from app.services.tasks import get_backtest_task

async def compare_backtests(task_ids):
    results = []

    for task_id in dict.fromkeys(task_ids):
        task = await get_backtest_task(task_id)

        if task is None:
            raise ValueError(f"Backtest {task_id} not found")

        if task["status"] != "completed":
            raise ValueError(f"Backtest {task_id} is not completed")

        results.append(task)

    if len(results) < 2:
        raise ValueError("At least two different backtests required")

    leaders = {}

    criteria = {
        "highest_profit": ("profit_pct", max),
        "lowest_drawdown": ("max_drawdown_pct", min),
        "best_sharpe": ("sharpe", max),
        "best_sortino": ("sortino", max),
        "best_win_rate": ("win_rate_pct", max),
        "best_profit_factor": ("profit_factor", max),
    }

    for name, (metric, selector) in criteria.items():
        available = [
            task for task in results
            if task["metrics"].get("total_trades", 0) > 0
            and task["metrics"].get(metric) is not None
        ]

        if available:
            best = selector(
                available,
                key=lambda task: task["metrics"][metric]
            )

            leaders[name] = {
                "task_id": best["task_id"],
                "value": best["metrics"][metric],
            }

    return {
        "results": results,
        "leaders": leaders,
    }