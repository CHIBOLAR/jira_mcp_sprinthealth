# Jira MCP SprintHealth Server

🔐 **OAuth Browser Authentication Now Active!**

## 🚀 Quick Start

### For Smithery Deployment
1. Use the repository URL: `https://github.com/CHIBOLAR/jira_mcp_sprinthealth`
2. Configure with your Jira details (no API token needed!)
3. Use OAuth browser authentication for seamless login

### Configuration Required
- **companyUrl**: Your Jira instance URL (e.g., `https://company.atlassian.net`)
- **userEmail**: Your email address  
- **authMethod**: "oauth" (default) or "token"
- **jiraApiToken**: Only needed if using "token" auth method

## 🔐 OAuth Authentication Flow

### **Much Better UX than API Tokens!**

**With OAuth (Active Now):**
1. Configure Jira URL and email only
2. Call `initiate_oauth` → get authentication URL
3. Click URL → authorize in browser (one click!)
4. Call `complete_oauth` with auth code → tokens stored
5. All tools work automatically! ✨

**Old API Token Way:**
1. Configure Jira URL, email, AND manual API token
2. Visit Atlassian settings manually
3. Generate API token manually  
4. Copy/paste token into configuration
5. Use tools

## 🔧 Available Tools

### **OAuth Tools (No Auth Needed):**
1. **help** - Get help information  
2. **initiate_oauth** - Start OAuth flow → returns auth URL
3. **complete_oauth** - Complete OAuth → exchange code for tokens

### **Jira Tools (OAuth/Token Auth Required):**
4. **test_jira_connection** - Test your Jira connection
5. **jira_get_issue** - Get detailed issue information
6. **jira_search** - Search issues with JQL
7. **list_projects** - List accessible projects

## ✅ Fixed Issues

- ✅ **failedToFetchConfigSchema** - Proper schema exports
- ✅ **OAuth browser authentication** - No manual tokens needed!
- ✅ **TypeScript runtime compatibility** - Smithery ready
- ✅ **Lazy loading** - Tools load without upfront auth
- ✅ **Better UX** - Click to authenticate vs manual token generation

## 🌟 OAuth Benefits

✅ **Browser-based** - Click to authenticate  
✅ **No manual setup** - No API token generation needed  
✅ **Secure scopes** - Granular permissions  
✅ **Auto refresh** - Seamless token management  
✅ **Modern standard** - OAuth 2.0 with PKCE  

## 📋 Technical Details

- **Runtime**: TypeScript
- **Entry Point**: `src/server-http-oauth.ts` (OAuth-enabled)
- **Exports**: `createServer`, `configSchema`, OAuth tools
- **Pattern**: Lazy loading + OAuth browser authentication
- **Fallback**: API token auth still available

---

🎉 **OAuth authentication active - Ready for seamless deployment in Smithery!**
