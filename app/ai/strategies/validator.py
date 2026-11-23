import ast
import re
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

def validate_draft(draft_path: str | Path):
    source = Path(draft_path).read_text(encoding="utf-8")
    tree = ast.parse(source)

    strategy_names = [
        node.name
        for node in tree.body
        if isinstance(node, ast.ClassDef)
        and any(isinstance(base, ast.Name) and base.id == "IStrategy" for base in node.bases)
    ]

    if len(strategy_names) != 1:
        raise ValueError("Expected exactly one Freqtrade strategy")

    name = strategy_names[0]
    parent = Path("generated_strategies").resolve()

    with TemporaryDirectory(dir=parent) as folder:
        Path(folder, "DraftStrategy.py").write_text(
            source, encoding="utf-8"
        )

        command = [
            "docker", "run", "--rm",
            "--network", "none",
            "--read-only",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "--pids-limit", "128",
            "--memory", "1g",
            "--cpus", "1",
            "--tmpfs", "/tmp:rw,size=128m,mode=1777",
            "--tmpfs", "/freqtrade/user_data:rw,size=64m,mode=1777",
            "--mount", f"type=bind,source={folder},target=/strategies,readonly",
            "freqtradeorg/freqtrade:stable",
            "list-strategies",
            "--strategy-path", "/strategies",
        ]

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )

    output = result.stdout + result.stderr

    valid = result.returncode == 0 and any(
        name in line and re.search(r"\bOK\b", line)
        for line in output.splitlines()
    )

    if not valid:
        raise ValueError(f"Freqtrade validation failed:\n{output[-3000:]}")

    return {"name": name, "status": "OK"}