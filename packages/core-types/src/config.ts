export interface AppConfig {
  workspace: {
    lastOpenedPackage?: string;
  };
  plugins: Record<string, Record<string, unknown>>;
  variables?: Record<string, unknown>;
}
