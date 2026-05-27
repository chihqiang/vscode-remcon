import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SSHConnection, SSHStatus } from '../core/const';
import type { Connection, Sftp, Logger, SftpEntry } from '../core/types';

export class SftpItem extends vscode.TreeItem {
  constructor(
    public readonly conn: SSHConnection,
    public readonly remotePath: string,
    public readonly entry?: SftpEntry,
    collapsibleState?: vscode.TreeItemCollapsibleState,
    sftp?: Sftp,
  ) {
    const label = entry?.name || path.basename(remotePath) || conn.name;
    super(label, collapsibleState ?? vscode.TreeItemCollapsibleState.None);

    if (!entry) {
      this.description = `${conn.username}@${conn.host}:${conn.port}`;
      this.iconPath = new vscode.ThemeIcon('server');
      this.contextValue = 'sftpRoot';
    } else if (sftp?.isSymlink(entry)) {
      this.iconPath = new vscode.ThemeIcon('link');
      this.contextValue = 'sftpLink';
    } else if (sftp?.isDirectory(entry)) {
      this.iconPath = new vscode.ThemeIcon('folder');
      this.contextValue = 'sftpFolder';
    } else {
      this.iconPath = new vscode.ThemeIcon('file');
      this.contextValue = 'sftpFile';
      this.command = {
        command: 'remcon.sftp.open',
        title: 'Open File',
        arguments: [this],
      };
    }

    this.tooltip = entry
      ? `${entry.name}\nSize: ${fmtSize(entry.size)}\nModified: ${new Date(entry.modifyTime).toLocaleString()}`
      : `${conn.name} (SFTP)`;
  }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export class SftpTree implements vscode.TreeDataProvider<SftpItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SftpItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private expandedPaths = new Map<string, Set<string>>();
  private remconConfig: Record<string, string> | null | undefined;

  constructor(
    private connection: Connection,
    private sftp: Sftp,
    private logger: Logger,
  ) {}

  refresh(): void {
    this.remconConfig = undefined;
    this._onDidChangeTreeData.fire(undefined);
  }

  refreshItem(item: SftpItem): void {
    this._onDidChangeTreeData.fire(item);
  }

  getTreeItem(element: SftpItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SftpItem): Promise<SftpItem[]> {
    if (!element) {
      return this.getRootItems();
    }

    if (!element.entry || this.sftp.isDirectory(element.entry)) {
      return this.listDirItems(element.conn, element.remotePath);
    }
    return [];
  }

  private loadRemconConfig(): Record<string, string> | null {
    if (this.remconConfig !== undefined) {
      return this.remconConfig;
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
      this.logger.sftp.debug('No workspace folders, skip remcon.json');
      this.remconConfig = null;
      return null;
    }
    const configPath = path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'remcon.json');
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      this.remconConfig = JSON.parse(raw) as Record<string, string>;
      this.logger.sftp.debug(`Loaded remcon.json with ${Object.keys(this.remconConfig).length} entries`);
    } catch {
      this.logger.sftp.debug(`No remcon.json found at ${configPath}`);
      this.remconConfig = null;
    }
    return this.remconConfig;
  }

  async getRootPath(c: SSHConnection): Promise<string> {
    const config = this.loadRemconConfig();
    if (config) {
      const configuredDir = config[c.name];
      if (configuredDir) {
        this.logger.sftp.debug(`Checking configured dir "${configuredDir}" for "${c.name}"`);
        const exists = await this.sftp.exists(c, configuredDir);
        if (exists) {
          this.logger.sftp.debug(`Using configured dir "${configuredDir}" for "${c.name}"`);
          return configuredDir;
        }
        this.logger.sftp.warn(`Configured dir "${configuredDir}" for "${c.name}" not found on remote, fallback to home`);
      }
    }
    const home = await this.sftp.getHomeDir(c);
    this.logger.sftp.debug(`Using home dir "${home}" for "${c.name}"`);
    return home;
  }

  private async getRootItems(): Promise<SftpItem[]> {
    const allConns = this.connection.getAllSSH();
    const sshOnline = allConns.filter((c) => c.status === SSHStatus.ONLINE);
    const sftpOpen = Array.from(this.expandedPaths.keys());

    const items = await Promise.all(
      sshOnline.map(async (c) => {
        const rootPath = await this.getRootPath(c);
        const isOpen = sftpOpen.includes(c.id);
        return new SftpItem(
          c,
          rootPath,
          undefined,
          isOpen ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
        );
      }),
    );

    return items;
  }

  private async listDirItems(conn: SSHConnection, dirPath: string): Promise<SftpItem[]> {
    if (!this.expandedPaths.has(conn.id)) {
      this.expandedPaths.set(conn.id, new Set());
    }
    this.expandedPaths.get(conn.id)!.add(dirPath);

    try {
      const entries = await this.sftp.listDir(conn, dirPath);
      return entries.map((e) => {
        const isDir = this.sftp.isDirectory(e);
        return new SftpItem(
          conn,
          path.posix.join(dirPath, e.name),
          e,
          isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
          this.sftp,
        );
      });
    } catch (err) {
      this.logger.sftp.error(`Failed to list ${dirPath}`, err);
      return [];
    }
  }
}

export async function downloadRemoteFile(item: SftpItem, sftp: Sftp, logger: Logger) {
  if (!item.entry || sftp.isDirectory(item.entry)) {
    return;
  }

  const defaultName = item.entry.name;
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const defaultUri = workspaceFolders?.length
    ? vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, defaultName))
    : vscode.Uri.file(defaultName);

  const uri = await vscode.window.showSaveDialog({ defaultUri });
  if (!uri) {
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Downloading ${item.entry.name}...` },
    async () => {
      await sftp.downloadFile(item.conn, item.remotePath, uri.fsPath);
      logger.notify.info(`Downloaded ${item.entry!.name}`);
    },
  );
}
