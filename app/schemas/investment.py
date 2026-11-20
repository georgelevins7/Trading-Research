from datetime import datetime
from pydantic import BaseModel, Field


class DCARequest(BaseModel):
    pair: str
    amount: float = Field(gt=0)
    weekday: int = Field(ge=0, le=6)
    hour: int = Field(ge=0, le=23)
    minute: int = Field(default=0, ge=0, le=59)
    timezone: str
    start: datetime
    end: datetime
    fee_pct: float = Field(default=0.1, ge=0, lt=100)