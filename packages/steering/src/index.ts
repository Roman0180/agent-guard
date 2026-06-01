export type SteeringProviderName = "local-http";

export type SteeringConfig = {
  enabled: boolean;
  providers: SteeringProviderName[];
  maxCallsPerRun: number;
  maxCostUsdPerRun: number;
};

export const DEFAULT_STEERING_CONFIG: SteeringConfig = {
  enabled: false,
  providers: [],
  maxCallsPerRun: 0,
  maxCostUsdPerRun: 0
};
