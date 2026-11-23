import ast
from pydantic import BaseModel
from app.ai.llm import model
from pathlib import Path
from uuid import uuid4

class GeneratedStrategy(BaseModel):
    name: str
    description: str
    source_code: str

generator = model.with_structured_output(GeneratedStrategy)

def generate_strategy(request: str):
    result = generator.invoke([
        (
            "system",
            """
            Generate a complete Freqtrade Spot strategy in Python.
            Requirements:
            - Inherit from IStrategy.
            - Implement populate_indicators, populate_entry_trend,
              and populate_exit_trend.
            - Use valid Freqtrade strategy syntax.
            - Include timeframe, stoploss and minimal_roi.
            - Return complete Python source code without Markdown.
            - Do not include file access, network requests,
              subprocesses, eval or exec.
            - Source_code must contain actual newline characters and valid Python indentation.
            - Never compress Python source code into a single line.
            - Ensure entry and exit conditions are logically consistent.
            - Do not add arbitrary RSI thresholds.
            - If thresholds are unspecified, choose reasonable defaults
            and explain them in the description.
            - Do not require contradictory market conditions.
            """
        ),
        ("human", request)
    ])

    try:
        tree = ast.parse(result.source_code)
    except SyntaxError as error:
        raise ValueError(f"Invalid Python code: {error}")

    strategy_class = next(
        (
            node for node in tree.body
            if isinstance(node, ast.ClassDef)
            and node.name == result.name
        ),
        None
    )

    if strategy_class is None:
        raise ValueError("Strategy class not found")

    if not any(isinstance(base, ast.Name) and base.id == "IStrategy" for base in strategy_class.bases):
        raise ValueError("Strategy must inherit from IStrategy")

    required = {
        "populate_indicators",
        "populate_entry_trend",
        "populate_exit_trend",
    }

    methods = {node.name for node in strategy_class.body if isinstance(node, ast.FunctionDef)}

    if missing := required - methods:
        raise ValueError(f"Missing methods: {missing}")

    return result

def save_strategy_draft(strategy: GeneratedStrategy):
    folder = Path("generated_strategies")
    folder.mkdir(exist_ok=True)

    path = folder / f"{uuid4().hex}.txt"
    path.write_text(strategy.source_code, encoding="utf-8")

    return path