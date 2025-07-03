# 🔍 Live OAuth Testing Guide

This guide will help you test the OAuth flow with comprehensive real-time logging so we can see exactly what happens.

## 📋 Setup (Run These First)

### 1. Setup Live Logging System
```bash
node setup-live-logging.js
```
This clears old logs and prepares fresh monitoring.

### 2. Start Log Monitoring (In Another Terminal)
```bash
node monitor-live-logs.js watch
```
This will show real-time logs as you test. **Keep this running in a separate terminal.**

## 🚀 Testing Steps

### Step 1: Check Initial Status
```bash
node check-live-sessions.js
```
**Expected:** No sessions or tokens should exist.

### Step 2: Test Jira Connection
Run your MCP tools:
- `test_jira_connection`
- `oauth_status`

**Expected:** Tools should work, show OAuth config ready.

### Step 3: Start OAuth Flow
Run: `start_oauth`

**Expected:** 
- Tool returns OAuth URL
- Logs show session creation
- Session checker shows 1 active session

**Check with:**
```bash
node check-live-sessions.js
```

### Step 4: Complete OAuth in Browser
1. **Copy the OAuth URL** from `start_oauth` response
2. **Paste in browser** and complete authentication
3. **Watch the log monitor** for callback activity

**Expected:**
- Browser redirects to callback URL
- Logs show token exchange attempt
- Either success or specific error details

### Step 5: Verify Results

**If successful:**
```bash
node check-live-sessions.js
```
Should show OAuth tokens saved.

**Test API calls:**
- `jira_get_issue PROJ-123`
- `jira_search project = PROJ`
- `list_projects`

## 🔍 Log Monitoring Commands

### Real-time Monitoring
```bash
node monitor-live-logs.js watch
```
Shows live logs as they happen.

### Recent Logs
```bash
node monitor-live-logs.js recent
```
Shows last 50 log entries.

### Session Status
```bash
node check-live-sessions.js
```
Shows current OAuth sessions and tokens.

## 📁 Log File Locations

All logs are stored in `/tmp/` (temporary directory):

- **Live Test Log:** `/tmp/oauth-live-test.log`
- **OAuth Sessions:** `/tmp/jira-oauth-sessions.json`
- **OAuth Tokens:** `/tmp/jira-mcp-tokens.json`

You can also check these directly:
```bash
# View live test log
cat /tmp/oauth-live-test.log

# View current sessions
cat /tmp/jira-oauth-sessions.json

# View saved tokens
cat /tmp/jira-mcp-tokens.json
```

## 🎯 What We're Looking For

### Success Indicators:
- ✅ Session created during `start_oauth`
- ✅ OAuth URL generated successfully
- ✅ Browser callback triggers token exchange
- ✅ Tokens saved to `/tmp/jira-mcp-tokens.json`
- ✅ API calls work with saved tokens

### Failure Indicators:
- ❌ "Invalid or expired OAuth state parameter"
- ❌ "authorization_code is invalid"
- ❌ "Token exchange failed"
- ❌ Sessions not found during callback

### Debug Information:
- Process PIDs (same/different)
- Session storage methods used
- Token exchange request/response details
- API call authentication attempts

## 🔧 Troubleshooting

### If logs aren't showing:
```bash
# Check if log file exists
ls -la /tmp/oauth-live-test.log

# Re-setup logging
node setup-live-logging.js
```

### If sessions disappear:
- Check log for auto-cleanup messages
- Verify TTL not expiring (15 minutes)
- Look for process PID changes

### If token exchange fails:
- Check authorization code in logs
- Verify redirect URI consistency
- Look for client ID/secret issues

## 📞 During Testing

**While you test, I can analyze:**
1. Real-time logs from `monitor-live-logs.js watch`
2. Session states from `check-live-sessions.js`
3. Specific error details from log files

**Share with me:**
- Output from `check-live-sessions.js` after each step
- Any error messages from MCP tools
- Browser behavior during OAuth redirect

This comprehensive logging will show us exactly where the OAuth flow succeeds or fails!