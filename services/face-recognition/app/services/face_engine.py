"""
InsightFace engine v2 — multi-template enrollment + Qdrant vector search + decision engine.
Legacy single-template API (register/verify/delete) is preserved for backward compatibility.
"""

import base64
import json
import logging
import os
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis

from app.config import MODEL_NAME, SIMILARITY_THRESHOLD, EMBEDDINGS_DIR, DET_SIZE
from app.services.quality_service import quality_service, QualityResult
from app.services.liveness_service import liveness_service
from app.services.qdrant_service import qdrant_service

logger = logging.getLogger(__name__)


class FaceEngine:
    def __init__(self):
        self._app: FaceAnalysis | None = None
        # Legacy file store (kept for backward compat during migration)
        self._embeddings_dir = Path(EMBEDDINGS_DIR)
        self._embeddings_dir.mkdir(parents=True, exist_ok=True)

    # ── Init ──────────────────────────────────────────────────────────────────

    def _ensure_loaded(self):
        if self._app is None:
            logger.info("Loading InsightFace model: %s", MODEL_NAME)
            providers = ["CPUExecutionProvider"]
            try:
                import onnxruntime as ort
                if "CUDAExecutionProvider" in ort.get_available_providers():
                    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            except Exception:
                pass
            self._app = FaceAnalysis(name=MODEL_NAME, providers=providers)
            self._app.prepare(ctx_id=-1, det_size=(DET_SIZE, DET_SIZE))
            qdrant_service.ensure_collection()
            logger.info("InsightFace model loaded; Qdrant ready=%s", qdrant_service.is_available())

    # ── Image helpers ─────────────────────────────────────────────────────────

    def decode_image(self, image_base64: str) -> np.ndarray:
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        img_bytes = base64.b64decode(image_base64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image")
        return img

    def _detect_single(self, img: np.ndarray) -> tuple[object | None, str]:
        faces = self._app.get(img)
        if len(faces) == 0:
            return None, "NO_FACE_DETECTED"
        if len(faces) > 1:
            return None, "MULTIPLE_FACES"
        return faces[0], ""

    # ── V2: Enrollment (multi-template) ──────────────────────────────────────

    def enroll_frame(
        self,
        user_id: str,
        org_id: str,
        image_base64: str,
        template_no: int = 1,
        liveness_check: bool = False,
    ) -> dict:
        """
        Process one enrollment frame.
        Returns quality assessment + Qdrant point_id if passed.
        """
        self._ensure_loaded()
        try:
            img = self.decode_image(image_base64)
        except ValueError as exc:
            return {"success": False, "reason": str(exc)}

        face, err = self._detect_single(img)
        if face is None:
            return {"success": False, "reason": err}

        quality: QualityResult = quality_service.assess(img, face)
        liveness_result = {"score": 1.0, "is_live": True, "method": "off"}
        if liveness_check:
            liveness_result = liveness_service.assess(img, face)

        if not quality.passed:
            return {
                "success": False,
                "quality": _quality_dict(quality),
                "liveness": liveness_result,
                "reason": "QUALITY_FAILED",
                "reasons": quality.reasons,
            }

        if liveness_check and not liveness_result["is_live"]:
            return {
                "success": False,
                "quality": _quality_dict(quality),
                "liveness": liveness_result,
                "reason": "LIVENESS_FAILED",
            }

        embedding = face.embedding.astype(np.float32)
        point_id = qdrant_service.new_point_id()
        payload = {
            "org_id": str(org_id),
            "user_id": str(user_id),
            "template_no": template_no,
            "status": "active",
            "quality_score": quality.score,
            "pose_yaw": quality.pose_yaw,
            "pose_pitch": quality.pose_pitch,
        }
        qdrant_ok = qdrant_service.upsert(point_id, embedding, payload)

        return {
            "success": True,
            "point_id": point_id,
            "quality": _quality_dict(quality),
            "liveness": liveness_result,
            "qdrant_stored": qdrant_ok,
        }

    # ── V2: Scan (multi-frame → decision) ────────────────────────────────────

    def scan_verify(
        self,
        org_id: str,
        image_base64_list: list[str],
        config: dict,
        liveness_check: bool = False,
    ) -> dict:
        """
        Process burst of frames, pick best, search Qdrant, run decision engine.
        config keys: accept_threshold, review_threshold, min_margin, min_quality_score, min_liveness_score
        """
        self._ensure_loaded()

        best_face = None
        best_quality: QualityResult | None = None
        best_img = None
        best_liveness = {"score": 1.0, "is_live": True, "method": "off"}

        for b64 in image_base64_list:
            try:
                img = self.decode_image(b64)
            except ValueError:
                continue
            face, _ = self._detect_single(img)
            if face is None:
                continue
            q = quality_service.assess(img, face)
            if best_quality is None or q.score > best_quality.score:
                best_face = face
                best_quality = q
                best_img = img

        if best_face is None or best_quality is None:
            return {
                "decision": "rejected",
                "reason_codes": ["NO_FACE_DETECTED"],
                "top1_user_id": None,
                "top1_score": None,
                "top2_user_id": None,
                "top2_score": None,
                "score_margin": None,
                "quality_score": None,
                "liveness_score": None,
            }

        if liveness_check and best_img is not None:
            best_liveness = liveness_service.assess(best_img, best_face)

        embedding = best_face.embedding.astype(np.float32)
        top_k = qdrant_service.search(embedding, str(org_id), k=10)

        decision_result = _decision_engine(
            top_k=top_k,
            quality_score=best_quality.score,
            liveness_result=best_liveness,
            config=config,
        )

        return {
            **decision_result,
            "quality_score": best_quality.score,
            "liveness_score": best_liveness["score"],
            "top_k_raw": top_k[:3],
        }

    # ── V2: Delete person from Qdrant ─────────────────────────────────────────

    def delete_person(self, org_id: str, user_id: str) -> dict:
        deleted = qdrant_service.delete_person(str(org_id), str(user_id))
        self.delete_embedding(user_id)  # also clean legacy file
        return {"deleted": deleted > 0, "org_id": org_id, "user_id": user_id}

    def deactivate_template(self, point_id: str) -> dict:
        ok = qdrant_service.deactivate_template(point_id)
        return {"deactivated": ok, "point_id": point_id}

    # ── Legacy V1 API (preserved for backward compat) ─────────────────────────

    def register(self, user_id: str, image_base64: str) -> dict:
        self._ensure_loaded()
        img = self.decode_image(image_base64)
        faces = self._app.get(img)
        if len(faces) == 0:
            return {"success": False, "face_id": None, "confidence": 0.0, "message": "No face detected"}
        if len(faces) > 1:
            return {"success": False, "face_id": None, "confidence": 0.0, "message": f"Multiple faces detected ({len(faces)})"}
        face = faces[0]
        self._save_embedding(user_id, face.embedding)
        return {"success": True, "face_id": f"face_{user_id}", "confidence": float(face.det_score), "message": "Registered"}

    def verify(self, user_id: str, image_base64: str) -> dict:
        self._ensure_loaded()
        stored = self._load_embedding(user_id)
        if stored is None:
            return {"matched": False, "similarity": 0.0, "confidence": 0.0, "message": f"No face registered for {user_id}"}
        img = self.decode_image(image_base64)
        faces = self._app.get(img)
        if len(faces) == 0:
            return {"matched": False, "similarity": 0.0, "confidence": 0.0, "message": "No face detected"}
        if len(faces) > 1:
            return {"matched": False, "similarity": 0.0, "confidence": 0.0, "message": "Multiple faces"}
        face = faces[0]
        sim = _cosine_similarity(stored, face.embedding)
        matched = sim >= SIMILARITY_THRESHOLD
        return {"matched": matched, "similarity": round(sim, 4), "confidence": round(float(face.det_score), 4), "message": "Matched" if matched else "Not matched"}

    def delete_embedding(self, user_id: str) -> bool:
        path = self._embeddings_dir / f"{user_id}.json"
        if path.exists():
            path.unlink()
            return True
        return False

    def has_embedding(self, user_id: str) -> bool:
        return (self._embeddings_dir / f"{user_id}.json").exists()

    # ── Private helpers ───────────────────────────────────────────────────────

    def _save_embedding(self, user_id: str, embedding: np.ndarray):
        path = self._embeddings_dir / f"{user_id}.json"
        path.write_text(json.dumps({"user_id": user_id, "embedding": embedding.tolist()}))

    def _load_embedding(self, user_id: str) -> np.ndarray | None:
        path = self._embeddings_dir / f"{user_id}.json"
        if not path.exists():
            return None
        return np.array(json.loads(path.read_text())["embedding"], dtype=np.float32)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    return float(dot / norm) if norm > 0 else 0.0


def _quality_dict(q: QualityResult) -> dict:
    return {
        "passed": q.passed,
        "score": q.score,
        "blur_variance": q.blur_variance,
        "brightness": q.brightness,
        "face_size_ratio": q.face_size_ratio,
        "pose_yaw": q.pose_yaw,
        "pose_pitch": q.pose_pitch,
        "pose_roll": q.pose_roll,
        "light_score": q.light_score,
        "reasons": q.reasons,
    }


def _decision_engine(
    top_k: list[dict],
    quality_score: float,
    liveness_result: dict,
    config: dict,
) -> dict:
    """
    Decision engine: ACCEPT | REVIEW | REJECTED
    Returns dict with decision, reason_codes, top1/top2 info.
    """
    accept_threshold = config.get("accept_threshold", 0.72)
    review_threshold = config.get("review_threshold", 0.55)
    min_margin = config.get("min_margin", 0.08)
    min_quality = config.get("min_quality_score", 0.35)
    min_liveness = config.get("min_liveness_score", 0.0)
    liveness_mode = config.get("liveness_mode", "off")

    reason_codes: list[str] = []

    # Liveness gate
    if liveness_mode != "off" and min_liveness > 0:
        liveness_score = liveness_result.get("score", 1.0)
        if liveness_score < min_liveness:
            return _decision("rejected", ["LOW_LIVENESS"], None, None, None, None, None)

    # Quality gate → REVIEW (not outright reject)
    if quality_score < min_quality:
        reason_codes.append("LOW_QUALITY")
        return _decision("review", reason_codes, None, None, None, None, None)

    if not top_k:
        return _decision("rejected", ["NO_ACTIVE_TEMPLATE"], None, None, None, None, None)

    top1 = top_k[0]
    top2 = top_k[1] if len(top_k) > 1 else None
    t1_score = top1["score"]
    t2_score = top2["score"] if top2 else 0.0
    margin = t1_score - t2_score

    top1_uid = top1.get("user_id")
    top2_uid = top2.get("user_id") if top2 else None

    # Strong ACCEPT
    if t1_score >= accept_threshold and margin >= min_margin:
        return _decision("accepted", ["MATCH_ACCEPTED"], top1_uid, t1_score, top2_uid, t2_score, margin)

    # Clear REJECT
    if t1_score < review_threshold:
        reason_codes.append("LOW_TOP1_SCORE")
        return _decision("rejected", reason_codes, top1_uid, t1_score, top2_uid, t2_score, margin)

    # Middle zone → REVIEW
    if margin < min_margin:
        reason_codes.append("LOW_MARGIN")
    else:
        reason_codes.append("LOW_TOP1_SCORE")
    return _decision("review", reason_codes, top1_uid, t1_score, top2_uid, t2_score, margin)


def _decision(result, reasons, t1_uid, t1_score, t2_uid, t2_score, margin) -> dict:
    return {
        "decision": result,
        "reason_codes": reasons,
        "top1_user_id": t1_uid,
        "top1_score": round(t1_score, 4) if t1_score is not None else None,
        "top2_user_id": t2_uid,
        "top2_score": round(t2_score, 4) if t2_score is not None else None,
        "score_margin": round(margin, 4) if margin is not None else None,
    }


# Singleton
engine = FaceEngine()
