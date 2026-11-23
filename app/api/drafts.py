from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from app.ai.strategies.pipeline import generate_reviewed_draft
from app.database.models import StrategyDraft, User, StrategyRecord
from app.database.session import AsyncSessionLocal
from app.security import get_current_user
from uuid import UUID
from pathlib import Path
from app.schemas.backtest import DraftBacktestRequest
from app.services.tasks import create_draft_backtest_task
from hashlib import sha256
from sqlalchemy import select

router = APIRouter(prefix="/drafts", tags=["Drafts"])

class DraftRequest(BaseModel):
    request: str = Field(min_length=10)


@router.post("/generate")
async def create_draft(data: DraftRequest, user: User = Depends(get_current_user)):
    try:
        result = await run_in_threadpool(generate_reviewed_draft, data.request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    
    code_hash = sha256(Path(result["draft_path"]).read_bytes()).hexdigest()
    async with AsyncSessionLocal() as session:
        draft = StrategyDraft(
            owner_id=user.id,
            name=result["name"],
            draft_path=result["draft_path"],
            status="pending_approval",
            code_hash=code_hash
        )

        session.add(draft)
        await session.commit()
        await session.refresh(draft)

    return {
        "id": draft.id,
        "name": draft.name,
        "status": draft.status,
        "review": result["review"],
        "validation": result["validation"]
    }

@router.post("/{draft_id}/approve")
async def approve_draft(draft_id: UUID, user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        draft = await session.get(StrategyDraft, draft_id)

        if draft is None or draft.owner_id != user.id:
            raise HTTPException(404, "Draft not found")

        if draft.status != "pending_approval":
            raise HTTPException(409, "Draft is not awaiting approval")

        if draft.code_hash is None:
            raise HTTPException(409, "Draft has no code hash")

        try:
            current_hash = sha256(Path(draft.draft_path).read_bytes()).hexdigest()
        except OSError:
            raise HTTPException(409, "Draft file unavailable")

        if current_hash != draft.code_hash:
            raise HTTPException(409, "Draft code has changed")
        
        draft.status = "approved_for_backtest"
        await session.commit()

    return {
        "id": draft_id,
        "status": "approved_for_backtest"
    }

@router.get("/{draft_id}")
async def get_draft(draft_id: UUID, user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        draft = await session.get(StrategyDraft, draft_id)

        if draft is None or draft.owner_id != user.id:
            raise HTTPException(404, "Draft not found")

        source_code = Path(draft.draft_path).read_text(encoding="utf-8")

        return {
            "id": draft.id,
            "name": draft.name,
            "status": draft.status,
            "source_code": source_code,
        }

@router.post("/{draft_id}/backtest", status_code=202)
async def start_draft_backtest(draft_id: UUID, data: DraftBacktestRequest, user: User = Depends(get_current_user)):
    try:
        return await create_draft_backtest_task(
            draft_id,
            user.id,
            data
        )
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Approved draft not found"
        )

@router.post("/{draft_id}/save")
async def save_draft(draft_id: UUID, user: User = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        draft = await session.get(StrategyDraft, draft_id)

        if draft is None or draft.owner_id != user.id:
            raise HTTPException(404, "Draft not found")

        if draft.status != "approved_for_backtest":
            raise HTTPException(409, "Draft not approved")

        try:
            current_hash = sha256(
                Path(draft.draft_path).read_bytes()).hexdigest()
        except OSError:
            raise HTTPException(409, "Draft file unavailable")

        if current_hash != draft.code_hash:
            raise HTTPException(409, "Draft code has changed")

        existing = await session.scalar(
            select(StrategyRecord).where(
                StrategyRecord.owner_id == user.id,
                StrategyRecord.code_path == draft.draft_path,
            )
        )

        if existing:
            return {"id": existing.id, "status": "saved"}

        strategy = StrategyRecord(
            name=draft.name,
            profile={
                "name": draft.name,
                "description": "",
            },
            code_path=draft.draft_path,
            code_hash=draft.code_hash,
            owner_id=user.id,
            visibility="private",
            moderation_status="not_requested",
        )

        session.add(strategy)
        await session.commit()
        await session.refresh(strategy)

        return {"id": strategy.id, "status": "saved"}