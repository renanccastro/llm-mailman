'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Github, CheckCircle, XCircle, Loader } from 'lucide-react';

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing GitHub authentication...');
  const [userInfo, setUserInfo] = useState<any>(null);

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      // Check for OAuth errors
      if (error) {
        throw new Error(`GitHub OAuth error: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received from GitHub');
      }

      // Verify state parameter
      const storedState = localStorage.getItem('oauth_state');
      if (!storedState || storedState !== state) {
        throw new Error('Invalid state parameter - possible CSRF attack');
      }

      setMessage('Exchanging code for access token...');

      // Exchange code for access token
      const response = await fetch('http://localhost:4000/api/v1/auth/github/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, state }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Authentication failed`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Authentication failed');
      }

      setMessage('Fetching user repositories...');

      // Store the JWT token
      localStorage.setItem('auth_token', data.token);
      localStorage.removeItem('oauth_state');

      setUserInfo(data.user);
      setStatus('success');
      setMessage('Authentication successful! Redirecting to dashboard...');

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/');
      }, 2000);

    } catch (error) {
      console.error('OAuth callback error:', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Authentication failed');

      // Clean up stored state
      localStorage.removeItem('oauth_state');
    }
  };

  const handleRetry = () => {
    router.push('/');
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader className="h-8 w-8 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case 'error':
        return <XCircle className="h-8 w-8 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'border-blue-200 bg-blue-50';
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'error':
        return 'border-red-200 bg-red-50';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className={`w-full max-w-md ${getStatusColor()}`}>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {getStatusIcon()}
          </div>
          <CardTitle className="flex items-center justify-center">
            <Github className="h-6 w-6 mr-2" />
            GitHub Authentication
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Processing your GitHub authentication...'}
            {status === 'success' && 'Successfully connected to GitHub!'}
            {status === 'error' && 'Authentication failed'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'loading' && (
            <div className="space-y-3">
              <div className="text-center text-sm text-gray-600">
                {message}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
              </div>
            </div>
          )}

          {status === 'success' && userInfo && (
            <div className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Welcome, {userInfo.name || userInfo.githubUsername}! Your account has been connected successfully.
                </AlertDescription>
              </Alert>

              <div className="bg-white p-4 rounded-lg border">
                <div className="flex items-center space-x-3">
                  <img
                    src={userInfo.avatarUrl}
                    alt={userInfo.name || userInfo.githubUsername}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <h3 className="font-medium">{userInfo.name || userInfo.githubUsername}</h3>
                    <p className="text-sm text-gray-600">@{userInfo.githubUsername}</p>
                    <p className="text-xs text-gray-500">
                      {userInfo.repositories?.length || 0} repositories accessible
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-center text-sm text-gray-600">
                Redirecting to dashboard...
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {message}
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h4 className="font-medium">Troubleshooting:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Make sure you granted the necessary permissions</li>
                  <li>• Check that your GitHub account is accessible</li>
                  <li>• Try clearing your browser cache and cookies</li>
                  <li>• Ensure you're using a supported browser</li>
                </ul>
              </div>

              <div className="flex space-x-2">
                <Button
                  onClick={handleRetry}
                  className="flex-1"
                  variant="outline"
                >
                  Back to Dashboard
                </Button>
                <Button
                  onClick={() => window.location.href = '/'}
                  className="flex-1"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthCallbackContent />
    </Suspense>
  );
}
