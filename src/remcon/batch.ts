import * as vscode from 'vscode';
import type { Connection, SshClient, Localization, Logger } from '../core/types';

export class Batch {
  constructor(
    private connection: Connection,
    private sshClient: SshClient,
    private localization: Localization,
    private logger: Logger,
  ) {}

  showBatchDialog = async () => {
    const allConns = this.connection.getAllSSH();
    if (allConns.length === 0) {
      this.logger.notify.info(this.localization.localize('remcon.msg.batch.noConnections'));
      return;
    }

    const items = allConns.map((conn) => ({
      label: conn.name,
      description: `${conn.username}@${conn.host}:${conn.port}`,
      picked: false,
      conn,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: this.localization.localize('remcon.msg.batch.select'),
      canPickMany: true,
      ignoreFocusOut: true,
    });
    if (!selected || selected.length === 0) {
      return;
    }

    const command = await vscode.window.showInputBox({
      prompt: this.localization.localize('remcon.msg.batch.command'),
      placeHolder: 'e.g. uptime',
      ignoreFocusOut: true,
    });
    if (!command) {
      return;
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Running on ${selected.length} host(s)...` },
      async () => {
        const results = await Promise.allSettled(
          selected.map(async (item) => {
            try {
              const result = await this.sshClient.execCommand(item.conn, command);
              return { name: item.conn.name, success: true, stdout: result.stdout, stderr: result.stderr };
            } catch (err) {
              return { name: item.conn.name, success: false, error: String(err) };
            }
          }),
        );

        const output = results
          .map((r) => {
            if (r.status === 'fulfilled') {
              const d = r.value;
              return `=== ${d.name} ===\n${d.success ? d.stdout : d.error}`;
            }
            return `=== Error ===\n${r.reason}`;
          })
          .join('\n\n');

        const doc = await vscode.workspace.openTextDocument({
          content: output,
          language: 'shell',
        });
        await vscode.window.showTextDocument(doc);
      },
    );
  };
}
