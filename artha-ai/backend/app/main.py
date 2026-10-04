"""Bulls Eye FastAPI application — Research Beyond the Noise."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import research_routes, document_routes, agent_routes

logger = logging.getLogger("bullseye")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from .config import settings
    # Late import keeps the route module's (test-swappable) instance.
    from .api.research_routes import jobs

    provider = settings.effective_provider
    logger.info("Model provider in effect: %s", provider)
    if provider == "mock":
        logger.warning(
            "No usable provider key for '%s' — running in deterministic mock "
            "mode (₹0). Set GEMINI_API_KEY or OPENROUTER_API_KEY in "
            "artha-ai/.env for live research.", settings.model_provider)

    # Jobs left non-terminal by a previous run (crash, --reload restart) must
    # never stay "running" forever — fail them so the UI can recover.
    jobs.fail_stale_jobs("interrupted by server restart")
    yield


app = FastAPI(title="Bulls Eye", version="1.0.0", lifespan=lifespan,
              description="Multi-agent company research — one question, "
                          "specialist agents, evidence, synthesis, PDF.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(research_routes.router, prefix="/api")
app.include_router(document_routes.router, prefix="/api")
app.include_router(agent_routes.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "bullseye"}
