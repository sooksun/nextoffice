"""
Passive liveness detection using texture analysis.
Detects printed-photo and screen spoofing attempts via LBP texture variance.
Score 0.0–1.0. Threshold >= 0.4 considered live.
"""

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def _lbp_variance(roi_gray: np.ndarray) -> float:
    """Compute LBP (Local Binary Pattern) texture variance. Higher = more texture = more likely live."""
    h, w = roi_gray.shape
    lbp = np.zeros_like(roi_gray, dtype=np.uint8)
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            if dy == 0 and dx == 0:
                continue
            shifted = np.roll(np.roll(roi_gray, dy, axis=0), dx, axis=1)
            lbp += (shifted >= roi_gray).astype(np.uint8)
    return float(np.var(lbp.astype(np.float32)))


class LivenessService:
    LIVE_THRESHOLD = 0.4

    def assess(self, img: np.ndarray, face) -> dict:
        """
        Passive liveness check using face ROI texture.
        Returns: { score: float, is_live: bool, method: str }
        """
        try:
            h, w = img.shape[:2]
            bbox = face.bbox.astype(int)
            x1, y1 = max(0, bbox[0]), max(0, bbox[1])
            x2, y2 = min(w, bbox[2]), min(h, bbox[3])
            face_roi = img[y1:y2, x1:x2]

            if face_roi.size == 0 or (x2 - x1) < 32 or (y2 - y1) < 32:
                return {"score": 0.5, "is_live": True, "method": "skipped_small_face"}

            gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
            resized = cv2.resize(gray, (64, 64))

            texture_var = _lbp_variance(resized)

            # High-freq energy via Sobel
            sobelx = cv2.Sobel(resized, cv2.CV_64F, 1, 0, ksize=3)
            sobely = cv2.Sobel(resized, cv2.CV_64F, 0, 1, ksize=3)
            edge_energy = float(np.mean(np.sqrt(sobelx**2 + sobely**2)))

            # Normalise both signals to [0, 1]
            texture_score = min(1.0, texture_var / 800.0)
            edge_score = min(1.0, edge_energy / 30.0)
            score = round(texture_score * 0.6 + edge_score * 0.4, 4)
            is_live = score >= self.LIVE_THRESHOLD

            return {"score": score, "is_live": is_live, "method": "passive_texture"}
        except Exception as exc:
            logger.warning("Liveness assessment error: %s", exc)
            return {"score": 0.5, "is_live": True, "method": "error_passthrough"}


liveness_service = LivenessService()
