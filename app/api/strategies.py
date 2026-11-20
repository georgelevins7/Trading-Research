from fastapi import APIRouter
from app.services.strategies import list_strategies
from fastapi import HTTPException
from app.services.strategies import read_strategy

router = APIRouter(
    prefix="/strategies",
    tags=["Strategies"]
)


@router.get("/")
async def get_strategies():
    return await list_strategies()

@router.get("/{strategy_name}")
async def get_strategy(strategy_name: str):
    strategy = read_strategy(strategy_name)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy