"""
Qdrant vector store client for face embeddings.
Collection: face_embeddings_v1, dim=512, cosine distance.
"""

import logging
import uuid
from typing import Optional

import numpy as np

from app.config import (
    QDRANT_HOST,
    QDRANT_PORT,
    QDRANT_API_KEY,
    FACE_COLLECTION,
    FACE_EMBEDDING_DIM,
)

logger = logging.getLogger(__name__)

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import (
        Distance,
        VectorParams,
        PointStruct,
        Filter,
        FieldCondition,
        MatchValue,
        PayloadSchemaType,
        UpdateStatus,
    )
    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False
    logger.warning("qdrant-client not installed — Qdrant features disabled")


class QdrantService:
    def __init__(self):
        self._client: Optional[object] = None

    def _get_client(self):
        if not QDRANT_AVAILABLE:
            raise RuntimeError("qdrant-client package not installed")
        if self._client is None:
            self._client = QdrantClient(
                host=QDRANT_HOST,
                port=QDRANT_PORT,
                api_key=QDRANT_API_KEY,
                timeout=10,
            )
        return self._client

    def ensure_collection(self) -> bool:
        if not QDRANT_AVAILABLE:
            return False
        try:
            client = self._get_client()
            existing = [c.name for c in client.get_collections().collections]
            if FACE_COLLECTION not in existing:
                client.create_collection(
                    collection_name=FACE_COLLECTION,
                    vectors_config=VectorParams(
                        size=FACE_EMBEDDING_DIM,
                        distance=Distance.COSINE,
                    ),
                )
                client.create_payload_index(
                    FACE_COLLECTION, "org_id", PayloadSchemaType.KEYWORD
                )
                client.create_payload_index(
                    FACE_COLLECTION, "user_id", PayloadSchemaType.KEYWORD
                )
                client.create_payload_index(
                    FACE_COLLECTION, "status", PayloadSchemaType.KEYWORD
                )
                logger.info("Created Qdrant collection: %s", FACE_COLLECTION)
            return True
        except Exception as exc:
            logger.error("ensure_collection failed: %s", exc)
            return False

    def upsert(self, point_id: str, embedding: np.ndarray, payload: dict) -> bool:
        try:
            client = self._get_client()
            client.upsert(
                collection_name=FACE_COLLECTION,
                points=[
                    PointStruct(
                        id=point_id,
                        vector=embedding.tolist(),
                        payload=payload,
                    )
                ],
            )
            return True
        except Exception as exc:
            logger.error("upsert failed for point %s: %s", point_id, exc)
            return False

    def search(
        self,
        embedding: np.ndarray,
        org_id: str,
        k: int = 10,
        only_active: bool = True,
    ) -> list[dict]:
        try:
            client = self._get_client()
            must_conditions = [
                FieldCondition(key="org_id", match=MatchValue(value=org_id)),
            ]
            if only_active:
                must_conditions.append(
                    FieldCondition(key="status", match=MatchValue(value="active"))
                )
            results = client.search(
                collection_name=FACE_COLLECTION,
                query_vector=embedding.tolist(),
                query_filter=Filter(must=must_conditions),
                limit=k,
                with_payload=True,
            )
            return [
                {
                    "point_id": str(r.id),
                    "score": float(r.score),
                    "user_id": r.payload.get("user_id"),
                    "template_id": r.payload.get("template_id"),
                    "quality_score": r.payload.get("quality_score"),
                }
                for r in results
            ]
        except Exception as exc:
            logger.error("search failed for org %s: %s", org_id, exc)
            return []

    def deactivate_template(self, point_id: str) -> bool:
        try:
            client = self._get_client()
            client.set_payload(
                collection_name=FACE_COLLECTION,
                payload={"status": "inactive"},
                points=[point_id],
            )
            return True
        except Exception as exc:
            logger.error("deactivate_template failed: %s", exc)
            return False

    def delete_person(self, org_id: str, user_id: str) -> int:
        try:
            client = self._get_client()
            result = client.delete(
                collection_name=FACE_COLLECTION,
                points_selector=Filter(
                    must=[
                        FieldCondition(key="org_id", match=MatchValue(value=org_id)),
                        FieldCondition(key="user_id", match=MatchValue(value=user_id)),
                    ]
                ),
            )
            return 1 if result.status == UpdateStatus.COMPLETED else 0
        except Exception as exc:
            logger.error("delete_person failed: %s", exc)
            return 0

    def is_available(self) -> bool:
        if not QDRANT_AVAILABLE:
            return False
        try:
            self._get_client().get_collections()
            return True
        except Exception:
            return False

    @staticmethod
    def new_point_id() -> str:
        return str(uuid.uuid4())


qdrant_service = QdrantService()
