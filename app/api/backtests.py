from fastapi import APIRouter, HTTPException, status
from app.schemas.backtest import BacktestRequest
from app.services.backtesting import run_backtest
from app.services.tasks import create_backtest_task, get_backtest_task

router = APIRouter(prefix="/backtests", tags=["Backtests"])

@router.get("/health")
def health_check():
    return {"status": "ok"}

@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def create_backtest(request: BacktestRequest):
    return create_backtest_task(request)

@router.get("/{task_id}")
async def get_backtest(task_id: str):
    task = get_backtest_task(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest not found")
    return task