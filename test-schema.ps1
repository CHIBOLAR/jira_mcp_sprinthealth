$response = (Invoke-WebRequest -Uri 'http://localhost:3000/mcp' -Method POST -ContentType 'application/json' -InFile 'C:\Users\Public\jira-mcp-mvp\test-init.json').Content
$json = $response | ConvertFrom-Json
$json.result.capabilities.server.configSchema | ConvertTo-Json -Depth 5