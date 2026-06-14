import { describe, expect, it } from "vitest";

import { DEFAULT_STEERING_CONFIG, SteeringEngine } from "./index.js";

describe("@agent-sidecar/steering", () => {
  it("keeps steering disabled by default", () => {
    expect(DEFAULT_STEERING_CONFIG).toEqual({ enabled: false, providers: [], maxCallsPerRun: 0, maxCostUsdPerRun: 0 });
  });

  it("ranks deterministic detector findings into a warning", () => {
    const decision = new SteeringEngine({ now: () => "2026-06-12T00:00:00.000Z", idFactory: () => "steer-1" }).evaluate("run-1", {
      runState: { repeatedCommandCounts: { "pnpm test": 4 } }
    });

    expect(decision).toMatchObject({ id: "steer-1", action: "warn", reasonCode: "loop.repeated_command", source: "deterministic" });
    expect(decision.findings[0]).toMatchObject({ detectorId: "repeated_command_detector" });
  });

  it("tries a local DeepSeek steering evaluator before deterministic fallback", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const decision = await new SteeringEngine({
      now: () => "2026-06-12T00:00:00.000Z",
      idFactory: () => "steer-local",
      localModel: {
        enabled: true,
        model: "deepseek-r1:1.5b",
        fetch: async (_url: string | URL | Request, init?: RequestInit) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return new Response(JSON.stringify({
            message: {
              content: JSON.stringify({
                action: "warn",
                confidence: 0.91,
                reasonCode: "local.deepseek.validation_loop",
                message: "DeepSeek sees repeated validation without new evidence.",
                recommendedNextStep: "Inspect the first failing validation output before rerunning pnpm test.",
                estimatedAvoidedWaste: ["redundant test reruns"]
              })
            }
          }));
        }
      }
    }).evaluateWithLocalModel("run-1", {
      runState: { repeatedCommandCounts: { "pnpm test": 3 } },
      events: [{ eventType: "validation", summary: "pnpm test failed", validation: { status: "failed" } }]
    });

    expect(decision).toMatchObject({
      id: "steer-local",
      action: "warn",
      reasonCode: "local.deepseek.validation_loop",
      source: "model_assisted"
    });
    expect(decision.findings[0]).toMatchObject({ detectorId: "repeated_command_detector" });
    expect(JSON.stringify(requestBody)).toContain("local DeepSeek steering evaluator");
    expect(JSON.stringify(requestBody)).toContain("detectorFindings");
  });
});
