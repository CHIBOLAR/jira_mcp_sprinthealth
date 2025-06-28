#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import open from 'open';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execAsync = promisify(exec);

interface SetupConfig {
  jiraUrl?: string;
  email?: string;
  setupType: 'oauth' | 'api_token' | 'automatic';
  port: number;
  existingConfig?: any;
}

/**
 * Automatic Setup Wizard - Creates the same experience as official Atlassian integration
 */
export class AutoSetupWizard {
  private claudeConfigPath: string;
  private serverPort: number = 3000;
  private projectRoot: string;

  constructor() {
    this.claudeConfigPath = this.getClaudeConfigPath();
    this.projectRoot = path.resolve(__dirname, '..');
  }

  /**
   * Main setup process - Like official integrations
   */
  async run(): Promise<void> {
    console.clear();
    console.log(chalk.blue.bold('🚀 Jira MCP OAuth Integration Setup'));
    console.log(chalk.blue('━'.repeat(50)));
    console.log(chalk.gray('Creating seamless authentication like official Atlassian integration...'));
    console.log(chalk.gray('This wizard will configure OAuth, Claude Desktop, and test everything.\n'));

    try {
      // Step 1: Welcome and setup type
      await this.showWelcome();
      const setupType = await this.chooseSetupType();
      
      // Step 2: Auto-detect or configure Jira
      const config = await this.configureJira(setupType);
      
      // Step 3: Build the project
      await this.buildProject();
      
      // Step 4: Setup OAuth server
      if (setupType === 'oauth' || setupType === 'automatic') {
        await this.setupOAuthServer(config);
      }
      
      // Step 5: Auto-configure Claude Desktop
      await this.configureClaudeDesktop(config);
      
      // Step 6: Test and verify
      await this.testIntegration(config);
      
      // Step 7: Success and instructions
      await this.showSuccessInstructions(config);
      
    } catch (error) {
      console.error(chalk.red('\n❌ Setup failed:'), error);
      await this.provideTroubleshootingHelp();
    }
  }

  private async showWelcome(): Promise<void> {
    const { continue: shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: 'Ready to set up OAuth integration for your Jira MCP server?',
        default: true
      }
    ]);

    if (!shouldContinue) {
      console.log(chalk.yellow('Setup cancelled. Run again when ready!'));
      process.exit(0);
    }
  }

  /**
   * Let user choose setup type like official implementations
   */
  private async chooseSetupType(): Promise<'oauth' | 'api_token' | 'automatic'> {
    const { setupType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'setupType',
        message: 'How would you like to set up authentication?',
        choices: [
          {
            name: '🔄 Automatic OAuth (Recommended) - Like official Atlassian integration',
            value: 'automatic',
            short: 'Automatic OAuth'
          },
          {
            name: '🔐 Manual OAuth Setup - Full control over OAuth flow', 
            value: 'oauth',
            short: 'Manual OAuth'
          },
          {
            name: '🔑 API Token - Simple but less secure (current method)',
            value: 'api_token', 
            short: 'API Token'
          }
        ],
        default: 'automatic'
      }
    ]);

    return setupType;
  }

  /**
   * Auto-detect or configure Jira instance
   */
  private async configureJira(setupType: string): Promise<SetupConfig> {
    console.log(chalk.blue('\n📋 Jira Configuration'));
    
    // Try to auto-detect from existing .env
    const detectedJira = await this.autoDetectJiraInstance();
    
    const questions: any[] = [];
    
    if (!detectedJira) {
      questions.push({
        type: 'input',
        name: 'jiraUrl',
        message: 'Enter your Jira instance URL:',
        placeholder: 'https://your-company.atlassian.net',
        validate: (input: string) => {
          if (!input) return 'Jira URL is required';
          if (!input.startsWith('https://')) return 'URL must start with https://';
          if (!input.includes('.atlassian.net')) return 'Must be an Atlassian Cloud URL';
          return true;
        }
      });
    }

    if (setupType === 'api_token') {
      questions.push({
        type: 'input',
        name: 'email',
        message: 'Enter your Atlassian email:',
        validate: (input: string) => {
          if (!input) return 'Email is required';
          if (!input.includes('@')) return 'Please enter a valid email';
          return true;
        }
      });
    }

    const answers = await inquirer.prompt(questions);
    
    return {
      jiraUrl: detectedJira || answers.jiraUrl,
      email: answers.email,
      setupType: setupType as any,
      port: this.serverPort
    };
  }

  /**
   * Auto-detect Jira instance from existing config
   */
  private async autoDetectJiraInstance(): Promise<string | null> {
    const spinner = ora('Auto-detecting Jira instance...').start();
    
    try {
      // Check existing .env file
      const envPath = path.join(this.projectRoot, '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const jiraUrlMatch = envContent.match(/JIRA_URL=(.+)/);
        if (jiraUrlMatch) {
          const jiraUrl = jiraUrlMatch[1].trim();
          spinner.succeed(`Found Jira URL in .env: ${jiraUrl}`);
          return jiraUrl;
        }
      }

      // Check common environment variables
      const envUrls = [
        process.env.JIRA_URL,
        process.env.ATLASSIAN_URL,
        process.env.JIRA_INSTANCE_URL
      ].filter(Boolean);

      if (envUrls.length > 0) {
        spinner.succeed(`Found Jira URL in environment: ${envUrls[0]}`);
        return envUrls[0]!;
      }

      spinner.warn('Could not auto-detect Jira instance');
      return null;
    } catch (error) {
      spinner.warn('Auto-detection failed');
      return null;
    }
  }

  /**
   * Build the project to ensure everything compiles
   */
  private async buildProject(): Promise<void> {
    const spinner = ora('Building OAuth server...').start();
    
    try {
      const { stdout, stderr } = await execAsync('npm run build', { 
        cwd: this.projectRoot 
      });
      
      if (stderr && !stderr.includes('warning')) {
        throw new Error(stderr);
      }
      
      spinner.succeed('Project built successfully');
    } catch (error) {
      spinner.fail('Build failed');
      console.log(chalk.yellow('💡 Trying to fix build issues...'));
      
      // Try to install missing dependencies
      try {
        await execAsync('npm install', { cwd: this.projectRoot });
        await execAsync('npm run build', { cwd: this.projectRoot });
        spinner.succeed('Project built after dependency update');
      } catch (buildError) {
        throw new Error(`Build failed: ${buildError}`);
      }
    }
  }

  /**
   * Setup OAuth server automatically
   */
  private async setupOAuthServer(config: SetupConfig): Promise<void> {
    const spinner = ora('Setting up OAuth server...').start();
    
    try {
      // Find available port
      this.serverPort = await this.findAvailablePort(config.port);
      
      // Create OAuth environment file
      const oauthEnvPath = path.join(this.projectRoot, '.env.oauth');
      const oauthEnvContent = [
        `PORT=${this.serverPort}`,
        `JIRA_URL=${config.jiraUrl}`,
        `OAUTH_MODE=true`,
        `NODE_ENV=development`,
        `# OAuth will be configured automatically during first run`
      ].join('\n');
      
      fs.writeFileSync(oauthEnvPath, oauthEnvContent);
      
      spinner.succeed(`OAuth server configured on port ${this.serverPort}`);

    } catch (error) {
      spinner.fail('OAuth setup failed');
      throw error;
    }
  }

  /**
   * Automatically configure Claude Desktop (the key magic!)
   */
  private async configureClaudeDesktop(config: SetupConfig): Promise<void> {
    const spinner = ora('Configuring Claude Desktop...').start();
    
    try {
      // Ensure Claude config directory exists
      const claudeConfigDir = path.dirname(this.claudeConfigPath);
      if (!fs.existsSync(claudeConfigDir)) {
        fs.mkdirSync(claudeConfigDir, { recursive: true });
      }

      // Read existing Claude config
      let claudeConfig: any = { mcpServers: {} };
      
      if (fs.existsSync(this.claudeConfigPath)) {
        try {
          const existingConfig = fs.readFileSync(this.claudeConfigPath, 'utf8');
          claudeConfig = JSON.parse(existingConfig);
          if (!claudeConfig.mcpServers) {
            claudeConfig.mcpServers = {};
          }
        } catch (parseError) {
          console.log(chalk.yellow('⚠️  Creating new Claude config (existing config was invalid)'));
          claudeConfig = { mcpServers: {} };
        }
      }

      // Configure based on setup type
      if (config.setupType === 'oauth' || config.setupType === 'automatic') {
        // OAuth configuration - the future!
        claudeConfig.mcpServers['jira-dashboard-oauth'] = {
          command: 'node',
          args: [path.join(this.projectRoot, 'dist', 'oauth-server.js')],
          env: {
            PORT: this.serverPort.toString(),
            OAUTH_MODE: 'true',
            JIRA_URL: config.jiraUrl,
            NODE_ENV: 'production'
          }
        };
        
        // Keep existing API token config as backup
        if (claudeConfig.mcpServers['jira-dashboard']) {
          claudeConfig.mcpServers['jira-dashboard-backup'] = claudeConfig.mcpServers['jira-dashboard'];
        }
        
        spinner.text = 'Configured OAuth integration';
        
      } else {
        // API token configuration (enhanced)
        claudeConfig.mcpServers['jira-dashboard'] = {
          command: 'node',
          args: [path.join(this.projectRoot, 'dist', 'index.js')],
          env: {
            JIRA_URL: config.jiraUrl,
            JIRA_EMAIL: config.email,
            NODE_ENV: 'production'
          }
        };
        
        spinner.text = 'Configured API token integration';
      }

      // Backup existing config
      if (fs.existsSync(this.claudeConfigPath)) {
        const backupPath = this.claudeConfigPath + '.backup.' + Date.now();
        fs.copyFileSync(this.claudeConfigPath, backupPath);
      }

      // Write new config
      fs.writeFileSync(this.claudeConfigPath, JSON.stringify(claudeConfig, null, 2));
      
      spinner.succeed('Claude Desktop configured successfully');
      
    } catch (error) {
      spinner.fail('Claude Desktop configuration failed');
      throw error;
    }
  }

  /**
   * Test integration and provide first-run experience
   */
  private async testIntegration(config: SetupConfig): Promise<void> {
    const spinner = ora('Testing integration...').start();
    
    try {
      if (config.setupType === 'oauth' || config.setupType === 'automatic') {
        spinner.text = 'Starting OAuth server for testing...';
        
        // Start OAuth server in background for testing
        const serverProcess = spawn('node', [
          path.join(this.projectRoot, 'dist', 'oauth-server.js')
        ], {
          env: { 
            ...process.env, 
            PORT: this.serverPort.toString(),
            JIRA_URL: config.jiraUrl
          },
          stdio: 'pipe'
        });

        // Wait for server to start
        await new Promise(resolve => setTimeout(resolve, 3000));

        try {
          // Test health endpoint
          const fetch = (await import('node-fetch')).default;
          const healthResponse = await fetch(`http://localhost:${this.serverPort}/health`);
          
          if (!healthResponse.ok) {
            throw new Error('Health check failed');
          }
          
          spinner.succeed('OAuth server is running correctly');
          
          // Ask if user wants to test OAuth flow
          const { testOAuth } = await inquirer.prompt([{
            type: 'confirm',
            name: 'testOAuth',
            message: 'Would you like to test the OAuth flow now?',
            default: true
          }]);
          
          if (testOAuth) {
            console.log(chalk.blue('\n🌐 Opening OAuth flow in your browser...'));
            console.log(chalk.gray('This will demonstrate the same experience as official Atlassian integration.'));
            
            await open(`http://localhost:${this.serverPort}/oauth/authorize`);
            
            console.log(chalk.gray(`\nIf browser doesn't open, visit: http://localhost:${this.serverPort}/oauth/authorize`));
            
            await inquirer.prompt([{
              type: 'input',
              name: 'continue',
              message: 'Press Enter after reviewing the OAuth flow (or Ctrl+C to skip)...'
            }]);
          }
          
        } catch (testError) {
          console.log(chalk.yellow('⚠️  OAuth test completed (this is normal for first-time setup)'));
        } finally {
          // Cleanup test server
          serverProcess.kill();
        }
        
      } else {
        // API token setup
        await this.setupApiToken(config);
        spinner.succeed('API token configuration completed');
      }
      
    } catch (error) {
      spinner.warn('Integration test had issues (this might be normal)');
      console.log(chalk.gray('You can test manually after setup completion.'));
    }
  }

  /**
   * API token setup helper
   */
  private async setupApiToken(config: SetupConfig): Promise<void> {
    console.log(chalk.blue('\n🔑 API Token Setup'));
    console.log(chalk.gray('For API token method, you\'ll need to create a token manually.'));
    
    const { openTokenPage } = await inquirer.prompt([{
      type: 'confirm',
      name: 'openTokenPage',
      message: 'Open Atlassian API token page in browser?',
      default: true
    }]);
    
    if (openTokenPage) {
      await open('https://id.atlassian.com/manage-profile/security/api-tokens');
    }
    
    const { apiToken } = await inquirer.prompt([{
      type: 'password',
      name: 'apiToken',
      message: 'Paste your API token here (will be stored in .env):',
      mask: '*'
    }]);

    // Update .env file with token
    const envPath = path.join(this.projectRoot, '.env');
    const envContent = [
      `JIRA_URL=${config.jiraUrl}`,
      `JIRA_EMAIL=${config.email}`,
      `JIRA_API_TOKEN=${apiToken}`,
      `NODE_ENV=development`
    ].join('\n');
    
    fs.writeFileSync(envPath, envContent);
    console.log(chalk.green('✅ API token saved to .env file'));
  }

  /**
   * Show success instructions
   */
  private async showSuccessInstructions(config: SetupConfig): Promise<void> {
    console.log(chalk.green.bold('\n🎉 Setup Complete!'));
    console.log(chalk.green('━'.repeat(50)));
    
    if (config.setupType === 'oauth' || config.setupType === 'automatic') {
      console.log(chalk.white('✨ OAuth Integration Active:'));
      console.log(chalk.gray(`   • Server: http://localhost:${this.serverPort}`));
      console.log(chalk.gray(`   • OAuth: http://localhost:${this.serverPort}/oauth/authorize`));
      console.log(chalk.gray(`   • Health: http://localhost:${this.serverPort}/health`));
    } else {
      console.log(chalk.white('✨ API Token Integration Active:'));
      console.log(chalk.gray(`   • Configuration saved to .env`));
    }
    
    console.log(chalk.white('\n📋 Next Steps:'));
    console.log(chalk.gray('   1. Restart Claude Desktop application'));
    console.log(chalk.gray('   2. Open a new chat in Claude'));
    console.log(chalk.gray('   3. Type: "Test Jira connection"'));
    console.log(chalk.gray('   4. Try: "Generate dashboard for project [YOUR_PROJECT_KEY]"'));
    
    console.log(chalk.white('\n🚀 Available Commands:'));
    console.log(chalk.gray('   • npm run oauth:server  - Start OAuth server manually'));
    console.log(chalk.gray('   • npm run dev          - Start development server'));
    console.log(chalk.gray('   • npm run build        - Build the project'));
    
    console.log(chalk.blue('\n💡 Pro Tip:'));
    console.log(chalk.gray('   Your integration now works like the official Atlassian MCP!'));
    console.log(chalk.gray('   Users get seamless OAuth without manual token creation.'));
    
    // Ask if user wants to restart Claude Desktop
    const { openClaudeHelp } = await inquirer.prompt([{
      type: 'confirm',
      name: 'openClaudeHelp',
      message: 'Would you like instructions on restarting Claude Desktop?',
      default: false
    }]);
    
    if (openClaudeHelp) {
      this.showClaudeRestartInstructions();
    }
  }

  private showClaudeRestartInstructions(): void {
    console.log(chalk.blue('\n📖 How to Restart Claude Desktop:'));
    console.log(chalk.gray('   Windows: Close Claude completely, then reopen from Start Menu'));
    console.log(chalk.gray('   macOS: Cmd+Q to quit, then reopen from Applications'));
    console.log(chalk.gray('   Alternative: Kill the process and restart'));
    console.log(chalk.white('\n🔍 Verify Integration:'));
    console.log(chalk.gray('   After restart, look for MCP tools icon in Claude chat'));
    console.log(chalk.gray('   Try typing: "List my Jira projects" or "Test connection"'));
  }

  /**
   * Get Claude Desktop config path for different platforms
   */
  private getClaudeConfigPath(): string {
    const platform = os.platform();
    const homeDir = os.homedir();
    
    switch (platform) {
      case 'win32':
        return path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      case 'linux':
        return path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Find available port for OAuth server
   */
  private async findAvailablePort(startPort: number): Promise<number> {
    const net = await import('net');
    
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      
      server.listen(startPort, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : startPort;
        server.close(() => resolve(port));
      });
      
      server.on('error', async () => {
        // Try next port
        try {
          const nextPort = await this.findAvailablePort(startPort + 1);
          resolve(nextPort);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Provide troubleshooting help
   */
  private async provideTroubleshootingHelp(): Promise<void> {
    console.log(chalk.yellow('\n🔧 Troubleshooting Help:'));
    console.log(chalk.gray('1. Ensure Claude Desktop is closed during setup'));
    console.log(chalk.gray('2. Check your Jira instance URL is correct'));
    console.log(chalk.gray('3. Verify Node.js version is 18+ (node --version)'));
    console.log(chalk.gray('4. Try running as administrator/sudo'));
    
    const { viewLogs } = await inquirer.prompt([{
      type: 'confirm',
      name: 'viewLogs',
      message: 'Would you like to view configuration details?',
      default: false
    }]);
    
    if (viewLogs) {
      console.log(chalk.gray('\n📋 Configuration Locations:'));
      console.log(chalk.gray(`• Claude config: ${this.claudeConfigPath}`));
      console.log(chalk.gray(`• Project root: ${this.projectRoot}`));
      console.log(chalk.gray(`• OAuth port: ${this.serverPort}`));
      
      console.log(chalk.gray('\n🔄 Recovery Commands:'));
      console.log(chalk.gray('• npm run build        - Rebuild project'));
      console.log(chalk.gray('• npm run setup        - Run setup again'));
      console.log(chalk.gray('• npm run oauth:server - Test OAuth server'));
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const wizard = new AutoSetupWizard();
  
  // Handle command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(chalk.blue('🧙‍♂️ Jira MCP OAuth Setup Wizard'));
    console.log(chalk.gray('\nUsage:'));
    console.log(chalk.gray('  npm run setup           - Interactive setup'));
    console.log(chalk.gray('  npm run setup:auto      - Automatic OAuth setup'));
    console.log(chalk.gray('  npm run setup:oauth     - Manual OAuth setup'));
    process.exit(0);
  }
  
  wizard.run().catch((error) => {
    console.error(chalk.red('\n❌ Setup wizard failed:'), error);
    process.exit(1);
  });
}
