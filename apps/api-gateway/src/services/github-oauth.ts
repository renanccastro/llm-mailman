import jwt from 'jsonwebtoken';
import { prisma } from '@ai-dev/database';

export interface GitHubUser {
  id: number;
  login: string;
  name?: string;
  email?: string;
  avatar_url: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  private: boolean;
  clone_url: string;
  default_branch: string;
  language?: string;
  updated_at: string;
}

export class GitHubOAuthService {
  private clientId: string;
  private clientSecret: string;
  private jwtSecret: string;

  constructor() {
    this.clientId = process.env.GITHUB_CLIENT_ID!;
    this.clientSecret = process.env.GITHUB_CLIENT_SECRET!;
    this.jwtSecret = process.env.JWT_SECRET || 'your-jwt-secret';
  }

  private ensureConfigured(): void {
    if (!this.clientId || !this.clientSecret || this.clientId === 'your_github_oauth_client_id' || this.clientSecret === 'your_github_oauth_client_secret') {
      throw new Error('GitHub OAuth credentials not configured');
    }
  }

  async exchangeCodeForToken(code: string, state: string): Promise<string> {
    this.ensureConfigured();
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        state,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub OAuth failed: ${response.statusText}`);
    }

    const data = await response.json() as any;

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
    }

    return data.access_token;
  }

  async fetchUserProfile(accessToken: string): Promise<GitHubUser> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch GitHub user: ${response.statusText}`);
    }

    return (await response.json()) as any;
  }

  async fetchUserRepositories(accessToken: string): Promise<GitHubRepository[]> {
    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch GitHub repositories: ${response.statusText}`);
    }

    return (await response.json()) as any;
  }

  async createOrUpdateUser(githubUser: GitHubUser, repositories: GitHubRepository[]): Promise<any> {
    const existingUser = await prisma.user.findUnique({
      where: { githubId: githubUser.id.toString() },
      include: { repositories: true },
    });

    if (existingUser) {
      // Update existing user
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          githubUsername: githubUser.login,
          email: githubUser.email || existingUser.email,
          name: githubUser.name || existingUser.name,
          avatarUrl: githubUser.avatar_url,
        } as any,
        include: { repositories: true },
      });

      // Update repositories
      await this.updateUserRepositories(updatedUser.id, repositories);

      return await prisma.user.findUnique({
        where: { id: updatedUser.id },
        include: { repositories: true },
      });
    } else {
      // Create new user
      const newUser = await prisma.user.create({
        data: {
          githubId: githubUser.id.toString(),
          githubUsername: githubUser.login,
          email: githubUser.email || `${githubUser.login}@github.local`,
          name: githubUser.name || githubUser.login,
          avatarUrl: githubUser.avatar_url,
        } as any,
        include: { repositories: true },
      });

      // Add repositories
      await this.updateUserRepositories(newUser.id, repositories);

      return await prisma.user.findUnique({
        where: { id: newUser.id },
        include: { repositories: true },
      });
    }
  }

  private async updateUserRepositories(userId: string, repositories: GitHubRepository[]): Promise<void> {
    // Delete existing repositories
    await prisma.repository.deleteMany({
      where: { userId },
    });

    // Create new repositories
    const repositoryData = repositories.map(repo => ({
      userId,
      githubId: repo.id.toString(),
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch,
      language: repo.language,
      lastActivity: new Date(repo.updated_at),
    }));

    if (repositoryData.length > 0) {
      await prisma.repository.createMany({
        data: repositoryData as any,
      });
    }
  }

  generateJWT(user: any): string {
    return jwt.sign(
      {
        userId: user.id,
        githubId: user.githubId,
        githubUsername: user.githubUsername,
        email: user.email,
      },
      this.jwtSecret,
      {
        expiresIn: '7d',
        issuer: 'ai-dev-assistant',
        audience: 'api-gateway',
      }
    );
  }

  verifyJWT(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'ai-dev-assistant',
        audience: 'api-gateway',
      });
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  async refreshUserRepositories(userId: string, accessToken: string): Promise<any> {
    const repositories = await this.fetchUserRepositories(accessToken);
    await this.updateUserRepositories(userId, repositories);

    return await prisma.user.findUnique({
      where: { id: userId },
      include: { repositories: true },
    });
  }
}