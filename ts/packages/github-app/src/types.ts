export interface Installation {
  id: number;
  account: {
    login: string;
    id: number;
    type: string; // "User" | "Organization"
  };
  appId: number;
  targetType: string;
  permissions: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface InstallationToken {
  token: string;
  expiresAt: string;
  permissions: Record<string, string>;
}

export interface Repository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  url: string;
}

export interface GitHubAppService {
  /** List all installations of this GitHub App */
  listInstallations(): Promise<Installation[]>;

  /** Get a specific installation by ID */
  getInstallation(installationId: number): Promise<Installation>;

  /** Find an installation by account login (org or user name) */
  findInstallationByAccount(account: string): Promise<Installation | null>;

  /** Mint a short-lived installation access token */
  createInstallationToken(installationId: number): Promise<InstallationToken>;

  /** List repositories accessible to an installation */
  listRepositories(installationId: number): Promise<Repository[]>;
}
