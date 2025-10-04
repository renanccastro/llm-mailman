#!/bin/bash

# Simple GitHub Push Script with PAT
# Usage: ./git-push-with-pat.sh [username] [repo-name] [pat]

echo "🚀 Simple GitHub Push with PAT"
echo "=============================="

# Get parameters
if [ "$#" -eq 3 ]; then
    GITHUB_USERNAME=$1
    REPO_NAME=$2
    GITHUB_PAT=$3
else
    read -p "Enter your GitHub username: " GITHUB_USERNAME
    read -p "Enter your repository name: " REPO_NAME
    echo -n "Enter your GitHub PAT: "
    read -s GITHUB_PAT
    echo ""
fi

# Initialize git if needed
if [ ! -d .git ]; then
    echo "Initializing git repository..."
    git init
    git branch -M master
fi

# Configure git
git config user.name "${GITHUB_USERNAME}"
git config user.email "${GITHUB_USERNAME}@users.noreply.github.com"

# Add all files and commit
echo ""
echo "Adding all files..."
git add -A

# Check if there are changes to commit
if [[ -n $(git status --porcelain) ]]; then
    echo "Committing changes..."
    git commit -m "feat: Complete AI Development Assistant Platform

- GitHub OAuth authentication with repository permissions
- Push notifications for 2FA-style command confirmation
- Email webhook system for command processing
- Container lifecycle management with 45-minute idle timeout
- Thread-based container persistence
- Automatic state preservation and restoration
- Web dashboard with real-time monitoring
- Comprehensive documentation and setup guides

Co-authored-by: Claude <claude@anthropic.com>"
else
    echo "No changes to commit, proceeding with push..."
fi

# Set remote with authentication
echo ""
echo "Setting up remote..."
git remote remove origin 2>/dev/null
git remote add origin "https://${GITHUB_USERNAME}:${GITHUB_PAT}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

# Push to master
echo ""
echo "Pushing to master branch..."
git push -u origin master --force

# Clean up PAT from remote URL
git remote set-url origin "https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

echo ""
echo "✅ Successfully pushed to GitHub!"
echo "Repository: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}"
echo ""
echo "Your code is now on the master branch!"