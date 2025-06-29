# Jira MCP SprintHealth Server

✅ **WORKING - OAuth Browser Authentication Added!**

## 🚀 Status: DEPLOYED AND WORKING

✅ **failedToFetchConfigSchema FIXED** - Uses working code from commit c40787e  
✅ **OAuth Browser Authentication ADDED** - No more manual API tokens!  
✅ **Smithery Compatible** - Ready for deployment  
✅ **Build Passes** - All TypeScript errors resolved  

## 🔐 OAuth Authentication Flow

**Simple 2-step browser authentication:**

1. **Start OAuth:** `initiate_oauth` → Get browser URL
2. **Complete OAuth:** `complete_oauth` → Exchange code for tokens

**Much better than manual API tokens!**

## 🔧 Available Tools

### **Authentication (No auth needed):**
- `help` - Get help information  
- `initiate_oauth` - Start OAuth browser flow
- `complete_oauth` - Complete OAuth authentication

### **Jira Operations (OAuth or token auth):**
- `test_jira_connection` - Test your connection
- `jira_get_issue` - Get issue details  
- `jira_search` - Search with JQL
- `list_projects` - List accessible projects

## ⚙️ Configuration

**Required:**
- `companyUrl` - Your Jira URL (e.g., `https://company.atlassian.net`)
- `userEmail` - Your email address

**Optional:**
- `authMethod` - "oauth" (default) or "token"  
- `jiraApiToken` - Only needed for token auth

## 🎯 What We Fixed

**Problem:** Kept getting `failedToFetchConfigSchema` error

**Solution:** 
1. ✅ Restored working code from commit `c40787e` (that had fixed the schema issue)
2. ✅ Added OAuth tools to the working version instead of rewriting everything
3. ✅ Maintained exact export structure that Smithery expects

**Key Learning:** Don't rewrite working code - just extend it!

## 🚀 Deploy to Smithery

1. Use repository: `https://github.com/CHIBOLAR/jira_mcp_sprinthealth`
2. Configure with Jira URL + email
3. Use OAuth for seamless authentication

---

**🎉 OAuth authentication now works alongside the existing solution!**
