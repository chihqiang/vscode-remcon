import * as vscode from 'vscode';
import { Command, SSHStatus } from '../core/const';
import type { Connection, SshClient, Logger } from '../core/types';

export class Quick {
  constructor(
    private connection: Connection,
    private sshClient: SshClient,
    private logger: Logger,
  ) {}

  quickConnect = async () => {
    const allConns = this.connection.getAllSSH();
    const offline = allConns.filter((c) => c.status !== SSHStatus.ONLINE);

    if (offline.length === 0) {
      this.logger.notify.info('No offline connections to connect');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      offline.map((c) => ({
        label: c.name,
        description: `${c.username}@${c.host}:${c.port}`,
        conn: c,
      })),
      { placeHolder: 'Select connection to open terminal', ignoreFocusOut: true },
    );
    if (!picked) {
      return;
    }

    try {
      await this.sshClient.openShellInTerminal(picked.conn);
      await this.connection.editSSH(picked.conn.id, { status: SSHStatus.ONLINE });
      vscode.commands.executeCommand(Command.REFRESH);
      this.logger.notify.info(`${picked.conn.name}: connected`);
    } catch (err) {
      this.logger.notify.error(`${picked.conn.name}: connection failed`);
      this.logger.error(`Connect failed: ${picked.conn.name}`, err);
    }
  };

  quickDisconnect = async () => {
    const allConns = this.connection.getAllSSH();
    const online = allConns.filter((c) => c.status === SSHStatus.ONLINE);

    if (online.length === 0) {
      this.logger.notify.info('No online connections to disconnect');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      online.map((c) => ({
        label: c.name,
        description: `${c.username}@${c.host}:${c.port}`,
        conn: c,
      })),
      { placeHolder: 'Select connection to disconnect', ignoreFocusOut: true },
    );
    if (!picked) {
      return;
    }

    this.sshClient.disconnect(picked.conn.id);
    await this.connection.editSSH(picked.conn.id, { status: SSHStatus.OFFLINE });
    vscode.commands.executeCommand(Command.REFRESH);
    this.logger.notify.info(`${picked.conn.name}: disconnected`);
  };
}
