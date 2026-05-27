import * as vscode from 'vscode';
import { NodeType, SSHConnection, SSHStatus } from '../core/const';
import type { Connection, Ping } from '../core/types';

export class HostItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly type: NodeType,
    public readonly connection?: SSHConnection,
    collapsibleState?: vscode.TreeItemCollapsibleState,
    ping?: Ping,
  ) {
    super(label, collapsibleState ?? vscode.TreeItemCollapsibleState.None);

    if (connection) {
      this.description = `${connection.username}@${connection.host}:${connection.port}`;
      this.tooltip = `${connection.name}\n${connection.username}@${connection.host}:${connection.port}`;

      if (connection.status === SSHStatus.ONLINE) {
        this.contextValue = NodeType.ONLINE;
        this.iconPath = new vscode.ThemeIcon('server-environment');
      } else {
        this.contextValue = NodeType.OFFLINE;
        const reachable = ping?.isReachable(connection);
        if (reachable === true) {
          this.iconPath = new vscode.ThemeIcon('remote', new vscode.ThemeColor('testing.iconPassed'));
          this.description += ' ●';
        } else if (reachable === false) {
          this.iconPath = new vscode.ThemeIcon('remote', new vscode.ThemeColor('testing.iconFailed'));
        } else {
          this.iconPath = new vscode.ThemeIcon('remote');
        }
      }
    } else if (type === NodeType.GROUP) {
      this.contextValue = NodeType.GROUP;
      this.iconPath = new vscode.ThemeIcon('group-by-ref-type');
    }
  }
}

export class HostTree implements vscode.TreeDataProvider<HostItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HostItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private type: 'online' | 'offline',
    private connection: Connection,
    private ping: Ping,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: HostItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HostItem): Thenable<HostItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    if (element.type === NodeType.GROUP) {
      const conns = this.getConnections().filter((c) => c.group === element.label);
      return Promise.resolve(conns.map((c) => new HostItem(c.name, NodeType.SSH, c, vscode.TreeItemCollapsibleState.None, this.ping)));
    }
    return Promise.resolve([]);
  }

  private getConnections(): SSHConnection[] {
    return this.type === 'online' ? this.connection.getOnlineSSH() : this.connection.getOfflineSSH();
  }

  private getGroups(): string[] {
    const groups = new Set(this.getConnections().map((c) => c.group || 'default'));
    return Array.from(groups).sort();
  }

  private async getRootItems(): Promise<HostItem[]> {
    const groupMode = vscode.workspace.getConfiguration('remcon').get('groupMode', true);
    if (!groupMode) {
      return this.getConnections().map((c) => new HostItem(c.name, NodeType.SSH, c, vscode.TreeItemCollapsibleState.None, this.ping));
    }

    return this.getGroups().map((g) => new HostItem(g, NodeType.GROUP, undefined, vscode.TreeItemCollapsibleState.Expanded));
  }
}
