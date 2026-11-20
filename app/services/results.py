import json
import zipfile
from pathlib import Path

RESULTS_DIR = (Path(__file__).resolve().parents[2]/ "freqtrade-lab"/ "user_data"/ "backtest_results")


def read_backtest_result(archive_path: Path, strategy: str):
    with zipfile.ZipFile(archive_path) as archive:
        json_file = next(
            name for name in archive.namelist()
            if name.endswith(".json") and not name.endswith(".meta.json")
        )

        data = json.loads(archive.read(json_file))

    metrics = data["strategy"][strategy]

    return {
        "total_trades": metrics["total_trades"],
        "profit_pct": round(metrics["profit_total"] * 100, 2),
        "profit_abs": metrics["profit_total_abs"],
        "max_drawdown_pct": round(
            metrics["max_drawdown_account"] * 100, 2
        ),
        "sharpe": metrics.get("sharpe"),
        "sortino": metrics.get("sortino"),
        "win_rate_pct": round(metrics["winrate"] * 100, 2)
            if metrics.get("winrate") is not None else None,
        "profit_factor": metrics.get("profit_factor"),
        "cagr_pct": round(metrics["cagr"] * 100, 2)
            if metrics.get("cagr") is not None else None,
    }