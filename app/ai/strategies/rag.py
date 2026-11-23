import asyncio
from dotenv import load_dotenv
from sqlalchemy import select
from app.database.session import AsyncSessionLocal
from app.database.models import StrategyRecord
from app.ai.strategies.embeddings import embeddings

load_dotenv()

async def search_strategies(query: str, limit: int = 3):
    query_vector = await embeddings.aembed_query(query)

    async with AsyncSessionLocal() as session:
        result = await session.scalars(select(StrategyRecord).where(
                StrategyRecord.visibility == "public",
                StrategyRecord.moderation_status == "approved",
                StrategyRecord.embedding.is_not(None)
            ).order_by(StrategyRecord.embedding.cosine_distance(query_vector)).limit(limit))

        return [
            {"name": strategy.name, "profile": strategy.profile}
            for strategy in result.all()
        ]


async def main():
    matches = await search_strategies(
        "Find a trading strategy that uses RSI for entry and exit"
    )

    for strategy in matches:
        print(strategy["name"])


if __name__ == "__main__":
    asyncio.run(main())