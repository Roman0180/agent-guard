import { evaluateTrajectorySlice } from "@agent-sidecar/detectors";
import { ObserveStepResponse, TrajectorySlice, type Intervention } from "@agent-sidecar/core";

export type AgentSidecarConfig = {
  apiUrl?: string;
  apiKey?: string;
  localOnly?: boolean;
  redact?: boolean;
  maxFieldLength?: number;
  fetch?: typeof fetch;
};

export type ObserveStepInput = Omit<Partial<TrajectorySlice>, "schemaVersion" | "timestamp"> & {
  sessionId: string;
  stepId: string;
  timestamp?: string;
  stepType: TrajectorySlice["stepType"];
};

export type RedactionOptions = {
  maxFieldLength?: number;
};

const DEFAULT_API_URL = "http://localhost:4319";
const DEFAULT_MAX_FIELD_LENGTH = 4_000;
const REDACTED = "[REDACTED]";

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/(xox[baprs]-[A-Za-z0-9-]+)/g, REDACTED],
  [/AKIA[0-9A-Z]{16}/g, REDACTED],
  [/(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, REDACTED],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]"],
  [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[REDACTED_PHONE]"],
  [/(password|passwd|pwd|api[_-]?key|token|secret|authorization)(\s*[:=]\s*)([^\s'\"&]+)/gi, "$1$2[REDACTED]"],
  [/(postgres|postgresql|mysql|mongodb|redis):\/\/[^\s'\"]+/gi, "$1://[REDACTED_CONNECTION_STRING]"]
];

export function createAgentSidecar(config: AgentSidecarConfig = {}) {
  const apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
  const transport = config.fetch ?? fetch;
  const maxFieldLength = config.maxFieldLength ?? DEFAULT_MAX_FIELD_LENGTH;
  const recentSlices: TrajectorySlice[] = [];

  return {
    async observeStep(input: ObserveStepInput): Promise<Intervention> {
      const slice = TrajectorySlice.parse({
        schemaVersion: 1,
        timestamp: input.timestamp ?? new Date().toISOString(),
        agentName: "generic-coding-agent",
        provider: "unknown",
        toolArguments: {},
        filesTouched: [],
        tokenCounts: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        tags: [],
        metadata: {},
        ...input
      });
      const sanitized = config.redact === false ? slice : sanitizeTrajectorySlice(slice, { maxFieldLength });

      if (config.localOnly) {
        recentSlices.push(sanitized);
        if (recentSlices.length > 50) recentSlices.shift();
        return evaluateTrajectorySlice(sanitized, recentSlices);
      }

      const response = await transport(`${apiUrl}/api/trajectory-slices`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
        },
        body: JSON.stringify(sanitized)
      });

      if (!response.ok) {
        throw new Error(`Agent Sidecar API returned ${response.status}`);
      }

      const payload = ObserveStepResponse.parse(await response.json());
      return payload.intervention;
    },
    sanitizeStep(input: ObserveStepInput): TrajectorySlice {
      const slice = TrajectorySlice.parse({
        schemaVersion: 1,
        timestamp: input.timestamp ?? new Date().toISOString(),
        agentName: "generic-coding-agent",
        provider: "unknown",
        toolArguments: {},
        filesTouched: [],
        tokenCounts: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        tags: [],
        metadata: {},
        ...input
      });
      return sanitizeTrajectorySlice(slice, { maxFieldLength });
    }
  };
}

export function sanitizeTrajectorySlice(slice: TrajectorySlice, options: RedactionOptions = {}): TrajectorySlice {
  const maxFieldLength = options.maxFieldLength ?? DEFAULT_MAX_FIELD_LENGTH;
  return TrajectorySlice.parse(redactValue(slice, maxFieldLength));
}

function redactValue(value: unknown, maxFieldLength: number): unknown {
  if (typeof value === "string") return truncate(redactString(value), maxFieldLength);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactValue(item, maxFieldLength));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        if (key !== "tokenCounts" && /api[_-]?key|token(?!s$)|secret|password|authorization|cookie/i.test(key)) return [key, REDACTED];
        return [key, redactValue(nested, maxFieldLength)];
      })
    );
  }
  return value;
}

function redactString(value: string): string {
  return SECRET_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 32))}\n[TRUNCATED ${value.length - Math.max(0, maxLength - 32)} CHARS]`;
}
