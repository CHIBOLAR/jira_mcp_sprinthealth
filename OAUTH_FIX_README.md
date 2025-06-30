# OAuth Error Fix - Session Persistence Issue

## Problem
Users were encountering the error: "Token exchange failed: Invalid or expired OAuth state parameter. Please restart the authentication flow."

## Root Cause
The OAuth state was being stored in memory (Map) in the JiraOAuthManager class, but multiple instances of the OAuth manager were being created:
1. One instance in the MCP server for generating auth URLs
2. Another instance in the HTTP server for handling OAuth callbacks

When the OAuth flow was initiated, the state was stored in the first instance, but when the callback was processed, it was handled by the second instance which didn't have access to the stored state.

## Fix
Replaced in-memory session storage with persistent file-based storage:

### Changes Made:
1. **File-based Session Storage**: OAuth sessions are now stored in `${tmpdir()}/jira-oauth-sessions.json`
2. **Persistent State Management**: State persists across multiple OAuth manager instances
3. **Enhanced Error Logging**: Added comprehensive debugging information
4. **Session Cleanup**: Automatic cleanup of expired sessions
5. **Debug Utilities**: Added methods to clear sessions and inspect state

### New Features:
- `clearAllSessions()` method for debugging
- Enhanced logging with session file location
- Session persistence across server restarts
- Better error messages with debugging information

## Usage

### Start the Fixed OAuth Server:
```bash
npm run restart-oauth
```

### Clear sessions and restart (for debugging):
```bash
npm run restart-oauth-clean
```

### Test OAuth Persistence:
```bash
node test-oauth.js
```

## Files Modified:
- `src/auth/oauth-manager.ts` - Main fix with persistent storage
- `restart-oauth-server.js` - New restart script with session management
- `test-oauth.js` - Test script for OAuth persistence
- `package.json` - Added new scripts

## Verification
The fix ensures that OAuth state is maintained consistently across all OAuth manager instances, resolving the "Invalid or expired OAuth state parameter" error.

## Next Steps
1. Try the OAuth flow again using the `start_oauth` tool
2. If you still encounter issues, use `npm run restart-oauth-clean` to clear any stale sessions
3. Check the console logs for detailed debugging information

The OAuth flow should now work reliably! 🎉
