from fastapi import APIRouter, HTTPException
from app.schemas.investment import DCARequest
from app.services.investment import simulate_dca

router = APIRouter(prefix="/investments", tags=["Investments"])

@router.post("/dca")
async def run_dca(request: DCARequest):
    try:
        return await simulate_dca(request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))