from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas.backtest import BacktestRequest
from app.services.tasks import create_backtest_task, get_backtest_task, get_all_backtest_tasks
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
async def get_backtest(task_id: UUID, user: User = Depends(get_current_user)):
    task = await get_backtest_task(task_id, user.id)
    if not task:
        raise HTTPException(404, "Backtest not found")

    return task


@router.get("/")
async def get_backtests(user: User = Depends(get_current_user)):
    return await get_all_backtest_tasks(user.id)


@router.post("/compare")
async def compare_backtest(request: CompareRequest, user: User = Depends(get_current_user)):
    try:
        return await compare_backtests(request.task_ids, user.id)
    except ValueError as e:
        raise HTTPException(400, str(e))
