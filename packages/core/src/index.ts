export type AgentProvider = "codex" | "claude-code" | "generic";

export type HealthStatus = {
  status: "ok";
  service: "agentguard-daemon";
};

export type RuntimeDecisionAction =
  | "allow"
  | "warn"
  | "block"
  | "require_continue"
  | "require_approval"
  | "inject_lesson";

export type RuntimeDecision = {
  action: RuntimeDecisionAction;
  reasonCode: string;
  message: string;
};

export const AGENTGUARD_DAEMON_DEFAULT_PORT = 4737;
