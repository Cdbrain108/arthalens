"""Domain-boundary tests for chat and research requests."""

from app.api.research_routes import is_financial_or_stock_query


def test_financial_and_company_questions_remain_in_scope():
    queries = [
        "What is the ticker for Hindustan Aeronautics Limited?",
        "Does SpaceX have a stock or is it private?",
        "Explain free cash flow simply",
        "Analyze Palantir fundamentals",
        "Buddy, is the F-16 manufacturer listed in the stock market?",
        "tell me about Zoho",
        "What did each agent find in the report?",
        "Who are you?",
        "Analyze JIO IPO",
        "Jio IPO",
        "Yes, create full research report for JIO IPO",
        "Check valuation & financial metrics for JIO IPO",
        "Compare JIO IPO with industry peers",
        "Swiggy IPO grey market premium",
    ]

    for query in queries:
        assert is_financial_or_stock_query(query), query


def test_general_purpose_questions_are_out_of_scope():
    queries = [
        "How do black holes form?",
        "Who is the prime minister of India?",
        "Write a poem about rain",
        "Write an email asking for leave",
        "Plan a five day vacation in Goa",
        "Solve x^2 + 5x + 6 = 0",
        "Write a Python script to sort an array",
    ]

    for query in queries:
        assert not is_financial_or_stock_query(query), query
