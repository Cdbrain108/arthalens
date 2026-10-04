"""Public capabilities derived from the executable specialist registry."""
from fastapi import APIRouter
from ..graph.definitions import DEF_BY_NAME, registry_health

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("")
async def list_agents():
    return [{**entry, "label": DEF_BY_NAME[entry['name']]['role'],
             "description": DEF_BY_NAME[entry['name']]['goal'],
             "tools": [t.name for t in DEF_BY_NAME[entry['name']]['tools']],
             "limitations": "Configured means local tools initialize. External provider coverage is assessed per research run."}
            for entry in registry_health()]
