import * as vscode from 'vscode';
import type { Logger } from './types';
import { VSCODE_NAME } from './const';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'core' | 'connection' | 'tunnel' | 'sftp' | 'key' | 'api' | 'config';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CATEGORY_NAMES: Record<LogCategory, string> = {
  core: 'Core',
  connection: 'Connection',
  tunnel: 'Tunnel',
  sftp: 'SFTP',
  key: 'Key',
  api: 'API',
  config: 'Config',
};

type CategoryLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
};

export class LoggerImpl implements Logger {
  private channel: vscode.OutputChannel | undefined;
  private currentLogLevel: LogLevel = 'info';

  readonly sftp: CategoryLogger;
  readonly connection: CategoryLogger;
  readonly tunnel: CategoryLogger;
  readonly key: CategoryLogger;
  readonly api: CategoryLogger;

  readonly notify: Logger['notify'] = {
    error: (message: string, ...rest: any[]) => vscode.window.showErrorMessage(message, ...rest),
    info: (message: string, ...rest: any[]) => vscode.window.showInformationMessage(message, ...rest),
    warn: (message: string, ...rest: any[]) => vscode.window.showWarningMessage(message, ...rest),
  };

  constructor(context: vscode.ExtensionContext) {
    this.currentLogLevel = context.extensionMode === vscode.ExtensionMode.Development ? 'debug' : 'info';
    this.sftp = this.category('sftp');
    this.connection = this.category('connection');
    this.tunnel = this.category('tunnel');
    this.key = this.category('key');
    this.api = this.category('api');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.currentLogLevel];
  }

  private category(cat: LogCategory): CategoryLogger {
    const log = (level: LogLevel, ...args: unknown[]) => {
      if (!this.shouldLog(level)) {
        return;
      }
      if (!this.channel) {
        return;
      }

      const prefix = `[${CATEGORY_NAMES[cat]}]`;
      const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      this.channel.appendLine(`${prefix} ${level.toUpperCase()}: ${msg}`);
    };

    return {
      info: (...args) => log('info', ...args),
      warn: (...args) => log('warn', ...args),
      error: (...args) => log('error', ...args),
      debug: (...args) => log('debug', ...args),
    };
  }

  private log(level: LogLevel, ...args: unknown[]) {
    if (!this.shouldLog(level)) {
      return;
    }
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel(VSCODE_NAME);
      this.channel.show(true);
    }
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    this.channel.appendLine(`[Core] ${level.toUpperCase()}: ${msg}`);
  }

  info(...args: unknown[]): void {
    this.log('info', ...args);
  }
  warn(...args: unknown[]): void {
    this.log('warn', ...args);
  }
  error(...args: unknown[]): void {
    this.log('error', ...args);
  }
  debug(...args: unknown[]): void {
    this.log('debug', ...args);
  }

  show(): void {
    if (this.channel) {
      this.channel.show();
    }
  }

  clear(): void {
    if (this.channel) {
      this.channel.clear();
    }
  }

  dispose(): void {
    if (this.channel) {
      this.channel.dispose();
    }
  }
}
