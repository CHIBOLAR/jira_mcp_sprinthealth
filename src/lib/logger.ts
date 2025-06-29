/**
 * Logger utility for Jira MCP Server
 */

interface Logger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

export function createLogger(name: string): Logger {
  const logLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
  const shouldLog = (level: string) => {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevel = levels.indexOf(logLevel);
    const messageLevel = levels.indexOf(level);
    return messageLevel >= currentLevel;
  };

  const formatMessage = (level: string, message: string, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${name}]`;
    
    if (args.length > 0) {
      return `${prefix} ${message} ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')}`;
    }
    
    return `${prefix} ${message}`;
  };

  return {
    debug: (message: string, ...args: any[]) => {
      if (shouldLog('debug')) {
        console.log(formatMessage('debug', message, ...args));
      }
    },
    
    info: (message: string, ...args: any[]) => {
      if (shouldLog('info')) {
        console.log(formatMessage('info', message, ...args));
      }
    },
    
    warn: (message: string, ...args: any[]) => {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', message, ...args));
      }
    },
    
    error: (message: string, ...args: any[]) => {
      if (shouldLog('error')) {
        console.error(formatMessage('error', message, ...args));
      }
    }
  };
}