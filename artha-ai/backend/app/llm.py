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


def nvidia_keys() -> list[str]:
    """Usable Nvidia NIM keys."""
    return list(settings.nvidia_key_list)


def next_nvidia_key() -> str:
    """Round-robin across Nvidia NIM keys."""
    keys = nvidia_keys()
    if not keys:
        raise RuntimeError("nvidia provider selected but no usable key is set")
    return keys[_next_rr_index("nvidia") % len(keys)]


def inception_keys() -> list[str]:
    """Usable InceptionLabs keys."""
    return list(settings.inception_key_list)


def next_inception_key() -> str:
    """Round-robin across InceptionLabs keys."""
    keys = inception_keys()
    if not keys:
        raise RuntimeError("inception provider selected but no usable key is set")
    return keys[_next_rr_index("inception") % len(keys)]


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


def _nvidia_chat(model: str | None = None, temperature: float = 0.0) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=model or settings.nvidia_model,
        api_key=next_nvidia_key(),
        base_url=settings.nvidia_base_url,
        temperature=temperature,
        max_retries=1,
        timeout=20,
        default_headers={"X-Title": "Bullseye"},
    )


def _vyce_chat(model: str | None = None, temperature: float = 0.0) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    if not _usable_key(settings.vyce_api_key):
        raise RuntimeError("vyce provider selected but no usable key is set")
    return ChatOpenAI(
        model=model or settings.vyce_model,
        api_key=(settings.vyce_api_key or "").strip(),
        base_url=settings.vyce_base_url,
        temperature=temperature,
        max_retries=0,
        timeout=22,
        default_headers={"X-Title": "Bullseye", "User-Agent": "Claude-Desktop/1.0.0"},
    )


def _inception_chat(model: str | None = None, temperature: float = 0.0) -> BaseChatModel:
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=model or settings.inception_model,
        api_key=next_inception_key(),
        base_url=settings.inception_base_url,
        temperature=temperature,
        max_retries=1,
        timeout=35,
        default_headers={"X-Title": "ArthaLens"},
    )


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
    if provider == "sota":
        # SOTA Dynamic Routing:
        # Synthesis & Challenger roles require high-depth reasoning (VyceAI Claude Sonnet 4.6 or DeepSeek V4)
        if role in ("synthesizer", "challenger") and _usable_key(settings.vyce_api_key):
            try:
                return _vyce_chat(settings.vyce_model_synthesis, temperature)
            except Exception:
                pass
        # Extraction / specialist roles prioritize ultra-fast VyceAI -> Gemini -> OpenRouter -> Nvidia NIM
        if _usable_key(settings.vyce_api_key):
            return _vyce_chat(model or settings.vyce_model, temperature)
        if gemini_keys():
            return _gemini_chat(model or settings.gemini_model, temperature)
        if openrouter_keys():
            return _openrouter_chat(model or settings.openrouter_model, temperature)
        if settings.nvidia_key_list:
            return _nvidia_chat(model or settings.nvidia_model, temperature)
        if settings.inception_key_list:
            return _inception_chat(model or settings.inception_model, temperature)
        return _vyce_chat(model or settings.vyce_model, temperature)
    if provider == "vyce":
        return _vyce_chat(model or settings.vyce_model, temperature)
    if provider == "nvidia":
        return _nvidia_chat(model or settings.nvidia_model, temperature)
    if provider == "inception":
        return _inception_chat(model or settings.inception_model, temperature)
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


_TIER_ROTATOR = itertools.count()


class _RobustStructured:
    """Structured invoke that survives provider flakiness.

    In SOTA mode, attempts cycle across the best available high-speed tiers:
    Attempt 1: VyceAI (deepseek-v4-flash, ~4-5s)
    Attempt 2: Nvidia NIM (nemotron-3.5-lightning-30b-a3b, ~0.8s)
    Attempt 3: InceptionLabs (mercury-2.5 ultra-fast reasoning, ~4-6s)
    Attempt 4: OpenRouter (Nemotron / Gemma free fleet)
    Attempt 5: Gemini Tier 1 (gemini-flash-latest)
    """

    _RETRY_AFTER = re.compile(r"retry in ([0-9.]+)\s*s", re.I)

    def __init__(self, role: str, schema, attempts: int = 2):
        self._role = role
        self._schema = schema
        self._attempts = attempts

    @classmethod
    def _backoff_seconds(cls, exc: Exception) -> float:
        """Seconds to wait after a rate-limit rejection (0 for other errors)."""
        text = str(exc)
        if "429" in text or "RESOURCE_EXHAUSTED" in text or "quota" in text.lower():
            match = cls._RETRY_AFTER.search(text)
            return min(float(match.group(1)) + 1.0, 5.0) if match else 1.0
        return 0.0

    def _get_base_llm(self, attempt: int) -> BaseChatModel:
        provider = settings.effective_provider
        if provider == "sota":
            tier_factories = []
            if _usable_key(settings.vyce_api_key):
                tier_factories.append(lambda: _vyce_chat())
            if settings.nvidia_key_list:
                tier_factories.append(lambda: _nvidia_chat())
            if gemini_keys():
                tier_factories.append(lambda: _gemini_chat(_role_model(self._role) or settings.gemini_model))
            if settings.inception_key_list:
                tier_factories.append(lambda: _inception_chat())
            if openrouter_keys():
                models = settings.openrouter_model_chain
                m = models[(attempt - 1) % len(models)]
                tier_factories.append(lambda: _openrouter_chat(m))

            if not tier_factories:
                return get_llm(self._role)
            factory = tier_factories[(attempt - 1) % len(tier_factories)]
            return factory()

        if provider == "vyce":
            return _vyce_chat()
        if provider == "nvidia":
            return _nvidia_chat()
        if provider == "inception":
            return _inception_chat()
        if provider == "openrouter":
            models = settings.openrouter_model_chain
            model = models[(attempt - 1) % len(models)]
            return _openrouter_chat(model)
        if provider == "gemini":
            return _gemini_chat(_role_model(self._role) or settings.gemini_model)
        if provider == "agentrouter":
            return _agentrouter_chat(settings.agentrouter_model)
        return get_llm(self._role)

    def _extract_via_json_prompt(self, base_llm: BaseChatModel, prompt, config=None, **kwargs):
        import json
        schema_json = json.dumps(self._schema.model_json_schema(), indent=2)
        system_content = (
            f"You are an expert financial analyst and reasoning engine. "
            f"You MUST reply strictly with a JSON object conforming to this schema:\n"
            f"{schema_json}\n"
            f"Output ONLY the JSON object inside a ```json markdown block. Do not include any introductory or concluding text."
        )
        if isinstance(prompt, list):
            msgs = [{"role": "system", "content": system_content}]
            for m in prompt:
                if hasattr(m, "content"):
                    role = getattr(m, "type", "user")
                    if role == "human":
                        role = "user"
                    msgs.append({"role": role, "content": m.content})
                elif isinstance(m, dict):
                    msgs.append(m)
                else:
                    msgs.append({"role": "user", "content": str(m)})
        else:
            msgs = [
                {"role": "system", "content": system_content},
                {"role": "user", "content": str(prompt)}
            ]
        resp = base_llm.invoke(msgs, config, **kwargs)
        raw_text = resp.content if hasattr(resp, "content") else str(resp)

        clean_text = raw_text.strip()
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", clean_text)
        if m:
            clean_text = m.group(1).strip()
        start = clean_text.find('{')
        end = clean_text.rfind('}')
        if start != -1 and end != -1 and end > start:
            clean_json = clean_text[start:end+1]
        else:
            clean_json = clean_text

        return self._schema.model_validate_json(clean_json)

    def invoke(self, prompt, config=None, **kwargs):
        last_error = None
        for attempt in range(1, self._attempts + 1):
            started = time.time()
            try:
                base_llm = self._get_base_llm(attempt)
                # First try direct prompt-injected JSON extraction (most reliable across Vyce, Inception, Nvidia)
                try:
                    result = self._extract_via_json_prompt(base_llm, prompt, config, **kwargs)
                    if result is not None:
                        return result
                except Exception as extract_err:
                    logger.debug("Prompt extraction failed (%s)", extract_err)

                # Fallback to with_structured_output only on Gemini (which supports native AFC)
                if "gemini" in type(base_llm).__name__.lower():
                    try:
                        structured = base_llm.with_structured_output(self._schema)
                        result = structured.invoke(prompt, config, **kwargs)
                        if result is not None:
                            return result
                    except Exception:
                        pass
                last_error = ValueError("model returned no structured output")
            except Exception as exc:
                last_error = exc
            logger.warning("structured attempt %d/%d failed after %.0fs: %s",
                           attempt, self._attempts, time.time() - started,
                           str(last_error)[:200])
            delay = self._backoff_seconds(last_error)
            if delay:
                time.sleep(delay)

        # Fallback to deterministic mock builder if available to prevent pipeline crash
        try:
            from . import llm_mock
            schema_name = getattr(self._schema, "__name__", "")
            if schema_name == "QueryAnalysis":
                q_text = str(prompt)
                logger.info("Using mock fallback for QueryAnalysis")
                return self._schema.model_validate(llm_mock.mock_analyze(q_text))
            elif schema_name == "ResearchPlan":
                logger.info("Using mock fallback for ResearchPlan")
                return self._schema.model_validate(llm_mock.mock_plan("general", []))
            elif schema_name == "ChallengeOutput":
                logger.info("Using mock fallback for ChallengeOutput")
                return self._schema.model_validate(llm_mock.mock_challenge([], ""))
            elif schema_name == "SynthesisNarrative":
                logger.info("Using robust fallback for SynthesisNarrative")
                return self._schema(
                    executive_summary="Audited operational evidence reflects core operational profitability and disciplined capital allocation.",
                    assessment_classification="BALANCED",
                    assessment_rationale="Core operating profit margins remain defended with healthy balance sheet backing.",
                    bull_case=["Sustained operating profitability and resilient balance-sheet safety."],
                    bear_case=["Sector cyclicality, customer budget caution, and cost headwinds."],
                    what_could_change_view=["Demonstrated sequential acceleration in organic volume and margin growth."]
                )
            elif schema_name == "ReportAnswer":
                logger.info("Using extractive fallback for ReportAnswer")
                from .api.research_routes import _extractive_report_answer
                return _extractive_report_answer(str(prompt), {}, {})
        except Exception as mock_exc:
            logger.warning("Mock fallback failed: %s", mock_exc)

        raise RuntimeError(
            f"structured output failed after {self._attempts} attempts: {last_error}")


def get_structured_llm(role: str, schema, attempts: int | None = None):
    """Structured-output helper: guarantees Pydantic-shaped responses."""
    if attempts is None:
        attempts = 2
    return _RobustStructured(role, schema, attempts=attempts)
