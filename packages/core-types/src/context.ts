export interface AppContext {
  readonly version: string;
}

export interface WorkspaceContext {
  readonly workspaceId: string;
  readonly name?: string;
}

export interface PackageContext {
  readonly packageId: string;
}
