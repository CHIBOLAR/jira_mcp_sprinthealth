#!/bin/bash

# 🔍 Docker Health Check for Jira MCP Server
# Supports both HTTP and MCP modes with comprehensive monitoring

# Configuration
TIMEOUT=10
MAX_RETRIES=3
MODE="${MODE:-http}"
PORT="${PORT:-3000}"

# Function to check if the process is running
check_process() {
    case "$MODE" in
        "http"|"server"|"oauth")
            pgrep -f "node.*oauth-server.js" > /dev/null
            return $?
            ;;
        "mcp"|"stdio")
            pgrep -f "node.*dist/index.js" > /dev/null
            return $?
            ;;
        *)
            echo "ERROR: Unknown mode: $MODE"
            return 1
            ;;
    esac
}

# Function to test HTTP server
test_http_server() {
    if [ "$MODE" = "http" ] || [ "$MODE" = "server" ] || [ "$MODE" = "oauth" ]; then
        # Test health endpoint
        response=$(wget --timeout=$TIMEOUT --tries=1 \
            "http://localhost:$PORT/health" \
            -O- 2>/dev/null)
        
        if [ $? -eq 0 ]; then
            echo "OK: HTTP server responding on port $PORT"
            return 0
        else
            echo "ERROR: HTTP server not responding on port $PORT"
            return 1
        fi
    else
        echo "SKIP: HTTP test not applicable for mode $MODE"
        return 0
    fi
}

# Function to test Jira connection (simplified for container)
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
        echo "WARNING: Cannot connect to Jira (may be network/config issue)"
        return 0  # Don't fail health check for Jira connectivity issues
    fi
}

# Function to check memory usage
check_memory() {
    # Get memory usage percentage for our process
    case "$MODE" in
        "http"|"server"|"oauth")
            PID=$(pgrep -f "node.*oauth-server.js" | head -1)
            ;;
        "mcp"|"stdio")
            PID=$(pgrep -f "node.*dist/index.js" | head -1)
            ;;
        *)
            echo "WARNING: Unknown mode for memory check"
            return 1
            ;;
    esac
    
    if [ -n "$PID" ]; then
        # Get memory usage in KB and convert to percentage (rough estimate)
        MEM_KB=$(ps -o pid,rss --no-headers -p $PID 2>/dev/null | awk '{print $2}')
        if [ -n "$MEM_KB" ] && [ "$MEM_KB" -gt 0 ]; then
            # Rough estimate: if using > 400MB (400000 KB), consider it high
            if [ "$MEM_KB" -gt 400000 ]; then
                echo "WARNING: High memory usage: ${MEM_KB}KB"
                return 1
            else
                echo "OK: Memory usage normal: ${MEM_KB}KB"
                return 0
            fi
        else
            echo "WARNING: Cannot determine memory usage"
            return 1
        fi
    else
        echo "WARNING: Process not found for memory check"
        return 1
    fi
}

# Main health check
main() {
    echo "=== Jira MCP Server Health Check ==="
    echo "Timestamp: $(date)"
    echo "Mode: $MODE"
    echo "Port: $PORT"
    
    # Check if process is running
    if ! check_process; then
        echo "CRITICAL: Server process not found"
        exit 1
    fi
    
    echo "OK: Server process is running"
    
    # Test HTTP server if applicable
    test_http_server
    HTTP_STATUS=$?
    
    # Check memory usage
    check_memory
    MEM_STATUS=$?
    
    # Test Jira connection (non-critical)
    test_jira_connection
    JIRA_STATUS=$?
    
    # Determine overall health
    if [ $HTTP_STATUS -eq 0 ]; then
        if [ $MEM_STATUS -eq 0 ]; then
            echo "HEALTHY: All critical checks passed"
            exit 0
        else
            echo "DEGRADED: Server running but high resource usage"
            exit 0  # Still considered healthy but with warnings
        fi
    else
        echo "UNHEALTHY: Server not responding"
        exit 1
    fi
}

# Run health check
main "$@"
