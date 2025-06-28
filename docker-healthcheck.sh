#!/bin/sh

# Docker health check script for Jira MCP Server
# Checks if the server is responding and can connect to Jira

# Configuration
TIMEOUT=10
MAX_RETRIES=3

# Function to check if the server process is running
check_process() {
    pgrep -f "node.*dist/index.js" > /dev/null
    return $?
}

# Function to test Jira connection
test_jira_connection() {
    if [ -z "$JIRA_URL" ] || [ -z "$JIRA_EMAIL" ] || [ -z "$JIRA_API_TOKEN" ]; then
        echo "ERROR: Missing required environment variables"
        return 1
    fi
    
    # Create basic auth header
    AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)
    
    # Test connection to Jira
    response=$(wget --timeout=$TIMEOUT --tries=1 \
        --header="Authorization: Basic $AUTH" \
        --header="Accept: application/json" \
        "$JIRA_URL/rest/api/3/myself" \
        -O- 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "OK: Jira connection successful"
        return 0
    else
        echo "ERROR: Cannot connect to Jira"
        return 1
    fi
}

# Function to check memory usage
check_memory() {
    # Get memory usage percentage
    MEM_USAGE=$(ps -o pid,ppid,cmd,%mem --sort=-%mem -p $(pgrep -f "node.*dist/index.js") | tail -n +2 | awk '{print $4}' | head -1)
    
    if [ -n "$MEM_USAGE" ]; then
        # Check if memory usage is too high (>80%)
        if [ $(echo "$MEM_USAGE > 80" | bc 2>/dev/null || echo "0") -eq 1 ]; then
            echo "WARNING: High memory usage: ${MEM_USAGE}%"
            return 1
        else
            echo "OK: Memory usage: ${MEM_USAGE}%"
            return 0
        fi
    else
        echo "WARNING: Cannot determine memory usage"
        return 1
    fi
}

# Main health check
main() {
    echo "=== Jira MCP Server Health Check ==="
    echo "Timestamp: $(date)"
    
    # Check if process is running
    if ! check_process; then
        echo "CRITICAL: MCP Server process not found"
        exit 1
    fi
    
    echo "OK: MCP Server process is running"
    
    # Check memory usage
    check_memory
    MEM_STATUS=$?
    
    # Test Jira connection
    test_jira_connection
    JIRA_STATUS=$?
    
    # Determine overall health
    if [ $JIRA_STATUS -eq 0 ]; then
        if [ $MEM_STATUS -eq 0 ]; then
            echo "HEALTHY: All checks passed"
            exit 0
        else
            echo "DEGRADED: Jira connection OK but high resource usage"
            exit 0  # Still considered healthy but with warnings
        fi
    else
        echo "UNHEALTHY: Cannot connect to Jira"
        exit 1
    fi
}

# Run health check
main
