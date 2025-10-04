#!/bin/bash

# GitHub Push Script with PAT Authentication
# This script configures git to use your PAT and pushes to master

echo "🚀 GitHub Push Script"
echo "====================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Get repository information
REPO_URL=$(git config --get remote.origin.url 2>/dev/null)

if [ -z "$REPO_URL" ]; then
    echo -e "${YELLOW}No remote origin found. Let's set it up.${NC}"
    echo ""
    read -p "Enter your GitHub username: " GITHUB_USERNAME
    read -p "Enter your repository name (e.g., maillm): " REPO_NAME

    # Set up the remote
    REPO_URL="https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"
    git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
    echo -e "${GREEN}Remote origin set to: $REPO_URL${NC}"
else
    echo -e "${GREEN}Current remote: $REPO_URL${NC}"

    # Extract username and repo from URL
    if [[ $REPO_URL =~ github\.com[:/]([^/]+)/([^/]+)(\.git)?$ ]]; then
        GITHUB_USERNAME="${BASH_REMATCH[1]}"
        REPO_NAME="${BASH_REMATCH[2]}"
        REPO_NAME="${REPO_NAME%.git}"  # Remove .git suffix if present
    else
        read -p "Enter your GitHub username: " GITHUB_USERNAME
        read -p "Enter your repository name: " REPO_NAME
    fi
fi

# Check for PAT in environment or prompt for it
if [ -z "$GITHUB_PAT" ]; then
    echo ""
    echo -e "${YELLOW}GitHub Personal Access Token required${NC}"
    echo "Note: Your PAT needs 'repo' scope for pushing"
    echo -s -p "Enter your GitHub PAT: " GITHUB_PAT
    echo ""
fi

# Configure git with PAT
echo -e "\n${YELLOW}Configuring git authentication...${NC}"
git config --local credential.helper store
git config --local user.name "${GITHUB_USERNAME}"
git config --local user.email "${GITHUB_USERNAME}@users.noreply.github.com"

# Set the remote URL with PAT
AUTHENTICATED_URL="https://${GITHUB_USERNAME}:${GITHUB_PAT}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"
git remote set-url origin "$AUTHENTICATED_URL"

echo -e "${GREEN}Git configured successfully${NC}"

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "\n${YELLOW}Current branch: ${CURRENT_BRANCH}${NC}"

# Show git status
echo -e "\n${YELLOW}Git Status:${NC}"
git status --short

# Check if there are changes to commit
if [[ -n $(git status --porcelain) ]]; then
    echo -e "\n${YELLOW}Uncommitted changes detected${NC}"
    read -p "Do you want to commit all changes? (y/n): " COMMIT_CHANGES

    if [[ $COMMIT_CHANGES == "y" || $COMMIT_CHANGES == "Y" ]]; then
        echo ""
        read -p "Enter commit message: " COMMIT_MESSAGE

        if [ -z "$COMMIT_MESSAGE" ]; then
            COMMIT_MESSAGE="Update: AI Development Assistant Platform implementation"
        fi

        git add -A
        git commit -m "$COMMIT_MESSAGE

Co-authored-by: Claude <claude@anthropic.com>"
        echo -e "${GREEN}Changes committed${NC}"
    fi
fi

# Push to master
echo -e "\n${YELLOW}Preparing to push to master branch...${NC}"

# Check if master branch exists remotely
if git ls-remote --heads origin master | grep -q master; then
    echo "Remote master branch exists"

    if [[ $CURRENT_BRANCH != "master" && $CURRENT_BRANCH != "main" ]]; then
        echo -e "${YELLOW}You're on branch '${CURRENT_BRANCH}', not master${NC}"
        read -p "Do you want to merge to master and push? (y/n): " MERGE_TO_MASTER

        if [[ $MERGE_TO_MASTER == "y" || $MERGE_TO_MASTER == "Y" ]]; then
            # Checkout master and merge
            git checkout master 2>/dev/null || git checkout -b master
            git merge $CURRENT_BRANCH --no-edit
            echo -e "${GREEN}Merged ${CURRENT_BRANCH} into master${NC}"
        else
            # Push current branch to master
            echo "Pushing ${CURRENT_BRANCH} to remote master..."
            git push origin ${CURRENT_BRANCH}:master --force-with-lease
            echo -e "${GREEN}Pushed ${CURRENT_BRANCH} to master${NC}"

            # Clean up the authenticated URL from config
            git remote set-url origin "$REPO_URL"
            exit 0
        fi
    fi

    # Push master to remote
    echo "Pushing to master branch..."
    git push origin master --force-with-lease

else
    echo "Remote master branch doesn't exist, creating it..."

    if [[ $CURRENT_BRANCH == "main" ]]; then
        # If we're on main, push it as master
        git push origin main:master
    else
        # Create and push master
        git checkout -b master 2>/dev/null || git checkout master
        git push origin master
    fi
fi

# Clean up - remove PAT from remote URL for security
echo -e "\n${YELLOW}Cleaning up credentials...${NC}"
git remote set-url origin "$REPO_URL"

echo -e "\n${GREEN}✅ Successfully pushed to master branch!${NC}"
echo -e "${GREEN}Repository: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}${NC}"

# Show the latest commit
echo -e "\n${YELLOW}Latest commit pushed:${NC}"
git log --oneline -1

echo -e "\n${GREEN}Done! Your code is now on GitHub master branch.${NC}"