#!/usr/bin/env node

export function getCliName(): string {
  return "agent-sidecar";
}

if (process.argv[1]?.endsWith("agent-sidecar") || process.argv[1]?.endsWith("index.js")) {
  console.log("agent-sidecar CLI skeleton");
}
