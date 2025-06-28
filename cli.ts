#!/usr/bin/env node

/**
 * Jira MCP CLI Tool - Week 4 Production Feature
 * Command-line interface for managing and testing the Jira MCP Server
 */

import { program } from 'commander';
import { JiraApiClient } from './src/jira-client.js';
import { DashboardGenerator } from './src/dashboard-generator.js';
import { AdvancedAnalyticsEngine } from './src/advanced-analytics.js';
import { ConfigurationManager } from './src/config-manager.js';
import { PerformanceMonitor } from './src/error-handler.js';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import figlet from 'figlet';
import boxen from 'boxen';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * CLI Application Class
 */
class JiraMCPCLI {
  private jiraClient?: JiraApiClient;
  private dashboardGenerator?: DashboardGenerator;
  private analyticsEngine?: AdvancedAnalyticsEngine;
  private configManager: ConfigurationManager;

  constructor() {
    this.configManager = ConfigurationManager.getInstance();
  }

  /**
   * Initialize Jira client
   */
  private async initializeClient(): Promise<void> {
    if (this.jiraClient) return;

    try {
      const config = this.configManager.getJiraConfig();
      this.jiraClient = new JiraApiClient(config);
      this.dashboardGenerator = new DashboardGenerator(this.jiraClient);
      this.analyticsEngine = new AdvancedAnalyticsEngine(this.jiraClient);
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize Jira client:'));
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  }

  /**
   * Display welcome banner
   */
  private showBanner(): void {
    console.log(chalk.cyan(figlet.textSync('Jira MCP CLI', { horizontalLayout: 'fitted' })));
    console.log(chalk.gray('Sprint Analytics & Dashboard Management Tool\n'));
  }

  /**
   * Test Jira connection
   */
  async testConnection(): Promise<void> {
    const spinner = ora('Testing Jira connection...').start();
    
    try {
      await this.initializeClient();
      const isConnected = await this.jiraClient!.testConnection();
      
      if (isConnected) {
        spinner.succeed(chalk.green('✅ Jira connection successful!'));
        
        // Show configuration status
        const status = this.configManager.getConfigurationStatus();
        console.log(boxen(status, { 
          padding: 1, 
          borderColor: 'green',
          title: 'Configuration Status'
        }));
      } else {
        spinner.fail(chalk.red('❌ Jira connection failed'));
      }
    } catch (error) {
      spinner.fail(chalk.red('❌ Connection error'));
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * List accessible projects
   */
  async listProjects(): Promise<void> {
    const spinner = ora('Fetching Jira projects...').start();
    
    try {
      await this.initializeClient();
      const projects = await this.jiraClient!.getProjects();
      
      spinner.succeed(chalk.green(`✅ Found ${projects.length} accessible projects`));
      
      if (projects.length === 0) {
        console.log(chalk.yellow('No accessible projects found.'));
        return;
      }

      const table = new Table({
        head: [chalk.cyan('Key'), chalk.cyan('Name'), chalk.cyan('Type'), chalk.cyan('Lead')],
        colWidths: [10, 40, 15, 25]
      });

      projects.forEach(project => {
        table.push([
          chalk.white(project.key),
          chalk.white(project.name),
          chalk.gray(project.projectTypeKey || 'N/A'),
          chalk.gray(project.lead?.displayName || 'N/A')
        ]);
      });

      console.log(table.toString());
    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to fetch projects'));
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Generate sprint dashboard
   */
  async generateDashboard(projectKey: string, sprintId?: string): Promise<void> {
    const spinner = ora(`Generating dashboard for project ${projectKey}...`).start();
    
    try {
      await this.initializeClient();
      
      PerformanceMonitor.startTimer('cli_dashboard');
      const dashboard = await this.dashboardGenerator!.generateComprehensiveDashboard(projectKey, sprintId);
      const duration = PerformanceMonitor.endTimer('cli_dashboard');
      
      spinner.succeed(chalk.green(`✅ Dashboard generated in ${PerformanceMonitor.formatDuration(duration)}`));
      
      // Format and display dashboard
      const content = dashboard.content[0].text;
      console.log(boxen(content, {
        padding: 1,
        borderColor: 'blue',
        title: `📊 ${projectKey} Sprint Dashboard`
      }));
      
    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to generate dashboard'));
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Run predictive analytics
   */
  async runPredictiveAnalytics(projectKey: string, sprintId?: string): Promise<void> {
    const spinner = ora(`Running predictive analytics for ${projectKey}...`).start();
    
    try {
      await this.initializeClient();
      const analytics = await this.analyticsEngine!.generatePredictiveAnalytics(projectKey, sprintId);
      
      spinner.succeed(chalk.green('✅ Predictive analytics completed'));
      
      // Format results
      const completion = analytics.sprintCompletion;
      const risk = analytics.riskFactors;
      
      console.log(boxen(
        `🔮 ${chalk.bold('Sprint Completion Forecast')}\n\n` +
        `📅 Predicted Completion: ${chalk.cyan(completion.predictedCompletionDate)}\n` +
        `🎯 Confidence Level: ${chalk.cyan(completion.confidenceLevel + '%')}\n` +
        `⏰ Remaining Days: ${chalk.cyan(completion.remainingDays)}\n` +
        `📊 Velocity Forecast: ${chalk.cyan(completion.velocityBasedForecast)} SP\n\n` +
        `⚠️ ${chalk.bold('Risk Assessment')}\n` +
        `📊 Risk Level: ${this.getRiskColor(risk.level)}${risk.level}${chalk.reset}\n` +
        `🔍 Risk Factors:\n${risk.factors.map(f => `  • ${f}`).join('\n')}\n` +
        `💡 Recommendations:\n${risk.recommendations.map(r => `  • ${r}`).join('\n')}`,
        {
          padding: 1,
          borderColor: 'magenta',
          title: '🔮 Predictive Analytics'
        }
      ));
      
    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to run predictive analytics'));
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Detect anomalies
   */
  async detectAnomalies(projectKey: string, sprintId?: string): Promise<void> {
    const spinner = ora(`Detecting anomalies in ${projectKey}...`).start();
    
    try {
      await this.initializeClient();
      const anomalies = await this.analyticsEngine!.detectAnomalies(projectKey, sprintId);
      
      if (!anomalies.detected) {
        spinner.succeed(chalk.green('✅ No anomalies detected - sprint is healthy!'));
        return;
      }
      
      spinner.warn(chalk.yellow(`⚠️ ${anomalies.anomalies.length} anomalies detected`));
      
      const table = new Table({
        head: [chalk.cyan('Type'), chalk.cyan('Severity'), chalk.cyan('Description'), chalk.cyan('Recommendation')],
        colWidths: [15, 10, 40, 35]
      });

      anomalies.anomalies.forEach(anomaly => {
        table.push([
          chalk.white(anomaly.type),
          this.getSeverityColor(anomaly.severity) + anomaly.severity + chalk.reset,
          chalk.gray(anomaly.description),
          chalk.gray(anomaly.recommendation)
        ]);
      });

      console.log(table.toString());
      
    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to detect anomalies'));
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Portfolio analysis
   */
  async portfolioAnalysis(projectKeys: string[]): Promise<void> {
    const spinner = ora(`Analyzing portfolio (${projectKeys.length} projects)...`).start();
    
    try {
      await this.initializeClient();
      const insights = await this.analyticsEngine!.generateCrossSprintInsights(projectKeys);
      
      spinner.succeed(chalk.green('✅ Portfolio analysis completed'));
      
      console.log(boxen(
        `📊 ${chalk.bold('Portfolio Overview')}\n\n` +
        `🏆 Portfolio Health: ${chalk.cyan(insights.portfolioHealth + '/100')}\n` +
        `📋 Total Projects: ${chalk.cyan(insights.totalProjects)}\n` +
        `🟢 Active Projects: ${chalk.cyan(insights.activeProjects)}\n` +
        `⚡ Average Velocity: ${chalk.cyan(insights.averageVelocity)} SP\n` +
        `🚫 Blocked Issues: ${chalk.cyan(insights.totalBlockedIssues)}\n\n` +
        `🏅 ${chalk.bold('Top Performers')}\n${insights.topPerformingTeams.map(t => `  • ${t}`).join('\n')}\n\n` +
        `⚠️ ${chalk.bold('Bottlenecks')}\n${insights.bottleneckProjects.map(t => `  • ${t}`).join('\n')}\n\n` +
        `🚨 ${chalk.bold('Critical Risks')}\n${insights.criticalRisks.map(r => `  • ${r}`).join('\n')}`,
        {
          padding: 1,
          borderColor: 'cyan',
          title: '📊 Portfolio Analysis'
        }
      ));
      
    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to analyze portfolio'));
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Show cache statistics
   */
  async showCacheStats(): Promise<void> {
    try {
      await this.initializeClient();
      const stats = this.jiraClient!.getCacheStats();
      
      const table = new Table({
        head: [chalk.cyan('Metric'), chalk.cyan('Value')],
      });

      table.push(
        ['Cache Entries', chalk.white(stats.entries)],
        ['Active Requests', chalk.white(stats.totalRequests)],
        ['Hit Rate', chalk.white(stats.hitRate + '%')]
      );

      console.log('\n📊 Cache Statistics:');
      console.log(table.toString());
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to get cache stats'));
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    const spinner = ora('Clearing cache...').start();
    
    try {
      await this.initializeClient();
      this.jiraClient!.clearCache();
      spinner.succeed(chalk.green('✅ Cache cleared successfully'));
      
    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to clear cache'));
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Helper methods for colors
   */
  private getRiskColor(level: string): string {
    switch (level) {
      case 'LOW': return chalk.green;
      case 'MEDIUM': return chalk.yellow;
      case 'HIGH': return chalk.red;
      case 'CRITICAL': return chalk.redBright;
      default: return chalk.gray;
    }
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'LOW': return chalk.green;
      case 'MEDIUM': return chalk.yellow;
      case 'HIGH': return chalk.red;
      default: return chalk.gray;
    }
  }
}

// CLI Program Setup
const cli = new JiraMCPCLI();

program
  .name('jira-mcp')
  .description('Jira MCP Sprint Analytics CLI Tool')
  .version('1.0.0')
  .hook('preAction', () => {
    cli.showBanner();
  });

// Commands
program
  .command('test')
  .description('Test Jira connection and configuration')
  .action(() => cli.testConnection());

program
  .command('projects')
  .description('List all accessible Jira projects')
  .action(() => cli.listProjects());

program
  .command('dashboard <projectKey>')
  .description('Generate comprehensive sprint dashboard')
  .option('-s, --sprint <sprintId>', 'Specific sprint ID (defaults to active sprint)')
  .action((projectKey, options) => cli.generateDashboard(projectKey, options.sprint));

program
  .command('predict <projectKey>')
  .description('Run predictive analytics for sprint completion')
  .option('-s, --sprint <sprintId>', 'Specific sprint ID (defaults to active sprint)')
  .action((projectKey, options) => cli.runPredictiveAnalytics(projectKey, options.sprint));

program
  .command('anomalies <projectKey>')
  .description('Detect anomalies in sprint patterns')
  .option('-s, --sprint <sprintId>', 'Specific sprint ID (defaults to active sprint)')
  .action((projectKey, options) => cli.detectAnomalies(projectKey, options.sprint));

program
  .command('portfolio <projectKeys...>')
  .description('Analyze portfolio across multiple projects')
  .action((projectKeys) => cli.portfolioAnalysis(projectKeys));

program
  .command('cache')
  .description('Cache management commands')
  .addCommand(
    program.createCommand('stats')
      .description('Show cache statistics')
      .action(() => cli.showCacheStats())
  )
  .addCommand(
    program.createCommand('clear')
      .description('Clear all cached data')
      .action(() => cli.clearCache())
  );

// Error handling
program.exitOverride();

try {
  program.parse();
} catch (err) {
  console.error(chalk.red('❌ CLI Error:'), err);
  process.exit(1);
}
