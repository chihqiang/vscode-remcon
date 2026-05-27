import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { SSHConnection, SSHStatus, OSType } from '../../core/const';
import type { Connection, Logger } from '../../core/types';
import { HostFile } from '../../remcon/hostfile';

class MockConn implements Connection {
  private list: SSHConnection[] = [];

  getAllSSH() {
    return this.list;
  }
  getOnlineSSH() {
    return this.list.filter((c) => c.status === SSHStatus.ONLINE);
  }
  getOfflineSSH() {
    return this.list.filter((c) => c.status === SSHStatus.OFFLINE);
  }

  async addSSH(data: any): Promise<SSHConnection> {
    const conn: SSHConnection = {
      id: String(this.list.length + 1),
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
    this.list.push(conn);
    return conn;
  }

  async editSSH(id: string, data: Partial<SSHConnection>) {
    const c = this.list.find((s) => s.id === id);
    if (c) {
      Object.assign(c, data);
    }
  }

  async deleteSSH(id: string) {
    this.list = this.list.filter((s) => s.id !== id);
  }
  async clearAll() {
    this.list = [];
  }
}

class MockLogger implements Logger {
  info = (..._args: unknown[]) => {};
  warn = (..._args: unknown[]) => {};
  error = (..._args: unknown[]) => {};
  debug = (..._args: unknown[]) => {};
  sftp = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  connection = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  tunnel = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  key = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  api = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  notify = { error: async (m: string) => m, info: async (m: string) => m, warn: async (m: string) => m };
  show = () => {};
  clear = () => {};
  dispose = () => {};
}

suite('HostFile', () => {
  let conn: MockConn;
  let logger: MockLogger;
  let hostFileDir: string;
  let hostFilePath: string;

  setup(() => {
    conn = new MockConn();
    logger = new MockLogger();
    hostFileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remcon-hostfile-test-'));
    hostFilePath = path.join(hostFileDir, 'hosts.json');
  });

  teardown(() => {
    fs.rmSync(hostFileDir, { recursive: true, force: true });
    vscode.workspace.getConfiguration('remcon.hostfile').update('enabled', undefined, vscode.ConfigurationTarget.Global);
    vscode.workspace.getConfiguration('remcon.hostfile').update('path', undefined, vscode.ConfigurationTarget.Global);
  });

  test('import returns 0 when disabled', async () => {
    await vscode.workspace.getConfiguration('remcon.hostfile').update('enabled', false, vscode.ConfigurationTarget.Global);
    const hf = new HostFile(conn, logger);
    const count = await hf.import();
    assert.strictEqual(count, 0);
  });

  test('import returns 0 when file does not exist', async () => {
    await vscode.workspace.getConfiguration('remcon.hostfile').update('enabled', true, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('remcon.hostfile').update('path', hostFilePath, vscode.ConfigurationTarget.Global);
    const hf = new HostFile(conn, logger);
    const count = await hf.import();
    assert.strictEqual(count, 0);
  });

  test('import parses JSON and adds connections', async () => {
    fs.writeFileSync(
      hostFilePath,
      JSON.stringify([
        { name: 'sv1', host: '10.0.0.1', port: 22, username: 'root' },
        { name: 'sv2', host: '10.0.0.2', port: 2222, username: 'admin', group: 'prod' },
      ]),
    );

    await vscode.workspace.getConfiguration('remcon.hostfile').update('enabled', true, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('remcon.hostfile').update('path', hostFilePath, vscode.ConfigurationTarget.Global);
    const hf = new HostFile(conn, logger);
    const count = await hf.import();
    assert.strictEqual(count, 2);
    assert.strictEqual(conn.getAllSSH().length, 2);
    assert.strictEqual(conn.getAllSSH()[0].name, 'sv1');
    assert.strictEqual(conn.getAllSSH()[1].group, 'prod');
  });

  test('import skips duplicate names', async () => {
    fs.writeFileSync(
      hostFilePath,
      JSON.stringify([
        { name: 'sv1', host: '10.0.0.1', port: 22, username: 'root' },
        { name: 'sv1', host: '10.0.0.2', port: 22, username: 'root' },
      ]),
    );

    await vscode.workspace.getConfiguration('remcon.hostfile').update('enabled', true, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('remcon.hostfile').update('path', hostFilePath, vscode.ConfigurationTarget.Global);
    const hf = new HostFile(conn, logger);
    await hf.import();
    assert.strictEqual(conn.getAllSSH().length, 1);
  });

  test('import skips duplicate host:port', async () => {
    fs.writeFileSync(
      hostFilePath,
      JSON.stringify([
        { name: 'sv1', host: '10.0.0.1', port: 22, username: 'root' },
        { name: 'sv2', host: '10.0.0.1', port: 22, username: 'root' },
      ]),
    );

    await vscode.workspace.getConfiguration('remcon.hostfile').update('enabled', true, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('remcon.hostfile').update('path', hostFilePath, vscode.ConfigurationTarget.Global);
    const hf = new HostFile(conn, logger);
    await hf.import();
    assert.strictEqual(conn.getAllSSH().length, 1);
  });

  test('import handles empty JSON array', async () => {
    fs.writeFileSync(hostFilePath, JSON.stringify([]));
    await vscode.workspace.getConfiguration('remcon.hostfile').update('enabled', true, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('remcon.hostfile').update('path', hostFilePath, vscode.ConfigurationTarget.Global);
    const hf = new HostFile(conn, logger);
    const count = await hf.import();
    assert.strictEqual(count, 0);
  });

  test('import handles invalid JSON gracefully', async () => {
    fs.writeFileSync(hostFilePath, 'not json');
    await vscode.workspace.getConfiguration('remcon.hostfile').update('enabled', true, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('remcon.hostfile').update('path', hostFilePath, vscode.ConfigurationTarget.Global);
    const hf = new HostFile(conn, logger);
    const count = await hf.import();
    assert.strictEqual(count, 0);
  });
});
