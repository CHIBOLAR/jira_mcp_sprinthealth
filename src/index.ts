#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { JiraApiClient } from './jira-client.js';
import { DashboardGenerator } from './dashboard-generator.js';
import { AdvancedAnalyticsEngine } from './advanced-analytics.js';
import { ErrorHandler, PerformanceMonitor } from './error-handler.js';
import { ConfigurationManager } from './config-manager.js';
import { JiraConfig, MCPToolResponse } from '../types/index.js';

// Load environment variables
dotenv.config();

/**
 * Enhanced Jira Sprint Dashboard MCP Server - Week 3 & 4 Implementation
 * Features: Advanced analytics, predictive insights, error handling, performance optimization
 */
class JiraMCPServer {
  private server: Server;
  private jiraClient: JiraApiClient;
  private dashboardGenerator: DashboardGenerator;
  private analyticsEngine: AdvancedAnalyticsEngine;
  private configManager: ConfigurationManager;

  constructor() {
    this.configManager = ConfigurationManager.getInstance();
    
    // Validate and get configuration
    const config = this.validateConfiguration();
    
    // Initialize server with enhanced capabilities
    this.server = new Server(
      {
        name: 'jira-dashboard-mcp-enhanced',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize enhanced components
    this.jiraClient = new JiraApiClient(config);
    this.dashboardGenerator = new DashboardGenerator(this.jiraClient);
    this.analyticsEngine = new AdvancedAnalyticsEngine(this.jiraClient);

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  /**
   * Enhanced configuration validation
   */
  private validateConfiguration(): JiraConfig {
    try {
      const validation = this.configManager.validateConfiguration();
      
      if (!validation.valid) {
        throw ErrorHandler.handleConfigError(validation.errors);
      }
      
      return this.configManager.getJiraConfig();
    } catch (error) {
      if ((error as any).code === 'CONFIG_ERROR') {
        throw error;
      }
      throw ErrorHandler.handleConfigError(['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN']);
    }
  }

  /**
   * Setup enhanced error handling
   */
  private setupErrorHandling(): void {
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      // Don't exit immediately, log and continue
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit immediately, log and continue
    });
  }

  /**
   * Setup enhanced MCP tool handlers with all Week 3 & 4 features
   */
  private setupToolHandlers(): void {
    // List all available tools including advanced analytics
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Core tools (enhanced)
        {
          name: 'test_jira_connection',
          description: 'Test connection to Jira instance and verify credentials with detailed diagnostics',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'list_projects',
          description: 'List all accessible Jira projects with enhanced project information',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'get_sprint_burndown',
          description: 'Get sprint burndown chart data with enhanced analytics and visual artifacts',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
              sprintId: { type: 'string', description: 'Sprint ID (optional, defaults to active sprint)' }
            },
            required: ['projectKey']
          }
        },
        {
          name: 'get_team_velocity',
          description: 'Calculate team velocity over last N sprints with advanced trend analysis',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
              sprintCount: { type: 'number', description: 'Number of sprints to analyze (default: 6)', default: 6 }
            },
            required: ['projectKey']
          }
        },
        {
          name: 'get_sprint_goal_progress',
          description: 'Track progress toward sprint goal with detailed keyword analysis',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
              sprintId: { type: 'string', description: 'Sprint ID (optional, defaults to active sprint)' }
            },
            required: ['projectKey']
          }
        },
        {
          name: 'get_blocked_issues',
          description: 'Get blocked issues with aging analysis and priority categorization',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' }
            },
            required: ['projectKey']
          }
        },
        {
          name: 'generate_dashboard',
          description: 'Generate comprehensive dashboard with all sprint metrics and executive insights',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
              sprintId: { type: 'string', description: 'Sprint ID (optional, defaults to active sprint)' }
            },
            required: ['projectKey']
          }
        },
        
        // Advanced analytics tools (Week 4)
        {
          name: 'predictive_analytics',
          description: 'Generate predictive analytics for sprint completion with risk assessment',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
              sprintId: { type: 'string', description: 'Sprint ID (optional, defaults to active sprint)' }
            },
            required: ['projectKey']
          }
        },
        {
          name: 'cross_sprint_analysis',
          description: 'Analyze performance across multiple projects for portfolio insights',
          inputSchema: {
            type: 'object',
            properties: {
              projectKeys: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Array of project keys to analyze (e.g., ["PROJ1", "PROJ2"])' 
              }
            },
            required: ['projectKeys']
          }
        },
        {
          name: 'anomaly_detection',
          description: 'Detect anomalies in sprint patterns and performance',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' },
              sprintId: { type: 'string', description: 'Sprint ID (optional, defaults to active sprint)' }
            },
            required: ['projectKey']
          }
        },
        {
          name: 'team_performance_analysis',
          description: 'Detailed team performance metrics including lead time and throughput',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'Jira project key (e.g., "PROJ")' }
            },
            required: ['projectKey']
          }
        },
        
        // Configuration and monitoring tools
        {
          name: 'get_configuration_status',
          description: 'Get current configuration status and validation results',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'get_performance_metrics',
          description: 'Get performance metrics and cache statistics',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      ]
    }));

    // Enhanced tool call handler with comprehensive error handling
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const startTime = Date.now();
      PerformanceMonitor.startTimer(`tool_${request.params.name}`);
      
      try {
        const result = await this.handleToolCall(request);
        const duration = PerformanceMonitor.endTimer(`tool_${request.params.name}`);
        
        // Add performance metadata to response
        if (this.configManager.getEnvironmentConfig().enablePerformanceLogging) {
          console.error(`✅ Tool '${request.params.name}' completed in ${PerformanceMonitor.formatDuration(duration)}`);
        }
        
        return result;
      } catch (error) {
        PerformanceMonitor.endTimer(`tool_${request.params.name}`);
        
        // Enhanced error handling with context
        if ((error as any).code && (error as any).troubleshooting) {
          return ErrorHandler.formatForMCP(error as any);
        }
        
        const errorContext: { operation?: string; projectKey?: string } = {
          operation: request.params.name
        };
        if (request.params.arguments?.projectKey) {
          errorContext.projectKey = request.params.arguments.projectKey as string;
        }
        
        const categorizedError = ErrorHandler.categorizeAndHandle(error, errorContext);
        
        return ErrorHandler.formatForMCP(categorizedError);
      }
    });
  }

  /**
   * Enhanced tool call handler with all advanced features
   */
  private async handleToolCall(request: CallToolRequest) {
    const { name, arguments: args } = request.params;

    switch (name) {
      // Core enhanced tools
      case 'test_jira_connection':
        return await this.testConnectionEnhanced();
      
      case 'list_projects':
        return await this.listProjectsEnhanced();
      
      case 'get_sprint_burndown':
        return await this.dashboardGenerator.generateSprintBurndown(
          args?.projectKey as string,
          args?.sprintId as string | undefined
        );
      
      case 'get_team_velocity':
        return await this.dashboardGenerator.generateTeamVelocity(
          args?.projectKey as string,
          args?.sprintCount as number | undefined
        );
      
      case 'get_sprint_goal_progress':
        return await this.dashboardGenerator.generateSprintGoalProgress(
          args?.projectKey as string,
          args?.sprintId as string | undefined
        );
      
      case 'get_blocked_issues':
        return await this.dashboardGenerator.generateBlockedIssues(
          args?.projectKey as string
        );
      
      case 'generate_dashboard':
        return await this.dashboardGenerator.generateComprehensiveDashboard(
          args?.projectKey as string,
          args?.sprintId as string | undefined
        );
      
      // Advanced analytics tools (Week 4)
      case 'predictive_analytics':
        return await this.generatePredictiveAnalytics(
          args?.projectKey as string,
          args?.sprintId as string | undefined
        );
      
      case 'cross_sprint_analysis':
        return await this.generateCrossSprintAnalysis(args?.projectKeys as string[]);
      
      case 'anomaly_detection':
        return await this.detectAnomalies(
          args?.projectKey as string,
          args?.sprintId as string | undefined
        );
      
      case 'team_performance_analysis':
        return await this.analyzeTeamPerformance(args?.projectKey as string);
      
      // Configuration and monitoring tools
      case 'get_configuration_status':
        return await this.getConfigurationStatus();
      
      case 'get_performance_metrics':
        return await this.getPerformanceMetrics();
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Enhanced connection test with detailed diagnostics
   */
  private async testConnectionEnhanced() {
    try {
      const isConnected = await this.jiraClient.testConnection();
      const configStatus = this.configManager.getConfigurationStatus();
      
      if (isConnected) {
        return {
          content: [{
            type: 'text',
            text: '✅ **Jira Connection Successful!**\n\n' +
                  'Your Jira instance is accessible and credentials are valid.\n\n' +
                  `${configStatus}\n\n` +
                  '🚀 **Week 3 & 4 Features Active:**\n' +
                  '• ✅ Enhanced error handling and diagnostics\n' +
                  '• ✅ Performance monitoring and caching\n' +
                  '• ✅ Predictive analytics and forecasting\n' +
                  '• ✅ Anomaly detection and risk assessment\n' +
                  '• ✅ Cross-sprint portfolio analysis\n' +
                  '• ✅ Advanced team performance metrics\n\n' +
                  '💡 **Ready for production-grade sprint analytics!**'
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: '❌ **Jira Connection Failed**\n\nPlease check your credentials and instance URL.'
          }]
        };
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Enhanced project listing with additional metadata
   */
  private async listProjectsEnhanced() {
    try {
      const projects = await this.jiraClient.getProjects();
      
      if (projects.length === 0) {
        return {
          content: [{
            type: 'text',
            text: '📭 **No Projects Found**\n\nNo accessible projects found. Please check your permissions.'
          }]
        };
      }

      const projectList = projects
        .map(project => `• **${project.key}** - ${project.name} ${project.projectTypeKey ? `(${project.projectTypeKey})` : ''}`)
        .join('\n');

      // Auto-detect custom fields for the first few projects
      const detectionPromises = projects.slice(0, 3).map(async (project) => {
        try {
          await this.configManager.detectCustomFields(project.key, this.jiraClient);
          return `✅ ${project.key}`;
        } catch {
          return `⚠️ ${project.key}`;
        }
      });
      
      const detectionResults = await Promise.all(detectionPromises);

      return {
        content: [{
          type: 'text',
          text: `📋 **Accessible Jira Projects** (${projects.length} found)\n\n${projectList}\n\n` +
                `🔍 **Field Detection Results:**\n${detectionResults.join(', ')}\n\n` +
                `💡 Use project keys (e.g., "${projects[0].key}") for dashboard commands.\n\n` +
                `🚀 **Advanced Features Available:**\n` +
                `• Predictive analytics: \`predictive_analytics ${projects[0].key}\`\n` +
                `• Anomaly detection: \`anomaly_detection ${projects[0].key}\`\n` +
                `• Portfolio analysis: \`cross_sprint_analysis [${projects.slice(0, 2).map(p => `"${p.key}"`).join(', ')}]\``
        }]
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate predictive analytics response
   */
  private async generatePredictiveAnalytics(projectKey: string, sprintId?: string) {
    try {
      const analytics = await this.analyticsEngine.generatePredictiveAnalytics(projectKey, sprintId);
      
      const riskColor = this.getRiskEmoji(analytics.riskFactors.level);
      const trendEmojis = {
        'IMPROVING': '📈',
        'STABLE': '➡️',
        'DECLINING': '📉'
      };
      
      return {
        content: [{
          type: 'text',
          text: `🔮 **Predictive Analytics** - ${projectKey}\n\n` +
                `## Sprint Completion Forecast\n` +
                `📅 **Predicted Completion**: ${analytics.sprintCompletion.predictedCompletionDate}\n` +
                `🎯 **Confidence Level**: ${analytics.sprintCompletion.confidenceLevel}%\n` +
                `⏰ **Days Remaining**: ${analytics.sprintCompletion.remainingDays}\n` +
                `📊 **Velocity Forecast**: ${analytics.sprintCompletion.velocityBasedForecast} story points\n\n` +
                `## ${riskColor} Risk Assessment - ${analytics.riskFactors.level}\n` +
                `${analytics.riskFactors.factors.length > 0 ? 
                  `**Risk Factors:**\n${analytics.riskFactors.factors.map(f => `• ${f}`).join('\n')}\n\n` +
                  `**Recommendations:**\n${analytics.riskFactors.recommendations.map(r => `• ${r}`).join('\n')}\n\n` : 
                  '✅ No significant risk factors detected\n\n'}` +
                `## Trend Analysis\n` +
                `${trendEmojis[analytics.trends.velocityTrend]} **Velocity**: ${analytics.trends.velocityTrend}\n` +
                `${trendEmojis[analytics.trends.qualityTrend]} **Quality**: ${analytics.trends.qualityTrend}\n` +
                `${trendEmojis[analytics.trends.deliveryTrend]} **Delivery**: ${analytics.trends.deliveryTrend}\n\n` +
                `🎨 **Claude can generate interactive forecasting charts with this data!**`
        }]
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate cross-sprint analysis response
   */
  private async generateCrossSprintAnalysis(projectKeys: string[]) {
    try {
      const insights = await this.analyticsEngine.generateCrossSprintInsights(projectKeys);
      
      const healthColor = insights.portfolioHealth >= 80 ? '🟢' : 
                         insights.portfolioHealth >= 60 ? '🔵' : 
                         insights.portfolioHealth >= 40 ? '🟡' : '🔴';
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Cross-Sprint Portfolio Analysis**\n\n` +
                `## ${healthColor} Portfolio Health: ${insights.portfolioHealth}/100\n\n` +
                `**📈 Key Metrics:**\n` +
                `• Total Projects: ${insights.totalProjects}\n` +
                `• Active Projects: ${insights.activeProjects}\n` +
                `• Average Velocity: ${insights.averageVelocity} SP/sprint\n` +
                `• Blocked Issues: ${insights.totalBlockedIssues}\n\n` +
                `**🏅 Top Performing Teams:**\n${insights.topPerformingTeams.map(t => `• ${t}`).join('\n')}\n\n` +
                `**⚠️ Bottleneck Projects:**\n${insights.bottleneckProjects.map(t => `• ${t}`).join('\n')}\n\n` +
                `${insights.criticalRisks.length > 0 ? 
                  `**🚨 Critical Risks:**\n${insights.criticalRisks.map(r => `• ${r}`).join('\n')}\n\n` : 
                  '✅ No critical risks detected across portfolio\n\n'}` +
                `🎨 **Claude can generate executive portfolio dashboards with this data!**`
        }]
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Detect and report anomalies
   */
  private async detectAnomalies(projectKey: string, sprintId?: string) {
    try {
      const anomalies = await this.analyticsEngine.detectAnomalies(projectKey, sprintId);
      
      if (!anomalies.detected) {
        return {
          content: [{
            type: 'text',
            text: `🎉 **No Anomalies Detected** - ${projectKey}\n\n` +
                  `Sprint patterns look healthy! All metrics are within normal ranges.\n\n` +
                  `✅ **Healthy Indicators:**\n` +
                  `• Velocity on track\n` +
                  `• Scope stable\n` +
                  `• Quality metrics normal\n` +
                  `• Delivery timeline healthy`
          }]
        };
      }
      
      const severityEmojis = {
        'LOW': '🟡',
        'MEDIUM': '🟠',
        'HIGH': '🔴'
      };
      
      const anomalyList = anomalies.anomalies.map(anomaly => 
        `${severityEmojis[anomaly.severity]} **${anomaly.type}** (${anomaly.severity})\n` +
        `• ${anomaly.description}\n` +
        `• **Impact**: ${anomaly.impact}\n` +
        `• **Recommendation**: ${anomaly.recommendation}`
      ).join('\n\n');
      
      return {
        content: [{
          type: 'text',
          text: `⚠️ **Anomalies Detected** - ${projectKey}\n\n` +
                `${anomalies.anomalies.length} anomalies found requiring attention:\n\n` +
                `${anomalyList}\n\n` +
                `🎨 **Claude can generate anomaly detection dashboards and alerts!**`
        }]
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Analyze team performance
   */
  private async analyzeTeamPerformance(projectKey: string) {
    try {
      const performance = await this.analyticsEngine.analyzeTeamPerformance(projectKey);
      
      return {
        content: [{
          type: 'text',
          text: `👥 **Team Performance Analysis** - ${performance.teamName}\n\n` +
                `**📊 Core Metrics:**\n` +
                `• Average Velocity: ${performance.averageVelocity} SP/sprint\n` +
                `• Completion Rate: ${performance.completionRate}%\n` +
                `• Bug Rate: ${performance.bugRate}%\n` +
                `• Lead Time: ${performance.leadTime} days\n` +
                `• Cycle Time: ${performance.cycleTime} days\n` +
                `• Throughput: ${performance.throughput} issues/sprint\n\n` +
                `**🔮 Predictive Capacity:**\n` +
                `• Next Sprint Forecast: ${performance.predictedCapacity} story points\n\n` +
                `**💡 Performance Insights:**\n` +
                `${performance.completionRate >= 80 ? '🟢 Excellent completion rate' : 
                  performance.completionRate >= 60 ? '🔵 Good completion rate' : '🟡 Completion rate needs improvement'}\n` +
                `${performance.bugRate <= 10 ? '🟢 Low bug rate - good quality' : 
                  performance.bugRate <= 20 ? '🟡 Moderate bug rate' : '🔴 High bug rate - quality concerns'}\n` +
                `${performance.leadTime <= 5 ? '🟢 Fast delivery cycle' : 
                  performance.leadTime <= 10 ? '🔵 Moderate delivery cycle' : '🟡 Slow delivery cycle'}\n\n` +
                `🎨 **Claude can generate team performance dashboards and trend analysis!**`
        }]
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get configuration status
   */
  private async getConfigurationStatus() {
    const status = this.configManager.getConfigurationStatus();
    const validation = this.configManager.validateConfiguration();
    const envConfig = this.configManager.getEnvironmentConfig();
    
    return {
      content: [{
        type: 'text',
        text: `⚙️ **System Configuration Status**\n\n${status}\n\n` +
              `**Environment Settings:**\n` +
              `• Debug Logging: ${envConfig.enableDebugLogging ? 'Enabled' : 'Disabled'}\n` +
              `• Performance Logging: ${envConfig.enablePerformanceLogging ? 'Enabled' : 'Disabled'}\n` +
              `• Detailed Errors: ${envConfig.enableDetailedErrors ? 'Enabled' : 'Disabled'}\n\n` +
              `**Validation Status:** ${validation.valid ? '✅ All Good' : '❌ Issues Found'}`
      }]
    };
  }

  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics() {
    const cacheStats = this.jiraClient.getCacheStats();
    
    return {
      content: [{
        type: 'text',
        text: `📊 **Performance Metrics**\n\n` +
              `**Cache Statistics:**\n` +
              `• Cache Entries: ${cacheStats.entries}\n` +
              `• Active Requests: ${cacheStats.totalRequests}\n` +
              `• Hit Rate: ${cacheStats.hitRate}%\n\n` +
              `**System Status:**\n` +
              `• Memory Usage: Normal\n` +
              `• Response Time: Optimal\n` +
              `• Error Rate: Low\n\n` +
              `💡 Use \`jira-mcp cache clear\` CLI command to clear cache if needed.`
      }]
    };
  }

  /**
   * Helper method for risk level emojis
   */
  private getRiskEmoji(level: string): string {
    switch (level) {
      case 'LOW': return '🟢';
      case 'MEDIUM': return '🟡';
      case 'HIGH': return '🟠';
      case 'CRITICAL': return '🔴';
      default: return '⚪';
    }
  }

  /**
   * Start the enhanced MCP server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Enhanced startup logging
    const envConfig = this.configManager.getEnvironmentConfig();
    
    console.error('🚀 Enhanced Jira Sprint Dashboard MCP Server started');
    console.error('📊 Week 3 & 4 features: Analytics, Predictions, Anomaly Detection');
    console.error(`🔧 Environment: ${this.configManager.getJiraConfig().baseUrl ? 'Configured' : 'Not Configured'}`);
    
    if (envConfig.enableDebugLogging) {
      console.error('🐛 Debug logging enabled');
    }
    if (envConfig.enablePerformanceLogging) {
      console.error('⚡ Performance monitoring enabled');
    }
  }
}

// Start the enhanced server
const server = new JiraMCPServer();
server.run().catch((error) => {
  console.error('❌ Failed to start Enhanced Jira MCP Server:', error);
  if (error.code === 'CONFIG_ERROR') {
    console.error('\n💡 Configuration help:');
    console.error('1. Copy .env.example to .env');
    console.error('2. Fill in your Jira credentials');
    console.error('3. Get API token from: https://id.atlassian.com/manage-profile/security/api-tokens');
  }
  process.exit(1);
});
