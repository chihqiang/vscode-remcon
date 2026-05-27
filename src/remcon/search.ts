import * as vscode from 'vscode';
import { Command, SSHStatus } from '../core/const';
import type { Connection, SshClient, Localization, Logger } from '../core/types';
import { copy } from './util';

export class Search {
  constructor(
    private connection: Connection,
    private sshClient: SshClient,
    private localization: Localization,
    private logger: Logger,
  ) {}

  showSearchDialog = async () => {
    const allConns = this.connection.getAllSSH();
    if (allConns.length === 0) {
      this.logger.notify.info(this.localization.localize('remcon.msg.search.noConnections'));
      return;
    }

    const items = allConns.map((conn) => ({
      label: conn.name,
      description: `${conn.username}@${conn.host}:${conn.port}`,
      detail: conn.status === SSHStatus.ONLINE ? 'Online' : 'Offline',
      conn,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: this.localization.localize('remcon.msg.search.placeholder'),
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked) {
      return;
    }

    const actions = [
      { label: '$(terminal) Connect', action: 'connect' },
      { label: '$(edit) Edit', action: 'edit' },
      { label: '$(trash) Delete', action: 'delete' },
      { label: '$(copy) Copy SSH command', action: 'copy' },
    ];

    const action = await vscode.window.showQuickPick(actions, {
      placeHolder: picked.label,
    });
    if (!action) {
      return;
    }

    switch (action.action) {
      case 'connect':
        if (picked.conn.status === SSHStatus.ONLINE) {
          this.logger.notify.info(`${picked.conn.name} is already connected`);
          return;
        }
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Connecting ${picked.conn.name}...` },
          async () => {
            try {
              await this.sshClient.openShellInTerminal(picked.conn);
              await this.connection.editSSH(picked.conn.id, { status: SSHStatus.ONLINE });
              vscode.commands.executeCommand(Command.REFRESH);
              this.logger.notify.info(`${picked.conn.name}: connected`);
            } catch (err) {
              this.logger.notify.error(`${picked.conn.name}: connection failed`);
              this.logger.error(`Connect failed: ${picked.conn.name}`, err);
            }
          },
        );
        break;
      case 'edit':
        vscode.commands.executeCommand(Command.EDIT, { connection: picked.conn });
        break;
      case 'delete':
        vscode.commands.executeCommand(Command.DELETE, { connection: picked.conn });
        break;
      case 'copy':
        copy(`ssh ${picked.conn.username}@${picked.conn.host} -p ${picked.conn.port}`);
        this.logger.notify.info('SSH command copied to clipboard');
        break;
    }
  };
}
