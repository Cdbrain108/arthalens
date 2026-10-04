"""Document routes — upload + index into the RAG store."""
import asyncio
import os
import uuid
from fastapi import APIRouter, HTTPException, UploadFile, Form

from ..config import settings
from ..rag.parser import parse_pdf
from ..rag.chunker import chunk_pages
from ..rag.retriever import get_retriever

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("")
async def upload_document(file: UploadFile, company: str | None = Form(None),
                          doc_type: str | None = Form(None),
                          period: str | None = Form(None),
                          publication_date: str | None = Form(None)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "PDF only")
    os.makedirs(settings.documents_dir, exist_ok=True)
    document_id = f"doc_{uuid.uuid4().hex[:10]}"
    path = os.path.join(settings.documents_dir, f"{document_id}.pdf")
    max_bytes = max(1, settings.max_document_size_mb) * 1024 * 1024
    total_bytes = 0
    try:
        # UploadFile.read() is streamed in bounded chunks instead of loading an
        # entire PDF into memory. This also gives the API a deterministic size
        # limit before parsing or embedding work starts.
        with open(path, "wb") as output:
            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    raise HTTPException(
                        413, f"PDF exceeds the {settings.max_document_size_mb} MB limit")
                output.write(chunk)
    except HTTPException:
        try:
            os.remove(path)
        except OSError:
            pass
        raise
    except Exception:
        try:
            os.remove(path)
        except OSError:
            pass
        raise
    finally:
        await file.close()
    try:
        # PDF parsing and embedding are CPU/model work; keep them off the
        # event loop so status polling and other users remain responsive.
        pages = await asyncio.to_thread(parse_pdf, path)
    except Exception as exc:
        try:
            os.remove(path)
        except OSError:
            pass
        raise HTTPException(400, f"PDF parse failed: {exc}")
    if not pages:
        try:
            os.remove(path)
        except OSError:
            pass
        raise HTTPException(400, "PDF contained no extractable text")
    chunks = chunk_pages(pages, document_id, {
        "company": company, "doc_type": doc_type, "period": period,
        "publication_date": publication_date, "source": file.filename})
    try:
        indexed = await asyncio.to_thread(get_retriever().add, chunks)
    except Exception as exc:
        try:
            os.remove(path)
        except OSError:
            pass
        raise HTTPException(500, f"PDF indexing failed: {exc}")
    return {"document_id": document_id, "chunks_indexed": indexed}


@router.get("")
async def list_documents():
    retriever = get_retriever()
    seen = {}
    for c in retriever.meta:
        md = c["metadata"]
        seen[md["document_id"]] = md
    return list(seen.values())
