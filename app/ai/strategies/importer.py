import asyncio
import hashlib
from sqlalchemy import select
from app.ai.tools import list_strategies
from app.ai.strategies.parser import build_strategy_profile
from app.services.strategies import read_strategy, STRATEGIES_DIR
from app.database.session import AsyncSessionLocal
from app.database.models import StrategyRecord
from app.database.crud import save_builtin_strategy

async def import_one_strategy(strategy_name: str):
    strategy = read_strategy(strategy_name)

    if strategy is None:
        print(f"Strategy not found: {strategy_name}")
        return

    path = STRATEGIES_DIR / strategy["filename"]
    code_hash = hashlib.sha256(path.read_bytes()).hexdigest()

    async with AsyncSessionLocal() as session:
        existing = await session.scalar(select(StrategyRecord).where(StrategyRecord.name == strategy_name))

        if existing:
            if existing.code_hash == code_hash:
                print(f"Already up to date: {strategy_name}")
            else:
                print(f"Code changed, new version required: {strategy_name}")
            return

        print(f"Analyzing: {strategy_name}")

        profile = build_strategy_profile(strategy_name)

        code_path = f"freqtrade-lab/user_data/strategies/{strategy['filename']}"

        record = await save_builtin_strategy(session, profile, code_path, code_hash)

        print(f"Saved: {record.name}")


async def main():
    strategies = list_strategies.invoke({})

    for name in strategies:
        try:
            await import_one_strategy(name)
        except Exception as error:
            print(f"Import failed for {name}: {error}")


if __name__ == "__main__":
    asyncio.run(main())
