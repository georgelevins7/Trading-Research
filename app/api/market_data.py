from fastapi import APIRouter
from app.services.market_data import get_available_pairs, get_available_timeframes


router = APIRouter(
    prefix="/market",
    tags=["Market Data"],
)


@router.get("/pairs")
async def get_pairs():
    return await get_available_pairs()


@router.get("/timeframes")
async def get_timeframes():
    return await get_available_timeframes()