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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(register_router)
app.include_router(verify_router)
app.include_router(health_router)
