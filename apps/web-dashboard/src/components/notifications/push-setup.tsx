'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bell, BellOff, Shield, Check, AlertTriangle, Settings } from 'lucide-react';

interface NotificationSettings {
  pushEnabled: boolean;
  activeDevices: number;
  emailFallback: boolean;
  emailTimeout: number;
  autoCancel: number;
}

export function PushNotificationSetup() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    checkNotificationSupport();
    loadNotificationSettings();
  }, []);

  const checkNotificationSupport = () => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
      checkSubscriptionStatus();
    }
  };

  const checkSubscriptionStatus = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      } catch (error) {
        console.error('Error checking subscription:', error);
      }
    }
  };

  const loadNotificationSettings = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/v1/notifications/settings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data.data);
        setIsSubscribed(data.data.pushEnabled);
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    }
  };

  const enablePushNotifications = async () => {
    setLoading(true);
    setError(null);

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Get VAPID public key from server
      const vapidResponse = await fetch('/api/v1/notifications/vapid-key');
      if (!vapidResponse.ok) {
        throw new Error('Failed to get VAPID key');
      }
      const { data } = await vapidResponse.json();

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey)
      });

      // Send subscription to server
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/v1/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subscription,
          deviceName: getBrowserInfo()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      setIsSubscribed(true);
      await loadNotificationSettings();

      // Send test notification
      await sendTestNotification();

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to enable notifications');
    } finally {
      setLoading(false);
    }
  };

  const disablePushNotifications = async () => {
    setLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      const token = localStorage.getItem('auth_token');
      await fetch('/api/v1/notifications/unsubscribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      setIsSubscribed(false);
      await loadNotificationSettings();
    } catch (error) {
      setError('Failed to disable notifications');
    } finally {
      setLoading(false);
    }
  };

  const sendTestNotification = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/v1/notifications/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setTestSent(true);
        setTimeout(() => setTestSent(false), 5000);
      }
    } catch (error) {
      console.error('Failed to send test notification:', error);
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const getBrowserInfo = () => {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown Browser';
  };

  if (!('Notification' in window)) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Push notifications are not supported in this browser. Email confirmations will be used instead.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Shield className="h-5 w-5 mr-2" />
          Security Confirmations
        </CardTitle>
        <CardDescription>
          Configure how you receive command confirmations for security
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {testSent && (
          <Alert>
            <Check className="h-4 w-4" />
            <AlertDescription>
              Test notification sent! Check your notifications.
            </AlertDescription>
          </Alert>
        )}

        {/* Push Notifications Section */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center space-x-3">
            {isSubscribed ? (
              <Bell className="h-5 w-5 text-green-500" />
            ) : (
              <BellOff className="h-5 w-5 text-gray-400" />
            )}
            <div>
              <p className="font-medium">
                Push Notifications
                {isSubscribed && (
                  <Badge variant="default" className="ml-2">
                    Enabled
                  </Badge>
                )}
              </p>
              <p className="text-sm text-gray-600">
                {isSubscribed
                  ? `Active on ${settings?.activeDevices || 1} device(s) - Instant confirmations`
                  : 'Disabled - Email confirmations only (slower)'
                }
              </p>
            </div>
          </div>

          <div className="flex space-x-2">
            {isSubscribed && (
              <Button
                onClick={sendTestNotification}
                disabled={loading}
                variant="outline"
                size="sm"
              >
                Test
              </Button>
            )}
            <Button
              onClick={isSubscribed ? disablePushNotifications : enablePushNotifications}
              disabled={loading}
              variant={isSubscribed ? "outline" : "default"}
            >
              {loading ? (
                'Working...'
              ) : isSubscribed ? (
                'Disable'
              ) : (
                'Enable'
              )}
            </Button>
          </div>
        </div>

        {/* Settings Overview */}
        {settings && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="font-medium flex items-center">
                <Settings className="h-4 w-4 mr-2" />
                Confirmation Flow
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Push notifications:</span>
                    <Badge variant={isSubscribed ? "default" : "secondary"}>
                      {isSubscribed ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email fallback:</span>
                    <Badge variant={settings.emailFallback ? "default" : "secondary"}>
                      {settings.emailFallback ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email timeout:</span>
                    <span className="font-medium">{settings.emailTimeout} minutes</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Auto-cancel:</span>
                    <span className="font-medium">{settings.autoCancel} minutes</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* How it works */}
        <div className="space-y-3 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900">🔄 How confirmation works:</h4>
          <ol className="text-sm space-y-1 text-blue-800">
            <li>1. Email command received → Security confirmation required</li>
            <li>2. {isSubscribed ? 'Push notification sent instantly' : 'Email confirmation sent'}</li>
            <li>3. {isSubscribed ? `Email fallback after ${settings?.emailTimeout || 5} minutes if no response` : 'Waiting for email response'}</li>
            <li>4. Command approved → Container created & executed</li>
            <li>5. Results sent back via email</li>
          </ol>
        </div>

        {permission === 'denied' && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Notifications are blocked in your browser. To enable them:
              <br />• Click the lock icon in your address bar
              <br />• Allow notifications for this site
              <br />• Refresh the page and try again
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}