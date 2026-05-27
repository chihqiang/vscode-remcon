import * as path from 'path';
import * as fs from 'fs';
import SftpClient from 'ssh2-sftp-client';
import { ConnectConfig } from 'ssh2';
import { SSHConnection, getSettings } from '../core/const';
import type { Logger, Credential, Sftp, SftpEntry } from '../core/types';

export class SFTP implements Sftp {
  private clients = new Map<string, SftpClient>();

  constructor(
    private credential: Credential,
    private logger: Logger,
  ) {}

  isDirectory(entry: SftpEntry): boolean {
    return entry.type === 'd';
  }

  isSymlink(entry: SftpEntry): boolean {
    return entry.type === 'l';
  }

  private resolveKey(key: string): string {
    try {
      const stat = fs.statSync(key);
      if (stat.isFile()) {
        return fs.readFileSync(key, 'utf-8');
      }
    } catch {}
    return key;
  }

  private async buildConfig(conn: SSHConnection, secrets: { password: string; passphrase: string }): Promise<ConnectConfig> {
    const settings = getSettings();
    const config: ConnectConfig = {
      host: conn.host,
      port: conn.port,
      username: conn.username,
      readyTimeout: settings.readyTimeout,
      keepaliveInterval: settings.keepaliveInterval,
      keepaliveCountMax: settings.keepaliveCountMax,
    };

    if (conn.privateKey) {
      config.privateKey = this.resolveKey(conn.privateKey);
      if (secrets.passphrase) {
        config.passphrase = secrets.passphrase;
      }
    } else if (secrets.password) {
      config.password = secrets.password;
    }

    return config;
  }

  async connect(conn: SSHConnection): Promise<void> {
    const existing = this.clients.get(conn.id);
    if (existing) {
      return;
    }

    const secrets = await this.credential.getCredentials(conn.id);
    const config = await this.buildConfig(conn, secrets);
    const client = new SftpClient();

    try {
      await client.connect(config);
      this.clients.set(conn.id, client);
      this.logger.sftp.info(`SFTP connected: ${conn.name}`);
    } catch (err) {
      this.logger.sftp.error(`SFTP connect failed: ${conn.name}`, err);
      throw err;
    }
  }

  async closeSFTP(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (client) {
      try {
        client.end();
      } catch {}
      this.clients.delete(id);
    }
  }

  async closeAllSFTP(): Promise<void> {
    await Promise.allSettled(Array.from(this.clients.keys()).map((id) => this.closeSFTP(id)));
  }

  private async getClient(conn: SSHConnection): Promise<SftpClient> {
    await this.connect(conn);
    return this.clients.get(conn.id)!;
  }

  async listDir(conn: SSHConnection, dirPath: string): Promise<SftpEntry[]> {
    const client = await this.getClient(conn);
    return client.list(dirPath) as unknown as SftpEntry[];
  }

  async stat(conn: SSHConnection, remotePath: string): Promise<{ size: number }> {
    const client = await this.getClient(conn);
    return client.stat(remotePath);
  }

  async getHomeDir(conn: SSHConnection): Promise<string> {
    const client = await this.getClient(conn);
    const home = await client.realPath('.');
    this.logger.sftp.debug(`Home dir for ${conn.name}: ${home}`);
    return home;
  }

  async exists(conn: SSHConnection, remotePath: string): Promise<boolean> {
    const client = await this.getClient(conn);
    try {
      const result = (await client.exists(remotePath)) !== false;
      this.logger.sftp.debug(`Exists check "${remotePath}" for ${conn.name}: ${result}`);
      return result;
    } catch (err) {
      this.logger.sftp.debug(`Exists check "${remotePath}" for ${conn.name} failed: ${err}`);
      return false;
    }
  }

  async downloadFile(conn: SSHConnection, remotePath: string, localPath: string): Promise<void> {
    const client = await this.getClient(conn);
    await client.fastGet(remotePath, localPath);
    this.logger.sftp.info(`[${conn.name}] Downloaded: ${remotePath} -> ${localPath}`);
  }

  async uploadFile(conn: SSHConnection, localPath: string, remotePath: string): Promise<void> {
    const client = await this.getClient(conn);
    await client.fastPut(localPath, remotePath);
    this.logger.sftp.info(`[${conn.name}] Uploaded: ${localPath} -> ${remotePath}`);
  }

  async uploadDir(conn: SSHConnection, localPath: string, remotePath: string): Promise<void> {
    const client = await this.getClient(conn);
    await client.uploadDir(localPath, remotePath);
    this.logger.sftp.info(`[${conn.name}] Uploaded dir: ${localPath} -> ${remotePath}`);
  }

  async writeFile(conn: SSHConnection, remotePath: string, data: Buffer): Promise<void> {
    const client = await this.getClient(conn);
    await client.put(data, remotePath);
  }

  async deleteFile(conn: SSHConnection, remotePath: string): Promise<void> {
    const client = await this.getClient(conn);
    await client.delete(remotePath);
  }

  async deleteDir(conn: SSHConnection, remotePath: string): Promise<void> {
    const client = await this.getClient(conn);
    await client.rmdir(remotePath, true);
  }

  async createDir(conn: SSHConnection, remotePath: string): Promise<void> {
    const client = await this.getClient(conn);
    await client.mkdir(remotePath, true);
  }

  async rename(conn: SSHConnection, oldPath: string, newPath: string): Promise<void> {
    const client = await this.getClient(conn);
    await client.rename(oldPath, newPath);
  }

  async downloadDir(conn: SSHConnection, remotePath: string, localPath: string): Promise<void> {
    const client = await this.getClient(conn);
    const entries = (await client.list(remotePath)) as unknown as SftpEntry[];

    fs.mkdirSync(localPath, { recursive: true });

    for (const entry of entries) {
      const remote = path.posix.join(remotePath, entry.name);
      const local = path.join(localPath, entry.name);

      if (entry.type === 'd') {
        await this.downloadDir(conn, remote, local);
      } else {
        await client.fastGet(remote, local);
      }
    }
  }
}
