#!/usr/bin/env node

import express from 'express';
import chalk from 'chalk';

console.log('🚀 Starting OAuth server test...');

const app = express();
const port = 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/.well-known/mcp-configuration', (req, res) => {
  res.json({
    name: 'jira-dashboard-mcp-enhanced',
    version: '2.0.0',
    oauth: {
      authorization_endpoint: 'https://auth.atlassian.com/authorize',
      token_endpoint: 'https://auth.atlassian.com/oauth/token'
    }
  });
});

app.listen(port, () => {
  console.log(chalk.green(`✅ OAuth server running on http://localhost:${port}`));
  console.log(chalk.gray(`📋 Test health: http://localhost:${port}/health`));
  console.log(chalk.gray(`📋 Test metadata: http://localhost:${port}/.well-known/mcp-configuration`));
});
