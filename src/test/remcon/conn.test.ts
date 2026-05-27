import * as assert from 'assert';
import { SSHConnection, SSHStatus, OSType } from '../../core/const';
import type { Storage, Credential } from '../../core/types';
import { Conn } from '../../remcon/conn';

class MockStorage implements Storage {
  private list: SSHConnection[] = [];

  getSSHList(): SSHConnection[] {
    return this.list;
  }
  async setSSHList(list: SSHConnection[]): Promise<void> {
    this.list = list;
  }
  async addSSH(conn: SSHConnection): Promise<void> {
    this.list.push(conn);
  }
  async updateSSH(id: string, data: Partial<SSHConnection>): Promise<void> {
    const idx = this.list.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.list[idx] = { ...this.list[idx], ...data };
    }
  }
  async deleteSSH(id: string): Promise<void> {
    this.list = this.list.filter((s) => s.id !== id);
  }
  async clearAllSSH(): Promise<void> {
    this.list = [];
  }
  getCollapseState() {
    return {};
  }
  async setCollapseState() {}
  getStatusKeys() {
    return {};
  }
  async setStatusKeys() {}
}

class MockCredential implements Credential {
  private store = new Map<string, { password: string; passphrase: string }>();

  async storeCredentials(connId: string, password: string, passphrase: string) {
    this.store.set(connId, { password, passphrase });
  }
  async getCredentials(connId: string) {
    return this.store.get(connId) || { password: '', passphrase: '' };
  }
  async deleteCredentials(connId: string) {
    this.store.delete(connId);
  }
}

suite('Conn', () => {
  let storage: MockStorage;
  let credential: MockCredential;
  let conn: Conn;

  setup(() => {
    storage = new MockStorage();
    credential = new MockCredential();
    conn = new Conn(storage, credential);
  });

  test('addSSH creates connection with defaults', async () => {
    const result = await conn.addSSH({
      name: 'test-server',
      host: '192.168.1.1',
      port: 22,
      username: 'root',
    });

    assert.ok(result.id);
    assert.strictEqual(result.name, 'test-server');
    assert.strictEqual(result.host, '192.168.1.1');
    assert.strictEqual(result.port, 22);
    assert.strictEqual(result.username, 'root');
    assert.strictEqual(result.group, 'default');
    assert.strictEqual(result.ostype, OSType.LINUX);
    assert.strictEqual(result.status, SSHStatus.OFFLINE);
    assert.ok(result.createTime > 0);
  });

  test('addSSH stores password and passphrase in credential service', async () => {
    const result = await conn.addSSH({
      name: 'pw-server',
      host: '10.0.0.1',
      port: 22,
      username: 'admin',
      password: 'secret123',
      passphrase: 'pass123',
    });

    const creds = await credential.getCredentials(result.id);
    assert.strictEqual(creds.password, 'secret123');
    assert.strictEqual(creds.passphrase, 'pass123');
  });

  test('addSSH stores secrets as empty strings in storage', async () => {
    const result = await conn.addSSH({
      name: 'pw-server',
      host: '10.0.0.1',
      port: 22,
      username: 'admin',
      password: 'secret123',
    });

    const stored = storage.getSSHList().find((s) => s.id === result.id);
    assert.ok(stored);
    assert.strictEqual(stored.password, '');
    assert.strictEqual(stored.passphrase, '');
  });

  test('getAllSSH returns all connections', async () => {
    await conn.addSSH({ name: 'a', host: '1.1.1.1', port: 22, username: 'u' });
    await conn.addSSH({ name: 'b', host: '2.2.2.2', port: 22, username: 'u' });

    assert.strictEqual(conn.getAllSSH().length, 2);
  });

  test('getOnlineSSH filters by status', async () => {
    const c1 = await conn.addSSH({ name: 'a', host: '1.1.1.1', port: 22, username: 'u' });
    await conn.addSSH({ name: 'b', host: '2.2.2.2', port: 22, username: 'u' });
    await conn.editSSH(c1.id, { status: SSHStatus.ONLINE });

    const online = conn.getOnlineSSH();
    assert.strictEqual(online.length, 1);
    assert.strictEqual(online[0].name, 'a');
  });

  test('getOfflineSSH filters by status', async () => {
    await conn.addSSH({ name: 'a', host: '1.1.1.1', port: 22, username: 'u' });
    const c2 = await conn.addSSH({ name: 'b', host: '2.2.2.2', port: 22, username: 'u' });
    await conn.editSSH(c2.id, { status: SSHStatus.ONLINE });

    const offline = conn.getOfflineSSH();
    assert.strictEqual(offline.length, 1);
    assert.strictEqual(offline[0].name, 'a');
  });

  test('editSSH updates fields', async () => {
    const c = await conn.addSSH({ name: 'old', host: '1.1.1.1', port: 22, username: 'u' });
    await conn.editSSH(c.id, { name: 'new-name', port: 2222 });

    const updated = conn.getAllSSH().find((s) => s.id === c.id);
    assert.ok(updated);
    assert.strictEqual(updated.name, 'new-name');
    assert.strictEqual(updated.port, 2222);
  });

  test('editSSH updates credentials when password changes', async () => {
    const c = await conn.addSSH({ name: 'pw-test', host: '1.1.1.1', port: 22, username: 'u', password: 'oldpw' });
    await conn.editSSH(c.id, { password: 'newpw' });

    const creds = await credential.getCredentials(c.id);
    assert.strictEqual(creds.password, 'newpw');
  });

  test('deleteSSH removes connection and credentials', async () => {
    const c = await conn.addSSH({ name: 'del-me', host: '1.1.1.1', port: 22, username: 'u', password: 'pw' });
    assert.strictEqual(conn.getAllSSH().length, 1);

    await conn.deleteSSH(c.id);
    assert.strictEqual(conn.getAllSSH().length, 0);

    const creds = await credential.getCredentials(c.id);
    assert.strictEqual(creds.password, '');
    assert.strictEqual(creds.passphrase, '');
  });

  test('clearAll removes all connections and credentials', async () => {
    await conn.addSSH({ name: 'a', host: '1.1.1.1', port: 22, username: 'u', password: 'pw1' });
    await conn.addSSH({ name: 'b', host: '2.2.2.2', port: 22, username: 'u', password: 'pw2' });

    await conn.clearAll();
    assert.strictEqual(conn.getAllSSH().length, 0);
  });
});
