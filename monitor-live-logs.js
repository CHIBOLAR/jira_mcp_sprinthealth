#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Live OAuth Log Monitor
 * Displays recent log entries and monitors for changes
 */

const LIVE_LOG_FILE = path.join(os.tmpdir(), 'oauth-live-test.log');

function showRecentLogs(lines = 50) {
  console.log('📋 ============ RECENT OAUTH LOGS ============');
  
  if (!fs.existsSync(LIVE_LOG_FILE)) {
    console.log('❌ No live log file found. Run setup-live-logging.js first.');
    return;
  }
  
  try {
    const logContent = fs.readFileSync(LIVE_LOG_FILE, 'utf8');
    const logLines = logContent.split('\n');
    const recentLines = logLines.slice(-lines).filter(line => line.trim());
    
    console.log(`📁 Log file: ${LIVE_LOG_FILE}`);
    console.log(`📊 Total lines: ${logLines.length}`);
    console.log(`🔍 Showing last ${recentLines.length} lines:`);
    console.log('');
    
    recentLines.forEach(line => {
      // Color-code different types of log entries
      if (line.includes('ERROR') || line.includes('❌') || line.includes('FAILED')) {
        console.log(`🔴 ${line}`);
      } else if (line.includes('SUCCESS') || line.includes('✅') || line.includes('COMPLETE')) {
        console.log(`🟢 ${line}`);
      } else if (line.includes('WARNING') || line.includes('⚠️')) {
        console.log(`🟡 ${line}`);
      } else if (line.includes('DEBUG') || line.includes('🔍')) {
        console.log(`🔵 ${line}`);
      } else {
        console.log(`⚪ ${line}`);
      }
    });
    
    console.log('');
    console.log('============================================');
    
  } catch (error) {
    console.log(`❌ Error reading log file: ${error.message}`);
  }
}

function watchLogs() {
  console.log('👁️ ============ LIVE LOG MONITORING ============');
  console.log('📋 Watching for new log entries...');
  console.log('   Press Ctrl+C to stop monitoring');
  console.log('');
  
  if (!fs.existsSync(LIVE_LOG_FILE)) {
    console.log('❌ No live log file found. Run setup-live-logging.js first.');
    return;
  }
  
  let lastSize = fs.statSync(LIVE_LOG_FILE).size;
  
  const checkForChanges = () => {
    try {
      const currentSize = fs.statSync(LIVE_LOG_FILE).size;
      
      if (currentSize > lastSize) {
        // File has grown, read new content
        const stream = fs.createReadStream(LIVE_LOG_FILE, {
          start: lastSize,
          end: currentSize
        });
        
        let newContent = '';
        stream.on('data', chunk => {
          newContent += chunk.toString();
        });
        
        stream.on('end', () => {
          const newLines = newContent.split('\n').filter(line => line.trim());
          newLines.forEach(line => {
            const timestamp = new Date().toISOString().substring(11, 19);
            console.log(`[${timestamp}] ${line}`);
          });
        });
        
        lastSize = currentSize;
      }
    } catch (error) {
      console.log(`⚠️ Error monitoring logs: ${error.message}`);
    }
  };
  
  // Check every 500ms for changes
  setInterval(checkForChanges, 500);
}

// Command line interface
const command = process.argv[2];

if (command === 'watch') {
  watchLogs();
} else if (command === 'recent') {
  const lines = parseInt(process.argv[3]) || 50;
  showRecentLogs(lines);
} else {
  console.log('📋 OAuth Live Log Monitor');
  console.log('');
  console.log('Usage:');
  console.log('  node monitor-live-logs.js recent [lines]  - Show recent log entries');
  console.log('  node monitor-live-logs.js watch          - Watch for new log entries');
  console.log('');
  console.log('Examples:');
  console.log('  node monitor-live-logs.js recent         - Show last 50 lines');
  console.log('  node monitor-live-logs.js recent 100     - Show last 100 lines');
  console.log('  node monitor-live-logs.js watch          - Monitor live');
  console.log('');
  
  // Show recent logs by default
  showRecentLogs(20);
}