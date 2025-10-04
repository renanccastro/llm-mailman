# GitHub Push Guide with Personal Access Token

This guide explains how to push your AI Development Assistant Platform code to GitHub using a Personal Access Token (PAT).

## 🔑 Prerequisites

### 1. Create a GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name like "AI Dev Platform Push"
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Optional, if using GitHub Actions)
5. Click "Generate token"
6. **COPY THE TOKEN NOW** - you won't be able to see it again!

### 2. Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `maillm` (or your preferred name)
3. Set as Public or Private
4. **DON'T** initialize with README, .gitignore, or license
5. Click "Create repository"

## 🚀 Method 1: Quick Push Script

### Make the script executable and run it:

```bash
# Make script executable
chmod +x git-push-with-pat.sh

# Run with parameters
./git-push-with-pat.sh YOUR_USERNAME YOUR_REPO_NAME YOUR_PAT_TOKEN

# Or run interactively (will prompt for inputs)
./git-push-with-pat.sh
```

## 🛠️ Method 2: Manual Commands

### Step-by-step manual push:

```bash
# 1. Initialize git (if not already)
git init
git branch -M master

# 2. Configure git
git config user.name "YOUR_USERNAME"
git config user.email "YOUR_USERNAME@users.noreply.github.com"

# 3. Add all files
git add -A

# 4. Commit changes
git commit -m "feat: Complete AI Development Assistant Platform implementation"

# 5. Add remote with PAT authentication
git remote add origin https://YOUR_USERNAME:YOUR_PAT@github.com/YOUR_USERNAME/REPO_NAME.git

# 6. Push to master
git push -u origin master

# 7. Clean up PAT from remote (for security)
git remote set-url origin https://github.com/YOUR_USERNAME/REPO_NAME.git
```

## 📝 Method 3: Using Environment Variable

### More secure approach using environment variable:

```bash
# 1. Export your PAT as environment variable
export GITHUB_PAT="your_pat_token_here"
export GITHUB_USERNAME="your_username"
export GITHUB_REPO="your_repo_name"

# 2. Run the commands
git init
git add -A
git commit -m "Initial commit: AI Development Assistant Platform"

# 3. Push using the environment variables
git remote add origin https://${GITHUB_USERNAME}:${GITHUB_PAT}@github.com/${GITHUB_USERNAME}/${GITHUB_REPO}.git
git push -u origin master

# 4. Clean up
git remote set-url origin https://github.com/${GITHUB_USERNAME}/${GITHUB_REPO}.git
unset GITHUB_PAT  # Remove PAT from environment
```

## 🔒 Method 4: Using Git Credential Manager

### For repeated pushes without exposing PAT:

```bash
# 1. Configure credential helper
git config --global credential.helper store

# 2. Add remote without PAT
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# 3. Push (will prompt for username and password)
git push -u origin master
# Username: YOUR_USERNAME
# Password: YOUR_PAT_TOKEN (use PAT, not your GitHub password)

# Credentials are now stored for future pushes
```

## ⚠️ Important Security Notes

### PAT Security Best Practices:

1. **Never commit your PAT** to the repository
2. **Set expiration** for your PAT (30-90 days recommended)
3. **Use minimum required scopes** (just `repo` for pushing)
4. **Delete PAT** after use if it's temporary
5. **Rotate PATs regularly** for production use

### After Pushing:

1. **Remove PAT from remote URL**:
```bash
git remote set-url origin https://github.com/USERNAME/REPO.git
```

2. **Clear git credentials if stored**:
```bash
git config --global --unset credential.helper
rm ~/.git-credentials  # If it exists
```

3. **Check your commit history** for accidental PAT exposure:
```bash
git log --all --full-history -p | grep -i "ghp_"
```

## 🎯 Specific Commands for This Project

### Complete push sequence for the AI Dev Platform:

```bash
# From the project root (/home/renanccastro/Work/maillm)
cd /home/renanccastro/Work/maillm

# Initialize and configure
git init
git branch -M master
git config user.name "YOUR_GITHUB_USERNAME"
git config user.email "YOUR_GITHUB_USERNAME@users.noreply.github.com"

# Add all files
git add .

# Create comprehensive commit
git commit -m "feat: AI Development Assistant Platform

Features implemented:
- GitHub OAuth authentication with repository permissions
- Push notifications for 2FA command confirmation
- Email webhook for processing development requests
- Container lifecycle with 45-minute idle timeout
- Thread-based container persistence
- Automatic state preservation and restoration
- Claude Code CLI integration via tmux sessions
- Web dashboard with real-time monitoring
- Comprehensive documentation and guides

Architecture:
- Monorepo with pnpm workspaces
- PostgreSQL + Prisma ORM
- Redis for caching and queues
- Docker containerization
- Next.js 14 web dashboard
- Express.js API gateway
- TypeScript throughout

Co-authored-by: Claude <claude@anthropic.com>"

# Push to GitHub
git remote add origin https://YOUR_USERNAME:YOUR_PAT@github.com/YOUR_USERNAME/maillm.git
git push -u origin master

# Clean up PAT
git remote set-url origin https://github.com/YOUR_USERNAME/maillm.git

echo "✅ Successfully pushed to GitHub!"
```

## 🔍 Troubleshooting

### Common Issues:

1. **"Authentication failed"**
   - Verify your PAT is correct
   - Check PAT has `repo` scope
   - Ensure PAT hasn't expired

2. **"Repository not found"**
   - Verify repository name and username
   - Check if repository exists on GitHub
   - Ensure repository is created before pushing

3. **"Permission denied"**
   - PAT might not have correct scopes
   - You might not have write access to the repository

4. **"Refusing to merge unrelated histories"**
   - Use `git push --force` if this is initial push
   - Or `git pull origin master --allow-unrelated-histories` first

### Verify Push Success:

```bash
# Check remote branches
git branch -r

# Check push status
git log origin/master --oneline -5

# Open in browser
open https://github.com/YOUR_USERNAME/REPO_NAME
```

## 📋 Quick Copy-Paste Commands

### For immediate use (replace placeholders):

```bash
# All-in-one command (replace USERNAME, REPO, and PAT)
git init && \
git add -A && \
git commit -m "AI Development Assistant Platform - Complete Implementation" && \
git branch -M master && \
git remote add origin https://USERNAME:PAT@github.com/USERNAME/REPO.git && \
git push -u origin master --force && \
git remote set-url origin https://github.com/USERNAME/REPO.git && \
echo "✅ Pushed successfully!"
```

## 🎉 After Successful Push

1. **Verify on GitHub**: Visit your repository page
2. **Add README**: Consider adding the main README.md to repository root
3. **Set up GitHub Actions**: For CI/CD if needed
4. **Configure Branch Protection**: For master branch
5. **Add Collaborators**: If working with a team
6. **Create Issues**: For tracking future work
7. **Set up GitHub Pages**: For documentation if needed

Your AI Development Assistant Platform is now on GitHub! 🚀