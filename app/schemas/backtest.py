from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, PositiveFloat


class BacktestRequest(BaseModel):
    pair: str
    strategy: str
    timerange: str
    timeframe: str
    balance: float = Field(default=1000, gt=0)

    stoploss_pct: float | None = Field(default=None, gt=0, lt=100)
    take_profit_pct: float | None = Field(default=None, gt=0, lt=100)
    trailing_stop: bool | None = None

    stake_amount: PositiveFloat | Literal["unlimited"] | None = None
    max_open_trades: int | None = Field(default=None, ge=1)
    fee_pct: float | None = Field(default=None, ge=0, lt=100)


class CompareRequest(BaseModel):
    task_ids: list[UUID] = Field(min_length=2, max_length=30)


class DraftBacktestRequest(BaseModel):
    pair: str
    timeframe: str
    timerange: str
    balance: float = Field(default=1000, gt=0)
    stoploss_pct: float | None = Field(default=None, gt=0, lt=100)
    take_profit_pct: float | None = Field(default=None, gt=0)
    trailing_stop: bool | None = None
    max_open_trades: int | None = Field(default=None, ge=1)
    fee_pct: float | None = Field(default=None, ge=0)
    stake_amount: float | None = Field(default=None, gt=0)