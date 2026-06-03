export const demoNarrationSegments = [
  [0, 8, "First, Agent Sidecar starts beside the coding agent and becomes the task intake layer."],
  [8, 16, "The user enters a plain-language request, and Sidecar prepares to make it more precise."],
  [16, 24, "Prompt compression pulls in only the relevant repo context, constraints, acceptance criteria, and tests."],
  [24, 32, "Cheap steering models help decide what to validate and where expensive agent tokens should go."],
  [32, 40, "Selective memory keeps important lessons and diffs while dropping irrelevant history."],
  [40, 48, "The result is a validated fix with fewer tokens, a clearer trace, and lower cost per run."]
] as const;

export const demoNarrationFallback =
  "The result is a validated fix with fewer tokens, a clearer trace, and lower cost per run.";
