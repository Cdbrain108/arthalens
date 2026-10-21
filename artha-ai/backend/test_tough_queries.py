import sys
import json
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from app.graph.meta import analyze
from app.report.schema import assemble_report

def run_tests():
    test_cases = [
        {
            "name": "Tough Case 1: Triple Tech Peer Comparison",
            "query": "Compare NVDA vs AMD vs INTC in terms of data center revenue growth and margins",
            "expected_is_comparison": True,
            "expected_tickers": ["NVDA", "AMD", "INTC"],
            "mock_evidence": [
                {"agent": "financial", "claim": "NVIDIA data center revenue surged 112% YoY driven by Hopper and Blackwell architecture deployments.", "evidence_id": "ev_nvda_1", "entity": "NVDA", "metric": "revenue", "value": 30000, "unit": "USD"},
                {"agent": "financial", "claim": "AMD data center segment grew 80% propelled by Instinct MI300 series accelerators.", "evidence_id": "ev_amd_1", "entity": "AMD", "metric": "revenue", "value": 5800, "unit": "USD"},
                {"agent": "financial", "claim": "Intel data center operating income declined due to product transition costs and competitive pricing pressures.", "evidence_id": "ev_intc_1", "entity": "INTC", "metric": "revenue", "value": 12800, "unit": "USD"},
                {"agent": "market", "claim": "S&P 500 Index traded higher by 1.2% over the monthly period.", "evidence_id": "ev_bench_1", "entity": "^GSPC", "metric": "price", "value": 5800, "unit": "USD"},
                {"agent": "risk", "claim": "Semiconductor manufacturing supply chain concentration remains concentrated in high-end packaging capacity.", "evidence_id": "ev_risk_1", "entity": "NVDA", "sentiment": "negative"}
            ]
        },
        {
            "name": "Tough Case 2: Deep-Dive Risk Audit (Single Stock with Benchmark Evidence)",
            "query": "Detailed risk audit and thesis vulnerabilities for NVIDIA (NVDA) semiconductor supply chain",
            "expected_is_comparison": False,
            "expected_tickers": ["NVDA"],
            "mock_evidence": [
                {"agent": "risk", "claim": "Advanced packaging bottlenecks at TSMC constrain Blackwell volume delivery schedules.", "evidence_id": "ev_nvda_r1", "entity": "NVDA", "sentiment": "negative"},
                {"agent": "risk", "claim": "Export restrictions to certain geographic markets reduce serviceable addressable market.", "evidence_id": "ev_nvda_r2", "entity": "NVDA", "sentiment": "negative"},
                {"agent": "financial", "claim": "Operating margin reached 62.1% supported by enterprise software attach and pricing power.", "evidence_id": "ev_nvda_f1", "entity": "NVDA", "metric": "opm_pct", "value": 62.1, "unit": "%"},
                {"agent": "market", "claim": "NVDA trades at $138.25 with 52-week trading range of $45.12 to $140.76.", "evidence_id": "ev_nvda_m1", "entity": "NVDA", "metric": "price", "value": 138.25, "unit": "USD"},
                {"agent": "market", "claim": "S&P 500 benchmark index correlation is 1.42 beta.", "evidence_id": "ev_gspc_1", "entity": "^GSPC", "metric": "price", "value": 5815.2, "unit": "USD"}
            ]
        },
        {
            "name": "Tough Case 3: Action Decision on Banking Stock",
            "query": "Should I buy or sell HDFC Bank stock right now given NIM pressures?",
            "expected_is_comparison": False,
            "expected_tickers": ["HDFCBANK"],
            "mock_evidence": [
                {"agent": "financial", "claim": "HDFC Bank reported net profit of ₹16,820 Cr with steady loan growth across retail and commercial segments.", "evidence_id": "ev_hdfc_1", "entity": "HDFCBANK", "metric": "net_income", "value": 16820, "unit": "INR"},
                {"agent": "market", "claim": "HDFC Bank trades at ₹1,680.50 consolidating in a narrow channel.", "evidence_id": "ev_hdfc_m1", "entity": "HDFCBANK", "metric": "price", "value": 1680.50, "unit": "INR"},
                {"agent": "risk", "claim": "Deposit competition across banking sector moderates net interest margin expansion.", "evidence_id": "ev_hdfc_r1", "entity": "HDFCBANK", "sentiment": "negative"}
            ]
        },
        {
            "name": "Tough Case 4: Benchmark Comparison Query Edge Case",
            "query": "How does Microsoft perform against the S&P 500 benchmark?",
            "expected_is_comparison": False,
            "expected_tickers": ["MSFT"],
            "mock_evidence": [
                {"agent": "financial", "claim": "Microsoft Azure cloud revenue expanded 29% YoY with expanding operating margins.", "evidence_id": "ev_msft_1", "entity": "MSFT", "metric": "revenue", "value": 65000, "unit": "USD"},
                {"agent": "market", "claim": "Microsoft trades at $428.50 with a P/E multiple of 34.2x.", "evidence_id": "ev_msft_m1", "entity": "MSFT", "metric": "price", "value": 428.50, "unit": "USD"},
                {"agent": "market", "claim": "S&P 500 benchmark return over 12 months is 21.4%.", "evidence_id": "ev_gspc_m2", "entity": "^GSPC", "metric": "price", "value": 5850.0, "unit": "USD"}
            ]
        },
        {
            "name": "Tough Case 5: Discovery / Capital Allocation Query",
            "query": "I have 50000 rupees to invest for next 5 years, which stocks are good for future growth?",
            "expected_is_comparison": True,
            "expected_tickers": ["BEL", "ZOMATO", "TATAPOWER", "ITC"],
            "mock_evidence": [
                {"agent": "financial", "claim": "Bharat Electronics defended 25.2% OPM with sovereign defense order book backlog.", "evidence_id": "ev_bel_1", "entity": "BEL", "metric": "opm_pct", "value": 25.2, "unit": "%"},
                {"agent": "financial", "claim": "ITC defended high cash conversion and 36.8% operating margin.", "evidence_id": "ev_itc_1", "entity": "ITC", "metric": "opm_pct", "value": 36.8, "unit": "%"}
            ]
        }
    ]

    print("======================================================================")
    print("RUNNING TOUGH QUERY & SCHEMA ASSEMBLY INTEGRITY SUITE")
    print("======================================================================\n")

    failures = 0
    for i, tc in enumerate(test_cases, 1):
        print(f"--- [Test {i}]: {tc['name']} ---")
        print(f"Query: \"{tc['query']}\"")
        analysis = analyze(tc['query'])
        print(f"-> Extracted Entities: {[e.ticker for e in analysis.entities]}")
        print(f"-> Intent: {analysis.intent} | Compare Mode: {analysis.compare_mode}")

        state = {
            "query": tc["query"],
            "intent": analysis.intent,
            "entities": [e.model_dump() for e in analysis.entities],
            "compare_mode": analysis.compare_mode,
            "evidence": tc["mock_evidence"],
            "agent_results": {
                "financial": {"findings": [e["claim"] for e in tc["mock_evidence"] if e.get("agent") == "financial"]},
                "market": {"findings": [e["claim"] for e in tc["mock_evidence"] if e.get("agent") == "market"]},
                "risk": {"findings": [e["claim"] for e in tc["mock_evidence"] if e.get("agent") == "risk"]}
            }
        }

        report = assemble_report({}, state)
        r_dict = report.model_dump()

        # Check 1: is_comparison
        is_comp = report.company.get("is_comparison", False)
        print(f"-> Report is_comparison: {is_comp} (Expected: {tc['expected_is_comparison']})")
        if is_comp != tc["expected_is_comparison"]:
            print(f"   [FAIL] is_comparison mismatch!")
            failures += 1
        else:
            print(f"   [PASS] is_comparison matched expected.")

        # Check 2: No benchmark indices in company or peer cohort
        if is_comp:
            comp_entities = report.company.get("comparison", [])
            comp_tickers = [c.get("ticker") for c in comp_entities]
            print(f"-> Comparison Cohort Tickers: {comp_tickers}")
            if any(t.startswith("^") for t in comp_tickers):
                print(f"   [FAIL] Benchmark index leaked into comparison cohort: {comp_tickers}")
                failures += 1
            else:
                print(f"   [PASS] No benchmark indices in cohort.")
        else:
            comp_ticker = report.company.get("ticker")
            print(f"-> Single Entity Ticker: {comp_ticker}")
            if comp_ticker and comp_ticker.startswith("^"):
                print(f"   [FAIL] Benchmark index assigned as primary company ticker: {comp_ticker}")
                failures += 1
            else:
                print(f"   [PASS] Primary company ticker is clean.")

        # Check 3: Check for forbidden hardcoded strings
        serialized = json.dumps(r_dict).lower()
        forbidden_terms = ["h-1b", "us visa", "subcontractor costs", "12.1%–14.2%"]
        found_forbidden = [term for term in forbidden_terms if term in serialized]
        if found_forbidden:
            print(f"   [FAIL] Found forbidden hardcoded text: {found_forbidden}")
            failures += 1
        else:
            print(f"   [PASS] Zero hardcoded forbidden sector stories found.")

        # Check 4: Currency formatting matches currency
        if not is_comp:
            price_display = report.company.get("current_price", "")
            print(f"-> Display Price: {price_display}")
            if "NVDA" in tc["expected_tickers"] or "MSFT" in tc["expected_tickers"]:
                if price_display and not price_display.startswith("$"):
                    print(f"   [WARN] US stock price did not format with $: {price_display}")

        print("-> Executive Summary Excerpt:")
        exec_lines = (report.executive_summary or "").split("\n")
        print("   " + (exec_lines[0] if exec_lines else "N/A")[:120])
        print()

    print("======================================================================")
    if failures == 0:
        print("ALL 5 TOUGH QUESTION TESTS PASSED PERFECTLY WITH ZERO REGRESSIONS!")
    else:
        print(f"TESTS FINISHED WITH {failures} FAILURE(S).")
    print("======================================================================")
    sys.exit(failures)

if __name__ == "__main__":
    run_tests()
