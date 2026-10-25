"""One compiled LangGraph for CLI, tests and persisted HTTP research jobs."""
from typing import Any
from langgraph.graph import StateGraph, START, END
from langchain_core.runnables import RunnableConfig
from .state import ResearchState
from . import nodes

STAGES = ('analyze_query', 'create_plan', 'apply_routing_policy', 'run_specialists',
          'collect_results', 'validate_evidence', 'challenge_thesis',
          'synthesize_report', 'build_report', 'generate_pdf')


def build_research_graph(checkpointer: Any = None):
    workflow = StateGraph(ResearchState)
    def wrapped(name):
        async def run(state: ResearchState, config: RunnableConfig):
            emit = config.get('configurable', {}).get('emit', lambda *_: None)
            emit('node', name)
            if name == 'run_specialists':
                # Retain the old patch point for integrations, inside the graph.
                from . import specialists, runner
                fn = runner._run_specialists_mock
                if fn is specialists.run_all_specialists:
                    fn = specialists._run_specialists_mock
                snapshot = dict(state)
                delta = await fn(snapshot, emit=emit)
                if delta is None:
                    delta = {k: snapshot[k] for k in ('agent_results', 'evidence', 'completed_agents', 'failed_agents', 'errors', 'evidence_gaps', 'timestamps')}
            else:
                delta = await getattr(nodes, f'node_{name}')(state)
            if name == 'analyze_query':
                emit('analysis', {key: delta.get(key) for key in ('intent', 'entities', 'compare_mode')})
            elif name in ('create_plan', 'apply_routing_policy'):
                if delta.get('selected_agents'):
                    emit('agents', delta.get('selected_agents', []))
            elif name == 'build_report':
                emit('report', delta.get('report'))
            return delta
        return run
    previous = START
    for name in STAGES:
        workflow.add_node(name, wrapped(name))
        workflow.add_edge(previous, name)
        previous = name
    workflow.add_edge(previous, END)
    return workflow.compile(checkpointer=checkpointer)


_graph_singleton = None


def get_graph():
    global _graph_singleton
    if _graph_singleton is None:
        _graph_singleton = build_research_graph()
    return _graph_singleton


def uses_real_llm():
    from ..llm import is_mock
    return not is_mock()


uses_real_crew = uses_real_llm


def build_llm(temperature=0.2):
    from ..llm import get_llm
    return get_llm(temperature=temperature)


async def run_flow(query, job_id, document_ids=None, on_event=None):
    state = ResearchState(query=query, job_id=job_id, document_ids=list(document_ids or []),
                          mode='auto', entities=[], selected_agents=[], agent_results={}, evidence=[],
                          evidence_gaps=[], completed_agents=[], failed_agents=[], errors=[], timestamps={},
                          bull_case=[], bear_case=[], risks=[], what_could_change_view=[], conflicts=[])
    return await get_graph().ainvoke(state, config={'configurable': {'emit': on_event or (lambda *_: None)}})


async def run_research(query, job_id, document_ids=None, on_event=None):
    return await run_flow(query, job_id, document_ids, on_event)
