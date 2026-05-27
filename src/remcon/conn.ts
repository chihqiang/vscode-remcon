import { SSHConnection, SshInput, SSHStatus, OSType } from '../core/const';
import { genId } from './util';
import type { Storage, Credential, Connection } from '../core/types';

export class Conn implements Connection {
  constructor(
    private storage: Storage,
    private credential: Credential,
  ) {}

  getAllSSH(): SSHConnection[] {
    return this.storage.getSSHList();
  }

  getOnlineSSH(): SSHConnection[] {
    return this.storage.getSSHList().filter((s) => s.status === SSHStatus.ONLINE);
  }

  getOfflineSSH(): SSHConnection[] {
    return this.storage.getSSHList().filter((s) => s.status === SSHStatus.OFFLINE);
  }

  private stripSecrets(data: Partial<SSHConnection>): Partial<SSHConnection> {
    return { ...data, password: '', passphrase: '' };
  }

  async addSSH(data: SshInput): Promise<SSHConnection> {
    const conn: SSHConnection = {
      id: genId(),
      name: data.name,
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password || '',
      privateKey: data.privateKey || '',
      passphrase: data.passphrase || '',
      group: data.group || 'default',
      ostype: data.ostype ?? OSType.LINUX,
      status: SSHStatus.OFFLINE,
      createTime: Date.now(),
    };

    await this.storage.addSSH(this.stripSecrets(conn) as SSHConnection);
    if (data.password || data.passphrase) {
      await this.credential.storeCredentials(conn.id, data.password || '', data.passphrase || '');
    }
    return conn;
  }

  async editSSH(id: string, data: Partial<SSHConnection>): Promise<void> {
    await this.storage.updateSSH(id, this.stripSecrets(data));
    if (data.password !== undefined || data.passphrase !== undefined) {
      await this.credential.storeCredentials(id, data.password || '', data.passphrase || '');
    }
  }

  async deleteSSH(id: string): Promise<void> {
    await this.storage.deleteSSH(id);
    await this.credential.deleteCredentials(id);
  }

  async clearAll(): Promise<void> {
    const all = this.storage.getSSHList();
    await Promise.all(all.map((c) => this.credential.deleteCredentials(c.id)));
    await this.storage.clearAllSSH();
  }
}
