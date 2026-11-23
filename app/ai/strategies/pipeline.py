from app.ai.strategies.generator import (generate_strategy, save_strategy_draft)
from app.ai.strategies.reviewer import review_strategy
from app.ai.strategies.validator import validate_draft

def generate_reviewed_draft(request: str):
    current_request = request
    last_error = None

    for attempt in range(1, 5):
        print(f"Generation attempt: {attempt}")

        try:
            strategy = generate_strategy(current_request)

        except ValueError as error:
            last_error = str(error)

            current_request = (
                f"Original request:\n{request}\n\n"
                f"Previous generation failed validation:\n{last_error}\n"
                "Generate a corrected strategy."
            )
            continue

        review = review_strategy(request, strategy.source_code)

        if review.approved:
            path = save_strategy_draft(strategy)

            try:
                validation = validate_draft(path)

            except ValueError as error:
                path.unlink(missing_ok=True)
                last_error = str(error)

                current_request = (
                    f"Original request:\n{request}\n\n"
                    f"Previous code:\n{strategy.source_code}\n\n"
                    f"Freqtrade validation error:\n{last_error}\n\n"
                    "Fix the error while preserving the trading logic."
                )
                continue

            return {
                "draft_id": path.stem,
                "name": strategy.name,
                "source_code": strategy.source_code,
                "draft_path": str(path),
                "attempts": attempt,
                "review": review.model_dump(),
                "validation": validation,
                "status": "pending_approval",
            }

        last_error = "\n".join(review.issues) or "Reviewer rejected the strategy."

        current_request = (
            f"Original request:\n{request}\n\n"
            f"Previous code:\n{strategy.source_code}\n\n"
            f"Reviewer issues:\n{last_error}\n\n"
            "Fix the issues while preserving the requested trading logic."
        )

    raise ValueError(
        f"Strategy failed after 3 corrections: {last_error}"
    )