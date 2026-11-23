from pydantic import BaseModel, Field, field_validator

class StrategyProfile(BaseModel):
    name: str
    description: str
    indicators: list[str] = Field(default_factory=list)
    signal_indicators: list[str] = Field(default_factory=list)
    entry_conditions: list[str] = Field(default_factory=list)
    exit_conditions: list[str] = Field(default_factory=list)
    parameters: dict[str, int | float | bool | str] = Field(default_factory=dict)
    timeframe: str | None = None
    stoploss: float | None = None
    minimal_roi: dict[str, float] = Field(default_factory=dict)


    @field_validator("indicators", "signal_indicators")
    @classmethod
    def normalize_indicators(cls, values: list[str]):
        raw_columns = {"OPEN", "HIGH", "LOW", "CLOSE", "VOLUME"}

        return list(dict.fromkeys(name.strip().upper()
            for name in values
            if name.strip() and name.strip().upper() not in raw_columns))
