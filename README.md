# 🚀 Jira MCP Server with OAuth Authentication

A production-ready Model Context Protocol (MCP) server for Jira with **browser-based OAuth 2.1 authentication** designed for individual users. No admin-level API tokens required!

## ✨ Features

- 🔐 **Browser-based OAuth 2.1 authentication** (PKCE security)
- 👤 **Individual user authentication** (no admin tokens required)
- 🔄 **Automatic token refresh** (seamless experience)
- 🌐 **Real Jira API integration** (actual data, not mock responses)
- 🏢 **Enterprise-ready** (supports SSO, scoped access, audit trails)
- 📱 **Cross-platform** (Cloud, Server/Data Center support)

## 🎯 Quick Start

### 1. Configuration

Configure your MCP client with these settings:

```json
{
  "mcpServers": {
    "jira-oauth": {
      "url": "https://your-server-url.com/mcp",
      "config": {
        "companyUrl": "https://your-company.atlassian.net",
        "userEmail": "your.email@company.com",
        "authMethod": "oauth"
      }
    }
  }
}
```

### 2. Authentication Flow

1. **Start OAuth:** Run `initiate_oauth` tool
2. **Browser Auth:** Click OAuth URL and authenticate
3. **Complete:** Run `complete_oauth` with authorization code
4. **Ready!** All tools now work with real Jira data

## 🛠️ Available Tools

| Tool | Description | Authentication Required |
|------|-------------|----------------------|
| `initiate_oauth` | Start OAuth authentication flow | ❌ |
| `complete_oauth` | Complete OAuth with auth code | ❌ |
| `test_jira_connection` | Test authenticated connection | ✅ |
| `jira_get_issue` | Get detailed issue information | ✅ |
| `jira_search` | Search issues with JQL | ✅ |
| `list_projects` | List accessible projects | ✅ |
| `help` | Usage guide and tool information | ❌ |

## 🔧 Deployment Options

### Option 1: Default OAuth Client (Recommended)

Use the built-in OAuth client for immediate deployment:

```bash
# Set only the server URL
export SERVER_URL=https://your-domain.com

# Deploy immediately - no OAuth app setup required!
npm run build && npm start
```

✅ **Pros:** Works immediately, no setup required  
⚠️ **Cons:** Shared OAuth client (still secure)

### Option 2: Custom OAuth App

Create your own OAuth application for branded experience:

1. **Create OAuth App:**
   - Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
   - Create new app → OAuth 2.0 integration
   - **Redirect URI:** `https://your-domain.com/oauth/callback`

2. **Configure Environment:**
   ```bash
   export SERVER_URL=https://your-domain.com
   export JIRA_OAUTH_CLIENT_ID=your_client_id
   export JIRA_OAUTH_CLIENT_SECRET=your_client_secret
   ```

3. **Deploy:**
   ```bash
   npm run build && npm start
   ```

✅ **Pros:** Branded experience, full control  
⚠️ **Cons:** Requires OAuth app setup
## 🏗️ Development Setup

### Prerequisites

- Node.js 20+
- npm or yarn
- Git

### Local Development

1. **Clone and Install:**
   ```bash
   git clone <your-repo-url>
   cd jira-mcp-mvp
   npm install
   ```

2. **Environment Setup:**
   ```bash
   cp .env.template .env
   # Edit .env with your settings
   ```

3. **Build and Run:**
   ```bash
   # Development mode with hot reload
   npm run dev
   
   # Production build and run
   npm run build
   npm start
   ```

4. **Test Endpoints:**
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/config-schema
   ```

### Testing OAuth Flow

1. Navigate to `http://localhost:3000`
2. Configure MCP client to point to local server
3. Test authentication flow with `initiate_oauth`
4. Complete flow in browser and verify with `test_jira_connection`

## 🚀 Production Deployment

### Smithery Deployment

1. **Update Configuration:**
   ```bash
   # Update smithery.yaml with your settings
   vim smithery.yaml
   ```

2. **Deploy:**
   ```bash
   npm run build
   smithery deploy
   ```

3. **Verify:**
   ```bash
   curl https://your-smithery-domain.com/health
   ```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVER_URL` | ✅ | Your deployed server URL for OAuth redirects |
| `PORT` | ❌ | Server port (default: 3000) |
| `JIRA_OAUTH_CLIENT_ID` | ❌ | Custom OAuth client ID (optional) |
| `JIRA_OAUTH_CLIENT_SECRET` | ❌ | OAuth client secret (confidential clients only) |
| `JIRA_API_TOKEN` | ❌ | Fallback API token (not recommended) |

## 🔐 Security Features

- **OAuth 2.1 with PKCE:** Industry-standard security protocol
- **Individual User Auth:** Each user authenticates with their own account
- **Scoped Access:** Users only see data they have permission for
- **Session Isolation:** Each user session is completely separate
- **Token Refresh:** Automatic token renewal without re-authentication
- **Audit Trail:** All API calls are logged and traceable

## 🎯 User Experience

### First-Time Setup
1. User configures Jira URL and email in MCP client
2. User runs `initiate_oauth` → gets authentication link
3. User clicks link → familiar OAuth login screen
4. User completes authentication → gets authorization code
5. User runs `complete_oauth` → ✅ authenticated!

### Ongoing Usage
- All tools work with real Jira data
- Tokens refresh automatically in background
- Re-authentication only needed if session expires (rare)
- Same experience across all MCP-compatible clients

## 📊 Monitoring & Health Checks

### Health Endpoint
```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "service": "jira-mcp-oauth", 
  "version": "4.0.0",
  "features": ["oauth", "browser-auth", "real-api"]
}
```

### OAuth Statistics
```bash
GET /oauth/stats  # (if implemented)
```

### Logs
- OAuth flow events
- API call statistics
- Error tracking
- Performance metrics
## 🔧 Troubleshooting

### OAuth Issues

**"Invalid client" error:**
- ✅ Check `JIRA_OAUTH_CLIENT_ID` is correct
- ✅ Verify redirect URI matches exactly in OAuth app
- ✅ Ensure OAuth app is enabled in Atlassian Console

**"Invalid redirect URI" error:**
- ✅ Update redirect URI in OAuth app: `${SERVER_URL}/oauth/callback`
- ✅ Ensure `SERVER_URL` environment variable is correct
- ✅ Check for typos in URL (http vs https, trailing slashes)

**Token refresh failures:**
- ✅ Verify `offline_access` scope is included
- ✅ Check refresh token is being stored properly
- ✅ Re-authenticate if refresh token expired

### API Issues

**Permission denied:**
- ✅ User needs appropriate Jira permissions
- ✅ Check OAuth scopes include necessary permissions
- ✅ Verify user can access Jira in browser

**Connection timeouts:**
- ✅ Verify company URL is correct
- ✅ Check network connectivity to Jira instance
- ✅ Test Jira API directly: `curl ${COMPANY_URL}/rest/api/3/myself`

### Debug Mode

Enable verbose logging:
```bash
export DEBUG=jira-mcp:*
npm start
```

## 📋 API Reference

### OAuth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/oauth/callback` | GET | OAuth redirect handler |
| `/config-schema` | GET | Configuration schema for MCP clients |
| `/health` | GET | Health check and server status |

### MCP Protocol

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | ALL | MCP protocol endpoint |

## 🎨 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Client    │◄──►│  OAuth Server   │◄──►│   Jira API      │
│  (Claude, etc.) │    │  (This Server)  │    │  (Cloud/Server) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ User Interface  │    │ Session Mgmt    │    │ Real Jira Data  │
│ (Browser Auth)  │    │ (Token Refresh) │    │ (Projects/Issues)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📚 Examples

### Complete Authentication Flow

```bash
# 1. Start OAuth
User: "Run initiate_oauth tool"
Server: "Click this link: https://auth.atlassian.com/authorize?..."

# 2. Browser Authentication  
User clicks link → Atlassian login → Authorization granted → Redirect

# 3. Complete OAuth
User: "Run complete_oauth with code: ABC123 and state: XYZ789"
Server: "✅ Authentication successful! You can now use all tools."

# 4. Use Real API
User: "List my projects"
Server: "📋 Found 5 projects: PROJECT-A, PROJECT-B, ..."
```

### JQL Search Example

```bash
User: "Search for bugs in PROJECT-A assigned to me"
→ jira_search with JQL: "project = PROJECT-A AND type = Bug AND assignee = currentUser()"
→ Real API call to Jira
→ Returns actual bug issues with details
```

## 🔄 Migration from Demo Version

| Aspect | Before (Demo) | After (OAuth) |
|--------|---------------|---------------|
| **Authentication** | Config validation only | OAuth 2.1 browser flow |
| **API Calls** | Mock/demo responses | Real Jira API integration |
| **User Management** | Single configuration | Individual user sessions |
| **Security** | Basic validation | OAuth + PKCE + token refresh |
| **Scalability** | Limited | Production-ready |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙋 Support

- 📖 **Documentation:** Check this README and inline code comments
- 🐛 **Issues:** Open a GitHub issue with details and logs
- 💬 **Discussions:** Use GitHub Discussions for questions
- 📧 **Security:** Email security issues privately

## 🎯 Roadmap

- [ ] Support for additional Atlassian products (Confluence, Bitbucket)
- [ ] Advanced JQL query builder
- [ ] Webhook support for real-time updates
- [ ] Enhanced error reporting and recovery
- [ ] Multi-language support
- [ ] Performance optimizations

---

**🚀 Ready to get started?** Follow the [Quick Start](#-quick-start) guide above!