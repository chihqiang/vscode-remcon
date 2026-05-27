import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Command, SshInput } from '../core/const';
import type { Connection, Logger } from '../core/types';
import { resolveHome } from './util';

export class HostFile {
  private watcher: fs.FSWatcher | undefined;

  constructor(
    private connection: Connection,
    private logger: Logger,
  ) {}

  private getConfig(): { enabled: boolean; filePath: string } {
    const config = vscode.workspace.getConfiguration('remcon.hostfile');
    const enabled = config.get<boolean>('enabled', false);
    let filePath = config.get<string>('path', path.join(os.homedir(), '.remcon', 'hosts.json'));
    filePath = resolveHome(filePath);
    return { enabled, filePath };
  }

  private readFile(filePath: string): SshInput[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const entries: any[] = JSON.parse(raw);
      if (!Array.isArray(entries)) {
        return [];
      }
      return entries.map((e) => ({
        name: e.name,
        host: e.host,
        port: e.port || 22,
        username: e.username,
        password: e.password,
        privateKey: e.privateKey ? resolveHome(e.privateKey) : undefined,
        passphrase: e.passphrase,
        group: e.group,
        ostype: e.ostype,
      }));
    } catch (err) {
      this.logger.error(`Failed to parse host file: ${err}`);
      return [];
    }
  }

  import = async (): Promise<number> => {
    const { enabled, filePath } = this.getConfig();
    if (!enabled) {
      return 0;
    }

    const entries = this.readFile(filePath);
    if (entries.length === 0) {
      return 0;
    }

    const existing = this.connection.getAllSSH();
    const existingNames = new Set(existing.map((c) => c.name));
    const existingHosts = new Set(existing.map((c) => `${c.host}:${c.port}`));

    let imported = 0;
    for (const entry of entries) {
      const key = `${entry.host}:${entry.port}`;
      if (existingNames.has(entry.name) || existingHosts.has(key)) {
        continue;
      }

      try {
        await this.connection.addSSH(entry);
        imported++;
        existingNames.add(entry.name);
        existingHosts.add(key);
        this.logger.info(`Auto-imported host: ${entry.name} (${entry.username}@${entry.host})`);
      } catch (err) {
        this.logger.error(`Failed to import ${entry.name}: ${err}`);
      }
    }
    return imported;
  };

  startWatch = (): vscode.Disposable => {
    const { enabled, filePath } = this.getConfig();
    if (!enabled || !fs.existsSync(filePath)) {
      return new vscode.Disposable(() => {});
    }

    if (this.watcher) {
      this.watcher.close();
    }

    let timer: NodeJS.Timeout | undefined;
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);

    try {
      this.watcher = fs.watch(dir, (_eventType, filename) => {
        if (filename !== basename) {
          return;
        }

        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(async () => {
          const count = await this.import();
          if (count > 0) {
            this.logger.notify.info(`Auto-imported ${count} host(s) from ${filePath}`);
            vscode.commands.executeCommand(Command.REFRESH);
          }
        }, 1000);
      });
    } catch (err) {
      this.logger.error(`Failed to watch host file: ${err}`);
    }

    return new vscode.Disposable(() => {
      if (timer) {
        clearTimeout(timer);
      }
      if (this.watcher) {
        this.watcher.close();
      }
    });
  };

  getFilePath(): string {
    return this.getConfig().filePath;
  }
}
