import asyncio
import json
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from sqlalchemy import select
from app.database.session import AsyncSessionLocal
from app.database.models import StrategyRecord

load_dotenv()

embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-001", output_dimensionality=768)

async def embed_strategy_code(name: str, source_code: str):
    text = f"Strategy: {name}\nSource code:\n{source_code}"
    vectors = await embeddings.aembed_documents([text])
    return vectors[0]

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.scalars(select(StrategyRecord).where(StrategyRecord.embedding.is_(None)))

        strategies = result.all()

        if not strategies:
            print("All strategies already have embeddings.")
            return

        texts = [
            json.dumps(
                {"name": s.name, **s.profile},
                ensure_ascii=False
            )
            for s in strategies
        ]

        vectors = await embeddings.aembed_documents(texts)

        for strategy, vector in zip(strategies, vectors):
            strategy.embedding = vector

        await session.commit()
        print(f"Saved {len(strategies)} embeddings.")


if __name__ == "__main__":
    asyncio.run(main())