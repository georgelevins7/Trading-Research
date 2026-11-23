from fastapi import APIRouter
from app.services.strategies import list_strategies
from fastapi import HTTPException
from app.services.strategies import read_strategy
from app.ai.strategies.rag import search_strategies

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

@router.get("/{strategy_name}")
async def get_strategy(strategy_name: str):
    strategy = read_strategy(strategy_name)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy