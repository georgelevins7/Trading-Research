import json
import asyncio
from pathlib import Path

from app.services.results import RESULTS_DIR, read_backtest_result

FREQTRADE_DIR = Path(__file__).resolve().parents[2] / "freqtrade-lab"


async def run_backtest(request, task_id: str):
    result_dir = RESULTS_DIR / task_id
    result_dir.mkdir(parents=True, exist_ok=True)

    overrides = {}

    if request.stoploss_pct is not None:
        overrides["stoploss"] = -request.stoploss_pct / 100

    if request.take_profit_pct is not None:
        overrides["minimal_roi"] = {
            "0": request.take_profit_pct / 100
        }

    if request.trailing_stop is not None:
        overrides["trailing_stop"] = request.trailing_stop

    if request.stake_amount is not None:
        overrides["stake_amount"] = request.stake_amount

    if request.max_open_trades is not None:
        overrides["max_open_trades"] = request.max_open_trades

    config_path = result_dir / "config_overrides.json"
    config_path.write_text(
        json.dumps(overrides),
        encoding="utf-8",
    )

    command = [
        "docker", "compose", "run", "--rm",
        "freqtrade", "backtesting",
        "--config", "user_data/config.json",
        "--config", f"user_data/backtest_results/{task_id}/config_overrides.json",
        "--strategy", request.strategy,
        "--pairs", request.pair,
        "--timeframe", request.timeframe,
        "--timerange", request.timerange,
        "--dry-run-wallet", str(request.balance),
        "--backtest-directory",
        f"user_data/backtest_results/{task_id}",
        "--cache", "none",
    ]
    if request.fee_pct is not None:
        command.extend([
            "--fee",
            str(request.fee_pct / 100),
        ])

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

    archives = list(result_dir.glob("*.zip"))

    if not archives:
        raise RuntimeError("No backtest result archives found.")

    archive_path = max(
        archives,
        key=lambda path: path.stat().st_mtime,
    )

    return read_backtest_result(
        archive_path,
        request.strategy,
    )
