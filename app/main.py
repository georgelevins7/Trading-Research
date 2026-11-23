from fastapi import FastAPI
from app.api.backtests import router as backtests_router
from app.api.strategies import router as strategies_router
from app.api.market_data import router as market_data_router
from app.api.investment import router as investment_router
from app.api.auth import router as auth_router
from app.api.drafts import router as drafts_router

app = FastAPI(
    title="Trading Research API",
    description="API for running backtests and managing trading strategies",
    version="1.0.0"
)
app.include_router(backtests_router)
app.include_router(strategies_router)
app.include_router(market_data_router)
app.include_router(investment_router)
app.include_router(auth_router)
app.include_router(drafts_router)