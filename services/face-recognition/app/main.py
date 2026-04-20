"""
NextOffice Face Recognition Service
====================================
FastAPI microservice using InsightFace/ArcFace for face registration and verification.
Designed to run as a Docker sidecar alongside the NestJS API.
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.register import router as register_router
from app.routes.verify import router as verify_router
from app.routes.delete import router as delete_router
from app.routes.health import router as health_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(
    title="NextOffice Face Recognition",
    description="Face registration and verification service using InsightFace/ArcFace",
    version="1.0.0",
)

import os

_allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(register_router)
app.include_router(verify_router)
app.include_router(delete_router)
app.include_router(health_router)
