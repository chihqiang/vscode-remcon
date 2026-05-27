import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Command, OSType } from '../core/const';
import type { Connection, Logger, Localization } from '../core/types';
import { resolveHome } from './util';

interface SshConfigEntry {
  host: string;
  hostName?: string;
  port?: number;
  user?: string;
  identityFile?: string;
  proxyJump?: string;
}

export class SshConfigImporter {
  constructor(
    private connection: Connection,
    private logger: Logger,
    private localization: Localization,
  ) {}

  private getSshConfigPath(): string {
    return path.join(os.homedir(), '.ssh', 'config');
  }

  private parseSshConfig(filePath: string): SshConfigEntry[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const entries: SshConfigEntry[] = [];
    let current: SshConfigEntry | null = null;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const match = trimmed.match(/^(\w+)\s+(.+)$/);
      if (!match) {
        continue;
      }

      const key = match[1].toLowerCase();
      const value = match[2].trim();

      if (key === 'host') {
        if (current) {
          entries.push(current);
        }
        current = { host: value };
      } else if (current) {
        switch (key) {
          case 'hostname':
            current.hostName = value;
            break;
          case 'port':
            current.port = parseInt(value, 10) || 22;
            break;
          case 'user':
            current.user = value;
            break;
          case 'identityfile':
            current.identityFile = resolveHome(value);
            break;
          case 'proxyjump':
            current.proxyJump = value;
            break;
        }
      }
    }

    if (current) {
      entries.push(current);
    }
    return entries;
  }

  private hasWildcard(host: string): boolean {
    return host.includes('*') || host.includes('?');
  }

  private shouldAutoImport(host: string): boolean {
    return !this.hasWildcard(host) && host !== '*';
  }

  importFromSshConfig = async (): Promise<number> => {
    const configPath = this.getSshConfigPath();

    if (!fs.existsSync(configPath)) {
      this.logger.notify.warn(this.localization.localize('remcon.msg.import.configNotFound', configPath));
      return 0;
    }

    const entries = this.parseSshConfig(configPath);
    const importable = entries.filter((e) => this.shouldAutoImport(e.host));

    if (importable.length === 0) {
      this.logger.notify.info(this.localization.localize('remcon.msg.import.noHosts'));
      return 0;
    }

    const existingConns = this.connection.getAllSSH();
    const existingNames = new Set(existingConns.map((c) => c.name));
    const existingHosts = new Set(existingConns.map((c) => `${c.host}:${c.port}`));

    const items = importable.map((entry) => {
      const host = entry.hostName || entry.host;
      const port = entry.port || 22;
      const user = entry.user || os.userInfo().username;
      const key = `${host}:${port}`;
      const alreadyExists = existingNames.has(entry.host) || existingHosts.has(key);

      return {
        label: entry.host,
        description: `${user}@${host}:${port}`,
        detail: alreadyExists
          ? this.localization.localize('remcon.msg.import.alreadyExists')
          : entry.identityFile
            ? `Key: ${entry.identityFile}`
            : '',
        picked: !alreadyExists,
        entry,
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: this.localization.localize('remcon.msg.import.selectHosts', String(importable.length)),
      canPickMany: true,
      ignoreFocusOut: true,
    });

    if (!selected || selected.length === 0) {
      return 0;
    }

    let imported = 0;
    for (const item of selected) {
      const e = item.entry;
      const host = e.hostName || e.host;
      const port = e.port || 22;
      const user = e.user || os.userInfo().username;

      try {
        await this.connection.addSSH({
          name: e.host,
          host,
          port,
          username: user,
          privateKey: e.identityFile || '',
          ostype: OSType.LINUX,
          group: 'default',
        });
        imported++;
        this.logger.info(`Imported SSH config host: ${e.host} (${user}@${host}:${port})`);
      } catch (err) {
        this.logger.error(`Failed to import ${e.host}: ${err}`);
      }
    }

    return imported;
  };

  watchSshConfig = (): vscode.Disposable => {
    const configPath = path.join(os.homedir(), '.ssh', 'config');
    if (!fs.existsSync(configPath)) {
      return new vscode.Disposable(() => {});
    }

    let timer: NodeJS.Timeout | undefined;
    fs.watchFile(configPath, { interval: 5000 }, (curr, prev) => {
      if (curr.mtimeMs === prev.mtimeMs) {
        return;
      }

      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(async () => {
        const ok = await this.logger.notify.info('~/.ssh/config has changed. Import hosts?', 'Import');
        if (ok === 'Import') {
          const count = await this.importFromSshConfig();
          if (count > 0) {
            this.logger.notify.info(`Imported ${count} host(s) from ~/.ssh/config`);
            vscode.commands.executeCommand(Command.REFRESH);
          }
        }
      }, 2000);
    });

    return new vscode.Disposable(() => {
      if (timer) {
        clearTimeout(timer);
      }
      fs.unwatchFile(configPath);
    });
  };
}
