// Service Worker for Push Notifications
const CACHE_NAME = 'ai-dev-assistant-v1';

// Install event
self.addEventListener('install', function(event) {
  console.log('Service Worker: Install');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Activate');
  event.waitUntil(
    clients.claim()
  );
});

// Push event handler
self.addEventListener('push', function(event) {
  console.log('Service Worker: Push Received', event);

  if (event.data) {
    const data = event.data.json();
    console.log('Push data:', data);

    const options = {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      image: data.type === 'command_confirmation' ? '/icons/confirmation-banner.png' : undefined,
      actions: data.type === 'command_confirmation' ? [
        {
          action: 'approve',
          title: '✅ Approve',
          icon: '/icons/approve-32x32.png'
        },
        {
          action: 'deny',
          title: '❌ Deny',
          icon: '/icons/deny-32x32.png'
        },
        {
          action: 'view',
          title: '👁️ View Details',
          icon: '/icons/view-32x32.png'
        }
      ] : [
        {
          action: 'view',
          title: '👁️ Open Dashboard',
          icon: '/icons/view-32x32.png'
        }
      ],
      data: {
        requestId: data.requestId,
        url: data.url,
        type: data.type
      },
      requireInteraction: data.type === 'command_confirmation', // Keep confirmation notifications until user acts
      tag: `${data.type}-${data.requestId}`, // Group related notifications
      vibrate: data.type === 'command_confirmation' ? [200, 100, 200] : [100],
      silent: false,
      timestamp: Date.now()
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', function(event) {
  console.log('Service Worker: Notification Click', event);

  event.notification.close();

  const data = event.notification.data;

  if (event.action === 'approve') {
    // Handle approval
    event.waitUntil(
      handleConfirmationAction(data.requestId, 'approve')
    );
  } else if (event.action === 'deny') {
    // Handle denial
    event.waitUntil(
      handleConfirmationAction(data.requestId, 'deny')
    );
  } else {
    // Open dashboard or specific page
    const url = data.url || '/';
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(function(clientList) {
        // Check if dashboard is already open
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }

        // Open new window if not already open
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

// Handle confirmation actions
async function handleConfirmationAction(requestId, action) {
  try {
    const token = await getStoredToken();

    if (!token) {
      console.error('No auth token found');
      return;
    }

    const response = await fetch(`/api/v1/requests/${requestId}/${action}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      // Show success notification
      const actionText = action === 'approve' ? 'approved' : 'denied';
      await self.registration.showNotification(
        `Command ${actionText}`,
        {
          body: `The development command has been ${actionText} successfully.`,
          icon: '/icons/icon-192x192.png',
          tag: `action-result-${requestId}`,
          actions: [
            {
              action: 'view',
              title: 'View Dashboard',
              icon: '/icons/view-32x32.png'
            }
          ]
        }
      );
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to handle confirmation action:', error);

    // Show error notification
    await self.registration.showNotification(
      'Action Failed',
      {
        body: 'Failed to process your response. Please try again from the dashboard.',
        icon: '/icons/icon-192x192.png',
        tag: `action-error-${requestId}`,
        actions: [
          {
            action: 'view',
            title: 'Open Dashboard',
            icon: '/icons/view-32x32.png'
          }
        ]
      }
    );
  }
}

// Get stored authentication token
async function getStoredToken() {
  try {
    // Get token from IndexedDB or localStorage
    const clients = await self.clients.matchAll({ type: 'window' });

    if (clients.length > 0) {
      // Request token from active client
      return new Promise((resolve) => {
        const client = clients[0];
        const channel = new MessageChannel();

        channel.port1.onmessage = function(event) {
          resolve(event.data.token);
        };

        client.postMessage({ action: 'getToken' }, [channel.port2]);

        // Timeout after 5 seconds
        setTimeout(() => resolve(null), 5000);
      });
    }

    return null;
  } catch (error) {
    console.error('Failed to get stored token:', error);
    return null;
  }
}

// Background sync for offline actions
self.addEventListener('sync', function(event) {
  console.log('Service Worker: Background Sync', event.tag);

  if (event.tag === 'confirmation-action') {
    event.waitUntil(
      // Handle any pending confirmation actions when back online
      processPendingActions()
    );
  }
});

async function processPendingActions() {
  // This would process any actions that were queued while offline
  console.log('Processing pending confirmation actions...');
}

// Handle messages from main thread
self.addEventListener('message', function(event) {
  console.log('Service Worker: Message received', event.data);

  if (event.data.action === 'getToken') {
    // This will be handled by the client
  }
});

console.log('Service Worker: Loaded');