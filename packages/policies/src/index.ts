export type PolicyFailMode = "open" | "closed";

export type PolicyConfig = {
  failMode: PolicyFailMode;
};

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  failMode: "open"
};
