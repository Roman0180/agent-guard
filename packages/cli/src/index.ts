#!/usr/bin/env node

export function getCliName(): string {
  return "agentguard";
}

if (process.argv[1]?.endsWith("agentguard") || process.argv[1]?.endsWith("index.js")) {
  console.log("agentguard CLI skeleton");
}
