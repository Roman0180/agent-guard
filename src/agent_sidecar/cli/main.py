from __future__ import annotations

import typer

from agent_sidecar import __version__
from agent_sidecar.cli import daemon_cmds, dev_cmds, hooks_cmds, intel_cmds, measurement_cmds, models_cmds, report_cmds, session_cmds, telemetry_cmds


app = typer.Typer(no_args_is_help=True, invoke_without_command=True)
hooks_app = typer.Typer(no_args_is_help=True)
telemetry_app = typer.Typer(no_args_is_help=True)
session_app = typer.Typer(no_args_is_help=True)
trace_app = typer.Typer(no_args_is_help=True)
event_app = typer.Typer(no_args_is_help=True)
dev_app = typer.Typer(no_args_is_help=True)
cost_app = typer.Typer(no_args_is_help=True)
models_app = typer.Typer(no_args_is_help=True)


@app.callback()
def callback(version: bool = typer.Option(False, "--version", help="Print version and exit.")) -> None:
    if version:
        typer.echo(__version__)
        raise typer.Exit()


app.command("start")(daemon_cmds.start)
app.command("status")(daemon_cmds.status)

hooks_app.command("install")(hooks_cmds.install)
hooks_app.command("uninstall")(hooks_cmds.uninstall)
hooks_app.command("status")(hooks_cmds.status)
app.add_typer(hooks_app, name="hooks")

telemetry_app.command("print-env")(telemetry_cmds.print_env)
app.add_typer(telemetry_app, name="telemetry")

session_app.command("list")(session_cmds.list_sessions)
session_app.command("show")(session_cmds.show)
session_app.command("stop")(session_cmds.stop)
app.add_typer(session_app, name="session")

trace_app.command("show")(session_cmds.trace_show)
app.add_typer(trace_app, name="trace")

event_app.command("command")(session_cmds.event_command)
event_app.command("edit")(session_cmds.event_edit)
event_app.command("test")(session_cmds.event_test)
app.add_typer(event_app, name="event")

app.command("refine")(intel_cmds.refine)
app.command("steer")(intel_cmds.steer)
app.command("report")(report_cmds.report)
app.command("gateway")(report_cmds.gateway)

cost_app.command("show")(intel_cmds.cost_show)
cost_app.command("compare")(intel_cmds.cost_compare)
cost_app.command("budget")(intel_cmds.cost_budget)
cost_app.command("refresh-map")(intel_cmds.cost_refresh_map)
app.add_typer(cost_app, name="cost")

models_app.command("list")(models_cmds.list_models)
models_app.command("pull")(models_cmds.pull)
models_app.command("promote")(models_cmds.promote)
models_app.command("rollback")(models_cmds.rollback)
app.add_typer(models_app, name="models")

dev_app.command("replay-fixture")(dev_cmds.replay_fixture)
dev_app.command("export-dataset")(dev_cmds.export_dataset)
dev_app.command("calibrate-detectors")(dev_cmds.calibrate_detectors)
dev_app.command("calibrate-k")(dev_cmds.calibrate_k_cmd)
app.add_typer(dev_app, name="dev")

measurement_app = typer.Typer(no_args_is_help=True)
measurement_app.command("report")(measurement_cmds.report)
app.add_typer(measurement_app, name="measurement")
