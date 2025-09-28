import webpush from 'web-push';
import { prisma } from '@ai-dev/database';

export interface PushSubscription {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  deviceName?: string;
}

export class PushNotificationService {
  constructor() {
    webpush.setVapidDetails(
      'mailto:admin@yourplatform.com',
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
  }

  async subscribeToPush(userId: string, subscription: any): Promise<void> {
    await prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: {
          userId,
          endpoint: subscription.endpoint
        }
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        isActive: true,
        lastUsed: new Date()
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        isActive: true,
        lastUsed: new Date()
      }
    });
  }

  async sendCommandConfirmation(requestId: string, userId: string): Promise<boolean> {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      include: { repository: true }
    });

    if (!request) throw new Error('Request not found');

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId, isActive: true }
    });

    if (subscriptions.length === 0) {
      return false; // No push subscriptions, will fall back to email
    }

    const payload = {
      title: '🔐 Confirm Development Command',
      body: `"${this.truncateCommand(request.command)}" on ${request.repository?.name || 'unknown repo'}`,
      requestId,
      url: `/requests/${requestId}`,
      data: {
        type: 'command_confirmation',
        requestId,
        command: request.command,
        repository: request.repository?.name,
        timestamp: new Date().toISOString()
      }
    };

    let successCount = 0;

    // Send to all active devices
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          },
          JSON.stringify(payload)
        );

        successCount++;

        // Update last used timestamp
        await prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastUsed: new Date() }
        });

      } catch (error) {
        console.error(`Failed to send push notification:`, error);

        // Deactivate failed subscriptions
        if ((error as any).statusCode === 410) { // Gone - subscription expired
          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { isActive: false }
          });
        }
      }
    }

    return successCount > 0;
  }

  async sendTestNotification(userId: string, testRequestId: string): Promise<boolean> {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId, isActive: true }
    });

    if (subscriptions.length === 0) {
      return false;
    }

    const payload = {
      title: '🧪 Test Notification',
      body: 'Push notifications are working! You\'ll receive confirmations like this.',
      requestId: testRequestId,
      url: '/settings',
      data: {
        type: 'test_notification',
        timestamp: new Date().toISOString()
      }
    };

    let successCount = 0;

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.keys.auth
            }
          },
          JSON.stringify(payload)
        );

        successCount++;

      } catch (error) {
        console.error(`Failed to send test notification:`, error);

        if ((error as any).statusCode === 410) {
          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { isActive: false }
          });
        }
      }
    }

    return successCount > 0;
  }

  private truncateCommand(command: string, maxLength: number = 60): string {
    return command.length > maxLength
      ? command.substring(0, maxLength) + '...'
      : command;
  }
}