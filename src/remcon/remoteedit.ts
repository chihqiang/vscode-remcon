import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SSHConnection, getSettings } from '../core/const';
import type { Sftp, Logger } from '../core/types';

interface RemoteFileMapping {
  connId: string;
  remotePath: string;
  conn: SSHConnection;
}

export class RemoteEdit {
  private localToRemote = new Map<string, RemoteFileMapping>();
  private tempDir: string;

  constructor(
    context: vscode.ExtensionContext,
    private sftp: Sftp,
    private logger: Logger,
  ) {
    this.tempDir = path.join(context.globalStorageUri.fsPath, 'remote-edit');
    fs.mkdirSync(this.tempDir, { recursive: true });
  }

  async openRemoteFile(conn: SSHConnection, remotePath: string): Promise<void> {
    const settings = getSettings();
    const maxSize = settings.openFileMaxSize * 1024 * 1024;

    const stats = await this.sftp.stat(conn, remotePath);

    if (stats.size > maxSize) {
      const ok = await vscode.window.showWarningMessage(`File is ${(stats.size / 1024 / 1024).toFixed(1)} MB. Open anyway?`, 'Yes', 'No');
      if (ok !== 'Yes') {
        return;
      }
    }

    const localPath = path.join(this.tempDir, `${conn.id}-${Date.now()}-${path.basename(remotePath)}`);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Downloading ${path.basename(remotePath)}...` },
      async () => {
        await this.sftp.downloadFile(conn, remotePath, localPath);
        this.logger.info(`Downloaded ${remotePath} to ${localPath}`);
      },
    );

    this.localToRemote.set(localPath, { connId: conn.id, remotePath, conn });
    const doc = await vscode.workspace.openTextDocument(localPath);
    await vscode.window.showTextDocument(doc);
  }

  handleDocumentSave = async (doc: vscode.TextDocument): Promise<void> => {
    const mapping = this.localToRemote.get(doc.fileName);
    if (!mapping) {
      return;
    }

    try {
      const data = await fs.promises.readFile(doc.fileName);
      await this.sftp.writeFile(mapping.conn, mapping.remotePath, Buffer.from(data));
      this.logger.sftp.info(`Synced: ${mapping.remotePath}`);
    } catch (err) {
      this.logger.error(`Failed to sync ${mapping.remotePath}:`, err);
      vscode.window.showErrorMessage(`Failed to sync ${mapping.remotePath}`);
    }
  };

  handleDocumentClose = (doc: vscode.TextDocument): void => {
    const mapping = this.localToRemote.get(doc.fileName);
    if (mapping) {
      this.localToRemote.delete(doc.fileName);
      fs.unlink(doc.fileName, () => {});
    }
  };
}
