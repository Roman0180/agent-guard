import { createAgentSidecar } from "@agent-sidecar/sdk";

const sidecar = createAgentSidecar({
  apiUrl: "http://localhost:4319",
  localOnly: true,
  redact: true,
  maxFieldLength: 4000
});

const sessionId = "migration-demo";
const repeatedFailure = "Error: migration registry missing entry for create_accounts";

for (let index = 1; index <= 3; index += 1) {
  const intervention = await sidecar.observeStep({
    sessionId,
    stepId: `repeat-${index}`,
    agentName: "demo-coding-agent",
    provider: "openai",
    model: "gpt-5.5",
    stepType: "tool_call",
    toolName: "run_command",
    toolArguments: { command: "pnpm test -- migration" },
    toolOutput: repeatedFailure,
    errorMessage: repeatedFailure,
    tokenCounts: { inputTokens: 1800, outputTokens: 220, totalTokens: 2020 },
    timingMs: 4100,
    filesTouched: ["src/migrations/index.ts"],
    tags: ["migration", "debugging"]
  });

  console.log(`step ${index}: ${intervention.severity}/${intervention.category} - ${intervention.message}`);
  if (intervention.severity !== "info") {
    console.log(`recommended action: ${intervention.recommended_action}`);
  }
}

console.log("Demo metrics are illustrative: repeated-loop intervention can avoid the next broad reread and redirect the agent to targeted validation.");
