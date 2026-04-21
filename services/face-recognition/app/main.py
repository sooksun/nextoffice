"""
NextOffice Face Recognition Service v2
=======================================
FastAPI microservice using InsightFace/ArcFace.
V2: multi-template enrollment, Qdrant vector search, decision engine.
V1 legacy routes preserved for backward compatibility.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.register import router as register_router
from app.routes.verify import router as verify_router
from app.routes.delete import router as delete_router
from app.routes.health import router as health_router
from app.routes.enrollment import router as enrollment_router
from app.routes.scan import router as scan_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(
    title="NextOffice Face Recognition",
    description="Face registration and verification service using InsightFace/ArcFace (v2: multi-template + Qdrant)",
    version="2.0.0",
)

_allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# V1 legacy routes
app.include_router(register_router)
app.include_router(verify_router)
app.include_router(delete_router)
app.include_router(health_router)

# V2 routes
app.include_router(enrollment_router)
app.include_router(scan_router)
