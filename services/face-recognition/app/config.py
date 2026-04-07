import os

MODEL_NAME = os.getenv("MODEL_NAME", "buffalo_l")
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.45"))
EMBEDDINGS_DIR = os.getenv("EMBEDDINGS_DIR", "/app/data/embeddings")
DET_SIZE = int(os.getenv("DET_SIZE", "640"))
