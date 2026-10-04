"""Shared specialist contract: real tools collect; optional models explain."""
from datetime import datetime, timezone


class BaseSpecialistAgent:
    name = "base"
    system_prompt = ""
    tools = []

    def run(self, state: dict) -> dict:
        from ..graph.specialists import execute_specialist
        return self._delta(execute_specialist(self.name, state))

    def run_mock(self, state: dict) -> dict:
        """Compatibility name for LLM-free collection. Data tools are real."""
        from .collectors import collect
        return self._delta(collect(self.name, state))

    def _delta(self, result):
        return {"agent_results": {self.name: result.model_dump()},
                "evidence": [e.model_dump() for e in result.evidence],
                "completed_agents": [self.name] if result.evidence else [],
                "timestamps": {self.name: datetime.now(timezone.utc).isoformat()}}


_WORKFORCE_BLOCKED_DOMAINS = ("linkedin.com", "facebook.com", "instagram.com",
                              "twitter.com", "x.com", "tiktok.com")


def _workforce_hit_allowed(hit: dict) -> bool:
    text = " ".join(str(hit.get(key, "")) for key in ("href", "url", "link")).lower()
    return not any(domain in text for domain in _WORKFORCE_BLOCKED_DOMAINS)
