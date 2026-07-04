from __future__ import annotations

from pathlib import Path

import httpx
import typer

from agent_sidecar.daemon.runner import daemon_api_url
from agent_sidecar.models.evals import run_promotion_eval
from agent_sidecar.models.local_services import pull_ollama_model
from agent_sidecar.models.registry import load_registry
from agent_sidecar.models.registry import promote as promote_model
from agent_sidecar.models.registry import rollback as rollback_model
from agent_sidecar.models.router import ModelRoute, ModelRouter
from agent_sidecar.schema.config import load_config
from agent_sidecar.schema.model_io import ModelRole


def list_models() -> None:
    result = _request("GET", "/models").json()
    for row in result["roles"]:
        status = "available" if row["available"] else f"unavailable: {row['reason']}"
        served = "served" if row.get("served") else "not-served"
        typer.echo(f"{row['role']}\t{row['model_id'] or '-'}\t{row['kind']}\t{row['serving']}\t{served}\t{status}")


def pull(model: str) -> None:
    repo_path = Path.cwd()
    route = _route_for_model(ModelRouter(repo_path, load_config(repo_path)), model)
    if route.serving != "ollama":
        typer.echo(f"{model} is configured for {route.serving}; start/register it with llama-server, then run `agent-sidecar models list`.", err=True)
        raise typer.Exit(1)
    try:
        result = pull_ollama_model(route.api_base, model)
    except httpx.HTTPError as error:
        typer.echo(f"Ollama pull failed at {route.api_base}: {error}", err=True)
        raise typer.Exit(1) from error
    typer.echo(f"Pulled {model}: {result.get('status', 'ok')}")


def promote(name: str) -> None:
    try:
        repo_path = Path.cwd()
        registry = load_registry(repo_path)
        entry = registry.by_name(name)
        eval_result = None
        if entry is not None and (entry.eval is None or not entry.eval.passed):
            eval_result = run_promotion_eval(entry, repo_path=repo_path)
        promoted = promote_model(repo_path, name, eval_result=eval_result)
    except ValueError as error:
        typer.echo(str(error), err=True)
        raise typer.Exit(1) from error
    typer.echo(f"Promoted {promoted.name} for {promoted.role.value}")
    if promoted.eval:
        typer.echo(f"Eval: {promoted.eval.score:.3f} vs base {promoted.eval.base_score:.3f} ({'passed' if promoted.eval.passed else 'failed'})")


def rollback(name: str) -> None:
    try:
        entry = rollback_model(Path.cwd(), name)
    except ValueError as error:
        typer.echo(str(error), err=True)
        raise typer.Exit(1) from error
    typer.echo(f"Rolled back {entry.name}")


def _request(method: str, path: str) -> httpx.Response:
    url = daemon_api_url(Path.cwd())
    try:
        response = httpx.request(method, f"{url}{path}", timeout=5)
        response.raise_for_status()
        return response
    except httpx.HTTPError as error:
        typer.echo(f"Agent Sidecar request failed at {url}{path}: {error}", err=True)
        raise typer.Exit(1) from error


def _route_for_model(router: ModelRouter, model: str) -> ModelRoute:
    for role in ModelRole:
        route = router.resolve(role)
        if route.model_id == model:
            return route
    endpoint = router.config.models.endpoints["ollama"]
    return ModelRoute(
        role=ModelRole.reasoning,
        model_id=model,
        litellm_model=f"{endpoint.litellm_prefix}{model}",
        api_base=endpoint.api_base,
        serving="ollama",
        kind="base",
    )
