# 🚀 Jira MCP Server with OAuth - Smithery Compatible

**Browser OAuth Authentication for Seamless Jira Integration in Claude Desktop**

## 🎯 What This Solves

Users can install your MCP server from Smithery marketplace and authenticate with Jira through **browser OAuth** - no manual API token management needed!

## 🔥 User Experience Flow

```
Smithery Install → Config UI → Browser OAuth → Auto-Configured Claude
```

### For End Users:
1. **Install** from Smithery marketplace
2. **Configure** Jira URL + email in Smithery UI  
3. **Run** `start_oauth` tool in Claude Desktop
4. **Login** via browser with Atlassian account
5. **Done!** Jira tools ready to use

## 🛠️ Technical Architecture

### OAuth Flow
```
Claude Desktop → MCP Server → Browser OAuth → Atlassian → Tokens → Storage → API Calls
```

### Key Components:
- **HTTP MCP Server** - Smithery-compatible transport
- **OAuth Handler** - Browser authentication flow
- **Token Storage** - Secure credential management
- **Jira Integration** - API calls with OAuth tokens

## 📋 Available Tools

| Tool | Description | Usage |
|------|-------------|-------|
| `oauth_status` | Check authentication status | First time setup |
| `start_oauth` | Launch browser authentication | Initial login |
| `test_jira_connection` | Verify OAuth tokens work | After authentication |
| `jira_get_issue` | Get issue details | Daily usage |
| `jira_search` | Search with JQL | Daily usage |
| `list_projects` | List accessible projects | Daily usage |
| `help` | Usage guide | Reference |

## 🚀 Development & Testing

### Start OAuth Server
```bash
cd jira-mcp-mvp
npm run dev-oauth
```

### Test OAuth Flow
```bash
npm run test-oauth
```

### Build for Production
```bash
npm run build
```

## 📦 Smithery Deployment

### 1. Configuration Schema
Users configure via Smithery UI:
- **Company Jira URL** (required)
- **User Email** (required) 
- **Auth Method** (OAuth only)

### 2. OAuth Endpoints
- `GET /oauth/callback` - Handles OAuth returns
- `GET /config-schema` - Smithery configuration
- `POST /mcp` - MCP protocol with config schema

### 3. Environment Variables
Smithery automatically injects:
```bash
SMITHERY_HOSTNAME=https://your-server.smithery.ai
OAUTH_CLIENT_ID=your_client_id
OAUTH_CLIENT_SECRET=your_client_secret
OAUTH_AUTHORIZATION_URL=https://auth.atlassian.com/authorize
OAUTH_TOKEN_URL=https://auth.atlassian.com/oauth/token
```

## 🔐 OAuth Security

### Token Storage
- **Development**: In-memory Map (testing only)
- **Production**: Redis/Database (implement as needed)
- **Session Management**: UUID-based session tracking

### Scopes Required
```
read:jira-user read:jira-work write:jira-work
```

### Callback Handling
```typescript
GET /oauth/callback?code=XXX&state=session-id
→ Exchange code for tokens
→ Store tokens with session ID
→ Display success page
```

## 🧪 Testing Checklist

### Local Development
- [ ] HTTP server starts on port 3000
- [ ] `/health` endpoint responds
- [ ] `/config-schema` returns valid schema
- [ ] `/tools` lists OAuth tools
- [ ] MCP initialization works
- [ ] OAuth callback endpoint responds

### OAuth Flow Testing
- [ ] `oauth_status` tool available
- [ ] `start_oauth` generates auth URL
- [ ] Browser OAuth flow works
- [ ] Tokens stored correctly
- [ ] API calls use stored tokens

### Smithery Compatibility
- [ ] `smithery.yaml` valid
- [ ] Config schema exposed correctly
- [ ] Environment variables used
- [ ] HTTP transport working
- [ ] No "failedToFetchConfigSchema" errors

## 🚀 Production Deployment

### 1. Smithery Marketplace
```yaml
# smithery.yaml configured for OAuth
name: jira-mcp-remote-oauth
version: 5.0.0
transport: http
oauth:
  provider: atlassian
  scopes: ["read:jira-user", "read:jira-work", "write:jira-work"]
```

### 2. OAuth App Registration
Register with Atlassian:
- **App Name**: Your MCP Server Name
- **Callback URL**: `${SMITHERY_HOSTNAME}/oauth/callback`
- **Scopes**: Jira read/write permissions

### 3. User Instructions
Include in marketplace listing:
```markdown
## Quick Setup:
1. Install from Smithery
2. Enter your Jira URL
3. Run `start_oauth` in Claude
4. Login in browser
5. Start using Jira tools!
```

## 🔧 Troubleshooting

### "failedToFetchConfigSchema"
- ✅ Check `/config-schema` endpoint
- ✅ Verify MCP initialization response
- ✅ Ensure HTTP transport is working

### OAuth Not Working
- ✅ Check `OAUTH_CLIENT_ID` environment variable
- ✅ Verify callback URL configuration
- ✅ Test `/oauth/callback` endpoint

### Tools Not Available
- ✅ Run `npm run test-oauth`
- ✅ Check `/tools` endpoint response
- ✅ Verify MCP tools registration

## 🎯 Success Metrics

- ✅ **Zero API token management** for users
- ✅ **One-click authentication** via browser
- ✅ **Auto-configured Claude Desktop**
- ✅ **Smithery marketplace ready**
- ✅ **Production OAuth flow**

## 📞 Support

For issues with:
- **OAuth Flow**: Check browser console and server logs
- **Smithery Deployment**: Verify smithery.yaml configuration  
- **Token Storage**: Implement proper database in production
- **API Integration**: Test with OAuth tokens manually

---

**🚀 Ready for Smithery marketplace deployment with seamless OAuth experience!**