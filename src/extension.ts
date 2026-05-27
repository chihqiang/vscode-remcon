import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { LoggerImpl } from './core/log';
import { Store } from './remcon/store';
import { Locale } from './remcon/locale';
import { Creds } from './remcon/credential';
import { Pinger } from './remcon/ping';
import { SSH } from './remcon/ssh';
import { SFTP } from './remcon/sftp';
import { TunnelSvc } from './remcon/tunnel';
import { Conn } from './remcon/conn';
import { AutoRefresher } from './remcon/refresh';
import { HostTree } from './views/hostTree';
import { SftpTree, SftpItem, downloadRemoteFile } from './views/sftpTree';
import { RemoteEdit } from './remcon/remoteedit';
import { SshConfigImporter } from './remcon/sshconfig';
import { Search } from './remcon/search';
import { Batch } from './remcon/batch';
import { Quick } from './remcon/quick';
import { Importer } from './remcon/importer';
import { Key } from './remcon/key';
import { HostFile } from './remcon/hostfile';
import { OSType, Command, SSHStatus, SSHConnection } from './core/const';
import { confirm, input, pick } from './remcon/util';

let extension: Ext;

export function activate(context: vscode.ExtensionContext) {
  extension = new Ext(context);
}

export function deactivate() {
  extension?.deactivate();
}

class Ext {
  private log: LoggerImpl;
  private store: Store;
  private locale: Locale;
  private creds: Creds;
  private pinger: Pinger;
  private ssh: SSH;
  private sftp: SFTP;
  private tunnel: TunnelSvc;
  private conn: Conn;
  private refresh: AutoRefresher;

  private onlineTree: HostTree;
  private offlineTree: HostTree;
  private sftpTree: SftpTree;
  private remoteEdit: RemoteEdit;
  private sshConfig: SshConfigImporter;
  private search: Search;
  private batch: Batch;
  private quick: Quick;
  private importer: Importer;
  private key: Key;
  private hostFile: HostFile;

  private statusBar: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.log = new LoggerImpl(context);
    this.store = new Store(context);
    this.locale = new Locale(context);
    this.creds = new Creds(context.secrets);
    this.pinger = new Pinger();
    this.ssh = new SSH(this.creds, this.log);
    this.sftp = new SFTP(this.creds, this.log);
    this.tunnel = new TunnelSvc(this.ssh, this.log);
    this.conn = new Conn(this.store, this.creds);
    this.refresh = new AutoRefresher(this.conn, this.pinger, this.log);

    this.onlineTree = new HostTree('online', this.conn, this.pinger);
    this.offlineTree = new HostTree('offline', this.conn, this.pinger);
    this.sftpTree = new SftpTree(this.conn, this.sftp, this.log);
    this.remoteEdit = new RemoteEdit(context, this.sftp, this.log);
    this.sshConfig = new SshConfigImporter(this.conn, this.log, this.locale);
    this.search = new Search(this.conn, this.ssh, this.locale, this.log);
    this.batch = new Batch(this.conn, this.ssh, this.locale, this.log);
    this.quick = new Quick(this.conn, this.ssh, this.log);
    this.importer = new Importer(this.conn, this.log);
    this.key = new Key(this.conn, this.sftp, this.log);
    this.hostFile = new HostFile(this.conn, this.log);

    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    this.statusBar.command = Command.SEARCH;

    this.log.info(`Activating extension`, {
      name: context.extension.packageJSON.displayName,
      version: context.extension.packageJSON.version,
      extensionKind: context.extension.extensionKind,
      vscode: vscode.version,
      uiKind: vscode.env.uiKind,
      platform: process.platform,
      arch: process.arch,
    });

    this.log.info(`Locale: ${this.locale.getCurrentLocale()}`);

    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('remcon.online', this.onlineTree),
      vscode.window.registerTreeDataProvider('remcon.offline', this.offlineTree),
      vscode.window.registerTreeDataProvider('remcon.sftp', this.sftpTree),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(Command.REFRESH, () => this.refreshAll()),
      vscode.commands.registerCommand(Command.ONLINE_REFRESH, () => this.onlineTree.refresh()),
      vscode.commands.registerCommand(Command.OFFLINE_REFRESH, () => this.offlineTree.refresh()),
      vscode.commands.registerCommand(Command.RELOAD, () => this.reload()),
      vscode.commands.registerCommand(Command.ADD, () => this.add()),
      vscode.commands.registerCommand(Command.EDIT, (item) => this.edit(item)),
      vscode.commands.registerCommand(Command.DELETE, (item) => this.del(item)),
      vscode.commands.registerCommand(Command.CONNECT_TERMINAL, (item) => this.terminal(item)),
      vscode.commands.registerCommand(Command.DISCONNECT, (item) => this.disconnect(item)),
      vscode.commands.registerCommand(Command.CLEAR_ALL, () => this.clearAll()),
      vscode.commands.registerCommand(Command.ADD_SSH, () => this.add()),
      vscode.commands.registerCommand(Command.TEST_CONNECTION, (item) => this.test(item)),
      vscode.commands.registerCommand(Command.SFTP_REFRESH, () => this.sftpTree.refresh()),
      vscode.commands.registerCommand(Command.SFTP_DOWNLOAD, (item) => this.sftpDownload(item)),
      vscode.commands.registerCommand(Command.SFTP_UPLOAD, (item) => this.sftpUpload(item)),
      vscode.commands.registerCommand(Command.SFTP_UPLOAD_EXPLORER, (uri, selectedUris) => this.sftpUploadExplorer(uri, selectedUris)),
      vscode.commands.registerCommand(Command.SFTP_NEW_FILE, (item) => this.sftpNewFile(item)),
      vscode.commands.registerCommand(Command.SFTP_NEW_FOLDER, (item) => this.sftpNewFolder(item)),
      vscode.commands.registerCommand(Command.SFTP_DELETE, (item) => this.sftpDelete(item)),
      vscode.commands.registerCommand(Command.SFTP_RENAME, (item) => this.sftpRename(item)),
      vscode.commands.registerCommand(Command.SFTP_OPEN, (item) => this.sftpOpen(item)),
      vscode.commands.registerCommand(Command.IMPORT_SSH_CONFIG, () => this.importSshConfig()),
      vscode.commands.registerCommand(Command.SEARCH, () => this.searchDialog()),
      vscode.commands.registerCommand(Command.BATCH, () => this.batchDialog()),
      vscode.commands.registerCommand(Command.TUNNEL_ADD, () => this.tunnelAdd()),
      vscode.commands.registerCommand(Command.TUNNEL_LIST, () => this.tunnelList()),
      vscode.commands.registerCommand(Command.EXPORT, () => this.importer.exportConnections()),
      vscode.commands.registerCommand(Command.IMPORT, () => this.importer.importConnections()),
      vscode.commands.registerCommand(Command.QUICK_CONNECT, () => this.quick.quickConnect()),
      vscode.commands.registerCommand(Command.QUICK_DISCONNECT, () => this.quick.quickDisconnect()),
      vscode.commands.registerCommand(Command.KEY_GENERATE, () => this.key.generateKeyPair()),
      vscode.commands.registerCommand(Command.KEY_DEPLOY, () => this.key.deployPublicKey()),
      vscode.commands.registerCommand(Command.SET_LOCALE, () => this.setLocale()),
      vscode.commands.registerCommand(Command.OPEN_SETTINGS, () => this.openSettings()),
    );

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => this.remoteEdit.handleDocumentSave(doc)),
      vscode.workspace.onDidCloseTextDocument((doc) => this.remoteEdit.handleDocumentClose(doc)),
    );

    this.refresh.start();

    context.subscriptions.push(this.sshConfig.watchSshConfig());

    this.hostFile.import().then((count) => {
      if (count > 0) {
        this.refreshAll();
        this.log.info(`Auto-imported ${count} host(s) from host file`);
      }
    });
    context.subscriptions.push(this.hostFile.startWatch());

    context.subscriptions.push(
      this.ssh.startHealthCheck(
        () => this.conn.getOnlineSSH(),
        async (conn) => {
          this.log.info(`Connection lost: ${conn.name}`);
          this.ssh.disconnect(conn.id);
          await this.conn.editSSH(conn.id, { status: SSHStatus.OFFLINE });
          this.log.notify.warn(`Connection lost: ${conn.name}`);
          this.refreshAll();
        },
      ),
    );

    context.subscriptions.push(this.statusBar);
    this.updateStatus();
  }

  deactivate(): void {
    this.refresh.stop();
    this.log.dispose();
  }

  private updateStatus() {
    const all = this.conn.getAllSSH();
    const online = all.filter((c) => c.status === SSHStatus.ONLINE).length;
    const total = all.length;
    if (total === 0) {
      this.statusBar.text = '$(remote) RemCon';
      this.statusBar.tooltip = 'No connections';
    } else {
      this.statusBar.text = `$(remote) ${online}/${total}`;
      this.statusBar.tooltip = `${online} online, ${total - online} offline`;
    }
    this.statusBar.show();
  }

  private refreshAll() {
    this.onlineTree.refresh();
    this.offlineTree.refresh();
    this.sftpTree.refresh();
    this.updateStatus();
  }

  private reload() {
    vscode.commands.executeCommand('workbench.action.reloadWindow');
  }

  private async add() {
    const name = await input(this.locale.localize('remcon.msg.input.connName'), 'my-server');
    if (!name) {
      return;
    }

    const host = await input(this.locale.localize('remcon.msg.input.host'), '192.168.1.1');
    if (!host) {
      return;
    }

    const portStr = await input(this.locale.localize('remcon.msg.input.port'), '22', '22');
    if (!portStr) {
      return;
    }
    const port = parseInt(portStr) || 22;

    const username = await input(this.locale.localize('remcon.msg.input.user'), 'root');
    if (!username) {
      return;
    }

    const authType = await pick(
      [
        { label: 'password', description: 'Authenticate with password' },
        { label: 'key', description: 'Authenticate with private key' },
      ],
      'Authentication type',
    );
    if (!authType) {
      return;
    }

    let password: string | undefined;
    let privateKey: string | undefined;
    let passphrase: string | undefined;

    if (authType.label === 'password') {
      password = await input(this.locale.localize('remcon.msg.input.password'), undefined, undefined, true);
      if (!password) {
        return;
      }
    } else {
      privateKey = await input(this.locale.localize('remcon.msg.input.privateKey'), '/path/to/id_rsa');
      if (!privateKey) {
        return;
      }
      passphrase = await input(this.locale.localize('remcon.msg.input.passphrase'), undefined, undefined, true);
    }

    try {
      await this.conn.addSSH({ name, host, port, username, password, privateKey, passphrase, ostype: OSType.LINUX });
      this.refreshAll();
      this.log.info(`Connection added: ${name}@${host}:${port}`);
      this.log.notify.info(this.locale.localize('remcon.msg.add.ok', name));
    } catch (err) {
      this.log.error(this.locale.localize('remcon.msg.add.no', name), err);
    }
  }

  private async edit(item: any) {
    if (!item?.connection) {
      this.log.notify.error('No connection selected');
      return;
    }
    const c = item.connection;

    const name = await input(this.locale.localize('remcon.msg.input.connName'), c.name, c.name);
    if (!name) {
      return;
    }

    const host = await input(this.locale.localize('remcon.msg.input.host'), c.host, c.host);
    if (!host) {
      return;
    }

    const portStr = await input(this.locale.localize('remcon.msg.input.port'), String(c.port || 22), String(c.port || 22));
    if (!portStr) {
      return;
    }
    const port = parseInt(portStr) || c.port || 22;

    const username = await input(this.locale.localize('remcon.msg.input.user'), c.username, c.username);
    if (!username) {
      return;
    }

    let password: string | undefined = c.password;
    let privateKey: string | undefined = c.privateKey;
    let passphrase: string | undefined = c.passphrase;

    if (privateKey) {
      privateKey = await input(this.locale.localize('remcon.msg.input.privateKey'), c.privateKey, c.privateKey);
      if (!privateKey) {
        return;
      }
      passphrase = await input(this.locale.localize('remcon.msg.input.passphrase'), undefined, undefined, true);
    } else {
      password = await input(this.locale.localize('remcon.msg.input.password'), undefined, undefined, true);
      if (!password) {
        return;
      }
    }

    try {
      await this.conn.editSSH(c.id, { name, host, port, username, password, privateKey, passphrase });
      this.refreshAll();
      this.log.info(`Connection edited: ${name}@${host}:${port}`);
      this.log.notify.info(this.locale.localize('remcon.msg.save.ok', name));
    } catch (err) {
      this.log.error(`Edit failed: ${name}`, err);
    }
  }

  private async del(item: any) {
    const c = item?.connection;
    if (!c) {
      return;
    }

    const ok = await confirm(this.locale.localize('remcon.msg.delete.confirm', c.name));
    if (!ok) {
      return;
    }

    this.log.connection.info(`Delete connection: ${c.name}`);
    this.ssh.disconnect(c.id);
    await this.conn.deleteSSH(c.id);
    this.refreshAll();
    this.log.notify.info(this.locale.localize('remcon.msg.delete.ok', c.name));
  }

  private async terminal(item: any) {
    const c = item?.connection;
    if (!c) {
      return;
    }

    try {
      this.log.connection.info(`Terminal connect: ${c.name}`);
      await this.ssh.openShellInTerminal(c);
      await this.conn.editSSH(c.id, { status: SSHStatus.ONLINE });
      this.refreshAll();
      this.log.connection.info(`Terminal connected: ${c.name}`);
    } catch (err) {
      this.log.error(`Failed to connect: ${err}`);
      this.log.connection.error(`Terminal connect failed: ${c.name}`, err);
    }
  }

  private async test(item: any) {
    const c = item?.connection;
    if (!c) {
      return;
    }

    try {
      this.log.connection.info(`Test connection: ${c.name}`);
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Testing ${c.name}...` }, () =>
        this.ssh.connect(c),
      );
      await this.conn.editSSH(c.id, { status: SSHStatus.ONLINE });
      this.refreshAll();
      this.log.notify.info(`${c.name}: connection successful`);
      this.log.connection.info(`Test connection OK: ${c.name}`);
    } catch (err) {
      this.log.connection.error(`Test connection failed: ${c.name}`, err);
      this.log.notify.error(`${c.name}: connection failed`);
    }
  }

  private async disconnect(item: any) {
    const c = item?.connection;
    if (!c) {
      return;
    }

    this.log.connection.info(`Disconnect: ${c.name}`);
    this.ssh.disconnect(c.id);
    await this.sftp.closeSFTP(c.id);
    await this.tunnel.closeAllTunnels(c.id);
    vscode.window.terminals.forEach((t) => {
      if (t.name === c.name) {
        t.dispose();
      }
    });
    await this.conn.editSSH(c.id, { status: SSHStatus.OFFLINE });
    this.refreshAll();
    this.log.notify.info(this.locale.localize('remcon.msg.disconnect.ok', c.name));
  }

  private async clearAll() {
    const ok = await confirm(this.locale.localize('remcon.msg.clearAll.confirm'));
    if (!ok) {
      return;
    }

    this.log.info('Clear all connections');
    this.ssh.disconnect('');
    await this.sftp.closeAllSFTP();
    await this.tunnel.closeAllTunnels();
    await this.conn.clearAll();
    this.refreshAll();
    this.log.notify.info(this.locale.localize('remcon.msg.clearAll.ok'));
  }

  private async sftpDownload(item: SftpItem) {
    if (!item) {
      return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders?.length) {
      const remoteRoot = await this.sftpTree.getRootPath(item.conn);
      const relPath = path.posix.relative(remoteRoot, item.remotePath);
      const localTarget = path.join(workspaceFolders[0].uri.fsPath, relPath);

      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Downloading...' }, async () => {
        if (!item.entry || item.contextValue === 'sftpFolder') {
          await this.sftp.downloadDir(item.conn, item.remotePath, localTarget);
        } else {
          fs.mkdirSync(path.dirname(localTarget), { recursive: true });
          await this.sftp.downloadFile(item.conn, item.remotePath, localTarget);
        }
      });
      this.log.notify.info(`Downloaded to ${localTarget}`);
      return;
    }

    if (!item.entry || item.contextValue === 'sftpFolder') {
      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFolders: true,
        title: 'Select local folder to download to',
      });
      if (!uri || uri.length === 0) {
        return;
      }
      const localDir = uri[0].fsPath;
      const localTarget = path.join(localDir, item.entry?.name || path.basename(item.remotePath));

      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Downloading directory...' }, async () => {
        await this.sftp.downloadDir(item.conn, item.remotePath, localTarget);
        this.log.notify.info(`Downloaded to ${localTarget}`);
      });
      return;
    }

    await downloadRemoteFile(item, this.sftp, this.log);
  }

  private async sftpUpload(item: SftpItem) {
    if (!item) {
      return;
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      title: this.locale.localize('remcon.command.sftp.upload'),
    });
    if (!uris || uris.length === 0) {
      return;
    }

    await this.sftpUploadToConn(item.conn, uris, item.remotePath);
    this.sftpTree.refreshItem(item);
  }

  private async sftpUploadExplorer(uri: vscode.Uri, selectedUris?: vscode.Uri[]) {
    const uris = selectedUris && selectedUris.length > 0 ? selectedUris : [uri];
    const onlineConns = this.conn.getOnlineSSH();

    if (onlineConns.length === 0) {
      this.log.notify.warn('No online connections. Connect to a server first.');
      return;
    }

    let conn: SSHConnection;
    if (onlineConns.length === 1) {
      conn = onlineConns[0];
    } else {
      const picked = await vscode.window.showQuickPick(
        onlineConns.map((c) => ({ label: c.name, description: `${c.username}@${c.host}:${c.port}`, conn: c })),
        { placeHolder: 'Select target server', ignoreFocusOut: true },
      );
      if (!picked) {
        return;
      }
      conn = picked.conn;
    }

    const remoteRoot = await this.sftpTree.getRootPath(conn);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    await this.sftpUploadToConn(conn, uris, remoteRoot, workspaceFolder);
  }

  private async sftpUploadToConn(conn: SSHConnection, uris: vscode.Uri[], remoteRoot: string, workspaceFolder?: vscode.WorkspaceFolder) {
    let fileCount = 0;
    for (const uri of uris) {
      const stat = fs.statSync(uri.fsPath);
      const relativePath = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath) : path.basename(uri.fsPath);
      const remoteTarget = path.posix.join(remoteRoot, relativePath.split(path.sep).join(path.posix.sep));
      try {
        if (stat.isDirectory()) {
          await this.sftp.uploadDir(conn, uri.fsPath, remoteTarget);
        } else {
          const parentDir = path.posix.dirname(remoteTarget);
          if (parentDir !== remoteRoot) {
            await this.sftp.createDir(conn, parentDir);
          }
          await this.sftp.uploadFile(conn, uri.fsPath, remoteTarget);
        }
        fileCount++;
      } catch (err) {
        this.log.error(`Upload failed: ${path.basename(uri.fsPath)}`, err);
      }
    }
    this.sftpTree.refresh();
    this.log.notify.info(`Uploaded ${fileCount} item(s) to ${conn.name}`);
  }

  private async sftpNewFile(item: SftpItem) {
    if (!item) {
      return;
    }

    const name = await vscode.window.showInputBox({ prompt: 'File name' });
    if (!name) {
      return;
    }

    const remotePath = path.posix.join(item.remotePath, name);
    try {
      await this.sftp.writeFile(item.conn, remotePath, Buffer.from(''));
      this.sftpTree.refreshItem(item);
      this.log.notify.info(`Created ${name}`);
    } catch (err) {
      this.log.error(`Failed to create file: ${err}`);
    }
  }

  private async sftpNewFolder(item: SftpItem) {
    if (!item) {
      return;
    }

    const name = await vscode.window.showInputBox({ prompt: 'Folder name' });
    if (!name) {
      return;
    }

    const remotePath = path.posix.join(item.remotePath, name);
    try {
      await this.sftp.createDir(item.conn, remotePath);
      this.sftpTree.refreshItem(item);
      this.log.notify.info(`Created folder ${name}`);
    } catch (err) {
      this.log.error(`Failed to create folder: ${err}`);
    }
  }

  private async sftpDelete(item: SftpItem) {
    if (!item || !item.entry) {
      return;
    }

    const ok = await confirm(`Delete ${item.entry.name}?`);
    if (!ok) {
      return;
    }

    try {
      if (item.contextValue === 'sftpFolder') {
        await this.sftp.deleteDir(item.conn, item.remotePath);
      } else {
        await this.sftp.deleteFile(item.conn, item.remotePath);
      }
      this.sftpTree.refresh();
      this.log.notify.info(`Deleted ${item.entry.name}`);
    } catch (err) {
      this.log.error(`Delete failed: ${err}`);
    }
  }

  private async sftpRename(item: SftpItem) {
    if (!item || !item.entry) {
      return;
    }

    const newName = await vscode.window.showInputBox({ prompt: 'New name', value: item.entry.name });
    if (!newName || newName === item.entry.name) {
      return;
    }

    const newPath = path.posix.join(path.dirname(item.remotePath), newName);
    try {
      await this.sftp.rename(item.conn, item.remotePath, newPath);
      this.sftpTree.refresh();
      this.log.notify.info(`Renamed to ${newName}`);
    } catch (err) {
      this.log.error(`Rename failed: ${err}`);
    }
  }

  private async sftpOpen(item: SftpItem) {
    if (!item) {
      return;
    }
    await this.remoteEdit.openRemoteFile(item.conn, item.remotePath);
  }

  private async importSshConfig() {
    const count = await this.sshConfig.importFromSshConfig();
    if (count > 0) {
      this.log.notify.info(`Imported ${count} host(s) from ~/.ssh/config`);
      this.refreshAll();
    }
  }

  private async searchDialog() {
    await this.search.showSearchDialog();
  }

  private async batchDialog() {
    await this.batch.showBatchDialog();
  }

  private async tunnelAdd() {
    const allConns = this.conn.getAllSSH();
    const online = allConns.filter((c) => c.status === SSHStatus.ONLINE);
    if (online.length === 0) {
      this.log.notify.warn('No online connections. Connect to a server first.');
      return;
    }

    const connItem = await vscode.window.showQuickPick(
      online.map((c) => ({ label: c.name, description: `${c.username}@${c.host}:${c.port}`, conn: c })),
      { placeHolder: 'Select connection for port forwarding', ignoreFocusOut: true },
    );
    if (!connItem) {
      return;
    }

    const typeItem = await vscode.window.showQuickPick(
      [
        { label: 'Local (-L)', description: 'Listen locally, forward to remote', type: 'local' as const },
        { label: 'Remote (-R)', description: 'Listen on remote, forward back to local', type: 'remote' as const },
      ],
      { placeHolder: 'Forward type', ignoreFocusOut: true },
    );
    if (!typeItem) {
      return;
    }

    if (typeItem.type === 'local') {
      const localPort = await vscode.window.showInputBox({ prompt: 'Local port', value: '8080', ignoreFocusOut: true });
      if (!localPort) {
        return;
      }
      const remoteHost = await vscode.window.showInputBox({ prompt: 'Remote host', value: 'localhost', ignoreFocusOut: true });
      if (!remoteHost) {
        return;
      }
      const remotePort = await vscode.window.showInputBox({ prompt: 'Remote port', value: '80', ignoreFocusOut: true });
      if (!remotePort) {
        return;
      }

      try {
        await this.tunnel.addLocalForward(connItem.conn, parseInt(localPort), remoteHost, parseInt(remotePort));
        this.log.notify.info(`Local forward active: 127.0.0.1:${localPort} -> ${remoteHost}:${remotePort}`);
      } catch (err) {
        this.log.notify.error(`Forward failed: ${err}`);
        this.log.error('Local forward failed:', err);
      }
    } else {
      const remotePort = await vscode.window.showInputBox({ prompt: 'Remote port', value: '8080', ignoreFocusOut: true });
      if (!remotePort) {
        return;
      }
      const localHost = await vscode.window.showInputBox({ prompt: 'Local host', value: 'localhost', ignoreFocusOut: true });
      if (!localHost) {
        return;
      }
      const localPort = await vscode.window.showInputBox({ prompt: 'Local port', value: '3000', ignoreFocusOut: true });
      if (!localPort) {
        return;
      }

      try {
        await this.tunnel.addRemoteForward(connItem.conn, parseInt(remotePort), localHost, parseInt(localPort));
        this.log.notify.info(`Remote forward active: ${remotePort} -> ${localHost}:${localPort}`);
      } catch (err) {
        this.log.notify.error(`Forward failed: ${err}`);
        this.log.error('Remote forward failed:', err);
      }
    }
  }

  private async tunnelList() {
    const active = this.tunnel.getActiveTunnels();
    if (active.length === 0) {
      this.log.notify.info('No active port forwards');
      return;
    }

    const connMap = new Map(this.conn.getAllSSH().map((c) => [c.id, c]));

    const item = await vscode.window.showQuickPick(
      active.map((t) => ({
        label: `[${t.type.toUpperCase()}] ${t.bindPort} -> ${t.targetHost}:${t.targetPort}`,
        description: connMap.get(t.connId)?.name || t.connId,
        detail: t.type === 'local' ? `127.0.0.1:${t.bindPort}` : `remote:${t.bindPort}`,
        tunnelId: t.id,
        buttons: [{ iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Close tunnel' }],
      })),
      { placeHolder: 'Active tunnels — select to close', ignoreFocusOut: true },
    );
    if (!item) {
      return;
    }

    await this.tunnel.closeTunnel(item.tunnelId);
    this.log.notify.info('Tunnel closed');
  }

  private async setLocale() {
    const current = this.locale.getCurrentLocale();
    const labels: Record<string, string> = { auto: 'Auto (follow VS Code UI)', en: 'English', 'zh-cn': '中文' };
    const items = Object.entries(labels).map(([value, label]) => ({
      label: value === current ? `$(check) ${label}` : label,
      description: value === 'auto' ? `(current: ${current})` : '',
      value,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select display language (requires reload)',
    });
    if (!picked) {
      return;
    }

    await vscode.workspace.getConfiguration('remcon').update('locale', picked.value, vscode.ConfigurationTarget.Global);
    const reload = await this.log.notify.info(`Language set to ${picked.label}. Reload to apply.`, 'Reload Now');
    if (reload === 'Reload Now') {
      vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  }

  private openSettings() {
    vscode.commands.executeCommand('workbench.action.openSettings', 'remcon');
  }
}
