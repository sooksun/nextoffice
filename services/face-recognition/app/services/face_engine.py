"""
InsightFace engine for face detection, embedding extraction, and comparison.
Uses ArcFace model (buffalo_l) for high-accuracy face recognition.
"""

import logging
import json
import os
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis

from app.config import MODEL_NAME, SIMILARITY_THRESHOLD, EMBEDDINGS_DIR, DET_SIZE

logger = logging.getLogger(__name__)


class FaceEngine:
    def __init__(self):
        self._app: FaceAnalysis | None = None
        self._embeddings_dir = Path(EMBEDDINGS_DIR)
        self._embeddings_dir.mkdir(parents=True, exist_ok=True)

    def _ensure_loaded(self):
        if self._app is None:
            logger.info("Loading InsightFace model: %s", MODEL_NAME)
            self._app = FaceAnalysis(
                name=MODEL_NAME,
                providers=["CPUExecutionProvider"],
            )
            self._app.prepare(ctx_id=-1, det_size=(DET_SIZE, DET_SIZE))
            logger.info("InsightFace model loaded successfully")

    def _decode_image(self, image_base64: str) -> np.ndarray:
        """Decode base64 image to OpenCV BGR numpy array."""
        import base64

        # Strip data URL prefix if present
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        img_bytes = base64.b64decode(image_base64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image")
        return img

    def _embedding_path(self, user_id: str) -> Path:
        return self._embeddings_dir / f"{user_id}.json"

    def _save_embedding(self, user_id: str, embedding: np.ndarray):
        path = self._embedding_path(user_id)
        data = {"user_id": user_id, "embedding": embedding.tolist()}
        path.write_text(json.dumps(data))

    def _load_embedding(self, user_id: str) -> np.ndarray | None:
        path = self._embedding_path(user_id)
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        return np.array(data["embedding"], dtype=np.float32)

    def _compute_similarity(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Cosine similarity between two embeddings."""
        dot = np.dot(emb1, emb2)
        norm = np.linalg.norm(emb1) * np.linalg.norm(emb2)
        if norm == 0:
            return 0.0
        return float(dot / norm)

    def register(self, user_id: str, image_base64: str) -> dict:
        """
        Register a face for a user.
        Returns: { success, face_id, confidence, message }
        """
        self._ensure_loaded()
        img = self._decode_image(image_base64)

        faces = self._app.get(img)

        if len(faces) == 0:
            return {
                "success": False,
                "face_id": None,
                "confidence": 0.0,
                "message": "No face detected in image",
            }

        if len(faces) > 1:
            return {
                "success": False,
                "face_id": None,
                "confidence": 0.0,
                "message": f"Multiple faces detected ({len(faces)}). Please submit an image with exactly one face.",
            }

        face = faces[0]
        embedding = face.embedding
        det_score = float(face.det_score)

        face_id = f"face_{user_id}"
        self._save_embedding(user_id, embedding)

        logger.info(
            "Registered face for user %s (det_score=%.3f)", user_id, det_score
        )

        return {
            "success": True,
            "face_id": face_id,
            "confidence": det_score,
            "message": "Face registered successfully",
        }

    def verify(self, user_id: str, image_base64: str) -> dict:
        """
        Verify a face against a registered user.
        Returns: { matched, similarity, confidence, message }
        """
        self._ensure_loaded()

        stored_embedding = self._load_embedding(user_id)
        if stored_embedding is None:
            return {
                "matched": False,
                "similarity": 0.0,
                "confidence": 0.0,
                "message": f"No face registered for user {user_id}",
            }

        img = self._decode_image(image_base64)
        faces = self._app.get(img)

        if len(faces) == 0:
            return {
                "matched": False,
                "similarity": 0.0,
                "confidence": 0.0,
                "message": "No face detected in verification image",
            }

        if len(faces) > 1:
            return {
                "matched": False,
                "similarity": 0.0,
                "confidence": 0.0,
                "message": "Multiple faces detected. Please show only one face.",
            }

        face = faces[0]
        similarity = self._compute_similarity(stored_embedding, face.embedding)
        det_score = float(face.det_score)
        matched = similarity >= SIMILARITY_THRESHOLD

        logger.info(
            "Verify user %s: similarity=%.4f, threshold=%.2f, matched=%s",
            user_id,
            similarity,
            SIMILARITY_THRESHOLD,
            matched,
        )

        return {
            "matched": matched,
            "similarity": round(similarity, 4),
            "confidence": round(det_score, 4),
            "message": "Face matched" if matched else "Face did not match",
        }

    def delete_embedding(self, user_id: str) -> bool:
        """Delete stored embedding for a user."""
        path = self._embedding_path(user_id)
        if path.exists():
            path.unlink()
            logger.info("Deleted embedding for user %s", user_id)
            return True
        return False

    def has_embedding(self, user_id: str) -> bool:
        """Check if a user has a registered face."""
        return self._embedding_path(user_id).exists()


# Singleton instance
engine = FaceEngine()
