import * as vscode from 'vscode';
import * as fs from 'fs';
import { Command, SSHConnection } from '../core/const';
import type { Connection, Logger } from '../core/types';

export class Importer {
  constructor(
    private connection: Connection,
    private logger: Logger,
  ) {}

  exportConnections = async () => {
    const allConns = this.connection.getAllSSH();
    if (allConns.length === 0) {
      this.logger.notify.info('No connections to export');
      return;
    }

    const uri = await vscode.window.showSaveDialog({
      filters: { JSON: ['json'] },
      defaultUri: vscode.Uri.file(`remcon-export-${Date.now()}.json`),
    });
    if (!uri) {
      return;
    }

    const data = JSON.stringify(
      allConns.map(({ id, ...rest }) => rest),
      null,
      2,
    );
    await fs.promises.writeFile(uri.fsPath, data, 'utf-8');
    this.logger.notify.info(`Exported ${allConns.length} connections`);
  };

  importConnections = async () => {
    const uri = await vscode.window.showOpenDialog({
      filters: { JSON: ['json'] },
      canSelectMany: false,
    });
    if (!uri || uri.length === 0) {
      return;
    }

    const data = await fs.promises.readFile(uri[0].fsPath, 'utf-8');
    let conns: Array<Omit<SSHConnection, 'id'>>;

    try {
      conns = JSON.parse(data);
      if (!Array.isArray(conns)) {
        throw new Error('Invalid format');
      }
    } catch {
      this.logger.notify.error('Invalid file format');
      return;
    }

    let imported = 0;
    for (const conn of conns) {
      try {
        await this.connection.addSSH({
          name: conn.name,
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: conn.password || '',
          privateKey: conn.privateKey || '',
          passphrase: conn.passphrase || '',
          group: conn.group || 'default',
          ostype: conn.ostype,
        });
        imported++;
      } catch (err) {
        this.logger.error(`Import failed: ${conn.name}`, err);
      }
    }

    vscode.commands.executeCommand(Command.REFRESH);
    this.logger.notify.info(`Imported ${imported} of ${conns.length} connections`);
  };
}
