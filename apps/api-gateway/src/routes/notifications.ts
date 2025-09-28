import { Router } from 'express';
import { ApiResponse } from '@ai-dev/shared';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { PushNotificationService } from '../services/push-notification';
import { prisma } from '@ai-dev/database';

export const notificationRouter = Router();

const pushService = new PushNotificationService();

// Get VAPID public key for push subscription
notificationRouter.get('/vapid-key', (req, res) => {
  res.json<ApiResponse>({
    success: true,
    data: {
      publicKey: process.env.VAPID_PUBLIC_KEY
    },
    timestamp: new Date().toISOString(),
  });
});

// Subscribe to push notifications
notificationRouter.post('/subscribe', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.user;
    const { subscription, deviceName } = req.body;

    await pushService.subscribeToPush(userId, {
      ...subscription,
      deviceName
    });

    res.json<ApiResponse>({
      success: true,
      message: 'Successfully subscribed to push notifications',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Push subscription error:', error);
    res.status(500).json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to subscribe to push notifications',
      timestamp: new Date().toISOString(),
    });
  }
});

// Unsubscribe from push notifications
notificationRouter.post('/unsubscribe', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.user;

    await prisma.pushSubscription.updateMany({
      where: { userId },
      data: { isActive: false }
    });

    res.json<ApiResponse>({
      success: true,
      message: 'Successfully unsubscribed from push notifications',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Push unsubscription error:', error);
    res.status(500).json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unsubscribe from push notifications',
      timestamp: new Date().toISOString(),
    });
  }
});

// Send test notification
notificationRouter.post('/test', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.user;

    const testRequestId = `test-${Date.now()}`;
    const sent = await pushService.sendTestNotification(userId, testRequestId);

    res.json<ApiResponse>({
      success: true,
      data: {
        sent,
        message: sent
          ? 'Test notification sent successfully'
          : 'No active push subscriptions found'
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test notification',
      timestamp: new Date().toISOString(),
    });
  }
});

// Get notification settings
notificationRouter.get('/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.user;

    const activeSubscriptions = await prisma.pushSubscription.count({
      where: { userId, isActive: true }
    });

    const settings = await prisma.notificationSettings.findUnique({
      where: { userId }
    });

    res.json<ApiResponse>({
      success: true,
      data: {
        pushEnabled: activeSubscriptions > 0,
        activeDevices: activeSubscriptions,
        emailFallback: settings?.emailFallback ?? true,
        emailTimeout: settings?.emailTimeout ?? 5, // minutes
        autoCancel: settings?.autoCancel ?? 15, // minutes
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get notification settings',
      timestamp: new Date().toISOString(),
    });
  }
});

// Update notification settings
notificationRouter.patch('/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.user;
    const { emailFallback, emailTimeout, autoCancel } = req.body;

    await prisma.notificationSettings.upsert({
      where: { userId },
      update: {
        emailFallback,
        emailTimeout,
        autoCancel,
        updatedAt: new Date()
      },
      create: {
        userId,
        emailFallback: emailFallback ?? true,
        emailTimeout: emailTimeout ?? 5,
        autoCancel: autoCancel ?? 15
      }
    });

    res.json<ApiResponse>({
      success: true,
      message: 'Notification settings updated successfully',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update notification settings',
      timestamp: new Date().toISOString(),
    });
  }
});