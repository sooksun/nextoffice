import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.face_engine import engine

router = APIRouter()
logger = logging.getLogger(__name__)


class DeleteResponse(BaseModel):
    deleted: bool
    message: str = ""


@router.delete("/faces/{user_id}", response_model=DeleteResponse)
async def delete_face(user_id: str):
    try:
        deleted = engine.delete_embedding(user_id)
        return DeleteResponse(
            deleted=deleted,
            message="Embedding deleted" if deleted else "No embedding found",
        )
    except Exception as e:
        logger.error("Face delete failed for user %s: %s", user_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Face delete failed: {e}")
