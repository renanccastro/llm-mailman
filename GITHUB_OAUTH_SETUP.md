# GitHub OAuth Setup Guide

This guide explains how to set up GitHub OAuth for the AI Development Assistant Platform.

## Prerequisites

1. A GitHub account
2. Admin access to create GitHub Apps or OAuth Apps

## Step 1: Create GitHub OAuth App

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Click "New OAuth App"
3. Fill in the application details:
   - **Application name**: AI Development Assistant
   - **Homepage URL**: `http://localhost:3001` (for development)
   - **Application description**: Multi-modal development automation platform
   - **Authorization callback URL**: `http://localhost:3001/auth/callback`

4. Click "Register application"
5. Note down the **Client ID** and generate a **Client Secret**

## Step 2: Configure Environment Variables

### API Gateway (.env)

```bash
# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-minimum-32-chars
```

### Web Dashboard (.env.local)

```bash
# GitHub OAuth
NEXT_PUBLIC_GITHUB_CLIENT_ID=your-github-client-id

# API Configuration
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

## Step 3: OAuth Permissions

The application requests the following GitHub permissions:

- `read:user` - Read user profile information
- `user:email` - Access user email addresses
- `repo` - Access to repositories (read and write)

## Step 4: How the OAuth Flow Works

### 1. User Authentication
- User clicks "Sign in with GitHub" in the web dashboard
- Redirected to GitHub OAuth authorization page
- User grants permissions
- GitHub redirects back to `/auth/callback` with authorization code

### 2. Token Exchange
- Frontend sends authorization code to API Gateway
- API Gateway exchanges code for access token with GitHub
- API Gateway fetches user profile and repositories
- User data is stored in database
- JWT token is generated and returned to frontend

### 3. Repository Access
- User's repositories are automatically synchronized
- Each repository gets its own clean container when referenced in commands
- Commands can be scoped to specific repositories

## Step 5: Email-to-Repository Workflow

### Email Format
Users can send development requests via email with repository context:

```
To: username@aidev.platform
Subject: [repository-name] Your development request
Body: Detailed description of what you want to accomplish
```

Or:

```
To: username@aidev.platform
Subject: Your development request
Body:
Repository: repository-name
Please implement a new authentication system using JWT tokens
```

### Processing Flow
1. Email received via webhook
2. Repository extracted from subject or body
3. Confirmation sent to user
4. User confirms via email/WhatsApp
5. Fresh container created with repository code cloned
6. Claude Code session started in container
7. Command executed in repository context
8. Results sent back to user

## Security Considerations

1. **JWT Secret**: Use a strong, random secret for JWT signing
2. **Token Storage**: JWT tokens are stored in localStorage (consider httpOnly cookies for production)
3. **Repository Access**: Users can only access repositories they have permissions for
4. **Container Isolation**: Each repository runs in its own isolated container
5. **Command Confirmation**: All commands require user confirmation before execution

## Troubleshooting

### Common Issues

1. **OAuth redirect mismatch**: Ensure callback URL matches exactly
2. **Invalid client credentials**: Verify CLIENT_ID and CLIENT_SECRET
3. **No repositories showing**: Check if user granted repository permissions
4. **Token expiration**: JWT tokens expire after 7 days by default

### Debug Steps

1. Check browser network tab for OAuth requests
2. Verify environment variables are loaded correctly
3. Check API Gateway logs for OAuth errors
4. Ensure database is running and accessible

## Production Setup

For production deployment:

1. Update OAuth app callback URL to production domain
2. Use secure JWT secrets (minimum 32 characters)
3. Enable HTTPS for all OAuth endpoints
4. Consider using refresh tokens for longer sessions
5. Implement proper error logging and monitoring

## Testing

To test the OAuth flow:

1. Start the API Gateway: `cd apps/api-gateway && npm run dev`
2. Start the Web Dashboard: `cd apps/web-dashboard && npm run dev`
3. Visit `http://localhost:3001`
4. Click "Sign in with GitHub"
5. Grant permissions
6. Verify user data and repositories are displayed

## Environment Setup Commands

```bash
# Copy environment templates
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/web-dashboard/.env.example apps/web-dashboard/.env.local

# Install dependencies
pnpm install

# Start services
pnpm run dev
```