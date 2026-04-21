import os

MODEL_NAME = os.getenv("MODEL_NAME", "buffalo_l")
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.45"))
EMBEDDINGS_DIR = os.getenv("EMBEDDINGS_DIR", "/app/data/embeddings")
DET_SIZE = int(os.getenv("DET_SIZE", "640"))

QDRANT_HOST = os.getenv("QDRANT_HOST", "qdrant")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)
FACE_COLLECTION = os.getenv("FACE_COLLECTION", "face_embeddings_v1")
FACE_EMBEDDING_DIM = 512  # ArcFace buffalo_l output dimension

MIN_QUALITY_SCORE = float(os.getenv("MIN_QUALITY_SCORE", "0.35"))
MIN_BLUR_VARIANCE = float(os.getenv("MIN_BLUR_VARIANCE", "80.0"))
MIN_FACE_SIZE_RATIO = float(os.getenv("MIN_FACE_SIZE_RATIO", "0.08"))
MAX_POSE_YAW = float(os.getenv("MAX_POSE_YAW", "45.0"))
MAX_POSE_PITCH = float(os.getenv("MAX_POSE_PITCH", "30.0"))
