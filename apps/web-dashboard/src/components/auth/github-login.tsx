'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Github, ExternalLink, GitBranch, Lock, Key } from 'lucide-react';

interface GitHubUser {
  id: string;
  githubId: string;
  githubUsername: string;
  email: string;
  name: string;
  avatarUrl: string;
  isActive: boolean;
  hasRepositoryAccess: boolean;
  repositories: Repository[];
}

interface Repository {
  id: string;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  cloneUrl: string;
  defaultBranch: string;
  language?: string;
  lastActivity: string;
}

interface GitHubLoginProps {
  onLogin: (user: GitHubUser) => void;
  apiBaseUrl?: string;
}

export function GitHubLogin({ onLogin, apiBaseUrl = 'http://localhost:4000/api/v1' }: GitHubLoginProps) {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setIsInitializing(false);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData.user);
        onLogin(userData.user);
      } else {
        localStorage.removeItem('auth_token');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('auth_token');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleGitHubLogin = () => {
    setLoading(true);
    setError(null);

    // Redirect to GitHub OAuth
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || 'your-github-client-id';
    const redirectUri = `${window.location.origin}/auth/callback`;
    const scope = 'read:user user:email repo';
    const state = Math.random().toString(36).substring(7);

    localStorage.setItem('oauth_state', state);

    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

    window.location.href = githubAuthUrl;
  };

  const handleRepositoryRefresh = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${apiBaseUrl}/repositories/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const updatedUser = await response.json();
        setUser(updatedUser.user);
        onLogin(updatedUser.user);
      } else {
        throw new Error('Failed to refresh repositories');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to refresh repositories');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('oauth_state');
    setUser(null);
    window.location.reload();
  };

  if (isInitializing) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2">Checking authentication...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (user) {
    return (
      <div className="space-y-6">
        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <img
                src={user.avatarUrl}
                alt={user.name || user.githubUsername}
                className="w-8 h-8 rounded-full mr-3"
              />
              Welcome, {user.name || user.githubUsername}!
            </CardTitle>
            <CardDescription>
              Connected to GitHub with repository access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Github className="h-4 w-4" />
                  <span className="font-medium">@{user.githubUsername}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={user.hasRepositoryAccess ? 'default' : 'secondary'}>
                    {user.hasRepositoryAccess ? (
                      <>
                        <Key className="h-3 w-3 mr-1" />
                        Repository Access Granted
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3 mr-1" />
                        Limited Access
                      </>
                    )}
                  </Badge>
                </div>
              </div>
              <div className="space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRepositoryRefresh}
                  disabled={loading}
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  Refresh Repos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                >
                  Sign Out
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Repositories Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <GitBranch className="h-5 w-5 mr-2" />
              Your Repositories ({user.repositories.length})
            </CardTitle>
            <CardDescription>
              Repositories available for AI development assistance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user.repositories.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No repositories found. Make sure you've granted repository access during OAuth.
                  <Button
                    variant="link"
                    className="ml-2 p-0 h-auto"
                    onClick={handleRepositoryRefresh}
                  >
                    Refresh repositories
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {user.repositories.map((repo) => (
                  <div key={repo.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium">{repo.name}</h4>
                          <Badge variant={repo.private ? 'secondary' : 'outline'}>
                            {repo.private ? 'Private' : 'Public'}
                          </Badge>
                          {repo.language && (
                            <Badge variant="outline">{repo.language}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {repo.description || 'No description'}
                        </p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span>Default: {repo.defaultBranch}</span>
                          <span>Last activity: {new Date(repo.lastActivity).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`https://github.com/${repo.fullName}`, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Instructions Card */}
        <Card>
          <CardHeader>
            <CardTitle>📧 Send Development Requests via Email</CardTitle>
            <CardDescription>
              Use your private email to send commands for any repository
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Your Private Email Address:</h4>
                <code className="bg-white px-3 py-1 rounded border">
                  {user.githubUsername.toLowerCase()}@aidev.platform
                </code>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Example Email Commands:</h4>

                <div className="space-y-2 text-sm">
                  <div className="bg-gray-50 p-3 rounded">
                    <strong>Subject:</strong> [my-repo] Run tests<br/>
                    <strong>Body:</strong> Please run the test suite and fix any failing tests
                  </div>

                  <div className="bg-gray-50 p-3 rounded">
                    <strong>Subject:</strong> Add new feature<br/>
                    <strong>Body:</strong> Repository: my-repo<br/>
                    Create a new API endpoint for user authentication
                  </div>

                  <div className="bg-gray-50 p-3 rounded">
                    <strong>Subject:</strong> Debug issue<br/>
                    <strong>Body:</strong> Repository: my-repo<br/>
                    The login function is throwing errors, please investigate and fix
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center">
          <Github className="h-6 w-6 mr-2" />
          GitHub Authentication Required
        </CardTitle>
        <CardDescription>
          Connect your GitHub account to access repository-scoped AI development assistance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <h4 className="font-medium">What we'll access:</h4>
          <ul className="text-sm space-y-1 text-gray-600">
            <li>• Your GitHub profile information</li>
            <li>• List of your repositories</li>
            <li>• Read access to repository code</li>
            <li>• Create commits and branches (when authorized)</li>
          </ul>
        </div>

        <Button
          onClick={handleGitHubLogin}
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Connecting...
            </>
          ) : (
            <>
              <Github className="h-4 w-4 mr-2" />
              Sign in with GitHub
            </>
          )}
        </Button>

        <p className="text-xs text-gray-500 text-center">
          By signing in, you agree to our terms of service and privacy policy.
          You can revoke access at any time in your GitHub settings.
        </p>
      </CardContent>
    </Card>
  );
}