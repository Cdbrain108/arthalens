"""Local embeddings — Sentence-Transformers (ADR-4: free, reproducible).

Falls back to None when the package/model is unavailable (offline CI,
minimal installs). The retriever then uses keyword search — RAG still works,
just without vectors.
"""
from functools import lru_cache
from ..config import settings


@lru_cache(maxsize=1)
def get_embedder():
    try:
        from sentence_transformers import SentenceTransformer
        return SentenceTransformer(settings.embedding_model)
    except Exception as exc:
        print(f"[bullseye] embeddings unavailable ({exc}); keyword fallback active.")
        return None


def embed_texts(texts: list[str]):
    emb = get_embedder()
    if emb is None:
        raise RuntimeError("embeddings unavailable")
    return emb.encode(texts, normalize_embeddings=True)


def embed_query(text: str):
    emb = get_embedder()
    if emb is None:
        raise RuntimeError("embeddings unavailable")
    return emb.encode([text], normalize_embeddings=True)[0]
