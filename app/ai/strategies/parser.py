from app.ai.llm import model
from app.ai.tools import get_strategy_details, list_strategies
from app.schemas.strategy_catalog import StrategyProfile

structured_model = model.with_structured_output(StrategyProfile,include_raw=True)

def build_strategy_profile(strategy_name: str) -> StrategyProfile:
    source_code = get_strategy_details.invoke({"strategy_name": strategy_name})

    response = structured_model.invoke([
        (
            "system",
            """
            Analyze the provided Freqtrade strategy source code.
            Extract:
            - All indicators calculated by the strategy.
            - Signal indicators actually used in entry or exit conditions.
            - Exact entry and exit conditions.
            - Strategy parameter names and their default values.
            - Timeframe, stoploss and minimal ROI.
            For each entry and exit condition:
            - Explain it in clear, human-readable English.
            - Resolve parameter references to their default values.
            - Preserve crossover directions and additional filters.
            - Mention parameter names when relevant.
            Important:
            - Do not confuse calculated indicators with signal indicators.
            - Never confuse crossing above with crossing below.
            - Normalize indicator names to uppercase.
            - Extract parameter defaults from the actual code.
            - Write a meaningful description of the trading logic.
            - Do not copy generic template descriptions.
            - Never invent missing information.
            - Use empty collections or null for missing values.
            """
        ),
        (
            "human",
            f"Strategy: {strategy_name}\n\nSource code:\n{source_code}"
        )
    ])

    if response["parsed"] is None:
        reason = response["raw"].response_metadata.get("finish_reason")

        raise ValueError(f"Strategy analysis failed for {strategy_name}: {reason}")

    return response["parsed"]


def build_catalog(limit: int | None = None):
    strategies = list_strategies.invoke({})
    catalog = []

    for name in strategies[:limit]:
        print(f"Analyzing: {name}")

        profile = build_strategy_profile(name)
        catalog.append(profile)

    return catalog
