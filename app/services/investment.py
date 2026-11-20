import ccxt.async_support as ccxt
import pandas as pd
from datetime import timedelta
from zoneinfo import ZoneInfo
from app.schemas.investment import DCARequest


async def simulate_dca(request: DCARequest):
    if request.end <= request.start:
        raise ValueError("End must be later than start")

    timezone = ZoneInfo(request.timezone)

    start = pd.Timestamp(request.start)
    end = pd.Timestamp(request.end)

    if start.tzinfo is None:
        start = start.tz_localize(timezone)
    if end.tzinfo is None:
        end = end.tz_localize(timezone)

    start = start.tz_convert("UTC")
    end = end.tz_convert("UTC")

    exchange = ccxt.binance({"enableRateLimit": True})

    try:
        await exchange.load_markets()

        if request.pair not in exchange.markets:
            raise ValueError("Trading pair not found")

        market = exchange.market(request.pair)
        if not market.get("spot") or not market.get("active"):
            raise ValueError("Trading pair is not an active spot market")

        purchases = []
        current = start.tz_convert(timezone).normalize()

        while current.tz_convert("UTC") < end:
            if current.weekday() == request.weekday:
                purchase_time = current + pd.Timedelta(
                    hours=request.hour,
                    minutes=request.minute,
                )

                purchase_utc = purchase_time.tz_convert("UTC")

                if start <= purchase_utc < end:
                    purchases.append(purchase_utc)

            current += pd.Timedelta(days=1)

        if not purchases:
            raise ValueError("No purchases scheduled in selected period")

        orders = []
        total_invested = 0.0
        total_quantity = 0.0

        for purchase_time in purchases:
            since = int(purchase_time.timestamp() * 1000)

            candles = await exchange.fetch_ohlcv(
                request.pair,
                timeframe="1h",
                since=since,
                limit=1,
            )

            if not candles:
                raise ValueError(
                    f"No market data for {purchase_time.isoformat()}"
                )

            candle_time, open_price, *_ = candles[0]

            if candle_time > since:
                raise ValueError(
                    f"Missing candle at {purchase_time.isoformat()}"
                )

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

        final_since = int((end - pd.Timedelta(hours=1)).timestamp() * 1000)

        final_candles = await exchange.fetch_ohlcv(
            request.pair,
            timeframe="1h",
            since=final_since,
            limit=1,
        )

        if not final_candles:
            raise ValueError("No final market price available")

        final_price = final_candles[0][4]

        actual_candle_time = final_candles[0][0]

        if actual_candle_time != final_since:
            raise ValueError(
                "Final historical candle does not match requested time"
            )

        final_value = total_quantity * final_price
        profit = final_value - total_invested
        profit_pct = profit / total_invested * 100

        return {
            "pair": request.pair,
            "purchases": len(orders),
            "total_invested": round(total_invested, 2),
            "total_quantity": round(total_quantity, 8),
            "final_price": final_price,
            "final_value": round(final_value, 2),
            "profit": round(profit, 2),
            "profit_pct": round(profit_pct, 2),
            "orders": orders,
        }

    finally:
        await exchange.close()