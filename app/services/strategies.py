import asyncio
from app.services.backtesting import FREQTRADE_DIR
import ast
from pathlib import Path


async def list_strategies():
    command = [
        "docker",
        "compose",
        "run",
        "--rm",
        "freqtrade",
        "list-strategies",
        "--one-column",
    ]

    process = await asyncio.create_subprocess_exec(
        *command,
        cwd=str(FREQTRADE_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        raise RuntimeError(stderr.decode(errors="replace"))

    return stdout.decode().splitlines()

STRATEGIES_DIR = FREQTRADE_DIR / "user_data" / "strategies"


def read_strategy(strategy_name: str):
    for path in STRATEGIES_DIR.glob("*.py"):
        source_code = path.read_text(encoding="utf-8")
        tree = ast.parse(source_code)

        for node in tree.body:
            if isinstance(node, ast.ClassDef) and node.name == strategy_name:
                return {
                    "strategy": strategy_name,
                    "filename": path.name,
                    "source_code": source_code,
                }

    return None