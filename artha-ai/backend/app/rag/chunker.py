"""RAG chunker — size/overlap chunking with full provenance metadata."""
import hashlib
import re
from ..config import settings

REQUIRED_METADATA = ("document_id", "page", "source")


def _detect_section(line: str) -> str | None:
    """Lightweight heading heuristic: numbered or ALL-CAPS short lines."""
    text = line.strip()
    if not text or len(text) > 80:
        return None
    if re.match(r"^(\d+(\.\d+)*\.?\s+\S+)", text):
        return text
    if text.isupper() and len(text.split()) <= 8:
        return text.title()
    return None


def validate_chunk(chunk: dict) -> None:
    md = (chunk.get("metadata") or {})
    missing = [key for key in REQUIRED_METADATA if md.get(key) is None]
    if not chunk.get("chunk_id") or not chunk.get("text"):
        raise ValueError("chunk requires chunk_id and text")
    if missing:
        raise ValueError(f"chunk metadata missing: {missing}")


def chunk_pages(pages: list[dict], document_id: str, meta: dict) -> list[dict]:
    """Chunk page text; every chunk carries company/doc_type/period/date/
    source/page/section/document_id (Framework §J). Section headers are
    detected per page so citations stay precise (falls back to doc-level)."""
    chunks = []
    size, overlap = settings.chunk_size, settings.chunk_overlap
    for p in pages:
        text = p["text"]
        page_section: str | None = meta.get("section")
        for line in text.splitlines()[:20]:
            heading = _detect_section(line)
            if heading:
                page_section = heading
                break
        start = 0
        while start < len(text):
            piece = text[start:start + size]
            cid = hashlib.sha1(f"{document_id}:{p['page']}:{start}".encode()).hexdigest()[:16]
            chunk = {
                "chunk_id": cid, "text": piece,
                "metadata": {"document_id": document_id, "page": p["page"],
                             "company": meta.get("company"),
                             "doc_type": meta.get("doc_type"),
                             "period": meta.get("period"),
                             "publication_date": meta.get("publication_date"),
                             "source": meta.get("source", document_id),
                             "section": page_section},
            }
            validate_chunk(chunk)
            chunks.append(chunk)
            start += size - overlap
    return chunks
