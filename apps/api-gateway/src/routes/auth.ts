import { Router } from 'express';
import { ApiResponse } from '@ai-dev/shared';
import { GitHubOAuthService } from '../services/github-oauth';
import { authenticateToken } from '../middleware/auth';

export const authRouter = Router();

const githubOAuth = new GitHubOAuthService();

// GitHub OAuth callback - exchange code for user data
authRouter.post('/github/callback', async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json<ApiResponse>({
        success: false,
        error: 'Authorization code is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Exchange code for access token
    const accessToken = await githubOAuth.exchangeCodeForToken(code, state);

    // Fetch user profile and repositories
    const [githubUser, repositories] = await Promise.all([
      githubOAuth.fetchUserProfile(accessToken),
      githubOAuth.fetchUserRepositories(accessToken),
    ]);

    // Create or update user in database
    const user = await githubOAuth.createOrUpdateUser(githubUser, repositories);

    // Generate JWT token
    const token = githubOAuth.generateJWT(user);

    res.json<ApiResponse>({
      success: true,
      message: 'Authentication successful',
      data: {
        token,
        user: {
          id: user.id,
          githubId: user.githubId,
          githubUsername: user.githubUsername,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          isActive: user.isActive,
          hasRepositoryAccess: user.hasRepositoryAccess,
          repositories: user.repositories,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    res.status(500).json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Get current user info
authRouter.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;

    res.json<ApiResponse>({
      success: true,
      data: {
        user: {
          id: user.userId,
          githubId: user.githubId,
          githubUsername: user.githubUsername,
          email: user.email,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user info',
      timestamp: new Date().toISOString(),
    });
  }
});

// Logout
authRouter.post('/logout', async (req, res) => {
  // TODO: Implement logout
  res.json<ApiResponse>({
    success: true,
    message: 'Logged out successfully',
    timestamp: new Date().toISOString(),
  });
});

// Refresh token
authRouter.post('/refresh', async (req, res) => {
  // TODO: Implement token refresh
  res.json<ApiResponse>({
    success: false,
    message: 'Token refresh not yet implemented',
    timestamp: new Date().toISOString(),
  });
});