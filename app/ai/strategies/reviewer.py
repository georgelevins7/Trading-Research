from pydantic import BaseModel, Field
from app.ai.llm import model

class ReviewResult(BaseModel):
    approved: bool
    issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)

reviewer = model.with_structured_output(ReviewResult)

def review_strategy(request: str, source_code: str):
    return reviewer.invoke([
        (
            "system",
            """
            You are a senior Freqtrade strategy code reviewer.
            Review the Python strategy against the user's request.
            Check:
            - Entry and exit logic.
            - Indicator calculations and conditions.
            - Compliance with the user's requirements.
            - Freqtrade API usage.
            - Contradictory or unreachable conditions.
            - Suspicious imports and unsafe operations.
            Rules:
            - Set approved=false for significant problems.
            - Explain problems clearly in issues.
            - Provide specific fixes in suggestions.
            - Do not reject valid strategies based on preferences.
            - Do not execute the code.
            - Do not rewrite the strategy.
            """
        ),
        (
            "human",
            f"User request:\n{request}\n\nStrategy code:\n{source_code}"
        )
    ])
