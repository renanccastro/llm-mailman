import { Router } from 'express';
import { ApiResponse } from '@ai-dev/shared';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { containerLifecycleManager } from '../services';
import { prisma } from '@ai-dev/database';

export const containerSessionRouter: any = Router();

// Get active container sessions for user
containerSessionRouter.get('/sessions', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.user;

    const sessions = await prisma.containerSession.findMany({
      where: {
        userId,
        isActive: true
      },
      orderBy: {
        lastActivityAt: 'desc'
      }
    });

    const now = Date.now();
    const IDLE_TIMEOUT_MS = 45 * 60 * 1000;

    const enrichedSessions = sessions.map(session => {
      const lastActivity = session.lastActivityAt.getTime();
      const idleTime = now - lastActivity;
      const idleMinutes = Math.floor(idleTime / 60000);
      const timeRemaining = Math.max(0, Math.floor((IDLE_TIMEOUT_MS - idleTime) / 60000));

      return {
        containerId: session.containerId,
        threadId: session.threadId,
        repositoryName: session.repositoryId, // Could be enhanced to get actual name
        isActive: session.isActive,
        lastActivityAt: session.lastActivityAt,
        createdAt: session.createdAt,
        idleMinutes,
        timeRemaining
      };
    });

    res.json({
      success: true,
      data: {
        sessions: enrichedSessions,
        total: enrichedSessions.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get container sessions error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get container sessions',
      timestamp: new Date().toISOString()
    });
  }
});

// Force cleanup a container
containerSessionRouter.post('/:containerId/cleanup', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.user;
    const { containerId } = req.params;

    // Verify ownership
    const session = await prisma.containerSession.findFirst({
      where: {
        containerId,
        userId,
        isActive: true
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Container not found or not owned by user',
        timestamp: new Date().toISOString()
      });
    }

    // Force cleanup
    await containerLifecycleManager.forceCleanupThread(session.threadId);

    res.json({
      success: true,
      message: 'Container cleaned up successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Container cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cleanup container',
      timestamp: new Date().toISOString()
    });
  }
});

// Extend container lifetime
containerSessionRouter.post('/:containerId/extend', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.user;
    const { containerId } = req.params;

    // Verify ownership
    const session = await prisma.containerSession.findFirst({
      where: {
        containerId,
        userId,
        isActive: true
      }
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Container not found or not owned by user',
        timestamp: new Date().toISOString()
      });
    }

    // Update activity to reset timer
    await containerLifecycleManager.updateActivity(containerId);

    // Update database
    await prisma.containerSession.update({
      where: { containerId },
      data: { lastActivityAt: new Date() }
    });

    res.json({
      success: true,
      message: 'Container lifetime extended by 45 minutes',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Container extend error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extend container lifetime',
      timestamp: new Date().toISOString()
    });
  }
});

// Get container statistics
containerSessionRouter.get('/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const stats = await containerLifecycleManager.getStatistics();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get container stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get container statistics',
      timestamp: new Date().toISOString()
    });
  }
});