import asyncio
from pathlib import Path

from app.services.results import RESULTS_DIR, read_backtest_result

FREQTRADE_DIR = Path(__file__).resolve().parents[2] / "freqtrade-lab"


async def run_backtest(request, task_id: str):
    result_dir = RESULTS_DIR / task_id
    result_dir.mkdir(parents=True, exist_ok=True)

    command = [
        "docker", "compose", "run", "--rm",
        "freqtrade", "backtesting",
        "--config", "user_data/config.json",
        "--strategy", request.strategy,
        "--pairs", request.pair,
        "--timerange", request.timerange,
        "--dry-run-wallet", str(request.balance),
        "--backtest-directory",
        f"user_data/backtest_results/{task_id}",
        "--cache", "none",
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
