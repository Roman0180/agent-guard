from __future__ import annotations

import json
import urllib.error
import urllib.request

import typer

from agent_sidecar.cloud.credentials import (
    CloudCredentials,
    clear_cloud_credentials,
    credentials_path,
    load_cloud_credentials,
    save_cloud_credentials,
)

DEFAULT_CLAIM_URL = "https://app.agentsidecar.com/api/link/claim"


def link(
    code: str = typer.Option(..., "--code", help="Claim code copied from the cloud dashboard's Link page."),
    claim_url: str = typer.Option(DEFAULT_CLAIM_URL, "--claim-url", help="Cloud claim endpoint."),
) -> None:
    """Link this machine to a cloud account so aggregate savings appear on the hosted dashboard.

    Sends only the claim code. The server returns an ingest URL and a device token, stored
    locally at ~/.agent-sidecar/credentials.json (0600). Prompts and code never leave the machine.
    """
    request = urllib.request.Request(
        claim_url,
        data=json.dumps({"code": code.strip()}).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = _error_detail(error)
        typer.echo(f"Link failed: {detail}", err=True)
        raise typer.Exit(code=1)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
        typer.echo(f"Link failed: could not reach {claim_url} ({error})", err=True)
        raise typer.Exit(code=1)

    ingest_url = str(body.get("ingest_url") or "").strip()
    device_token = str(body.get("device_token") or "").strip()
    if not ingest_url or not device_token:
        typer.echo("Link failed: server response missing ingest_url or device_token.", err=True)
        raise typer.Exit(code=1)

    path = save_cloud_credentials(CloudCredentials(ingest_url=ingest_url, device_token=device_token))
    typer.echo(f"Linked. Aggregate savings will push to {ingest_url}.")
    typer.echo(f"Credentials stored at {path} (0600).")


def link_status() -> None:
    """Show whether this machine is linked to a cloud account."""
    credentials = load_cloud_credentials()
    if credentials is None:
        typer.echo("Not linked. Run `agent-sidecar link --code <code>` from the dashboard's Link page.")
        raise typer.Exit(code=1)
    typer.echo(f"Linked to {credentials.ingest_url}")
    typer.echo(f"Credentials: {credentials_path()}")


def unlink() -> None:
    """Remove local cloud credentials. Aggregate pushes stop; local data is untouched."""
    if clear_cloud_credentials():
        typer.echo("Unlinked. Local credentials removed.")
    else:
        typer.echo("Nothing to unlink (no credentials found).")


def _error_detail(error: urllib.error.HTTPError) -> str:
    try:
        body = error.read().decode("utf-8")
        parsed = json.loads(body)
        if isinstance(parsed, dict) and parsed.get("error"):
            return f"HTTP {error.code}: {parsed['error']}"
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        pass
    return f"HTTP {error.code}"
