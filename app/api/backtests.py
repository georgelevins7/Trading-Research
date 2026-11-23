from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas.backtest import BacktestRequest
from app.services.tasks import create_backtest_task, get_backtest_task
from uuid import UUID
from app.services.tasks import get_all_backtest_tasks
from app.schemas.backtest import CompareRequest
from app.services.analytics import compare_backtests
from app.security import get_current_user
from app.database.models import User

router = APIRouter(
    prefix="/backtests",
    tags=["Backtests"]
)

@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def create_backtest(request: BacktestRequest, user: User = Depends(get_current_user)):
    return await create_backtest_task(request, user.id)

@router.get("/{task_id}")
async def get_backtest(task_id: UUID):
    task = await get_backtest_task(task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest not found")
    return task

@router.get("/", status_code=status.HTTP_200_OK)
async def get_backtests():
    return await get_all_backtest_tasks()

@router.post("/compare", status_code=status.HTTP_200_OK)
async def compare_backtest(request: CompareRequest):
    try:
        return await compare_backtests(request.task_ids)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
