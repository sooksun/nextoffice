from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.face_engine import engine

router = APIRouter()


class RegisterRequest(BaseModel):
    user_id: str
    image_base64: str


class RegisterResponse(BaseModel):
    success: bool
    face_id: str | None = None
    confidence: float = 0.0
    message: str = ""


@router.post("/faces/register", response_model=RegisterResponse)
async def register_face(req: RegisterRequest):
    try:
        result = engine.register(req.user_id, req.image_base64)
        return RegisterResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face registration failed: {e}")
