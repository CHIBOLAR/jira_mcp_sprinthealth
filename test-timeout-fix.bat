@echo off
echo 🧪 Testing Simplified Server for Timeout Fix...
echo.

echo 🔍 Testing: Health Check
curl -s -w "Status: %%{http_code}, Time: %%{time_total}s\n" http://localhost:3000/health
echo.

echo 🔍 Testing: Root Endpoint  
curl -s -w "Status: %%{http_code}, Time: %%{time_total}s\n" http://localhost:3000/
echo.

echo 🔍 Testing: Config Schema
curl -s -w "Status: %%{http_code}, Time: %%{time_total}s\n" http://localhost:3000/config-schema
echo.

echo 🔍 Testing: Tools Discovery (CRITICAL)
curl -s -w "Status: %%{http_code}, Time: %%{time_total}s\n" http://localhost:3000/tools
echo.

echo 🔍 Testing: MCP Initialization (CRITICAL)
curl -s -w "Status: %%{http_code}, Time: %%{time_total}s\n" -X POST -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}" http://localhost:3000/mcp
echo.

echo ✅ All tests completed!
echo 📊 All responses should be under 1 second with HTTP 200 status
echo 🎯 If times are low, the timeout issue is FIXED!
