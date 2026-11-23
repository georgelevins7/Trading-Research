import requests
from langchain_core.tools import tool
from app.schemas.backtest import BacktestRequest
import time
from app.ai.strategies.pipeline import generate_reviewed_draft

@tool
def get_backtest_result(task_id: str) -> dict:
    """Get the status and results of a backtest by its task ID."""

    response = requests.get(
        f"http://127.0.0.1:8000/backtests/{task_id}",
        timeout=15
    )

    response.raise_for_status()
    return response.json()

@tool(args_schema=BacktestRequest)
def start_backtest(**data):
    """Run a backtest of a trading strategy on the Spot market."""

    response = requests.post(
        "http://127.0.0.1:8000/backtests/",
        json=data,
        timeout=15
    )

    response.raise_for_status()

    data = response.json()
    task_id = data["task_id"]

    for i in range(60):
        result = get_backtest_result.invoke({"task_id": task_id})

        if result["status"] in ["completed", "failed"]:
            return result

        time.sleep(5)

    return result

@tool
def list_strategies():
    """Get the names of all available Freqtrade trading strategies."""
    response = requests.get(
        "http://127.0.0.1:8000/strategies/",
        timeout=60
    )
    response.raise_for_status()
    return response.json()

@tool
def get_strategy_details(strategy_name: str):
    """Get the source code and details of an available trading strategy."""
    response = requests.get(
        f"http://127.0.0.1:8000/strategies/{strategy_name}",
        timeout=60
    )
    response.raise_for_status()
    return response.text

@tool
def search_strategy_catalog(query: str):
    """Search for trading strategies by their trading logic using semantic similarity."""
    response = requests.get(
        "http://127.0.0.1:8000/strategies/search",
        params={"query": query},
        timeout=60
    )
    response.raise_for_status()
    return response.json()

@tool
def generate_strategy_draft(request: str):
    """Generate and AI-review a Freqtrade strategy draft without executing it."""
    return generate_reviewed_draft(request)