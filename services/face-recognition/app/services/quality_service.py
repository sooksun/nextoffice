"""
Image quality assessment for face enrollment and scan frames.
Checks: blur (Laplacian variance), brightness, face size ratio, pose bounds.
"""

import logging
from dataclasses import dataclass, field

import cv2
import numpy as np

from app.config import (
    MIN_BLUR_VARIANCE,
    MIN_FACE_SIZE_RATIO,
    MAX_POSE_YAW,
    MAX_POSE_PITCH,
)

logger = logging.getLogger(__name__)


@dataclass
class QualityResult:
    passed: bool
    score: float              # 0.0–1.0 composite
    blur_variance: float
    brightness: float
    face_size_ratio: float
    pose_yaw: float
    pose_pitch: float
    pose_roll: float
    light_score: float
    reasons: list[str] = field(default_factory=list)


class QualityService:
    def assess(self, img: np.ndarray, face) -> QualityResult:
        h, w = img.shape[:2]
        reasons: list[str] = []

        # --- Blur (Laplacian variance on face ROI) ---
        bbox = face.bbox.astype(int)
        x1, y1, x2, y2 = max(0, bbox[0]), max(0, bbox[1]), min(w, bbox[2]), min(h, bbox[3])
        face_roi = img[y1:y2, x1:x2]
        if face_roi.size == 0:
            blur_variance = 0.0
        else:
            gray_roi = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
            blur_variance = float(cv2.Laplacian(gray_roi, cv2.CV_64F).var())

        if blur_variance < MIN_BLUR_VARIANCE:
            reasons.append("BLUR")

        # --- Face size ratio ---
        face_w = x2 - x1
        face_h = y2 - y1
        face_size_ratio = (face_w * face_h) / (w * h) if (w * h) > 0 else 0.0
        if face_size_ratio < MIN_FACE_SIZE_RATIO:
            reasons.append("FACE_TOO_SMALL")

        # --- Brightness (mean of L channel in LAB) ---
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        brightness = float(lab[:, :, 0].mean())  # 0–255
        if brightness < 40:
            reasons.append("TOO_DARK")
        elif brightness > 220:
            reasons.append("TOO_BRIGHT")

        # --- Light score (normalised brightness distance from ideal ~120) ---
        light_score = max(0.0, 1.0 - abs(brightness - 120) / 120)

        # --- Pose from InsightFace (yaw, pitch, roll in degrees) ---
        pose_yaw, pose_pitch, pose_roll = 0.0, 0.0, 0.0
        if hasattr(face, "pose") and face.pose is not None:
            pose = face.pose
            pose_yaw = float(pose[1]) if len(pose) > 1 else 0.0
            pose_pitch = float(pose[0]) if len(pose) > 0 else 0.0
            pose_roll = float(pose[2]) if len(pose) > 2 else 0.0

        if abs(pose_yaw) > MAX_POSE_YAW:
            reasons.append("POSE_YAW")
        if abs(pose_pitch) > MAX_POSE_PITCH:
            reasons.append("POSE_PITCH")

        # --- Composite score ---
        blur_score = min(1.0, blur_variance / 500.0)
        size_score = min(1.0, face_size_ratio / 0.15)
        pose_score = max(0.0, 1.0 - (abs(pose_yaw) / MAX_POSE_YAW + abs(pose_pitch) / MAX_POSE_PITCH) / 2)
        score = (blur_score * 0.4 + size_score * 0.25 + light_score * 0.2 + pose_score * 0.15)
        score = round(min(1.0, max(0.0, score)), 4)

        passed = len(reasons) == 0

        return QualityResult(
            passed=passed,
            score=score,
            blur_variance=round(blur_variance, 2),
            brightness=round(brightness, 2),
            face_size_ratio=round(face_size_ratio, 4),
            pose_yaw=round(pose_yaw, 2),
            pose_pitch=round(pose_pitch, 2),
            pose_roll=round(pose_roll, 2),
            light_score=round(light_score, 4),
            reasons=reasons,
        )


quality_service = QualityService()
