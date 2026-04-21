"""
V2 enrollment routes — multi-frame, quality gate, Qdrant upsert.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.face_engine import engine

router = APIRouter(prefix="/enrollment", tags=["enrollment-v2"])


class EnrollFrameRequest(BaseModel):
    user_id: str
    org_id: str
    image_base64: str
    template_no: int = 1
    liveness_check: bool = False


class DeactivateTemplateRequest(BaseModel):
    point_id: str


@router.post("/upload-frame")
def upload_frame(req: EnrollFrameRequest):
    """
    Process one enrollment frame.
    Returns quality result and Qdrant point_id if passed.
    """
    return engine.enroll_frame(
        user_id=req.user_id,
        org_id=req.org_id,
        image_base64=req.image_base64,
        template_no=req.template_no,
        liveness_check=req.liveness_check,
    )


@router.post("/deactivate-template")
def deactivate_template(req: DeactivateTemplateRequest):
    """Mark a template as inactive in Qdrant (soft-delete)."""
    return engine.deactivate_template(req.point_id)


@router.delete("/persons/{org_id}/{user_id}")
def delete_person(org_id: str, user_id: str):
    """Delete all face templates for a person from Qdrant."""
    return engine.delete_person(org_id, user_id)
