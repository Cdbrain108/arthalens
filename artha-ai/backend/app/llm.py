"""Model gateway — ONE factory for every LLM in the system (ADR-2).

Never instantiate a chat model anywhere else. Per-role configuration lets
cheap models handle extraction while a stronger model handles synthesis.

OpenRouter: requests are distributed round-robin across every configured key
(OPENROUTER_API_KEY, OPENROUTER_API_KEY_BACKUP) so parallel specialists don't
exhaust a single free-tier rate limit. Gemini works the same way across
GEMINI_API_KEY + GEMINI_BACKUP_KEYS, and every Gemini request — across
both pipeline stages and parallel specialists — is paced
through gemini_slot() so parallel agents stay under the free-tier
per-key RPM limit.
"""
import itertools
import logging
import re
import threading
import time

from langchain_core.language_models import BaseChatModel

from .config import settings, _usable_key

logger = logging.getLogger("bullseye.llm")

_ROLE_MODELS = {
    "analyzer": None,    # cheap + fast
    "planner": None,
    "specialist": None,
    "validator": None,
    "challenger": None,
    "synthesizer": None,  # optionally point at a stronger model
}

# Extraction roles can run on the cheaper fast model when one is configured
# (GEMINI_MODEL_FAST) — the gateway's per-role design (ADR-2) in practice.
FAST_ROLES = {"analyzer", "planner", "validator"}


def _role_model(role: str) -> str | None:
    """Resolve a role's model override (None → provider default)."""
    if _ROLE_MODELS.get(role):
        return _ROLE_MODELS[role]
    if (settings.effective_provider == "gemini" and role in FAST_ROLES
            and settings.gemini_model_fast):
        return settings.gemini_model_fast
    return None


def is_mock() -> bool:
    """True when no real provider is configured — run the deterministic engine."""
    return settings.effective_provider == "mock"


def openrouter_keys() -> list[str]:
    """Usable OpenRouter keys in configured order (primary first)."""
    candidates = [settings.openrouter_api_key, settings.openrouter_api_key_backup]
    return [key.strip() for key in candidates if _usable_key(key)]


def gemini_keys() -> list[str]:
    """Usable Gemini keys in configured order (primary first, then extras)."""
    return list(settings.gemini_key_list)


# one counter per provider: a shared counter makes neither strictly round-robin
_rr_counters: dict[str, "itertools.count[int]"] = {}
_rr_lock = threading.Lock()


def _next_rr_index(provider: str) -> int:
    with _rr_lock:
        counter = _rr_counters.get(provider)
        if counter is None:
            counter = _rr_counters[provider] = itertools.count()
        return next(counter)


def next_openrouter_key() -> str:
    """Round-robin across keys: adjacent constructions get different keys."""
    keys = openrouter_keys()
    if not keys:
        raise RuntimeError("openrouter provider selected but no usable key is set")
    return keys[_next_rr_index("openrouter") % len(keys)]


def next_gemini_key() -> str:
    """Round-robin across Gemini keys (free-tier RPM headroom)."""
    keys = gemini_keys()
    if not keys:
        raise RuntimeError("gemini provider selected but no usable key is set")
    return keys[_next_rr_index("gemini") % len(keys)]


# --- Gemini free-tier pacing -------------------------------------------------
# Free-tier limits are per key (the weakest of our keys allows ~5 requests/
# min) and keys are round-robin shared by parallel specialists, so the global
# queue is spaced at ~3 requests/min per key with retry/rotation absorbing
# residual collisions.
_slot_lock = threading.Lock()
_slot_next_at = 0.0


def gemini_slot() -> None:
    """Block until the next Gemini request slot is available."""
    global _slot_next_at
    keys = max(1, len(gemini_keys()))
    interval = 60.0 / (keys * 3)  # ~3 requests/min per key, shared by all keys
    with _slot_lock:
        now = time.monotonic()
        wait = max(0.0, _slot_next_at - now)
        _slot_next_at = max(now, _slot_next_at) + interval
    if wait > 0:
        time.sleep(wait)


def _gemini_chat(model: str, temperature: float = 0.0):
    """Rate-limited ChatGoogleGenerativeAI with a round-robin key."""
    cls = _rate_limited_gemini_class()
    return cls(
        model=model,
        google_api_key=next_gemini_key(),
        temperature=temperature,
    )


_rate_limited_cls = None


def _rate_limited_gemini_class():
    """Cached ChatGoogleGenerativeAI subclass that paces every request."""
    global _rate_limited_cls
    if _rate_limited_cls is None:
        from langchain_google_genai import ChatGoogleGenerativeAI

        class _RateLimitedGemini(ChatGoogleGenerativeAI):
            def _generate(self, messages, stop=None, run_manager=None, **kwargs):
                gemini_slot()
                return super()._generate(messages, stop=stop,
                                         run_manager=run_manager, **kwargs)

            def _stream(self, messages, stop=None, run_manager=None, **kwargs):
                gemini_slot()
                yield from super()._stream(messages, stop=stop,
                                           run_manager=run_manager, **kwargs)

        _rate_limited_cls = _RateLimitedGemini
    return _rate_limited_cls


def _openrouter_chat(model: str, temperature: float = 0.0) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=model,
        api_key=next_openrouter_key(),
        base_url=settings.openrouter_base_url,
        temperature=temperature,
        max_retries=1,  # fast-fail; wrapper retries rotate keys AND models
        timeout=60,
        default_headers={"X-Title": "Bullseye"},
    )


def _agentrouter_chat(model: str, temperature: float = 0.0) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    if not _usable_key(settings.agentrouter_api_key):
        raise RuntimeError("agentrouter provider selected but no usable key is set")
    return ChatOpenAI(
        model=model,
        api_key=(settings.agentrouter_api_key or "").strip(),
        base_url=settings.agentrouter_base_url,
        temperature=temperature,
        max_retries=1,
        timeout=90,
        # Thinking models spend tokens before answering; headroom required.
        max_tokens=6000,
        # Gateway allowlists known client UAs; default httpx UA is rejected.
        default_headers={"X-Title": "Bullseye",
                         "User-Agent": "Claude-Desktop/1.0.0"},
    )


def get_llm(role: str = "specialist", temperature: float = 0.0) -> BaseChatModel:
    provider = settings.effective_provider
    model = _role_model(role)
    if provider == "mock":
        raise RuntimeError(
            "Mock mode: no LLM configured. Callers must branch on "
            "llm.is_mock() and use app.llm_mock helpers instead.")
    if provider == "gemini":
        return _gemini_chat(model or settings.gemini_model, temperature)
    if provider == "openrouter":
        return _openrouter_chat(model or settings.openrouter_model, temperature)
    if provider == "agentrouter":
        return _agentrouter_chat(model or settings.agentrouter_model, temperature)
    if provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=model or settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=temperature,
        )
    raise ValueError(f"Unknown model provider: {settings.model_provider}")


class _RobustStructured:
    """Structured invoke that survives provider flakiness.

    Free-tier models sometimes answer in plain content instead of emitting
    the requested tool call (parsed as None), transiently 429, or sit in
    congestion queues. Each attempt builds a fresh chain so keys rotate, and
    (on OpenRouter) advances along the model chain so one congested provider
    cannot doom the run. Rate-limit rejections wait the provider's advised
    retry window before the next attempt.
    """

    _RETRY_AFTER = re.compile(r"retry in ([0-9.]+)\s*s", re.I)

    def __init__(self, role: str, schema, attempts: int = 3):
        self._role = role
        self._schema = schema
        self._attempts = attempts

    @classmethod
    def _backoff_seconds(cls, exc: Exception) -> float:
        """Seconds to wait after a rate-limit rejection (0 for other errors)."""
        text = str(exc)
        if "429" in text or "RESOURCE_EXHAUSTED" in text or "quota" in text.lower():
            match = cls._RETRY_AFTER.search(text)
            return min(float(match.group(1)) + 1.0, 45.0) if match else 15.0
        return 0.0

    def _chain(self, attempt: int):
        provider = settings.effective_provider
        if provider == "openrouter":
            models = settings.openrouter_model_chain
            model = models[(attempt - 1) % len(models)]
            return _openrouter_chat(model).with_structured_output(
                self._schema, method="function_calling")
        if provider == "gemini":
            return _gemini_chat(
                _role_model(self._role) or settings.gemini_model).with_structured_output(
                self._schema)
        if provider == "agentrouter":
            return _agentrouter_chat(
                settings.agentrouter_model).with_structured_output(
                self._schema, method="function_calling")
        return get_llm(self._role).with_structured_output(self._schema)

    def invoke(self, prompt, config=None, **kwargs):
        last_error = None
        for attempt in range(1, self._attempts + 1):
            started = time.time()
            try:
                result = self._chain(attempt).invoke(prompt, config, **kwargs)
                if result is not None:
                    return result
                last_error = ValueError("model returned no structured output")
            except Exception as exc:
                last_error = exc
            logger.warning("structured attempt %d/%d failed after %.0fs: %s",
                           attempt, self._attempts, time.time() - started,
                           str(last_error)[:200])
            delay = self._backoff_seconds(last_error)
            if delay:
                time.sleep(delay)
        raise RuntimeError(
            f"structured output failed after {self._attempts} attempts: {last_error}")


def get_structured_llm(role: str, schema):
    """Structured-output helper: guarantees Pydantic-shaped responses.

    method="function_calling" is deliberate: OpenRouter's free models vary in
    json_schema support (some return empty content that breaks response
    parsing), while tool calling is universally supported by tools-capable
    free models. Retry handling lives in _RobustStructured.
    """
    attempts = 5 if settings.effective_provider == "gemini" else 3
    return _RobustStructured(role, schema, attempts=attempts)
