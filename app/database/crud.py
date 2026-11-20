from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.models import Backtest
from app.schemas.backtest import BacktestRequest
from sqlalchemy import select

async def create_backtest(session: AsyncSession, request: BacktestRequest):
    backtest = Backtest(
        strategy=request.strategy,
        pair=request.pair,
        timeframe=request.timeframe,
        timerange=request.timerange,
        balance=request.balance,
        status="pending",
    )

    session.add(backtest)
    await session.commit()
    await session.refresh(backtest)

    return backtest


async def get_backtest(session: AsyncSession, task_id: UUID):
    return await session.get(Backtest, task_id)

async def get_all_backtests(session: AsyncSession):
    result = await session.execute(select(Backtest).order_by(Backtest.created_at.desc()))
    return result.scalars()

async def update_backtest(
    session: AsyncSession,
    task_id: UUID,
    status: str,
    metrics: dict | None = None,
    error: str | None = None,
):
    backtest = await session.get(Backtest, task_id)

    if backtest is None:
        raise ValueError("Backtest not found")

    backtest.status = status
    backtest.metrics = metrics
    backtest.error = error

    await session.commit()

    return backtest