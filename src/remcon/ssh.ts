import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { SSHConnection, getSettings } from '../core/const';
import type { Logger, Credential, SshClient } from '../core/types';

export class SSH implements SshClient {
  private connections = new Map<string, Client>();

  constructor(
    private credential: Credential,
    private logger: Logger,
  ) {}

  private async buildConfig(conn: SSHConnection, password: string, passphrase: string): Promise<ConnectConfig> {
    const s = getSettings();
    const config: ConnectConfig = {
      host: conn.host,
      port: conn.port,
      username: conn.username,
      readyTimeout: s.readyTimeout,
      keepaliveInterval: s.keepaliveInterval,
      keepaliveCountMax: s.keepaliveCountMax,
      tryKeyboard: s.tryKeyboard,
    };

    const authSock = process.env.SSH_AUTH_SOCK;
    if (authSock) {
      config.agentForward = true;
      config.agent = authSock;
    }

    if (password) {
      config.password = password;
    } else if (conn.privateKey) {
      config.privateKey = this.resolveKey(conn.privateKey);
      if (passphrase) {
        config.passphrase = passphrase;
      }
    }
    return config;
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

  private logConnInfo(conn: SSHConnection) {
    this.logger.connection.info(`Connection config: ${conn.name} (${conn.username}@${conn.host}:${conn.port})`);
    this.logger.connection.info(`  Auth: ${conn.privateKey ? 'private key' : conn.password ? 'password' : 'agent'}`);
    if (conn.privateKey) {
      try {
        const stat = fs.statSync(conn.privateKey);
        if (stat.isFile()) {
          this.logger.connection.info(`  Key file: ${conn.privateKey}`);
        }
      } catch {
        this.logger.connection.info(`  Key: (inline content, ${conn.privateKey.length} chars)`);
      }
    }
  }

  connect(conn: SSHConnection): Promise<Client> {
    return new Promise((resolve, reject) => {
      const existing = this.connections.get(conn.id);
      if (existing) {
        resolve(existing);
        return;
      }

      const client = new Client();
      let pwd = '';

      this.credential
        .getCredentials(conn.id)
        .then((secrets) => {
          pwd = secrets.password;

          client.on('ready', () => {
            this.connections.set(conn.id, client);
            this.logger.connection.info(`SSH connected: ${conn.name}`);
            resolve(client);
          });
          client.on('error', (err) => {
            this.logConnInfo(conn);
            this.logger.connection.error(`SSH connection error: ${conn.name}`, err);
            reject(err);
          });
          client.on('close', () => {
            this.connections.delete(conn.id);
            this.logger.connection.info(`SSH disconnected: ${conn.name}`);
          });
          (client as any).on(
            'keyboard-interactive',
            (
              _name: string,
              _instructions: string,
              _lang: string,
              prompts: Array<{ prompt: string; echo: boolean }>,
              finish: (responses: string[]) => void,
            ) => {
              const responses = prompts.map(() => pwd);
              finish(responses);
            },
          );

          return this.buildConfig(conn, secrets.password, secrets.passphrase);
        })
        .then((config) => {
          client.connect(config);
        })
        .catch((err) => {
          this.logConnInfo(conn);
          this.logger.connection.error(`SSH connect failed: ${conn.name}`, err);
          reject(err);
        });
    });
  }

  disconnect(id: string): void {
    const client = this.connections.get(id);
    if (client) {
      client.end();
      this.connections.delete(id);
    }
  }

  isConnected(id: string): boolean {
    return this.connections.has(id);
  }

  openShellInTerminal(conn: SSHConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connect(conn)
        .then((client) => {
          client.shell({ term: 'xterm-256color' }, (err: Error | undefined, stream: ClientChannel) => {
            if (err) {
              reject(err);
              return;
            }

            const writeEmitter = new vscode.EventEmitter<string>();
            const pty: vscode.Pseudoterminal = {
              onDidWrite: writeEmitter.event,
              open: () => {
                stream.on('data', (data: Buffer) => writeEmitter.fire(data.toString()));
                stream.stderr.on('data', (data: Buffer) => writeEmitter.fire(data.toString()));
              },
              close: () => {
                client.end();
                this.connections.delete(conn.id);
              },
              handleInput: (data: string) => stream.write(data),
            };

            const terminal = vscode.window.createTerminal({ name: conn.name, pty });
            terminal.show();
            resolve();
          });
        })
        .catch(reject);
    });
  }

  execCommand(conn: SSHConnection, command: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      this.connect(conn)
        .then((client) => {
          client.exec(command, (err: Error | undefined, stream: ClientChannel) => {
            if (err) {
              reject(err);
              return;
            }
            let stdout = '';
            let stderr = '';
            stream.on('data', (data: Buffer) => {
              stdout += data.toString();
            });
            stream.stderr.on('data', (data: Buffer) => {
              stderr += data.toString();
            });
            stream.on('close', () => resolve({ stdout, stderr }));
          });
        })
        .catch(reject);
    });
  }

  startHealthCheck(getOnline: () => SSHConnection[], onDisconnected: (conn: SSHConnection) => void): vscode.Disposable {
    const timer = setInterval(async () => {
      const online = getOnline();
      for (const conn of online) {
        if (!this.connections.has(conn.id)) {
          onDisconnected(conn);
        }
      }
    }, 30000);

    return new vscode.Disposable(() => clearInterval(timer));
  }
}
