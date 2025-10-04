#!/bin/bash

# AI Dev Assistant Platform - Comprehensive Test Script
# This script tests all major components and generates proof of functionality

set -e

RESULTS_DIR="/tmp/aidev-test-results"
mkdir -p "$RESULTS_DIR"

echo "======================================="
echo "AI Dev Assistant Platform - System Test"
echo "======================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function for tests
run_test() {
    local test_name="$1"
    local test_command="$2"

    echo -e "${YELLOW}Testing:${NC} $test_name"

    if eval "$test_command" > "$RESULTS_DIR/${test_name}.log" 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}: $test_name"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

echo "1. Testing Infrastructure Services"
echo "-----------------------------------"

# Test PostgreSQL
run_test "postgresql_connection" "newgrp docker << 'EOF'
docker exec aidev-postgres pg_isready -U aidev
EOF"

# Test Redis
run_test "redis_connection" "newgrp docker << 'EOF'
docker exec aidev-redis redis-cli -a redis_secret_2025 ping | grep -q PONG
EOF"

echo ""
echo "2. Testing API Gateway"
echo "----------------------"

# Test health endpoint
run_test "api_health_endpoint" "curl -f -s http://localhost:4000/health | grep -q healthy"

# Test API is responding
run_test "api_responds" "curl -f -s -o /dev/null -w '%{http_code}' http://localhost:4000/health | grep -q 200"

echo ""
echo "3. Testing Database Schema"
echo "-------------------------"

# Test database tables exist
run_test "database_tables" "newgrp docker << 'EOF'
docker exec aidev-postgres psql -U aidev -d aidev_platform -c \"\\\dt\" | grep -E \"User|Request|Container\"
EOF"

# Count tables
run_test "database_schema_complete" "newgrp docker << 'EOF'
TABLE_COUNT=\$(docker exec aidev-postgres psql -U aidev -d aidev_platform -t -c \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'\")
[ \$TABLE_COUNT -gt 5 ]
EOF"

echo ""
echo "4. Testing Services Status"
echo "--------------------------"

# Save services status
curl -s http://localhost:4000/health > "$RESULTS_DIR/services_status.json"

# Test AI service availability
run_test "ai_service_status" "curl -s http://localhost:4000/health | grep -q 'claudeCode'"

# Test container service
run_test "container_service_available" "curl -s http://localhost:4000/health | python3 -c \"import sys,json; data=json.load(sys.stdin); sys.exit(0 if data['services']['container']['available'] else 1)\""

# Test communication service
run_test "communication_service_available" "curl -s http://localhost:4000/health | python3 -c \"import sys,json; data=json.load(sys.stdin); sys.exit(0 if data['services']['communication']['email']['available'] else 1)\""

echo ""
echo "5. Testing Docker Integration"
echo "-----------------------------"

# Test Docker is accessible
run_test "docker_accessible" "newgrp docker << 'EOF'
docker ps > /dev/null 2>&1
EOF"

# Test Docker containers are running
run_test "docker_containers_running" "newgrp docker << 'EOF'
[ \$(docker ps --filter name=aidev --format '{{.Names}}' | wc -l) -ge 2 ]
EOF"

echo ""
echo "6. Testing Build Artifacts"
echo "-------------------------"

# Test all packages built
run_test "packages_built" "[ -d apps/api-gateway/dist ] && [ -d packages/database/dist ] && [ -d packages/ai-service/dist ]"

# Test node_modules exists
run_test "dependencies_installed" "[ -d node_modules ] && [ -d apps/api-gateway/node_modules ]"

echo ""
echo "7. Collecting System Information"
echo "--------------------------------"

# Collect system info
{
    echo "=== System Information ==="
    echo "Node version: $(node --version)"
    echo "npm version: $(npm --version)"
    echo "pnpm version: $(pnpm --version)"
    echo ""
    echo "=== Docker Containers ==="
    newgrp docker << 'EOF'
docker ps --filter name=aidev --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
EOF
    echo ""
    echo "=== API Gateway Status ==="
    ps aux | grep "node apps/api-gateway" | grep -v grep || echo "Not running as expected"
    echo ""
    echo "=== Database Tables ==="
    newgrp docker << 'EOF'
docker exec aidev-postgres psql -U aidev -d aidev_platform -c "\dt"
EOF
} > "$RESULTS_DIR/system_info.txt" 2>&1

echo ""
echo "======================================="
echo "Test Results Summary"
echo "======================================="
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
echo ""
echo "Detailed results saved to: $RESULTS_DIR"
echo ""

# Create summary report
{
    echo "# AI Dev Assistant Platform - Test Report"
    echo "Generated: $(date)"
    echo ""
    echo "## Summary"
    echo "- Tests Passed: $TESTS_PASSED"
    echo "- Tests Failed: $TESTS_FAILED"
    echo "- Success Rate: $(( TESTS_PASSED * 100 / (TESTS_PASSED + TESTS_FAILED) ))%"
    echo ""
    echo "## Services Status"
    echo "\`\`\`json"
    cat "$RESULTS_DIR/services_status.json" | python3 -m json.tool
    echo "\`\`\`"
    echo ""
    echo "## System Information"
    echo "\`\`\`"
    cat "$RESULTS_DIR/system_info.txt"
    echo "\`\`\`"
    echo ""
    echo "## Test Logs"
    for log in "$RESULTS_DIR"/*.log; do
        if [ -f "$log" ]; then
            echo "### $(basename "$log" .log)"
            echo "\`\`\`"
            cat "$log"
            echo "\`\`\`"
            echo ""
        fi
    done
} > "$RESULTS_DIR/TEST_REPORT.md"

echo "Full report: $RESULTS_DIR/TEST_REPORT.md"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! System is functioning correctly.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some tests failed. Check the logs for details.${NC}"
    exit 1
fi
