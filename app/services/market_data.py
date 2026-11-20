import asyncio
from datetime import datetime, timedelta
from app.services.backtesting import FREQTRADE_DIR
import ccxt.async_support as ccxt

async def download_market_data(
    pair: str,
    timeframe: str,
    timerange: str,
):
    start, end = timerange.split("-")

    start_date = datetime.strptime(start, "%Y%m%d")
    start_date -= timedelta(days=30)

    download_timerange = (
        f"{start_date:%Y%m%d}-{end}"
    )

    command = [
        "docker",
        "compose",
        "run",
        "--rm",
        "freqtrade",
        "download-data",
        "--config", "user_data/config.json",
        "--pairs", pair,
        "--timeframes", timeframe,
        "--timerange", download_timerange,
        "--prepend",
    ]

    process = await asyncio.create_subprocess_exec(
        *command,
        cwd=str(FREQTRADE_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    output, _ = await process.communicate()

    if process.returncode != 0:
        raise RuntimeError(
            output.decode(errors="replace")[-3000:]
        )

    return {
        "pair": pair,
        "timeframe": timeframe,
        "timerange": download_timerange,
        "status": "downloaded",
    }

async def get_available_pairs():
    exchange = ccxt.binance()

    try:
        markets = await exchange.load_markets()

        return sorted([
            symbol
            for symbol, market in markets.items()
            if market.get("spot")
            and market.get("active")
        ])
    finally:
        await exchange.close()


async def get_available_timeframes():
    exchange = ccxt.binance()

    try:
        await exchange.load_markets()
        return list(exchange.timeframes.keys())
    finally:
        await exchange.close()