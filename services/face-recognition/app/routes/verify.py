from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.face_engine import engine

router = APIRouter()


class VerifyRequest(BaseModel):
    user_id: str
    image_base64: str


class VerifyResponse(BaseModel):
    matched: bool
    similarity: float = 0.0
    confidence: float = 0.0
    message: str = ""


@router.post("/faces/verify", response_model=VerifyResponse)
async def verify_face(req: VerifyRequest):
    try:
        result = engine.verify(req.user_id, req.image_base64)
        return VerifyResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face verification failed: {e}")
