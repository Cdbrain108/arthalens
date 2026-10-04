"""Document/RAG tools exposed as LangGraph tools."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel

from .base import NativeFunctionTool


def _source(title: str = "Bulls Eye document store") -> dict:
    return {"title": title, "url": None, "provider": "faiss",
            "retrieved_at": datetime.now(timezone.utc).isoformat()}


class SearchDocumentsArgs(BaseModel):
    query: str
    company: str | None = None
    doc_type: str | None = None
    period: str | None = None
    document_ids: list[str] | None = None


class RetrieveEvidenceArgs(BaseModel):
    chunk_ids: list[str]


def _normalize_ids(document_ids) -> list[str] | None:
    """LLMs often pass a bare string instead of a one-element list."""
    if document_ids is None:
        return None
    if isinstance(document_ids, str):
        return [document_ids]
    return list(document_ids)


def _search_documents(query: str, company: str | None = None,
                      doc_type: str | None = None, period: str | None = None,
                      document_ids: list[str] | None = None) -> dict:
    """Search indexed documents (filings, transcripts, uploaded PDFs).

    Returns ranked chunks with metadata: company, document type, period,
    publication date, source, page, section, document_id.
    """
    try:
        from ..rag.retriever import get_retriever
        from .base import clean_str

        retriever = get_retriever()
        document_ids = _normalize_ids(document_ids)
        filters = {k: v for k, v in {
            "company": clean_str(company), "doc_type": clean_str(doc_type),
            "period": clean_str(period),
            "document_ids": document_ids}.items() if v}
        docs = retriever.search(query, filters=filters)
        return {"ok": True, "data": {"query": query, "chunks": docs},
                "source": _source(), "error": None}
    except Exception as exc:
        return {"ok": False, "data": {"query": query, "chunks": []},
                "source": _source(),
                "error": str(exc)}


def _retrieve_evidence(chunk_ids: list[str]) -> dict:
    """Retrieve full excerpts (with page/section citations) for chunk IDs."""
    try:
        from ..rag.retriever import get_retriever

        return {"ok": True, "data": {"excerpts": get_retriever().fetch(chunk_ids)},
                "source": _source(), "error": None}
    except Exception as exc:
        return {"ok": False, "data": {"excerpts": []},
                "source": _source(),
                "error": str(exc)}


search_documents = NativeFunctionTool(
    name="search_documents",
    description="Search indexed filings and uploaded documents with metadata filters.",
    args_schema=SearchDocumentsArgs,
    function=_search_documents,
)

retrieve_evidence = NativeFunctionTool(
    name="retrieve_evidence",
    description="Retrieve full document excerpts with page and section metadata.",
    args_schema=RetrieveEvidenceArgs,
    function=_retrieve_evidence,
)
