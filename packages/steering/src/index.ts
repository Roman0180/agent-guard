export type SteeringProviderName = "none" | "local-http";

export type SteeringConfig = {
  enabled: boolean;
  provider: SteeringProviderName;
};

export const DEFAULT_STEERING_CONFIG: SteeringConfig = {
  enabled: false,
  provider: "none"
};
