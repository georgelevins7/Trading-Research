from pydantic import BaseModel, Field
from uuid import UUID

class BacktestRequest(BaseModel):
    pair: str
    strategy: str
    timerange: str
    timeframe: str
    balance: float = Field(gt=0, default=1000)

class CompareRequest(BaseModel):
    task_ids: list[UUID] = Field(min_length=2, max_length=30)