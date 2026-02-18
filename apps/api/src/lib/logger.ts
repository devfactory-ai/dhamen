type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  data?: Record<string, unknown>;
}

/**
 * Structured logger for Workers
 */
export function createLogger(requestId?: string, userId?: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId,
      userId,
      data,
    };

    // In production, this would be sent to a log aggregator
    // For now, we use console with structured output
    const output = JSON.stringify(entry);

    switch (level) {
      case 'debug':
        // biome-ignore lint/suspicious/noConsoleLog: Required for logging
        console.log(output);
        break;
      case 'info':
        // biome-ignore lint/suspicious/noConsoleLog: Required for logging
        console.log(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  };

  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
    error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
  };
}

export type Logger = ReturnType<typeof createLogger>;
