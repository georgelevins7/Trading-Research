import json
from app.services.backtesting import FREQTRADE_DIR
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
import asyncio
from app.services.results import RESULTS_DIR, read_backtest_result
from hashlib import sha256

def build_sandbox_config(
    pair: str,
    balance: float,
    stake_amount: float | None = None,
    max_open_trades: int | None = None,
):

    config_path = FREQTRADE_DIR / "user_data" / "config.json"
    original = json.loads(config_path.read_text(encoding="utf-8"))

    return {
        "dry_run": True,
        "trading_mode": "spot",
        "exchange": {
            "name": original["exchange"]["name"],
            "pair_whitelist": [pair],
            "pair_blacklist": [],
        },
        "pairlists": [{"method": "StaticPairList"}],

        "entry_pricing": {
        "price_side": "same",
        "use_order_book": False,
        },
        "exit_pricing": {
        "price_side": "same",
        "use_order_book": False,
        },
        "stake_currency": original["stake_currency"],
        "stake_amount": stake_amount if stake_amount is not None else "unlimited",
        "max_open_trades": max_open_trades if max_open_trades is not None else 1,
        "dry_run_wallet": balance,
        "dataformat_ohlcv": original.get("dataformat_ohlcv", "feather"),
    }


def prepare_sandbox(
    draft_path: str,
    strategy_name: str,
    request,
    task_id: str,
    expected_hash: str
):

    workspace = TemporaryDirectory()
    folder = Path(workspace.name)

    strategies_dir = folder / "strategies"
    strategies_dir.mkdir()

    shutil.copyfile(draft_path, strategies_dir / "DraftStrategy.py")

    copied_file = strategies_dir / "DraftStrategy.py"

    current_hash = sha256(copied_file.read_bytes()).hexdigest()

    if current_hash != expected_hash:
        raise ValueError("Draft code has changed")

    config = build_sandbox_config(
        pair=request.pair,
        balance=request.balance,
        stake_amount=request.stake_amount,
        max_open_trades=request.max_open_trades,
    )

    if request.stoploss_pct is not None:
        config["stoploss"] = -request.stoploss_pct / 100

    if request.take_profit_pct is not None:
        config["minimal_roi"] = {"0": request.take_profit_pct / 100}

    if request.trailing_stop is not None:
        config["trailing_stop"] = request.trailing_stop

    (folder / "config.json").write_text(
        json.dumps(config),
        encoding="utf-8"
    )

    data_dir = (
        FREQTRADE_DIR / "user_data" / "data"
        / config["exchange"]["name"]
    )

    results_dir = (
        FREQTRADE_DIR / "user_data"
        / "backtest_results" / task_id
    )
    results_dir.mkdir(parents=True, exist_ok=True)

    command = [
        "docker", "run", "--rm",
        "--network", "none",
        "--read-only",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--memory", "1g",
        "--cpus", "1",
        "--pids-limit", "128",
        "--tmpfs", "/tmp:rw,size=128m,mode=1777",
        "--tmpfs", "/freqtrade/user_data:rw,size=64m,mode=1777",
        "--mount", f"type=bind,source={folder},target=/sandbox,readonly",
        "--mount", f"type=bind,source={data_dir.resolve()},target=/data,readonly",
        "--mount", f"type=bind,source={results_dir.resolve()},target=/results",
        "freqtradeorg/freqtrade:stable",
        "backtesting",
        "--config", "/sandbox/config.json",
        "--strategy", strategy_name,
        "--strategy-path", "/sandbox/strategies",
        "--datadir", "/data",
        "--pairs", request.pair,
        "--timeframe", request.timeframe,
        "--timerange", request.timerange,
        "--backtest-directory", "/results",
        "--cache", "none",
    ]

    if request.fee_pct is not None:
        command.extend(["--fee", str(request.fee_pct / 100)])

    return command, workspace


async def run_sandbox_backtest(
    draft_path: str,
    strategy_name: str,
    request,
    task_id: str,
    expected_hash: str
):
    command, workspace = prepare_sandbox(
        draft_path, strategy_name, request, task_id, expected_hash
    )

    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        output, _ = await process.communicate()

        if process.returncode != 0:
            raise RuntimeError(
                f"Sandbox backtest failed:\n"
                f"{output.decode(errors='replace')[-3000:]}"
            )

        archives = list(
            (RESULTS_DIR / task_id).glob("*.zip")
        )

        if not archives:
            raise RuntimeError("Backtest results not found")

        archive = max(
            archives,
            key=lambda path: path.stat().st_mtime
        )

        return read_backtest_result(archive, strategy_name)

    finally:
        workspace.cleanup()
