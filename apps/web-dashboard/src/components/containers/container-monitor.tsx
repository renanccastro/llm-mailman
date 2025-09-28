'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Container,
  Clock,
  Activity,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  GitBranch,
  Monitor
} from 'lucide-react';

interface ContainerSession {
  containerId: string;
  threadId: string;
  repositoryName?: string;
  isActive: boolean;
  lastActivityAt: string;
  createdAt: string;
  idleMinutes: number;
  timeRemaining: number;
}

export function ContainerMonitor() {
  const [sessions, setSessions] = useState<ContainerSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContainerSessions();
    const interval = setInterval(loadContainerSessions, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadContainerSessions = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/v1/containers/sessions', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions);
      } else {
        throw new Error('Failed to load container sessions');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const cleanupContainer = async (containerId: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/v1/containers/${containerId}/cleanup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await loadContainerSessions();
      } else {
        throw new Error('Failed to cleanup container');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to cleanup');
    }
  };

  const extendContainer = async (containerId: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/v1/containers/${containerId}/extend`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await loadContainerSessions();
      } else {
        throw new Error('Failed to extend container lifetime');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to extend');
    }
  };

  const getIdleStatus = (idleMinutes: number, timeRemaining: number) => {
    if (timeRemaining <= 5) {
      return { variant: 'destructive' as const, text: 'Expiring Soon' };
    } else if (idleMinutes < 15) {
      return { variant: 'default' as const, text: 'Active' };
    } else if (idleMinutes < 30) {
      return { variant: 'secondary' as const, text: 'Idle' };
    } else {
      return { variant: 'outline' as const, text: 'Very Idle' };
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Container className="h-5 w-5 mr-2" />
          Container Lifecycle Monitor
        </CardTitle>
        <CardDescription>
          Containers automatically shut down after 45 minutes of inactivity
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Container className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No active containers</p>
            <p className="text-sm mt-2">Containers will be created when you send commands</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => {
              const status = getIdleStatus(session.idleMinutes, session.timeRemaining);
              const progressPercentage = Math.max(0, Math.min(100, (session.timeRemaining / 45) * 100));

              return (
                <div key={session.containerId} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Monitor className="h-4 w-4 text-gray-500" />
                        <span className="font-mono text-sm">{session.containerId.substring(0, 12)}</span>
                        <Badge variant={status.variant}>{status.text}</Badge>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Thread: {session.threadId}
                      </div>
                      {session.repositoryName && (
                        <div className="flex items-center space-x-1 text-sm text-gray-600 mt-1">
                          <GitBranch className="h-3 w-3" />
                          <span>{session.repositoryName}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex space-x-1">
                      {session.timeRemaining <= 10 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => extendContainer(session.containerId)}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Extend
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cleanupContainer(session.containerId)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Clean up
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-4 text-gray-500">
                        <span className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          Created {formatTimeAgo(session.createdAt)}
                        </span>
                        <span className="flex items-center">
                          <Activity className="h-3 w-3 mr-1" />
                          Last active {formatTimeAgo(session.lastActivityAt)}
                        </span>
                      </div>
                      <span className="text-gray-600 font-medium">
                        {session.timeRemaining}m remaining
                      </span>
                    </div>

                    <div>
                      <Progress value={progressPercentage} className="h-2" />
                      {session.timeRemaining <= 5 && (
                        <p className="text-xs text-orange-600 mt-1 flex items-center">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Container will be cleaned up soon. Extend if you need more time.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2 flex items-center">
            <CheckCircle className="h-4 w-4 mr-2" />
            How Container Lifecycle Works
          </h4>
          <ul className="text-sm space-y-1 text-blue-800">
            <li>• Containers persist for 45 minutes after last command</li>
            <li>• Each email thread gets its own container</li>
            <li>• Repository state is preserved between commands</li>
            <li>• Work is auto-saved before cleanup</li>
            <li>• Containers are restored when thread continues</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}