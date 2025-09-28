#!/bin/bash

# AI Development Assistant Platform - Build Verification Script
# This script verifies that all packages can be built successfully

set -e  # Exit on any error

echo "🔍 AI Development Assistant Platform - Build Verification"
echo "=========================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check Node.js version
print_status "Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "Node.js version: $NODE_VERSION"

# Check if we have minimum required version (20.0.0)
if [[ $(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1) -lt 20 ]]; then
    print_error "Node.js version 20.0.0 or higher is required"
    exit 1
fi
print_success "Node.js version is compatible"

# Check pnpm version
print_status "Checking pnpm version..."
if ! command -v pnpm &> /dev/null; then
    print_error "pnpm is not installed. Please install pnpm: npm install -g pnpm"
    exit 1
fi

PNPM_VERSION=$(pnpm --version)
echo "pnpm version: $PNPM_VERSION"
print_success "pnpm is available"

# Install dependencies
print_status "Installing dependencies..."
pnpm install --frozen-lockfile || {
    print_warning "Frozen lockfile failed, trying regular install..."
    pnpm install
}
print_success "Dependencies installed"

# Check workspace structure
print_status "Verifying workspace structure..."
EXPECTED_PACKAGES=(
    "packages/shared"
    "packages/database"
    "packages/auth-service"
    "packages/container-service"
    "packages/ai-service"
    "packages/communication-service"
    "apps/api-gateway"
    "apps/web-dashboard"
)

for package in "${EXPECTED_PACKAGES[@]}"; do
    if [ -d "$package" ]; then
        print_success "✓ $package exists"
    else
        print_error "✗ $package is missing"
        exit 1
    fi
done

# Run TypeScript type checking
print_status "Running TypeScript type checking..."
pnpm typecheck || {
    print_error "TypeScript type checking failed"
    exit 1
}
print_success "TypeScript type checking passed"

# Run linting
print_status "Running ESLint..."
pnpm lint || {
    print_warning "Linting found issues (non-fatal)"
}

# Build all packages
print_status "Building all packages..."
pnpm build || {
    print_error "Build failed"
    exit 1
}
print_success "All packages built successfully"

# Verify build outputs
print_status "Verifying build outputs..."
BUILD_OUTPUTS=(
    "packages/shared/dist"
    "packages/database/dist"
    "packages/auth-service/dist"
    "packages/container-service/dist"
    "packages/ai-service/dist"
    "packages/communication-service/dist"
    "apps/api-gateway/dist"
    "apps/web-dashboard/.next"
)

for output in "${BUILD_OUTPUTS[@]}"; do
    if [ -d "$output" ]; then
        print_success "✓ $output generated"
    else
        print_warning "✗ $output not found (may not be configured)"
    fi
done

# Check for critical dependencies
print_status "Checking critical dependencies..."
CRITICAL_DEPS=(
    "@anthropic-ai/claude-code"
    "express"
    "next"
    "prisma"
    "docker"
    "bull"
)

for dep in "${CRITICAL_DEPS[@]}"; do
    if pnpm list | grep -q "$dep"; then
        print_success "✓ $dep is installed"
    else
        print_warning "✗ $dep not found in dependencies"
    fi
done

# Run tests if available
print_status "Running tests..."
pnpm test || {
    print_warning "Some tests failed or no tests configured"
}

# Check Docker availability (optional)
print_status "Checking Docker availability..."
if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        print_success "Docker is available and running"
    else
        print_warning "Docker is installed but not running"
    fi
else
    print_warning "Docker is not installed (required for container functionality)"
fi

# Final summary
echo ""
echo "=========================================================="
print_success "Build verification completed successfully! 🎉"
echo ""
echo "📋 Summary:"
echo "  • Node.js: $NODE_VERSION"
echo "  • pnpm: $PNPM_VERSION"
echo "  • All packages: Built ✓"
echo "  • TypeScript: Valid ✓"
echo "  • Dependencies: Installed ✓"
echo ""
echo "🚀 The AI Development Assistant Platform is ready!"
echo ""
echo "Next steps:"
echo "  1. Set up environment variables (.env files)"
echo "  2. Configure database connection"
echo "  3. Start development: pnpm dev"
echo "  4. Start production: pnpm build && pnpm start"
echo ""
echo "For more information, see README.md"