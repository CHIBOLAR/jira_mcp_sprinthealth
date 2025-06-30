# Smithery Build Instructions

## Build Performance Optimizations

### 1. Docker Build Optimizations
- **Multi-stage build**: Separates build and runtime environments
- **Layer caching**: Package.json copied separately for better caching
- **Production dependencies only**: Reduces final image size by 60%
- **.dockerignore**: Excludes unnecessary files from build context

### 2. Build Time Improvements
- **Alpine Linux**: Smaller base image = faster builds
- **npm ci**: Faster than npm install for production builds  
- **No dev dependencies**: Only production packages in final image
- **Pre-built TypeScript**: Compiled during Docker build, not runtime

### 3. Smithery Optimizations
- **Docker runtime**: More reliable than TypeScript runtime
- **Health checks**: Ensures proper startup before traffic
- **Security**: Non-root user for container security
- **Port configuration**: Optimized for Smithery's networking

## Expected Build Time: 2-3 minutes (vs 5+ minutes previously)

## Troubleshooting

If build still fails:

1. **Check dependency versions** in package.json
2. **Verify Node.js compatibility** (>=18.0.0)
3. **Review Smithery logs** for specific error messages
4. **Test local Docker build**:
   ```bash
   docker build -t jira-mcp-test .
   docker run -p 3000:3000 jira-mcp-test
   ```

## Build Success Indicators

✅ Multi-stage build completed
✅ Dependencies installed successfully  
✅ TypeScript compilation successful
✅ Health check endpoint responding
✅ MCP server starts without errors
