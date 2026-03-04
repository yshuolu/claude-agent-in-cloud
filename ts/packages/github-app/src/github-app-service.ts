import { generateAppJwt } from "./jwt.js";
import type {
  GitHubAppService,
  Installation,
  InstallationToken,
  Repository,
} from "./types.js";

const GITHUB_API = "https://api.github.com";

interface GitHubInstallationResponse {
  id: number;
  account: { login: string; id: number; type: string };
  app_id: number;
  target_type: string;
  permissions: Record<string, string>;
  created_at: string;
  updated_at: string;
}

interface GitHubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
}

interface GitHubTokenResponse {
  token: string;
  expires_at: string;
  permissions: Record<string, string>;
}

export class DefaultGitHubAppService implements GitHubAppService {
  private appId: string;
  private privateKey: string;

  constructor(appId: string, privateKey: string) {
    this.appId = appId;
    // Handle escaped newlines in env vars
    this.privateKey = privateKey.replace(/\\n/g, "\n");
  }

  async listInstallations(): Promise<Installation[]> {
    const jwt = generateAppJwt(this.appId, this.privateKey);
    const res = await fetch(`${GITHUB_API}/app/installations`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `GitHub API error listing installations (${res.status}): ${body}`,
      );
    }

    const data = (await res.json()) as GitHubInstallationResponse[];
    return data.map(mapInstallation);
  }

  async getInstallation(installationId: number): Promise<Installation> {
    const jwt = generateAppJwt(this.appId, this.privateKey);
    const res = await fetch(
      `${GITHUB_API}/app/installations/${installationId}`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `GitHub API error getting installation ${installationId} (${res.status}): ${body}`,
      );
    }

    return mapInstallation(
      (await res.json()) as GitHubInstallationResponse,
    );
  }

  async findInstallationByAccount(
    account: string,
  ): Promise<Installation | null> {
    const installations = await this.listInstallations();
    return (
      installations.find(
        (i) => i.account.login.toLowerCase() === account.toLowerCase(),
      ) ?? null
    );
  }

  async createInstallationToken(
    installationId: number,
  ): Promise<InstallationToken> {
    const jwt = generateAppJwt(this.appId, this.privateKey);
    const res = await fetch(
      `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `GitHub API error minting token for installation ${installationId} (${res.status}): ${body}`,
      );
    }

    const data = (await res.json()) as GitHubTokenResponse;
    return {
      token: data.token,
      expiresAt: data.expires_at,
      permissions: data.permissions,
    };
  }

  async listRepositories(installationId: number): Promise<Repository[]> {
    // Mint a short-lived token to call the installation repos endpoint
    const installationToken =
      await this.createInstallationToken(installationId);
    const res = await fetch(`${GITHUB_API}/installation/repositories`, {
      headers: {
        Authorization: `token ${installationToken.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `GitHub API error listing repos for installation ${installationId} (${res.status}): ${body}`,
      );
    }

    const data = (await res.json()) as {
      repositories: GitHubRepoResponse[];
    };
    return data.repositories.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
      url: r.html_url,
    }));
  }
}

function mapInstallation(raw: GitHubInstallationResponse): Installation {
  return {
    id: raw.id,
    account: {
      login: raw.account.login,
      id: raw.account.id,
      type: raw.account.type,
    },
    appId: raw.app_id,
    targetType: raw.target_type,
    permissions: raw.permissions,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}
