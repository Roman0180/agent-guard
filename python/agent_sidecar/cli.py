from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


MIN_NODE_MAJOR = 20


def main() -> None:
    repo_root = find_repo_root()
    node = require_executable("node", "Agent Sidecar requires Node.js >=20 on PATH.")
    require_node_version(node)

    entry = repo_root / "packages" / "cli" / "dist" / "index.js"
    if cli_build_required(repo_root, entry):
        build_cli(repo_root)

    if not entry.exists():
        raise SystemExit(f"Agent Sidecar CLI build output was not found at {entry}")

    os.execv(node, [node, str(entry), *sys.argv[1:]])


def find_repo_root() -> Path:
    configured = os.environ.get("AGENT_SIDECAR_REPO_ROOT")
    if configured:
        root = Path(configured).expanduser().resolve()
        if is_repo_root(root):
            return root
        raise SystemExit(f"AGENT_SIDECAR_REPO_ROOT does not point to an Agent Sidecar checkout: {root}")

    for candidate in [Path.cwd().resolve(), *Path.cwd().resolve().parents]:
        if is_repo_root(candidate):
            return candidate

    for candidate in Path(__file__).resolve().parents:
        if is_repo_root(candidate):
            return candidate

    raise SystemExit(
        "Could not locate the Agent Sidecar source checkout. "
        "Run from the repo root or set AGENT_SIDECAR_REPO_ROOT."
    )


def is_repo_root(path: Path) -> bool:
    return (path / "package.json").exists() and (path / "packages" / "cli").exists()


def build_cli(repo_root: Path) -> None:
    pnpm = require_executable("pnpm", "Agent Sidecar CLI is not built yet and pnpm is required to build it.")
    subprocess.check_call([pnpm, "build"], cwd=repo_root)


def cli_build_required(repo_root: Path, entry: Path) -> bool:
    if not entry.exists():
        return True

    built_at = entry.stat().st_mtime
    cli_root = repo_root / "packages" / "cli"
    candidates = [
        cli_root / "package.json",
        cli_root / "tsconfig.json",
        repo_root / "tsconfig.base.json",
    ]
    source_root = cli_root / "src"
    if source_root.exists():
        candidates.extend(source_root.rglob("*.ts"))

    return any(path.exists() and path.stat().st_mtime > built_at for path in candidates)


def require_executable(name: str, message: str) -> str:
    executable = shutil.which(name)
    if executable:
        return executable
    raise SystemExit(message)


def require_node_version(node: str) -> None:
    try:
        version_output = subprocess.check_output([node, "--version"], text=True).strip()
    except (OSError, subprocess.SubprocessError) as error:
        raise SystemExit(f"Could not determine Node.js version: {error}") from error

    major = parse_node_major(version_output)
    if major < MIN_NODE_MAJOR:
        raise SystemExit(f"Agent Sidecar requires Node.js >=20; found {version_output}.")


def parse_node_major(version_output: str) -> int:
    version = version_output.removeprefix("v")
    major_text = version.split(".", 1)[0]
    try:
        return int(major_text)
    except ValueError as error:
        raise SystemExit(f"Could not parse Node.js version: {version_output}") from error


if __name__ == "__main__":
    main()
