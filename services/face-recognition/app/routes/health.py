from fastapi import APIRouter

from app.services.face_engine import engine

router = APIRouter()


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "face-recognition",
        "engine": "insightface-arcface",
    }


@router.get("/faces/status/{user_id}")
async def face_status(user_id: str):
    return {
        "user_id": user_id,
        "registered": engine.has_embedding(user_id),
    }


@router.delete("/faces/embeddings/{user_id}")
async def delete_embedding(user_id: str):
    deleted = engine.delete_embedding(user_id)
    return {
        "user_id": user_id,
        "deleted": deleted,
    }
