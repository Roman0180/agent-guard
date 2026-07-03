# Fixture Capture Notes

Chunk 1 uses synthetic fixtures that mirror Claude Code hook and OTLP payload shapes. Real Claude Code fixture capture must record:

- Claude Code version.
- Hook event type.
- Whether telemetry was emitted as OTLP protobuf or JSON.
- Any redactions applied before committing the fixture.

The current seed fixtures are synthetic and exist to keep CI offline while the adapters stabilize.
