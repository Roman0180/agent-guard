export type DetectorResult = {
  matched: boolean;
  reasonCode?: string;
};

export function noMatch(): DetectorResult {
  return { matched: false };
}
