# Jira MCP SprintHealth Server

✅ **FIXED: failedToFetchConfigSchema error**

This MCP server is now fully compatible with Smithery TypeScript runtime.

## 🚀 Quick Start

### For Smithery Deployment
1. Use the repository URL: `https://github.com/CHIBOLAR/jira_mcp_sprinthealth`
2. The server will automatically start with lazy loading
3. Configure in Smithery with your Jira details

### Configuration Required
- **companyUrl**: Your Jira instance URL (e.g., `https://company.atlassian.net`)
- **userEmail**: Your email address  
- **jiraApiToken**: API token from [Atlassian](https://id.atlassian.com/manage-profile/security/api-tokens)

## 🔧 Available Tools

1. **help** - Get help information (works without config)
2. **test_jira_connection** - Test your Jira connection
3. **jira_get_issue** - Get detailed issue information
4. **jira_search** - Search issues with JQL
5. **list_projects** - List accessible projects

## ✅ Fixed Issues

- ✅ **failedToFetchConfigSchema** - Now exports `configSchema` properly
- ✅ **TypeScript runtime compatibility** - Uses proper exports for Smithery
- ✅ **Lazy loading** - All tools work without upfront configuration
- ✅ **Build errors** - Fixed all TypeScript compilation issues

## 📋 Technical Details

- **Runtime**: TypeScript
- **Entry Point**: `src/index.ts`
- **Exports**: `createServer`, `configSchema`, `JiraMCPServer`
- **Pattern**: Lazy loading with proper error handling

---

🎉 **Ready for deployment in Smithery!**
