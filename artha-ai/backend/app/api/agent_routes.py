"""Agent registry route — the UI's Agents page renders from this."""
from fastapi import APIRouter

from ..graph.definitions import DEF_BY_NAME
from ..graph.routing import ALL_AGENTS

router = APIRouter(prefix="/agents", tags=["agents"])

OPTIONAL = {"workforce", "social"}


@router.get("")
async def list_agents():
    return [{
        "name": name,
        "description": DEF_BY_NAME[name]["goal"],
        "tools": [t.name for t in DEF_BY_NAME[name]["tools"]],
        "status": "optional" if name in OPTIONAL else "core",
    } for name in ALL_AGENTS if name in DEF_BY_NAME]
