# 🚀 Jira Sprint Health Dashboard - Docker Deployment Guide

## Quick Start for Docker

### Prerequisites
- Docker and Docker Compose installed
- Jira Cloud instance with API access
- API token from Atlassian

### 1. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit with your Jira credentials
JIRA_URL=https://your-company.atlassian.net
JIRA_EMAIL=your.email@company.com
JIRA_API_TOKEN=your_api_token_here
```

### 2. Production Deployment
```bash
# Build and start all services
npm run production:deploy

# Or manually:
docker-compose -f docker-compose.smithery.yml up -d
```

### 3. Access Your Services
- **🎯 Main API**: http://localhost:3000
- **📊 Grafana Dashboard**: http://localhost:3001 (admin/admin)
- **📈 Prometheus**: http://localhost:9090
- **💾 Redis**: localhost:6379

## 🔧 Configuration Options

### Environment Variables
```bash
MODE=http                    # Run as HTTP server (not MCP stdio)
PORT=3000                   # Server port
NODE_ENV=production         # Environment
REDIS_PASSWORD=changeme     # Redis password
GRAFANA_PASSWORD=admin      # Grafana admin password
```

### Service Modes
- **HTTP Mode** (Default for Docker): Web API with OAuth support
- **MCP Mode**: For Claude Desktop integration (stdio)

## 🐳 Docker Commands

```bash
# Production deployment
npm run docker:smithery

# Stop services
npm run docker:smithery:stop

# View logs
docker-compose -f docker-compose.smithery.yml logs -f

# Check health
curl http://localhost:3000/health
```

## 📊 Available Endpoints

### Health & Status
- `GET /health` - Service health check
- `GET /.well-known/mcp-configuration` - MCP metadata

### OAuth & Authentication
- `GET /oauth/authorize` - Start OAuth flow
- `GET /oauth/callback` - OAuth callback
- `GET /v1/sse` - Server-sent events

## 🎯 Sprint Analytics Features

- **📈 Sprint Burndown**: Real-time progress tracking
- **🚀 Team Velocity**: Historical performance analysis
- **🎯 Goal Progress**: Sprint objective tracking
- **🚫 Blocked Issues**: Impediment monitoring
- **🔮 Predictive Analytics**: AI-powered forecasting
- **⚠️ Anomaly Detection**: Pattern recognition
- **📊 Portfolio Analysis**: Cross-project insights

## 🔍 Monitoring & Observability

### Grafana Dashboards
- **Team Performance**: Velocity, completion rates, quality metrics
- **Sprint Health**: Burndown, scope changes, risk indicators
- **System Metrics**: API performance, Redis cache, resource usage

### Prometheus Metrics
- Application performance metrics
- Custom business metrics
- Infrastructure monitoring

## 🚀 Smithery Deployment

This project is ready for Smithery deployment with:
- ✅ Production-ready Docker configuration
- ✅ Health checks and monitoring
- ✅ Secure environment handling
- ✅ Comprehensive logging
- ✅ Resource optimization

### Smithery Upload
Upload to: `https://smithery.ai/new?owner=CHIBOLAR&repo=jira_mcp_sprinthealth`

## 🔒 Security Features

- **🔐 OAuth 2.0**: Secure authentication with Atlassian
- **🛡️ CORS Protection**: Configurable cross-origin policies
- **👤 Non-root User**: Container runs as non-privileged user
- **🔑 Environment Secrets**: Secure credential management
- **📝 Audit Logging**: Comprehensive request tracking

## 🐛 Troubleshooting

### Common Issues

**Container keeps restarting:**
```bash
# Check logs
docker-compose logs jira-mcp-server

# Common causes:
# - Missing environment variables
# - Invalid Jira credentials
# - Port conflicts
```

**Cannot connect to Jira:**
```bash
# Test API token
curl -H "Authorization: Basic $(echo -n 'email:token' | base64)" \
  https://your-company.atlassian.net/rest/api/3/myself
```

**Memory issues:**
```bash
# Increase Docker memory limit
# Or adjust resource limits in docker-compose.yml
```

### Health Check Status
- **HEALTHY**: All systems operational
- **DEGRADED**: High resource usage but functional
- **UNHEALTHY**: Service not responding

## 📈 Performance Optimization

- **Redis Caching**: Enabled by default (300s TTL)
- **Request Throttling**: 10 concurrent requests max
- **Connection Pooling**: Optimized Jira API connections
- **Resource Limits**: Memory and CPU constraints

## 🔄 Updates & Maintenance

```bash
# Update containers
docker-compose pull
docker-compose up -d

# Clear cache
docker exec jira-mcp-redis redis-cli FLUSHALL

# Backup data
docker exec jira-mcp-redis redis-cli BGSAVE
```

## 📞 Support

For issues or questions:
1. Check the health endpoint: `/health`
2. Review container logs
3. Verify Jira API connectivity
4. Check environment configuration

---

**🎯 Ready for production with enterprise-grade monitoring and analytics!**
