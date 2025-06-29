# 🚀 Jira MCP Server

A **super easy** Model Context Protocol (MCP) server for Jira that **solves the "how do I get API tokens" problem**!

## ✨ What makes this different?

🎯 **Built-in OAuth Helper**: No more hunting for API tokens or asking IT admins  
🔄 **Lazy Authentication**: Starts immediately, authenticates only when needed  
🌐 **Auto Browser Opening**: Opens the right pages for you  
🛠️ **Auto-Detection**: Finds your Jira URL automatically  
💡 **Step-by-Step Guidance**: Clear instructions for non-technical users  

## 🚀 Quick Start (2 minutes)

### Option 1: NPX (Easiest)
```bash
npx jira-mcp-server
```

### Option 2: Clone & Build
```bash
git clone [your-repo]
cd jira-mcp-mvp
npm install
npm run build
npm start
```

### Option 3: Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/path/to/jira-mcp-mvp/dist/index.js"]
    }
  }
}
```

## 🎯 Super Easy Setup

1. **Start the server** (any method above)
2. **Use the OAuth helper**:
   ```
   Ask Claude: "Help me set up Jira using jira_oauth_helper"
   ```
3. **Follow the guided setup** - it will:
   - Open your browser to get API tokens
   - Help you find your Jira URL
   - Guide you through environment variables
   - Test everything for you

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `help` | Get help information |
| `jira_oauth_helper` | 🌟 **Start here!** Get your API token easily |
| `test_jira_connection` | Test your Jira connection |
| `jira_get_issue` | Get issue details |
| `jira_search` | Search with JQL |
| `list_projects` | List your projects |

## 🔧 Manual Setup (if you prefer)

Set these environment variables:
```bash
export JIRA_URL="https://your-company.atlassian.net"
export JIRA_EMAIL="your@email.com"  
export JIRA_API_TOKEN="your_api_token"
```

## 💡 Examples

```bash
# Get help
"Use the help tool"

# Easy setup
"Use jira_oauth_helper to help me set up Jira"

# Test connection  
"Test my Jira connection"

# Get an issue
"Get details for issue PROJ-123"

# Search issues
"Search for issues assigned to me that are open"

# List projects
"Show me all my Jira projects"
```

## 🆘 Troubleshooting

**🔧 Setup Issues?**
- Use `jira_oauth_helper action="test_setup"` to check your config
- Use `jira_oauth_helper action="guide"` for step-by-step instructions

**🌐 Browser won't open?**
- The helper will give you the URL to copy manually
- Make sure you have a default browser set

**❌ Connection failed?**
- Double-check your JIRA_URL (should end with .atlassian.net)
- Verify your email is correct
- Make sure your API token is valid

## 🔒 Security

- API tokens are safer than passwords
- Tokens can be revoked anytime at https://id.atlassian.com/manage-profile/security/api-tokens
- All data stays local - nothing sent to third parties
- Lazy loading means authentication only happens when needed

## 🏗️ Architecture

This server follows successful MCP patterns:
- **Environment variable configuration** (not complex OAuth flows)
- **Lazy authentication loading** (starts fast, authenticates when needed)
- **Built-in help and documentation tools**
- **Proper error handling with helpful messages**

Based on patterns from successful servers like:
- [Google Cloud MCP](https://github.com/krzko/google-cloud-mcp)
- [WaPulse WhatsApp MCP](https://github.com/Quegenx/wapulse-whatsapp-mcp)
- [Plugged.in MCP Proxy](https://github.com/VeriTeknik/pluggedin-mcp-proxy)

## 📄 License

MIT License