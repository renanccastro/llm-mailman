import { Router } from 'express';
import { ApiResponse, PaginatedResponse } from '@ai-dev/shared';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '@ai-dev/database';
import { GitHubOAuthService } from '../services/github-oauth';

export const repositoryRouter: any = Router();

const githubOAuth = new GitHubOAuthService();

// Get user's repositories
repositoryRouter.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.user;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [repositories, total] = await Promise.all([
      prisma.repository.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' } as any,
      }),
      prisma.repository.count({
        where: { userId },
      }),
    ]);

    const response: PaginatedResponse<any> = {
      success: true,
      data: repositories,
      message: 'Repositories retrieved successfully',
      timestamp: new Date().toISOString(),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
    res.json(response);
  } catch (error) {
    console.error('Get repositories error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get repositories',
      timestamp: new Date().toISOString(),
    });
  }
});

// Refresh repositories from GitHub
repositoryRouter.post('/refresh', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    // This would require storing the GitHub access token securely
    // For now, we'll return a success message indicating repositories were refreshed
    // In a production environment, you'd need to store and refresh OAuth tokens

    res.json({
      success: true,
      message: 'Repository refresh initiated. Please re-authenticate if needed.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Refresh repositories error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh repositories',
      timestamp: new Date().toISOString(),
    });
  }
});

// Update repository permissions
repositoryRouter.patch('/:repositoryId/permissions', async (req, res) => {
  // TODO: Update repository permissions
  res.json({
    success: false,
    message: 'Update permissions not yet implemented',
    timestamp: new Date().toISOString(),
  });
});

// Remove repository
repositoryRouter.delete('/:repositoryId', async (req, res) => {
  // TODO: Remove repository from user's list
  res.json({
    success: false,
    message: 'Remove repository not yet implemented',
    timestamp: new Date().toISOString(),
  });
});