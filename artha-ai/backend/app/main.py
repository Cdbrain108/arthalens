"""Bullseye FastAPI application — Research Beyond the Noise."""
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
    from .graph.definitions import registry_health
    from .graph.workflow import get_graph
    app.state.agent_health = registry_health()
    get_graph()
    logger.info("Model provider in effect: %s", provider)
    if provider == "mock":
        logger.warning(
            "LLM-free research selected for '%s'. Data tools still query real providers; "
            "language-model explanation is disabled.", settings.model_provider)

    # Jobs left non-terminal by a previous run (crash, --reload restart) must
    # never stay "running" forever — fail them so the UI can recover.
    jobs.fail_stale_jobs("interrupted by server restart")
    yield


app = FastAPI(title="Bullseye", version="1.0.0", lifespan=lifespan,
              description="Multi-agent company research — one question, "
                          "specialist agents, evidence, synthesis, PDF.")

import os

cors_env = os.environ.get("CORS_ORIGINS", "")
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if cors_env:
    allowed_origins.extend([o.strip() for o in cors_env.split(",") if o.strip()])
elif os.environ.get("K_SERVICE") or os.environ.get("ENV") == "production":
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(research_routes.router, prefix="/api")
app.include_router(document_routes.router, prefix="/api")
app.include_router(agent_routes.router, prefix="/api")


@app.get("/api/health")
async def health():
    from .config import settings
    from .graph.definitions import registry_health
    agents = registry_health()
    return {"status": "ok" if all(a['status'] == 'configured' for a in agents) else "degraded",
            "service": "bullseye", "agents": agents, "provider": settings.effective_provider,
            "provider_connectivity": "not checked", "agent_concurrency": settings.agent_concurrency}
