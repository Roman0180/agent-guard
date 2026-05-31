export type SqliteStorageConfig = {
  databasePath: string;
};

export const DEFAULT_DATABASE_FILENAME = "agentguard.sqlite";

export function createStorageConfig(databasePath: string): SqliteStorageConfig {
  return { databasePath };
}
