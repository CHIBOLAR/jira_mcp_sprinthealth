# Jira MCP Server with OAuth Authentication

🚀 **Smithery-Compatible MCP Server** for seamless Jira integration with browser OAuth authentication.

## ✨ Key Features

- 🔐 **Browser OAuth Flow** - No manual API token management
- 🏪 **Smithery Marketplace Ready** - One-click installation
- ⚡ **Auto-Configuration** - Claude Desktop configured automatically
- 🛠️ **Complete Tool Suite** - Issue management, search, projects
- 🔒 **Secure** - OAuth tokens handled safely
- 📱 **User-Friendly** - Config UI in Smithery

## 🎯 User Experience

```
Install from Smithery → Config UI → Browser Login → Done!
(30 seconds total setup time)
```

### Installation Flow:
1. **Install** from Smithery marketplace
2. **Configure** Jira URL and email in Smithery UI
3. **Open Claude Desktop** (auto-configured)
4. **Run** `start_oauth` tool
5. **Login** via browser
6. **Ready!** All Jira tools available

## 🛠️ Available Tools

- `oauth_status` - Check authentication status
- `start_oauth` - Launch browser authentication
- `test_jira_connection` - Verify connection
- `jira_get_issue` - Get issue details
- `jira_search` - Search with JQL
- `list_projects` - List accessible projects
- `help` - Complete usage guide

## 🚀 Deployment

### For Smithery Marketplace:
1. Upload this repository to Smithery
2. Configure OAuth app with Atlassian
3. Set environment variables in Smithery
4. Publish to marketplace

### OAuth App Setup:
- **Authorization callback URL**: `${SMITHERY_HOSTNAME}/oauth/callback`
- **Scopes**: `read:jira-user`, `read:jira-work`, `write:jira-work`

## 💻 Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start development server
npm run dev-oauth

# Test OAuth flow
npm run test-oauth
```

## 📋 Environment Variables

Required for Smithery deployment:

```
OAUTH_CLIENT_ID=your_atlassian_oauth_client_id
OAUTH_CLIENT_SECRET=your_atlassian_oauth_client_secret
THIS_HOSTNAME=https://your-smithery-hostname
PORT=3000
```

## 🔧 Technical Details

- **Runtime**: Node.js 18+
- **Transport**: HTTP (Smithery-compatible)
- **Authentication**: Atlassian OAuth 2.0
- **Framework**: Express.js with MCP SDK
- **Token Storage**: In-memory (production: Redis recommended)

## 📜 License

MIT License - see LICENSE file for details

---

**Built for seamless Jira integration with Claude Desktop via Smithery marketplace.**
