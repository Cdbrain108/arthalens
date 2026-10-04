"""FAISS-backed retriever with metadata filtering (ADR-3)."""
import json
import os
from functools import lru_cache
import threading

from ..config import settings


class Retriever:
    def __init__(self):
        self._lock = threading.RLock()
        os.makedirs(settings.faiss_index_dir, exist_ok=True)
        self.index_path = os.path.join(settings.faiss_index_dir, "index.faiss")
        self.meta_path = os.path.join(settings.faiss_index_dir, "meta.jsonl")
        self.index = self._load_index()
        self.meta = self._load_meta()

    def _load_index(self):
        try:
            import faiss
            if os.path.exists(self.index_path):
                return faiss.read_index(self.index_path)
            return faiss.IndexFlatIP(384)  # all-MiniLM-L6-v2 dimension
        except Exception as exc:
            print(f"[bullseye] faiss unavailable ({exc}); keyword fallback active.")
            return None

    def _load_meta(self) -> list[dict]:
        if not os.path.exists(self.meta_path):
            return []
        with open(self.meta_path) as f:
            return [json.loads(line) for line in f]

    def add(self, chunks: list[dict]) -> int:
        if not chunks:
            return 0
        with self._lock:
            self.meta.extend(chunks)
            try:
                import faiss
                from .embeddings import embed_texts
                if self.index is not None:
                    vectors = embed_texts([c["text"] for c in chunks])
                    self.index.add(vectors)
                    faiss.write_index(self.index, self.index_path)
            except Exception as exc:
                print(f"[bullseye] vector index skipped ({exc}); keyword search will be used.")
            with open(self.meta_path, "a") as f:
                for c in chunks:
                    f.write(json.dumps(c) + "\n")
            return len(chunks)

    def _keyword_search(self, query: str, filters: dict | None,
                        top_k: int) -> list[dict]:
        terms = [t.lower() for t in query.split() if len(t) > 2]
        scored = []
        for c in self.meta:
            md = c.get("metadata", {})
            if filters and not self._matches_filters(md, filters):
                continue
            text = c.get("text", "").lower()
            score = sum(text.count(t) for t in terms)
            if score > 0:
                scored.append((score, c))
        scored.sort(key=lambda x: -x[0])
        return [{"chunk_id": c["chunk_id"], "score": float(s),
                 "text": c["text"], "metadata": c["metadata"]}
                for s, c in scored[:top_k]]

    def search(self, query: str, filters: dict | None = None,
               top_k: int | None = None) -> list[dict]:
        top_k = top_k or settings.retrieval_top_k
        with self._lock:
            if not self.meta:
                return []
            if self.index is None or getattr(self.index, "ntotal", 0) == 0:
                return self._keyword_search(query, filters, top_k)
            try:
                from .embeddings import embed_query
                scores, ids = self.index.search(embed_query(query).reshape(1, -1),
                                                min(top_k * 4, self.index.ntotal))
            except Exception as exc:
                print(f"[bullseye] vector search failed ({exc}); keyword fallback.")
                return self._keyword_search(query, filters, top_k)
            results = []
            for score, idx in zip(scores[0], ids[0]):
                if idx < 0 or idx >= len(self.meta):
                    continue
                chunk = self.meta[idx]
                md = chunk["metadata"]
                if filters and not self._matches_filters(md, filters):
                    continue
                results.append({"chunk_id": chunk["chunk_id"], "score": float(score),
                                "text": chunk["text"], "metadata": md})
                if len(results) >= top_k:
                    break
            return results

    @staticmethod
    def _matches_filters(metadata: dict, filters: dict) -> bool:
        """Apply scalar metadata filters and an optional document-id allowlist."""
        for key, expected in filters.items():
            if key == "document_ids":
                allowed = ({expected} if isinstance(expected, str)
                           else set(expected or []))
                if allowed and metadata.get("document_id") not in allowed:
                    return False
                continue
            if metadata.get(key) != expected:
                return False
        return True

    def fetch(self, chunk_ids: list[str]) -> list[dict]:
        wanted = set(chunk_ids)
        with self._lock:
            return [{"chunk_id": c["chunk_id"], "text": c["text"], "metadata": c["metadata"]}
                    for c in self.meta if c["chunk_id"] in wanted]


@lru_cache(maxsize=1)
def get_retriever() -> Retriever:
    return Retriever()
