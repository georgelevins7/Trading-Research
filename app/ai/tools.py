import requests
from langchain_core.tools import tool
from app.schemas.backtest import BacktestRequest
import time
from app.ai.strategies.pipeline import generate_reviewed_draft
from langchain.tools import ToolRuntime

@tool
def get_backtest_result(task_id: str, runtime: ToolRuntime) -> dict:
    """Get the status and results of a backtest by its task ID."""

    response = requests.get(
        f"http://127.0.0.1:8000/backtests/{task_id}",
        headers={
            "Authorization": f"Bearer {runtime.context['token']}"
        },
        timeout=15)

    response.raise_for_status()
    return response.json()

@tool(args_schema=BacktestRequest)
def start_backtest(runtime: ToolRuntime, **data):
    """Start a Spot backtest when explicitly requested by the user."""

    response = requests.post(
        "http://127.0.0.1:8000/backtests/",
        json=data,
        headers={
            "Authorization": f"Bearer {runtime.context['token']}"
        },
        timeout=30)

    response.raise_for_status()
    return response.json()

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
def generate_strategy_draft(request: str, runtime: ToolRuntime):
    """Generate a reviewed strategy draft ONLY when explicitly requested."""

    response = requests.post(
        "http://127.0.0.1:8000/drafts/generate",
        json={"request": request},
        headers={
            "Authorization": f"Bearer {runtime.context['token']}"
        },
        timeout=300)

    response.raise_for_status()
    return response.json()