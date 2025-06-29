# 🚀 Jira MCP Sprint Health - Complete Setup Guide

## Overview
Enhanced Jira Sprint Dashboard MCP Server with advanced analytics, OAuth support, and production-ready features for Sprint Health monitoring.

## ⚡ Quick Setup

### 1. Environment Configuration
Copy `.env.example` to `.env` and configure:

```bash
# Jira Configuration
JIRA_URL=https://your-company.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token

# Server Configuration  
PORT=3000
NODE_ENV=production
```

### 2. Get Your Jira API Token
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Create API token
3. Copy to `.env` file

### 3. Install & Run
```bash
npm install
npm run build
npm start
```

## 🔧 Available Tools

### Core Sprint Analytics
- **test_jira_connection** - Test Jira connectivity
- **list_projects** - List accessible projects
- **get_sprint_burndown** - Sprint burndown analytics
- **get_team_velocity** - Team velocity tracking
- **get_sprint_goal_progress** - Sprint goal monitoring
- **get_blocked_issues** - Blocked issues analysis
- **generate_dashboard** - Complete dashboard generation

## 🏥 Health Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### Available Endpoints
- `GET /health` - Health status
- `GET /.well-known/mcp-configuration` - MCP metadata
- `POST /test_jira_connection` - Test connection
- `POST /generate_dashboard` - Full dashboard

## 🐳 Production Deployment

### Docker (Recommended)
```bash
npm run docker:build
npm run docker:run
```

### Manual
```bash
npm run build
npm start
```

## 📊 Monitoring Stack

### With Docker Compose
- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Redis**: localhost:6379

## 🔒 Security Features

- OAuth 2.0 support
- Secure token management
- Rate limiting
- Input validation

## 📈 Analytics Features

- Sprint burndown analysis
- Team velocity tracking
- Blocked issues monitoring
- Predictive insights
- Executive dashboards

## 🛠️ Troubleshooting

### Common Issues
1. **Connection Failed**: Check JIRA_URL and credentials
2. **No Projects**: Verify API token permissions
3. **Port Conflict**: Change PORT in .env

### Logs
```bash
npm run docker:logs  # Docker logs
tail -f logs/app.log # Application logs
```

## 📚 API Documentation

### MCP Tools
All tools support the MCP protocol and can be called via:
- Claude Desktop integration
- Direct HTTP POST requests
- CLI interface

### Example Usage
```bash
# Test connection
curl -X POST http://localhost:3000/test_jira_connection

# Get dashboard for project
curl -X POST http://localhost:3000/generate_dashboard \
  -H "Content-Type: application/json" \
  -d '{"projectKey": "PROJ"}'
```

## 🔗 Integration

### Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "jira-sprint-health": {
      "command": "node",
      "args": ["C:/path/to/jira-mcp-mvp/dist/src/index.js"],
      "env": {
        "JIRA_URL": "https://your-company.atlassian.net",
        "JIRA_EMAIL": "your-email@company.com", 
        "JIRA_API_TOKEN": "your-token"
      }
    }
  }
}
```

## 🎯 Use Cases

- **Sprint Planning**: Velocity analysis and capacity planning
- **Daily Standups**: Burndown charts and blocked issues
- **Sprint Reviews**: Comprehensive analytics dashboards
- **Management Reports**: Executive insights and trends

## 📄 License
MIT License - See LICENSE file for details

## 🤝 Support
For issues and questions, please check the troubleshooting section or create an issue in the repository.