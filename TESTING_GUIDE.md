# 🧪 Jira MCP Server - Testing Guide

## Quick Test Setup

### 1. Environment Configuration
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your actual Jira credentials:
JIRA_URL=https://your-company.atlassian.net
JIRA_EMAIL=your.email@company.com
JIRA_API_TOKEN=your_api_token_here
PORT=3000
NODE_ENV=development
```

### 2. Get Your Jira API Token
1. Visit: https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Label: "Claude MCP Server Test"
4. Copy the generated token to your .env file

### 3. Build and Test
```bash
npm run build
npm run dev
```

## 🎯 Test Commands for Claude Desktop

### Basic Connection Tests
```
Test Jira connection
List my Jira projects
```

### Core Analytics Tests (NEW!)
```
Show me the sprint burndown for project DEMO
What's our team velocity for project DEMO?
How are we tracking against our sprint goal for project DEMO?
What issues are currently blocked in project DEMO?
Generate a complete dashboard for project DEMO
```

## 📊 Expected Results

### ✅ Week 2 Implementation Complete
All 4 core analytics are now fully functional:

1. **Sprint Burndown**: Real progress tracking with completion rates
2. **Team Velocity**: Historical sprint performance analysis
3. **Sprint Goal Progress**: Goal tracking with keyword analysis
4. **Blocked Issues**: Comprehensive blocker detection and aging
5. **Comprehensive Dashboard**: Combined executive summary with health scoring

### 🎨 Ready for Claude Artifacts
Each analytics tool returns structured data that Claude can use to generate:
- Interactive burndown charts
- Velocity trend visualizations
- Goal progress donuts/pie charts
- Blocked issues alerts and tables
- Executive dashboard with health scores

## 🔧 Troubleshooting

### Common Issues

**"No Scrum boards found"**
- Ensure your Jira project uses Scrum methodology
- Check that you have at least one Scrum board configured

**"No active sprint found"** 
- Start an active sprint in your Jira board
- Or specify a specific sprint ID in commands

**"Authentication failed"**
- Verify JIRA_URL format: https://your-company.atlassian.net
- Ensure JIRA_EMAIL matches your Atlassian account exactly
- Generate a fresh API token if issues persist

**"Permission denied"**
- Confirm your Jira account has access to the specified project
- Verify the project key is correct (case-sensitive)

## 🎬 Demo Commands by Project Type

### For Active Development Project
```
Generate comprehensive dashboard for project [YOUR_PROJECT_KEY]
```

### For Historical Analysis
```
What's our team velocity for project [YOUR_PROJECT_KEY]?
Show me blocked issues for project [YOUR_PROJECT_KEY]
```

### For Sprint Planning
```
Show sprint burndown for project [YOUR_PROJECT_KEY]
How are we tracking against our sprint goal for project [YOUR_PROJECT_KEY]?
```

## 📈 Portfolio Demo Script

### 30-Second Version
1. `Test Jira connection` → ✅ Success
2. `List my projects` → Shows real projects  
3. `Generate dashboard for project DEMO` → Full analytics

### 5-Minute Version
1. **Connection** (30s): Test and list projects
2. **Individual Metrics** (2m): Burndown, velocity, goal, blockers
3. **Dashboard** (1.5m): Complete executive view
4. **Technical** (1m): Show code, explain uniqueness

## 🏆 Success Criteria

✅ **All 7 MCP Tools Working**:
- test_jira_connection
- list_projects  
- get_sprint_burndown
- get_team_velocity
- get_sprint_goal_progress
- get_blocked_issues
- generate_dashboard

✅ **Real Data Integration**: Live Jira API connectivity
✅ **Analytics Engine**: Functional business intelligence
✅ **Error Handling**: User-friendly error messages  
✅ **Claude Ready**: Optimized for artifact generation
✅ **Portfolio Quality**: Professional presentation ready

## 🚀 Week 3 Focus

With core implementation complete, Week 3 will focus on:
- Enhanced error handling and UX polish
- Comprehensive documentation
- Demo preparation and testing
- Portfolio presentation materials
- Optional OAuth 2.0 stretch goal

**Status**: 🎉 **AHEAD OF SCHEDULE** - Week 2 goals achieved!
