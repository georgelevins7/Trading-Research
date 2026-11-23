from fastapi import APIRouter, Depends
from app.services.strategies import list_strategies
from fastapi import HTTPException
from app.services.strategies import read_strategy
from app.ai.strategies.rag import search_strategies
from sqlalchemy import select
from app.database.models import StrategyRecord, User
from app.database.session import AsyncSessionLocal
from app.security import get_current_user, require_admin
from pydantic import BaseModel
from typing import Literal
from uuid import UUID
from pathlib import Path
from hashlib import sha256
from app.schemas.backtest import DraftBacktestRequest
from app.services.tasks import create_saved_strategy_backtest_task
from app.ai.strategies.embeddings import embed_strategy_code

class ModerationDecision(BaseModel):
    action: Literal["approve", "reject"]

router = APIRouter(
    prefix="/strategies",
    tags=["Strategies"]
)

@router.get("/")
async def get_strategies():
    return await list_strategies()

@router.get("/search")
async def search_strategy_catalog(query: str):
    return await search_strategies(query)

@router.get("/mine")
async def get_my_strategies(user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        result = await session.scalars(select(StrategyRecord).where(StrategyRecord.owner_id == user.id))

        return [
            {
                "id": strategy.id,
                "name": strategy.name,
                "visibility": strategy.visibility,
                "moderation_status": strategy.moderation_status,
            }
            for strategy in result.all()
        ]

@router.post("/{strategy_id}/submit")
async def submit_strategy(strategy_id: UUID, user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        strategy = await session.get(StrategyRecord, strategy_id)

        if strategy is None or strategy.owner_id != user.id:
            raise HTTPException(404, "Strategy not found")

        if strategy.moderation_status not in ("not_requested", "rejected"):
            raise HTTPException(409, "Strategy cannot be submitted")

        try:
            current_hash = sha256(
                Path(strategy.code_path).read_bytes()
            ).hexdigest()
        except OSError:
            raise HTTPException(409, "Strategy file unavailable")

        if current_hash != strategy.code_hash:
            raise HTTPException(409, "Strategy code has changed")

        strategy.visibility = "private"
        strategy.moderation_status = "pending"

        await session.commit()

        return {"id": strategy.id, "status": "pending"}

@router.get("/moderation/pending")
async def pending_strategies(admin: User = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        result = await session.scalars(select(StrategyRecord).where(StrategyRecord.moderation_status == "pending"))

        strategies = []

        for strategy in result.all():
            try:
                source = Path(strategy.code_path).read_text(encoding="utf-8")
            except OSError:
                source = None

            strategies.append({
                "id": strategy.id,
                "name": strategy.name,
                "owner_id": strategy.owner_id,
                "source_code": source,
            })

        return strategies

@router.post("/{strategy_id}/moderate")
async def moderate_strategy(strategy_id: UUID, decision: ModerationDecision, admin: User = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        strategy = await session.get(StrategyRecord, strategy_id)

        if strategy is None:
            raise HTTPException(404, "Strategy not found")

        if strategy.moderation_status != "pending":
            raise HTTPException(409, "Strategy is not pending")

        if decision.action == "approve":
            try:
                current_hash = sha256(Path(strategy.code_path).read_bytes()).hexdigest()
            except OSError:
                raise HTTPException(409, "Strategy file unavailable")

            if current_hash != strategy.code_hash:
                raise HTTPException(409, "Strategy code has changed")
            
            strategy.embedding = await embed_strategy_code(
                strategy.name,
                Path(strategy.code_path).read_text(encoding="utf-8"))

            strategy.visibility = "public"
            strategy.moderation_status = "approved"

        else:
            strategy.visibility = "private"
            strategy.moderation_status = "rejected"

        await session.commit()

        return {
            "id": strategy.id,
            "visibility": strategy.visibility,
            "moderation_status": strategy.moderation_status,
        }

@router.get("/catalog")
async def get_public_catalog():
    async with AsyncSessionLocal() as session:
        result = await session.scalars(
            select(StrategyRecord).where(
                StrategyRecord.visibility == "public",
                StrategyRecord.moderation_status == "approved",
            )
        )

        return [
            {
                "id": strategy.id,
                "name": strategy.name,
                "profile": strategy.profile,
                "version": strategy.version,
            }
            for strategy in result.all()
        ]

@router.post("/{strategy_id}/hide")
async def hide_strategy(strategy_id: UUID, admin: User = Depends(require_admin)):
    async with AsyncSessionLocal() as session:
        strategy = await session.get(StrategyRecord, strategy_id)

        if strategy is None:
            raise HTTPException(404, "Strategy not found")

        if strategy.visibility != "public":
            raise HTTPException(409, "Strategy is not public")

        strategy.visibility = "private"
        strategy.moderation_status = "hidden"

        await session.commit()

        return {
            "id": strategy.id,
            "status": "hidden",
        }

@router.post("/{strategy_id}/backtest", status_code=202)
async def backtest_saved_strategy(strategy_id: UUID, data: DraftBacktestRequest,
        user: User = Depends(get_current_user)):
    try:
        return await create_saved_strategy_backtest_task(strategy_id, user.id, data)
    except ValueError as error:
        raise HTTPException(404, str(error))

@router.get("/{strategy_name}")
async def get_strategy(strategy_name: str):
    strategy = read_strategy(strategy_name)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy