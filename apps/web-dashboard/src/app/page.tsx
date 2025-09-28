'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitHubLogin } from '@/components/auth/github-login';
import { PushNotificationSetup } from '@/components/notifications/push-setup';
import {
  GitBranch,
  Container,
  Mail,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Settings,
  Terminal,
  Activity,
  Monitor,
  Play,
  Square,
  RotateCcw
} from 'lucide-react';

interface DashboardStats {
  totalRequests: number;
  pendingRequests: number;
  completedRequests: number;
  failedRequests: number;
  activeContainers: number;
  repositories: number;
  activeSessions: number;
}

interface TmuxSession {
  sessionId: string;
  userId: string;
  sessionName: string;
  windowName: string;
  workspaceRoot: string;
  isActive: boolean;
  lastActivity: string;
  status: 'running' | 'idle' | 'error';
}

interface RecentRequest {
  id: string;
  command: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  channel: 'email' | 'whatsapp';
  timestamp: string;
  repository?: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalRequests: 0,
    pendingRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    activeContainers: 0,
    repositories: 0,
    activeSessions: 0,
  });

  const [recentRequests, setRecentRequests] = useState<RecentRequest[]>([]);
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [servicesStatus, setServicesStatus] = useState<any>(null);

  useEffect(() => {
    // Simulated data for demo
    setStats({
      totalRequests: 127,
      pendingRequests: 3,
      completedRequests: 118,
      failedRequests: 6,
      activeContainers: 1,
      repositories: 8,
      activeSessions: 2,
    });

    setRecentRequests([
      {
        id: '1',
        command: 'Run tests for auth service',
        status: 'completed',
        channel: 'email',
        timestamp: '2024-01-20T10:30:00Z',
        repository: 'ai-dev-assistant',
      },
      {
        id: '2',
        command: 'Deploy to staging environment',
        status: 'executing',
        channel: 'whatsapp',
        timestamp: '2024-01-20T10:25:00Z',
        repository: 'web-app',
      },
      {
        id: '3',
        command: 'Fix TypeScript errors in container service',
        status: 'pending',
        channel: 'email',
        timestamp: '2024-01-20T10:20:00Z',
        repository: 'ai-dev-assistant',
      },
    ]);

    // Simulated tmux sessions
    setTmuxSessions([
      {
        sessionId: 'user123:claude-code-user123',
        userId: 'user123',
        sessionName: 'claude-code-user123',
        windowName: 'main',
        workspaceRoot: '/workspace/users/user123',
        isActive: true,
        lastActivity: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
        status: 'running',
      },
      {
        sessionId: 'user456:claude-code-user456',
        userId: 'user456',
        sessionName: 'claude-code-user456',
        windowName: 'main',
        workspaceRoot: '/workspace/users/user456',
        isActive: true,
        lastActivity: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        status: 'idle',
      },
    ]);

    // Simulated services status
    setServicesStatus({
      ai: {
        claude: true,
        claudeCode: true,
        openai: false,
        activeSessions: 2,
        queuedRequests: 1,
        claudeCodeStatus: {
          available: true,
          activeSessions: 2,
          totalSessions: 2,
        },
      },
      container: { available: true },
      communication: {
        email: { available: true, configured: true },
        whatsapp: { available: false, configured: false },
        services: { total: 2, healthy: 1 },
      },
    });

    // Simulate connection status
    setIsConnected(true);

    // Set up real-time updates (in production, this would be WebSocket)
    const interval = setInterval(() => {
      // Update last activity times
      setTmuxSessions(prev => prev.map(session => ({
        ...session,
        lastActivity: session.status === 'running'
          ? new Date(Date.now() - Math.random() * 10 * 60 * 1000).toISOString()
          : session.lastActivity,
      })));
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: RecentRequest['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'executing':
        return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: RecentRequest['status']) => {
    const variants = {
      completed: 'default',
      failed: 'destructive',
      executing: 'secondary',
      pending: 'outline',
    } as const;

    return (
      <Badge variant={variants[status]} className="text-xs">
        {status}
      </Badge>
    );
  };

  const getSessionStatusIcon = (status: TmuxSession['status']) => {
    switch (status) {
      case 'running':
        return <Play className="h-4 w-4 text-green-500" />;
      case 'idle':
        return <Monitor className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Square className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSessionStatusBadge = (status: TmuxSession['status']) => {
    const variants = {
      running: 'default',
      idle: 'secondary',
      error: 'destructive',
    } as const;

    return (
      <Badge variant={variants[status]} className="text-xs">
        {status}
      </Badge>
    );
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

  const handleUserLogin = (userData: any) => {
    setUser(userData);
    setStats(prev => ({
      ...prev,
      repositories: userData.repositories?.length || 0,
    }));
  };

  // Show GitHub login if user is not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">AI Dev Assistant</h1>
                <p className="text-gray-600">Multi-modal development automation platform</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Connect Your GitHub Account
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                To get started with AI-powered development assistance, connect your GitHub account.
                This allows us to access your repositories and create isolated development environments
                for each project.
              </p>
            </div>

            <GitHubLogin onLogin={handleUserLogin} />

            <div className="mt-12 grid md:grid-cols-3 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Mail className="h-5 w-5 mr-2 text-blue-500" />
                    Email Integration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Send development requests via email and get results back automatically.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Container className="h-5 w-5 mr-2 text-green-500" />
                    Isolated Environments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Each repository gets its own clean container with your code already cloned.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Monitor className="h-5 w-5 mr-2 text-purple-500" />
                    Persistent Sessions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Claude Code sessions persist between requests, maintaining context and state.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">AI Dev Assistant</h1>
              <p className="text-gray-600">Multi-modal development automation platform</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm text-gray-600">
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                {servicesStatus && (
                  <div className="flex items-center space-x-3 text-xs">
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${servicesStatus.ai?.claudeCode ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-gray-600">Claude Code</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${servicesStatus.container?.available ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-gray-600">Containers</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${servicesStatus.communication?.email?.available ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-gray-600">Email</span>
                    </div>
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <Terminal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalRequests}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingRequests}</div>
              <p className="text-xs text-muted-foreground">Awaiting confirmation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Containers</CardTitle>
              <Container className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeContainers}</div>
              <p className="text-xs text-muted-foreground">Running environments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
              <Monitor className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeSessions}</div>
              <p className="text-xs text-muted-foreground">Claude Code sessions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Repositories</CardTitle>
              <GitBranch className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.repositories}</div>
              <p className="text-xs text-muted-foreground">Connected repos</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Push Notification Setup */}
          <div className="xl:col-span-4 mb-6">
            <PushNotificationSetup />
          </div>

          {/* Recent Requests */}
          <div className="xl:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Requests</CardTitle>
                <CardDescription>Latest development automation requests</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentRequests.map((request) => (
                    <div key={request.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                      <div className="flex-shrink-0 mt-1">
                        {getStatusIcon(request.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {request.command}
                          </p>
                          {getStatusBadge(request.status)}
                        </div>
                        <div className="flex items-center space-x-4 mt-1">
                          <div className="flex items-center space-x-1">
                            {request.channel === 'email' ? (
                              <Mail className="h-3 w-3 text-gray-400" />
                            ) : (
                              <MessageSquare className="h-3 w-3 text-gray-400" />
                            )}
                            <span className="text-xs text-gray-500 capitalize">
                              {request.channel}
                            </span>
                          </div>
                          {request.repository && (
                            <div className="flex items-center space-x-1">
                              <GitBranch className="h-3 w-3 text-gray-400" />
                              <span className="text-xs text-gray-500">
                                {request.repository}
                              </span>
                            </div>
                          )}
                          <span className="text-xs text-gray-500">
                            {new Date(request.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Button variant="outline" className="w-full">
                    View All Requests
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tmux Sessions */}
          <div className="xl:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Monitor className="h-5 w-5 mr-2" />
                  Claude Code Sessions
                </CardTitle>
                <CardDescription>Active tmux sessions with persistent context</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tmuxSessions.map((session) => (
                    <div key={session.sessionId} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {getSessionStatusIcon(session.status)}
                          <span className="font-medium text-sm truncate">
                            {session.sessionName}
                          </span>
                        </div>
                        {getSessionStatusBadge(session.status)}
                      </div>
                      <div className="text-xs text-gray-500 space-y-1">
                        <div className="flex items-center space-x-1">
                          <Terminal className="h-3 w-3" />
                          <span className="truncate">{session.windowName}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatTimeAgo(session.lastActivity)}</span>
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {session.workspaceRoot}
                        </div>
                      </div>
                      <div className="flex space-x-1 mt-2">
                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                          <Terminal className="h-3 w-3 mr-1" />
                          Attach
                        </Button>
                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Restart
                        </Button>
                      </div>
                    </div>
                  ))}
                  {tmuxSessions.length === 0 && (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      No active sessions
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <Button variant="outline" className="w-full text-xs">
                    <Play className="h-3 w-3 mr-2" />
                    Create New Session
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions & Communication */}
          <div className="xl:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Communication Channels</CardTitle>
                <CardDescription>Your private contact information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-900">Email</span>
                  </div>
                  <p className="text-sm text-blue-700 mt-1">
                    {user?.githubUsername?.toLowerCase()}@aidev.platform
                  </p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-green-900">WhatsApp</span>
                  </div>
                  <p className="text-sm text-green-700 mt-1">+1 (555) 123-4567</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common development tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Terminal className="h-4 w-4 mr-2" />
                  Open Terminal
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Container className="h-4 w-4 mr-2" />
                  Manage Containers
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <GitBranch className="h-4 w-4 mr-2" />
                  Repository Settings
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Settings className="h-4 w-4 mr-2" />
                  API Configuration
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}