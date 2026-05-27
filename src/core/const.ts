import * as vscode from 'vscode';

export const VSCODE_NAME = 'vscode-remcon';

export enum NodeType {
  GROUP = 'group',
  SSH = 'ssh',
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export enum SSHStatus {
  ONLINE = 0,
  OFFLINE = 1,
}

export enum OSType {
  LINUX = 0,
  WINDOWS = 1,
  DARWIN = 2,
}

export const enum CacheKey {
  SSH_LIST = 'remcon.ssh.list',
  COLLAPSE_STATE = 'remcon.collapseState',
  STATUS_KEYS = 'remcon.status.keys',
}

export const enum Command {
  REFRESH = 'remcon.refresh',
  ONLINE_REFRESH = 'remcon.online.refresh',
  OFFLINE_REFRESH = 'remcon.offline.refresh',
  ADD_SSH = 'remcon.add.ssh',
  RELOAD = 'remcon.reload',
  ADD = 'remcon.add',
  EDIT = 'remcon.edit',
  DELETE = 'remcon.delete',
  CONNECT_TERMINAL = 'remcon.connect.terminal',
  DISCONNECT = 'remcon.disconnect',
  CLEAR_ALL = 'remcon.clearAll',
  TEST_CONNECTION = 'remcon.testConnection',
  SFTP_REFRESH = 'remcon.sftp.refresh',
  SFTP_DOWNLOAD = 'remcon.sftp.download',
  SFTP_UPLOAD = 'remcon.sftp.upload',
  SFTP_UPLOAD_EXPLORER = 'remcon.sftp.uploadExplorer',
  SFTP_NEW_FILE = 'remcon.sftp.newFile',
  SFTP_NEW_FOLDER = 'remcon.sftp.newFolder',
  SFTP_DELETE = 'remcon.sftp.delete',
  SFTP_RENAME = 'remcon.sftp.rename',
  SFTP_OPEN = 'remcon.sftp.open',
  IMPORT_SSH_CONFIG = 'remcon.import.sshConfig',
  SEARCH = 'remcon.search',
  BATCH = 'remcon.batch',
  TUNNEL_ADD = 'remcon.tunnel.add',
  TUNNEL_LIST = 'remcon.tunnel.list',
  EXPORT = 'remcon.export',
  IMPORT = 'remcon.import',
  QUICK_CONNECT = 'remcon.quickConnect',
  QUICK_DISCONNECT = 'remcon.quickDisconnect',
  KEY_GENERATE = 'remcon.key.generate',
  KEY_DEPLOY = 'remcon.key.deploy',
  SET_LOCALE = 'remcon.setLocale',
  OPEN_SETTINGS = 'remcon.openSettings',
}

export interface SshInput {
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  group?: string;
  ostype?: OSType;
}

export interface SSHConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  group?: string;
  ostype: OSType;
  status: SSHStatus;
  createTime: number;
}

export interface CollapseState {
  [key: string]: boolean;
}

export interface StatusKeys {
  [key: string]: string;
}

export interface Settings {
  pingHostTime: number;
  refreshNodeTime: number;
  showHiddenFiles: boolean;
  openFileMaxSize: number;
  readyTimeout: number;
  keepaliveInterval: number;
  keepaliveCountMax: number;
  tryKeyboard: boolean;
}

export function getSettings(): Settings {
  const config = vscode.workspace.getConfiguration('remcon.default');
  return {
    pingHostTime: config.get<number>('pingHostTime', 30),
    refreshNodeTime: config.get<number>('refreshNodeTime', 30),
    showHiddenFiles: config.get<boolean>('showHiddenFiles', false),
    openFileMaxSize: config.get<number>('openFileMaxSize', 10),
    readyTimeout: config.get<number>('readyTimeout', 10000),
    keepaliveInterval: config.get<number>('keepaliveInterval', 30000),
    keepaliveCountMax: config.get<number>('keepaliveCountMax', 3),
    tryKeyboard: config.get<boolean>('tryKeyboard', true),
  };
}
