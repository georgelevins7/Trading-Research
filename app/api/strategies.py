from fastapi import APIRouter, Depends
from app.services.strategies import list_strategies
from fastapi import HTTPException
from app.services.strategies import read_strategy
from app.ai.strategies.rag import search_strategies
from sqlalchemy import select
from app.database.models import StrategyRecord, User
from app.database.session import AsyncSessionLocal
from app.security import get_current_user

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

@router.get("/{strategy_name}")
async def get_strategy(strategy_name: str):
    strategy = read_strategy(strategy_name)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy