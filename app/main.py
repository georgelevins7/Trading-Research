from fastapi import FastAPI
from app.api.backtests import router as backtests_router

app = FastAPI(
    title="Trading Research API",
    description="API for running backtests and managing trading strategies",
    version="1.0.0"
)
app.include_router(backtests_router)