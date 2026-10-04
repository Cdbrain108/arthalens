# Bulls Eye — Evaluation & Testing Framework

Quality is enforced at four gates. A run is only "good" when all four pass.

## 1. Benchmarks

### Routing benchmark (target ≥ 90% exact-match)

| Question | Expected agents | Failure mode to watch |
|---|---|---|
| Why did TCS move today? | market, news | over-routing to financial/valuation |
| Should I buy TCS for 5 years? | financial, valuation, growth, market, news, risk | missing risk or growth |
| Is TCS hiring? | workforce, news | inventing hiring stats |
| Compare TCS vs Infosys on financial health and valuation | financial, valuation, market, risk | asymmetric coverage across the two companies |
| Explain this annual report (uploaded) | document, financial, risk | skipping the document agent |

Scored automatically: exact match = 1.0, superset (over-route) = 0.5, missing required = 0.0.

### Retrieval benchmark
20 questions against an indexed annual report; target Recall@5 ≥ 0.85 and every answer's citation page verified.

### Calculation benchmark
30 ratio computations against hand-checked values; target **100%** — this layer is pure code, no tolerance.

### Evidence completeness
Sampled runs: % of numeric/event claims with a resolvable source. Target ≥ 95%; the remainder must appear in `evidence_gaps`.

## 2. Test layers

| Layer | Tooling | Scope |
|---|---|---|
| Unit | pytest | ratio formulas, normalization, chunking, validators (seeded conflict cases), schema parse |
| Contract | pytest + recorded fixtures | each agent's `AgentResult` shape; each tool's envelope |
| Graph | pytest + LangGraph checkpoint replay | routing edges, reducer behavior on parallel writes, retry budget, resume-after-crash |
| Golden report | snapshot | same fixed state → byte-comparable HTML structure |
| E2E | playwright (1 happy path) | prompt → status transitions → PDF download |

## 3. CI gates

1. `pytest -q` all green
2. `python -m evals.routing` ≥ 0.90
3. No frontend component references fields absent from `JobStatus` (schema lint)
4. No agent module imports a PDF/render module (dependency lint — one-directional layers)

## 4. Run provenance (reproducibility record per job)

job ID · query · timestamp · selected agents + planner rationale · model/provider per role · source set + fetch timestamps · report schema version · cache-hit map. Stored in `data/jobs.sqlite`; replayable via the graph checkpointer.
