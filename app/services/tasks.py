import asyncio
from uuid import UUID
from app.database.session import AsyncSessionLocal
from app.database.crud import (
    create_backtest,
    get_backtest,
    update_backtest,
)
from app.services.backtesting import run_backtest
from app.database.crud import get_all_backtests
from app.services.market_data import download_market_data


async def execute_backtest(task_id, request):
    async with AsyncSessionLocal() as session:
        await update_backtest(session, task_id, "running")

    try:
        await download_market_data(pair=request.pair, timeframe=request.timeframe, timerange=request.timerange)
        metrics = await run_backtest(request, str(task_id))

        async with AsyncSessionLocal() as session:
            await update_backtest(
                session,
                task_id,
                status="completed",
                metrics=metrics,
            )

    except Exception as error:
        async with AsyncSessionLocal() as session:
            await update_backtest(
                session,
                task_id,
                status="failed",
                error=str(error),
            )


async def create_backtest_task(request):
    async with AsyncSessionLocal() as session:
        backtest = await create_backtest(session, request)

    asyncio.create_task(execute_backtest(backtest.id, request))

    return {
        "task_id": str(backtest.id),
        "status": backtest.status,
        "metrics": backtest.metrics,
    }


async def get_backtest_task(task_id: UUID):
    async with AsyncSessionLocal() as session:
        backtest = await get_backtest(session, task_id)

        if backtest is None:
            return None

        return {
            "task_id": str(backtest.id),
            "strategy": backtest.strategy,
            "pair": backtest.pair,
            "timerange": backtest.timerange,
            "timeframe": backtest.timeframe,
            "balance": backtest.balance,
            "status": backtest.status,
            "metrics": backtest.metrics,
            "error": backtest.error,
            "created_at": backtest.created_at,
        }

async def get_all_backtest_tasks():
    async with AsyncSessionLocal() as session:
        backtests = await get_all_backtests(session)

        return [
            {
                "task_id": str(backtest.id),
                "strategy": backtest.strategy,
                "pair": backtest.pair,
                "timerange": backtest.timerange,
                "timeframe": backtest.timeframe,
                "balance": backtest.balance,
                "status": backtest.status,
                "metrics": backtest.metrics,
                "error": backtest.error,
                "created_at": backtest.created_at,
            }
            for backtest in backtests
        ]