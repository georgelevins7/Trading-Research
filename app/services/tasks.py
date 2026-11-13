import asyncio
from uuid import uuid4

from app.services.backtesting import run_backtest

tasks = {}


async def execute_backtest(task_id, request):
    tasks[task_id]["status"] = "running"

    try:
        metrics = await run_backtest(request, task_id)

        tasks[task_id]["status"] = "completed"
        tasks[task_id]["metrics"] = metrics

    except Exception as error:
        tasks[task_id]["status"] = "failed"
        tasks[task_id]["error"] = str(error)


def create_backtest_task(request):
    task_id = str(uuid4())

    tasks[task_id] = {
        "task_id": task_id,
        "status": "pending",
        "metrics": None,
    }

    asyncio.create_task(
        execute_backtest(task_id, request)
    )

    return tasks[task_id]


def get_backtest_task(task_id):
    return tasks.get(task_id)