import * as vscode from 'vscode';
import { SSHConnection, SshInput, CollapseState, StatusKeys } from './const';

export interface SftpEntry {
  type: 'd' | '-' | 'l';
  name: string;
  size: number;
  modifyTime: number;
  accessTime: number;
  rights: { user: string; group: string; other: string };
  owner: number;
  group: number;
}

export interface Tunnel {
  id: string;
  connId: string;
  type: 'local' | 'remote';
  bindPort: number;
  targetHost: string;
  targetPort: number;
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  sftp: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  connection: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  tunnel: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  key: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  api: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
  };
  notify: {
    error: (message: string, ...rest: any[]) => Thenable<string | undefined>;
    info: (message: string, ...rest: any[]) => Thenable<string | undefined>;
    warn: (message: string, ...rest: any[]) => Thenable<string | undefined>;
  };
  show(): void;
  clear(): void;
  dispose(): void;
}

export interface Storage {
  getSSHList(): SSHConnection[];
  setSSHList(list: SSHConnection[]): Promise<void>;
  addSSH(conn: SSHConnection): Promise<void>;
  updateSSH(id: string, data: Partial<SSHConnection>): Promise<void>;
  deleteSSH(id: string): Promise<void>;
  clearAllSSH(): Promise<void>;
  getCollapseState(): CollapseState;
  setCollapseState(state: CollapseState): Promise<void>;
  getStatusKeys(): StatusKeys;
  setStatusKeys(keys: StatusKeys): Promise<void>;
}

export interface Localization {
  getCurrentLocale(): string;
  localize(key: string, ...args: string[]): string;
}

export interface Credential {
  storeCredentials(connId: string, password: string, passphrase: string): Promise<void>;
  getCredentials(connId: string): Promise<{ password: string; passphrase: string }>;
  deleteCredentials(connId: string): Promise<void>;
}

export interface Ping {
  isReachable(conn: SSHConnection): boolean | undefined;
  pingOfflineHosts(offlineConns: SSHConnection[]): Promise<void>;
}

export interface SshClient {
  connect(conn: SSHConnection): Promise<any>;
  disconnect(id: string): void;
  isConnected(id: string): boolean;
  openShellInTerminal(conn: SSHConnection): Promise<void>;
  execCommand(conn: SSHConnection, command: string): Promise<{ stdout: string; stderr: string }>;
  startHealthCheck(getOnline: () => SSHConnection[], onDisconnected: (conn: SSHConnection) => void): vscode.Disposable;
}

export interface Sftp {
  isDirectory(entry: SftpEntry): boolean;
  isSymlink(entry: SftpEntry): boolean;
  connect(conn: SSHConnection): Promise<void>;
  closeSFTP(id: string): Promise<void>;
  closeAllSFTP(): Promise<void>;
  listDir(conn: SSHConnection, dirPath: string): Promise<SftpEntry[]>;
  stat(conn: SSHConnection, remotePath: string): Promise<{ size: number }>;
  getHomeDir(conn: SSHConnection): Promise<string>;
  exists(conn: SSHConnection, remotePath: string): Promise<boolean>;
  downloadFile(conn: SSHConnection, remotePath: string, localPath: string): Promise<void>;
  uploadFile(conn: SSHConnection, localPath: string, remotePath: string): Promise<void>;
  writeFile(conn: SSHConnection, remotePath: string, data: Buffer): Promise<void>;
  deleteFile(conn: SSHConnection, remotePath: string): Promise<void>;
  deleteDir(conn: SSHConnection, remotePath: string): Promise<void>;
  createDir(conn: SSHConnection, remotePath: string): Promise<void>;
  rename(conn: SSHConnection, oldPath: string, newPath: string): Promise<void>;
  downloadDir(conn: SSHConnection, remotePath: string, localPath: string): Promise<void>;
  uploadDir(conn: SSHConnection, localPath: string, remotePath: string): Promise<void>;
}

export interface TunnelService {
  getActiveTunnels(): Tunnel[];
  addLocalForward(conn: SSHConnection, localPort: number, remoteHost: string, remotePort: number): Promise<string>;
  addRemoteForward(conn: SSHConnection, remotePort: number, localHost: string, localPort: number): Promise<string>;
  closeTunnel(id: string): Promise<void>;
  closeAllTunnels(connId?: string): Promise<void>;
}

export interface Connection {
  getAllSSH(): SSHConnection[];
  getOnlineSSH(): SSHConnection[];
  getOfflineSSH(): SSHConnection[];
  addSSH(data: SshInput): Promise<SSHConnection>;
  editSSH(id: string, data: Partial<SSHConnection>): Promise<void>;
  deleteSSH(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface AutoRefresh {
  start(): void;
  stop(): void;
}

export interface Services {
  logger: Logger;
  storage: Storage;
  localization: Localization;
  credential: Credential;
  ping: Ping;
  sshClient: SshClient;
  sftp: Sftp;
  tunnel: TunnelService;
  connection: Connection;
  autoRefresh: AutoRefresh;
}
