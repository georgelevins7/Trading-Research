from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import ccxt.async_support as ccxt
import pandas as pd

from app.schemas.investment import DCARequest


def to_utc(value, tz):
    timestamp = pd.Timestamp(value)

    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(
            tz, ambiguous="raise", nonexistent="raise"
        )

    return timestamp.tz_convert("UTC")


def build_schedule(request, start, end, tz):
    purchases = []
    day = start.tz_convert(tz).date()
    last_day = end.tz_convert(tz).date()

    while day <= last_day:
        if day.weekday() == request.weekday:
            local_time = datetime.combine(
                day,
                time(request.hour, request.minute),
            )

            purchase = to_utc(local_time, tz)

            if start <= purchase < end:
                purchases.append(purchase)

        day += timedelta(days=1)

    return purchases


async def fetch_exact_candle(exchange, pair, timestamp):
    since = int(timestamp.timestamp() * 1000)

    candles = await exchange.fetch_ohlcv(
        pair,
        timeframe="1m",
        since=since,
        limit=1,
    )

    if not candles or candles[0][0] != since:
        raise ValueError(
            f"Missing 1m candle at {timestamp.isoformat()}"
        )

    return candles[0]


async def simulate_dca(request: DCARequest):
    try:
        tz = ZoneInfo(request.timezone)
    except ZoneInfoNotFoundError:
        raise ValueError("Invalid timezone")

    start = to_utc(request.start, tz)
    end = to_utc(request.end, tz)

    if end <= start:
        raise ValueError("End must be later than start")

    if end > pd.Timestamp.now(tz="UTC"):
        raise ValueError("End cannot be in the future")

    purchases = build_schedule(request, start, end, tz)

    if not purchases:
        raise ValueError("No purchases scheduled in selected period")

    exchange = ccxt.binance({"enableRateLimit": True})

    try:
        await exchange.load_markets()

        if request.pair not in exchange.markets:
            raise ValueError("Trading pair not found")

        market = exchange.market(request.pair)

        if not market.get("spot") or not market.get("active"):
            raise ValueError("Trading pair is not an active spot market")

        orders = []
        total_invested = 0.0
        total_quantity = 0.0

        for purchase_time in purchases:
            candle = await fetch_exact_candle(
                exchange, request.pair, purchase_time
            )

            open_price = candle[1]

            if open_price <= 0:
                raise ValueError("Invalid historical price")

            fee = request.amount * request.fee_pct / 100
            quantity = (request.amount - fee) / open_price

            total_invested += request.amount
            total_quantity += quantity

            orders.append({
                "date": purchase_time.isoformat(),
                "price": open_price,
                "amount": request.amount,
                "fee": fee,
                "quantity": quantity,
            })

        # Last fully completed minute before end.
        final_time = end.floor("min") - pd.Timedelta(minutes=1)

        if final_time < purchases[-1]:
            raise ValueError("No completed candle after last purchase")

        final_candle = await fetch_exact_candle(
            exchange, request.pair, final_time
        )

        final_price = final_candle[4]
        final_value = total_quantity * final_price
        profit = final_value - total_invested

        return {
            "pair": request.pair,
            "purchases": len(orders),
            "total_invested": round(total_invested, 2),
            "total_quantity": round(total_quantity, 8),
            "final_price": final_price,
            "final_value": round(final_value, 2),
            "profit": round(profit, 2),
            "profit_pct": round(
                profit / total_invested * 100, 2
            ),
            "orders": orders,
        }

    finally:
        await exchange.close()
