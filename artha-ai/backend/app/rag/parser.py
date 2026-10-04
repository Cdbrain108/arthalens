"""RAG parser — PDF -> page-preserving text (PyMuPDF)."""
import fitz  # PyMuPDF


def parse_pdf(path: str) -> list[dict]:
    """Return [{'page': int, 'text': str}] — page numbers preserved for citations."""
    pages = []
    with fitz.open(path) as doc:
        for i, page in enumerate(doc, start=1):
            text = page.get_text("text").strip()
            if text:
                pages.append({"page": i, "text": text})
    return pages
