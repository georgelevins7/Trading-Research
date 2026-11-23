from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.backtest import BacktestRequest
from sqlalchemy import select
from app.database.models import Backtest, StrategyRecord
from app.schemas.strategy_catalog import StrategyProfile
from app.database.models import StrategyDraft


async def create_backtest(
    session: AsyncSession,
    request: BacktestRequest,
    owner_id: UUID | None = None,
    draft_id: UUID | None = None,
):
    backtest = Backtest(
        strategy=request.strategy,
        pair=request.pair,
        timeframe=request.timeframe,
        timerange=request.timerange,
        balance=request.balance,
        status="pending",
        owner_id=owner_id,
        draft_id=draft_id,
    )

    session.add(backtest)
    await session.commit()
    await session.refresh(backtest)

    return backtest



async def get_backtest(session: AsyncSession, task_id: UUID):
    return await session.get(Backtest, task_id)

async def get_all_backtests(session: AsyncSession, owner_id: UUID):
    result = await session.execute(select(Backtest).where(Backtest.owner_id == owner_id).
                                   order_by(Backtest.created_at.desc()))
    return result.scalars().all()

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

async def save_builtin_strategy(
    session: AsyncSession,
    profile: StrategyProfile,
    code_path: str,
    code_hash: str
):
    existing = await session.scalar(select(StrategyRecord).where(StrategyRecord.name == profile.name))

    if existing:
        if existing.code_hash == code_hash:
            return existing

        raise ValueError("Strategy code has changed. A new version is required.")

    strategy = StrategyRecord(
        name=profile.name,
        profile=profile.model_dump(),
        code_path=code_path,
        code_hash=code_hash,
        version=1,
        owner_id=None,
        visibility="public",
        moderation_status="approved"
    )

    session.add(strategy)
    await session.commit()
    await session.refresh(strategy)

    return strategy


async def get_public_strategies(session: AsyncSession):
    result = await session.execute(
        select(StrategyRecord).where(
            StrategyRecord.visibility == "public",
            StrategyRecord.moderation_status == "approved"
        )
    )

    return result.scalars().all()

async def get_approved_draft(session: AsyncSession, draft_id: UUID, owner_id: UUID):

    return await session.scalar(
        select(StrategyDraft).where(
            StrategyDraft.id == draft_id,
            StrategyDraft.owner_id == owner_id,
            StrategyDraft.status == "approved_for_backtest"
        )
    )
