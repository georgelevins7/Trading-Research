from pydantic import BaseModel, Field

class BacktestRequest(BaseModel):
    pair: str
    strategy: str
    timerange: str
    balance: float = Field(gt=0, default=1000)

