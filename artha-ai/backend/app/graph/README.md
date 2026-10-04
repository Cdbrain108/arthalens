# LangGraph Orchestration Engine (`backend/app/graph/`)

## 1. Overview & Architecture Philosophy

The research engine uses **LangGraph** as its master orchestration framework. 

Unlike previous role-playing frameworks (such as CrewAI) where agents interact via freeform chat prompts, LangGraph models the research workflow as an **explicit, deterministic Finite-State Machine (StateGraph)**.

### Why LangGraph for Stock Research?
1. **Explicit State Control**: Every step receives a strongly-typed `ResearchState` dictionary, computes updates, and returns a state delta.
2. **Determinism**: Transitions between stages (e.g. analysis → planning → research → validation → synthesis → PDF) are governed by hard edges, eliminating infinite loops.
3. **Traceability & Checkpointing**: Every intermediate node transition emits lifecycle events and timestamps, enabling real-time UI progress tracking and resume-after-crash persistence.
4. **Clean Concurrency**: Specialists are fanned out in parallel with strict per-agent timeout budgets and independent error isolation.

```mermaid
flowchart TD
    START([START: User Query]) --> N1[1. analyze_query]
    N1 --> N2[2. create_plan]
    N2 --> N3[3. apply_routing_policy]
    N3 --> N4[4. run_specialists (Parallel Fan-out)]
    
    subgraph Specialists["Concurrent Specialist Agents"]
        direction LR
        S1[Financial] 
        S2[Valuation] 
        S3[Market] 
        S4[News] 
        S5[Risk] 
        S6[Growth] 
        S7[Document]
    end
    N4 -.-> Specialists
    Specialists -.-> N5
    
    N5[5. collect_results] --> N6[6. validate_evidence]
    N6 --> N7[7. challenge_thesis]
    N7 --> N8[8. synthesize_report]
    N8 --> N9[9. build_report]
    N9 --> N10[10. generate_pdf]
    N10 --> END([END: Final Report & PDF Ready])
```

---

## 2. State Schema (`ResearchState`)

Defined in `app/graph/state.py`. Every node receives this state and returns only the fields it modifies:

```python
class ResearchState(TypedDict, total=False):
    # Session inputs
    query: str                       # Original user question
    job_id: str                      # Unique UUID for the run
    document_ids: list[str]          # Optional uploaded PDF IDs
    mode: str                        # "auto" or specified mode

    # Query Understanding
    intent: Optional[str]            # e.g., "long_term", "price_move", "compare"
    entities: list[dict]             # Target companies, tickers, exchanges (NSE/NYSE)
    time_horizon: Optional[str]      # e.g., "5y", "1y", "quarterly"
    compare_mode: bool               # True if benchmarking multiple stocks
    research_plan: Optional[dict]    # List of research steps & required evidence
    selected_agents: list[str]       # Policy-enforced list of active specialists

    # Specialist Output
    agent_results: dict[str, Any]    # Map of agent_name -> AgentResult
    evidence: list[dict]             # Extracted evidence items with citations
    evidence_gaps: list[str]         # Missing data points explicitly noted
    completed_agents: list[str]      # Agents that succeeded
    failed_agents: list[str]         # Agents that timed out or failed
    errors: list[dict]               # Non-fatal error logs

    # Validation & Adversarial Testing
    validation_results: list[dict]   # Audit status for every claim
    conflicts: list[dict]            # Factual discrepancies found between sources
    rejected_evidence: list[dict]    # Excluded unverifiable claims
    bull_case: list[dict]            # Bull scenario supported by evidence IDs
    bear_case: list[dict]            # Bear scenario supported by evidence IDs
    risks: list[Any]                 # Key downside vectors
    what_could_change_view: list[str]# Catalysts that would flip the thesis

    # Final Artifacts
    synthesis: Optional[dict]        # Consolidated narrative
    report: Optional[dict]           # Complete ReportJSON
    pdf_path: Optional[str]          # Local filepath to rendered PDF deliverable

    # Lifecycle Tracking
    current_node: str                # Currently executing stage name
    timestamps: dict[str, str]       # Node-level execution timestamps (ISO-8601)
```

---

## 3. The 10 Graph Nodes (Step-by-Step)

| Step | Node Name | Implementation | Function & Responsibility |
| :--- | :--- | :--- | :--- |
| **1** | `analyze_query` | `nodes.node_analyze_query` | Extracts intent, companies, tickers, and exchange rules (defaults Indian stocks to NSE). |
| **2** | `create_plan` | `nodes.node_create_plan` | Proposes research steps, required evidence checklist, and candidate agents. |
| **3** | `apply_routing_policy` | `nodes.node_apply_routing_policy` | Deterministic guardrail enforcing minimum agents, hard exclusions, and maximum agent concurrency caps (max 6, or 8 for comparisons). |
| **4** | `run_specialists` | `nodes.node_run_specialists` | Dispatches routed specialists in parallel using `asyncio.gather` with per-agent timeout protection. |
| **5** | `collect_results` | `nodes.node_collect_results` | Gathers specialist results, deduplicates citations, and sorts in routing priority. |
| **6** | `validate_evidence` | `nodes.node_validate_evidence` | Cross-verifies evidence items against schemas and flags numerical conflicts between sources. |
| **7** | `challenge_thesis` | `nodes.node_challenge_thesis` | Adversarial reviewer that stress-tests findings to construct balanced Bull vs Bear cases. |
| **8** | `synthesize_report` | `nodes.node_synthesize_report` | Synthesizes qualitative insights strictly grounded in validated evidence items. |
| **9** | `build_report` | `nodes.node_build_report` | Computes quantitative ratios in pure Python and structures the final `ReportJSON`. |
| **10** | `generate_pdf` | `nodes.node_generate_pdf` | Renders publication-ready PDF deliverable with charts, tables, and evidence citations. |

---

## 4. Key Modules in `app/graph/`

- **`state.py`**: Defines the shared `ResearchState` TypedDict.
- **`nodes.py`**: Contains the 10 node functions that execute pipeline stages.
- **`builder.py`**: Constructs and compiles the LangGraph `StateGraph(ResearchState)`.
- **`runner.py`**: High-level execution gateway that streams node lifecycle events to FastAPI and the SQLite JobManager.
- **`specialists.py`**: Specialist concurrency runner supporting both ₹0 deterministic mock mode and live LLM tool execution.
- **`routing.py`**: Deterministic routing policy rules that prevent over- or under-routing.
- **`meta.py`**: Direct Pydantic structured output callers (`analyze`, `plan`, `challenge`, `synthesize`, `answer_report_question`).
