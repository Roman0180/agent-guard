import { DEFAULT_DETECTORS, type DetectorContext, type DetectorResult } from "@agent-sidecar/detectors";

export type SteeringProviderName = "local-http" | "deterministic";
export type LocalModelSteeringOptions = { enabled?: boolean; baseUrl?: string; model?: string; timeoutMs?: number; fetch?: typeof fetch };

export type SteeringConfig = {
  enabled: boolean;
  providers: SteeringProviderName[];
  maxCallsPerRun: number;
  maxCostUsdPerRun: number;
};

export type SteeringAction = "continue" | "suggest" | "warn";

export type SteeringDecision = {
  id: string;
  runId: string;
  createdAt: string;
  action: SteeringAction;
  confidence: number;
  reasonCode: string;
  message: string;
  recommendedNextStep: string;
  findings: DetectorResult[];
  estimatedAvoidedWaste: string[];
  source: "deterministic" | "model_assisted";
};

export type SteeringEngineOptions = {
  now?: () => string;
  idFactory?: () => string;
  detectors?: Array<(context: DetectorContext) => DetectorResult>;
  localModel?: LocalModelSteeringOptions;
};

type ModelSteeringDraft = {
  action: SteeringAction;
  confidence: number;
  reasonCode: string;
  message: string;
  recommendedNextStep: string;
  estimatedAvoidedWaste: string[];
};

const DEFAULT_LOCAL_MODEL_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_LOCAL_MODEL = "deepseek-r1:7b";
const DEFAULT_LOCAL_MODEL_TIMEOUT_MS = 60_000;

export const DEFAULT_STEERING_CONFIG: SteeringConfig = {
  enabled: false,
  providers: [],
  maxCallsPerRun: 0,
  maxCostUsdPerRun: 0
};

export class SteeringEngine {
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly detectors: Array<(context: DetectorContext) => DetectorResult>;
  private readonly localModel?: Required<LocalModelSteeringOptions>;

  constructor(options: SteeringEngineOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? (() => `steer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this.detectors = options.detectors ?? DEFAULT_DETECTORS;
    this.localModel = options.localModel
      ? {
          enabled: options.localModel.enabled ?? false,
          baseUrl: options.localModel.baseUrl ?? DEFAULT_LOCAL_MODEL_BASE_URL,
          model: options.localModel.model ?? DEFAULT_LOCAL_MODEL,
          timeoutMs: options.localModel.timeoutMs ?? DEFAULT_LOCAL_MODEL_TIMEOUT_MS,
          fetch: options.localModel.fetch ?? fetch
        }
      : undefined;
  }

  evaluate(runId: string, context: DetectorContext): SteeringDecision {
    const findings = this.collectFindings(context);
    return this.buildDeterministicDecision(runId, findings);
  }

  async evaluateWithLocalModel(runId: string, context: DetectorContext): Promise<SteeringDecision> {
    const findings = this.collectFindings(context);
    const fallback = this.buildDeterministicDecision(runId, findings);
    if (!this.localModel?.enabled) {
      return fallback;
    }

    const assisted = await requestLocalModelSteering(context, findings, this.localModel).catch(() => undefined);
    if (!assisted) {
      return fallback;
    }

    return {
      ...fallback,
      action: assisted.action,
      confidence: assisted.confidence,
      reasonCode: assisted.reasonCode,
      message: assisted.message,
      recommendedNextStep: assisted.recommendedNextStep,
      estimatedAvoidedWaste: assisted.estimatedAvoidedWaste.length ? assisted.estimatedAvoidedWaste : fallback.estimatedAvoidedWaste,
      source: "model_assisted"
    };
  }

  private collectFindings(context: DetectorContext): DetectorResult[] {
    return this.detectors.map((detector) => detector(context)).filter((result) => result.matched);
  }

  private buildDeterministicDecision(runId: string, findings: DetectorResult[]): SteeringDecision {
    const ranked = findings.sort((a, b) => score(b) - score(a));
    const top = ranked[0];
    const action: SteeringAction = !top ? "continue" : score(top) >= 0.8 ? "warn" : "suggest";
    const confidence = top ? Math.max(...ranked.map((finding) => finding.confidence ?? 0.5)) : 0.2;
    const recommendations = ranked.map((finding) => finding.recommendation).filter((value): value is string => Boolean(value));
    const waste = Array.from(new Set(ranked.flatMap((finding) => finding.estimatedAvoidedWaste ?? []))).slice(0, 5);

    return {
      id: this.idFactory(),
      runId,
      createdAt: this.now(),
      action,
      confidence,
      reasonCode: top?.reasonCode ?? "steering.continue",
      message: top?.message ?? "No steering issues detected.",
      recommendedNextStep: recommendations[0] ?? "Continue with the current plan and keep recording validation evidence.",
      findings: ranked,
      estimatedAvoidedWaste: waste,
      source: "deterministic"
    };
  }
}

async function requestLocalModelSteering(
  context: DetectorContext,
  findings: DetectorResult[],
  localModel: Required<LocalModelSteeringOptions>
): Promise<ModelSteeringDraft> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), localModel.timeoutMs);

  try {
    const response = await localModel.fetch(`${localModel.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: localModel.model,
        stream: false,
        format: "json",
        think: false,
        options: {
          temperature: 0,
          num_predict: 500
        },
        messages: [
          {
            role: "system",
            content:
              "Return only minified JSON. No markdown. No explanation. Schema: {\"action\":\"continue|suggest|warn\",\"confidence\":0.0,\"reasonCode\":\"...\",\"message\":\"...\",\"recommendedNextStep\":\"...\",\"estimatedAvoidedWaste\":[]}. You are the local DeepSeek steering evaluator for a coding-agent sidecar. Decide whether the run should continue, receive a suggestion, or receive a warning. Use the detector findings as evidence, but make the final steering call yourself. Choose continue when evidence is weak. Choose suggest or warn only when the next step is concrete and grounded in observed commands, validation, edits, or task drift. Never call remote services."
          },
          {
            role: "user",
            content: JSON.stringify({
              runState: context.runState ?? {},
              recentEvents: (context.events ?? []).slice(-20),
              detectorFindings: findings
            })
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`local_steering_http_${response.status}`);
    }

    const body = await response.json() as { message?: { content?: string }; response?: string };
    const parsed = parseJsonObject(stripThinking(body.message?.content ?? body.response ?? ""));
    return steeringDraftFromUnknown(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

function steeringDraftFromUnknown(value: Record<string, unknown>): ModelSteeringDraft {
  const action = steeringActionValue(value.action);
  const recommendedNextStep = typeof value.recommendedNextStep === "string" ? value.recommendedNextStep.trim() : "";
  const message = typeof value.message === "string" ? value.message.trim() : recommendedNextStep;
  if (!action || !message || !recommendedNextStep) {
    throw new Error("local_steering_invalid_shape");
  }

  return {
    action,
    confidence: clampConfidence(typeof value.confidence === "number" ? value.confidence : Number(value.confidence ?? 0.5)),
    reasonCode: typeof value.reasonCode === "string" && value.reasonCode.trim() ? value.reasonCode.trim() : `steering.${action}`,
    message,
    recommendedNextStep,
    estimatedAvoidedWaste: stringArray(value.estimatedAvoidedWaste).slice(0, 5)
  };
}

function steeringActionValue(value: unknown): SteeringAction | undefined {
  return value === "continue" || value === "suggest" || value === "warn" ? value : undefined;
}

function clampConfidence(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function stripThinking(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const direct = tryParseJsonObject(trimmed);
  if (direct) return direct;
  const match = trimmed.match(/\{[\s\S]*\}/);
  const matched = match ? tryParseJsonObject(match[0]) : undefined;
  if (matched) return matched;
  throw new Error("local_steering_invalid_json");
}

function tryParseJsonObject(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function score(result: DetectorResult): number {
  const severity = result.severity === "error" ? 0.25 : result.severity === "warning" ? 0.15 : 0;
  return (result.confidence ?? 0.5) + severity;
}
