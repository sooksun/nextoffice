"""
V2 scan routes — multi-frame burst scan with decision engine.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.face_engine import engine

router = APIRouter(prefix="/scan", tags=["scan-v2"])

DEFAULT_CONFIG = {
    "accept_threshold": 0.72,
    "review_threshold": 0.55,
    "min_margin": 0.08,
    "min_quality_score": 0.35,
    "min_liveness_score": 0.0,
    "liveness_mode": "off",
}


class ScanRequest(BaseModel):
    org_id: str
    frames: list[str]           # list of base64-encoded JPEG frames (1–5 recommended)
    liveness_check: bool = False
    config: dict = {}           # per-school threshold overrides


@router.post("/verify")
def scan_verify(req: ScanRequest):
    """
    Multi-frame scan: pick best frame, embed, search Qdrant, apply decision engine.
    Returns: decision (accepted|review|rejected), top1/top2 scores, reason_codes.
    """
    merged_config = {**DEFAULT_CONFIG, **req.config}
    return engine.scan_verify(
        org_id=req.org_id,
        image_base64_list=req.frames,
        config=merged_config,
        liveness_check=req.liveness_check,
    )
