"""Bullseye configuration — provider-agnostic and env-driven."""
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Anchor every path to the project root (the parent of backend/) so behavior
# is identical whether the server, tests, or scripts launch from backend/,
# the repo root, or anywhere else. The README's setup puts .env at the project
# root; a CWD-relative env_file never found it when uvicorn ran from backend/
# (run_backend.bat), silently discarding the provider key and forcing mock.
import os

BASE_DIR = Path(os.environ.get("BASE_DIR", str(Path(__file__).resolve().parents[2])))


def _usable_key(key: str | None) -> bool:
    # Treat unset/blank values and .env.example placeholders ("your-...") as
    # "no key" so a copied template can never select live mode with an
    # invalid credential (every LLM call would 401).
    return bool(key and key.strip() and not key.strip().startswith("your-"))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"),
                                      env_file_encoding="utf-8", extra="ignore")

    # Model gateway: "sota" | "vyce" | "nvidia" | "inception" | "gemini" | "openrouter" | "agentrouter" | "mock"
    # SOTA dynamically routes across Tier 1 (VyceAI + Nvidia), Tier 2 (InceptionLabs + OpenRouter), Tier 3 (Gemini Tier 1)
    model_provider: str = "sota"

    # --- SOTA Tier 1: VyceAI ---
    vyce_api_key: str | None = None
    vyce_base_url: str = "https://vyceai.com/v1"
    vyce_model: str = "deepseek-v4-flash"
    vyce_model_synthesis: str = "claude-sonnet-4-6"

    # --- SOTA Tier 1: Nvidia NIM (round-robin keys) ---
    nvidia_api_keys: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model: str = "nvidia/nemotron-3-super-120b-a12b"

    # --- SOTA Tier 2: InceptionLabs (ultra-fast Mercury-2.5) ---
    inception_api_keys: str = ""
    inception_base_url: str = "https://api.inceptionlabs.ai/v1"
    inception_model: str = "mercury-2.5"

    gemini_api_key: str | None = None
    # Extra Gemini keys (comma-separated) round-robin with the primary for
    # free-tier rate-limit headroom.
    gemini_backup_keys: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_model_fast: str | None = "gemini-2.5-flash"  # cheap model for extraction roles
    # OpenRouter: free models; keys are used round-robin so parallel
    # specialists don't exhaust one free-tier rate limit.
    openrouter_api_key: str | None = None
    openrouter_api_key_backup: str | None = None
    openrouter_model: str = "nvidia/nemotron-3-super-120b-a12b:free"  # tools + structured outputs
    # Comma-separated fallbacks for free-tier congestion/flakiness: each retry
    # advances to the next model, spreading load across providers.
    openrouter_fallback_models: str = ("nex-agi/nex-n2.5-mini:free,"
                                       "google/gemma-4-31b-it:free")
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # AgentRouter: OpenAI-compatible gateway (One API style). Key + model
    # below select DeepSeek V4 Flash with no per-model daily free-tier cap.
    agentrouter_api_key: str | None = None
    agentrouter_model: str = "deepseek-v4-flash"
    # Tool-loop model: DeepSeek thinking breaks multi-turn tool calls
    # (reasoning_content echo required); GLM handles tool loops cleanly.
    agentrouter_model_tools: str = "glm-5.3"
    agentrouter_base_url: str = "https://agentrouter.org/v1"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"

    # Tavily: news search fallback only. The account is free-tier, so this is
    # never the default provider — news_tools calls it only when Google News
    # RSS fails or returns too little to research with. See `tavily_enabled`.
    tavily_api_key: str | None = None
    tavily_base_url: str = "https://api.tavily.com"
    # RSS result count below which a news search is considered too thin to
    # work with, which is the one condition that spends a Tavily credit.
    tavily_min_rss_items: int = 4

    # RAG
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    faiss_index_dir: str = "data/faiss"
    chunk_size: int = 800
    chunk_overlap: int = 120
    retrieval_top_k: int = 5

    # Storage
    sqlite_path: str = "data/jobs.sqlite"
    checkpoint_db: str = "data/checkpoints.sqlite"
    documents_dir: str = "documents"
    reports_dir: str = "reports"
    max_document_size_mb: int = 50

    # Runtime
    agent_timeout_s: int = 240
    agent_concurrency: int = 4
    max_agent_retries: int = 2

    # SEC EDGAR requires a User-Agent with app name + contact email for
    # data.sec.gov JSON APIs (free, no key). Override via EDGAR_CONTACT_EMAIL.
    edgar_contact_email: str = "cdbrain786@gmail.com"

    @property
    def edgar_user_agent(self) -> str:
        return f"Bullseye {self.edgar_contact_email}"

    @model_validator(mode="after")
    def _anchor_relative_paths(self):
        # Env-supplied relative paths (.env.example documents them as
        # "data/jobs.sqlite") resolve against the project root, never CWD.
        for field in ("sqlite_path", "checkpoint_db", "faiss_index_dir",
                      "documents_dir", "reports_dir"):
            value = getattr(self, field)
            if value and not Path(value).is_absolute():
                setattr(self, field, str((BASE_DIR / value).resolve()))
        return self

    @property
    def nvidia_key_list(self) -> list[str]:
        """Usable Nvidia NIM keys de-duplicated in configured order."""
        return list(dict.fromkeys(k.strip() for k in self.nvidia_api_keys.split(",") if _usable_key(k.strip())))

    @property
    def inception_key_list(self) -> list[str]:
        """Usable InceptionLabs keys de-duplicated in configured order."""
        return list(dict.fromkeys(k.strip() for k in self.inception_api_keys.split(",") if _usable_key(k.strip())))

    @property
    def gemini_key_list(self) -> list[str]:
        """Usable Gemini keys, primary first, then extras (de-duplicated)."""
        extras = [k.strip() for k in self.gemini_backup_keys.split(",") if k.strip()]
        return list(dict.fromkeys(
            k for k in [self.gemini_api_key, *extras] if _usable_key(k)))

    @property
    def tavily_enabled(self) -> bool:
        """True only for a real Tavily key (placeholders never select it)."""
        return _usable_key(self.tavily_api_key)

    @property
    def openrouter_model_chain(self) -> list[str]:
        """Primary model + fallbacks, de-duplicated in order."""
        chain = [m.strip() for m in self.openrouter_fallback_models.split(",") if m.strip()]
        return list(dict.fromkeys([self.openrouter_model, *chain]))

    @property
    def effective_provider(self) -> str:
        """Resolve the real provider: fall back to mock when no usable key is set."""
        if self.model_provider == "sota":
            if (self.nvidia_key_list or _usable_key(self.vyce_api_key) or
                    self.inception_key_list or _usable_key(self.openrouter_api_key) or
                    self.gemini_key_list):
                return "sota"
            return "mock"
        if self.model_provider == "vyce" and not _usable_key(self.vyce_api_key):
            return "mock"
        if self.model_provider == "nvidia" and not self.nvidia_key_list:
            return "mock"
        if self.model_provider == "inception" and not self.inception_key_list:
            return "mock"
        if self.model_provider == "gemini" and not self.gemini_key_list:
            return "mock"
        if self.model_provider == "openrouter" and not (
                _usable_key(self.openrouter_api_key)
                or _usable_key(self.openrouter_api_key_backup)):
            return "mock"
        if self.model_provider == "agentrouter" and not _usable_key(self.agentrouter_api_key):
            return "mock"
        return self.model_provider


settings = Settings()
