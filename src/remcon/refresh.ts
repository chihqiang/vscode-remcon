import * as vscode from 'vscode';
import { getSettings, Command } from '../core/const';
import type { Logger, Connection, Ping, AutoRefresh } from '../core/types';

export class AutoRefresher implements AutoRefresh {
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private connection: Connection,
    private ping: Ping,
    private logger: Logger,
  ) {}

  start(): void {
    const settings = getSettings();

    this.timers.push(
      setInterval(() => {
        vscode.commands.executeCommand(Command.ONLINE_REFRESH);
      }, settings.refreshNodeTime * 1000),
    );

    this.timers.push(
      setInterval(() => {
        vscode.commands.executeCommand(Command.OFFLINE_REFRESH);
      }, settings.refreshNodeTime * 1000),
    );

    this.timers.push(
      setInterval(() => {
        const offlineConns = this.connection.getOfflineSSH();
        if (offlineConns.length > 0) {
          this.ping.pingOfflineHosts(offlineConns).then(() => {
            vscode.commands.executeCommand(Command.OFFLINE_REFRESH);
          });
        }
      }, settings.pingHostTime * 1000),
    );

    this.logger.info('Auto refresh started');
  }

  stop(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
  }
}
