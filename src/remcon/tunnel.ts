import * as net from 'net';
import { Client } from 'ssh2';
import { SSHConnection } from '../core/const';
import type { Logger, SshClient, TunnelService, Tunnel } from '../core/types';

export class TunnelSvc implements TunnelService {
  private tunnels = new Map<string, Tunnel>();
  private servers = new Map<string, net.Server>();
  private remoteHandlers = new Map<string, (info: any, accept: any, reject: any) => void>();

  constructor(
    private sshClient: SshClient,
    private logger: Logger,
  ) {}

  getActiveTunnels(): Tunnel[] {
    return Array.from(this.tunnels.values());
  }

  async addLocalForward(conn: SSHConnection, localPort: number, remoteHost: string, remotePort: number): Promise<string> {
    const client = (await this.sshClient.connect(conn)) as Client;
    const id = `tunnel-${Date.now()}`;

    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        client.forwardOut('127.0.0.1', localPort, remoteHost, remotePort, (err?: Error | undefined, stream?: any) => {
          if (err) {
            socket.destroy();
            return;
          }
          socket.pipe(stream).pipe(socket);
          stream.on('error', () => socket.destroy());
          socket.on('error', () => stream.close());
        });
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.logger.error(`Port ${localPort} is already in use`);
        }
        reject(err);
      });

      server.listen(localPort, '127.0.0.1', () => {
        const tunnel: Tunnel = {
          id,
          connId: conn.id,
          type: 'local',
          bindPort: localPort,
          targetHost: remoteHost,
          targetPort: remotePort,
        };
        this.tunnels.set(id, tunnel);
        this.servers.set(id, server);
        this.logger.info(`Local forward: 127.0.0.1:${localPort} -> ${remoteHost}:${remotePort} [${conn.name}]`);
        resolve(id);
      });
    });
  }

  async addRemoteForward(conn: SSHConnection, remotePort: number, localHost: string, localPort: number): Promise<string> {
    const client = (await this.sshClient.connect(conn)) as Client;
    const id = `tunnel-${Date.now()}`;

    return new Promise((resolve, reject) => {
      (client as Client).forwardIn('0.0.0.0', remotePort, (err?: Error | undefined) => {
        if (err) {
          reject(err);
          return;
        }

        const handler = (_info: { destIP: string; destPort: number; srcIP: string; srcPort: number }, accept: () => any) => {
          const stream = accept();
          const local = net.connect(localPort, localHost);
          stream.pipe(local).pipe(stream);
          local.on('error', () => stream.close());
          stream.on('error', () => local.destroy());
        };

        client.on('tcp connection', handler);

        const tunnel: Tunnel = {
          id,
          connId: conn.id,
          type: 'remote',
          bindPort: remotePort,
          targetHost: localHost,
          targetPort: localPort,
        };
        this.tunnels.set(id, tunnel);
        this.remoteHandlers.set(id, handler);
        this.logger.info(`Remote forward: ${remotePort} -> ${localHost}:${localPort} [${conn.name}]`);
        resolve(id);
      });
    });
  }

  async closeTunnel(id: string): Promise<void> {
    const tunnel = this.tunnels.get(id);
    if (!tunnel) {
      return;
    }

    try {
      if (tunnel.type === 'local') {
        const server = this.servers.get(id);
        if (server) {
          server.close();
          this.servers.delete(id);
        }
      } else {
        const client = (await this.sshClient.connect(tunnel as any)) as Client & {
          unforwardIn?(port: number, callback: (err?: Error) => void): void;
        };
        if (client.unforwardIn) {
          client.unforwardIn(tunnel.bindPort, () => {});
        }
        const handler = this.remoteHandlers.get(id);
        if (handler) {
          client.off('tcp connection', handler);
          this.remoteHandlers.delete(id);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to close tunnel: ${err}`);
    }

    this.tunnels.delete(id);
    this.logger.info(`Tunnel closed [${tunnel.type}:${tunnel.bindPort}]`);
  }

  async closeAllTunnels(connId?: string): Promise<void> {
    const ids = Array.from(this.tunnels.keys()).filter((id) => {
      return !connId || this.tunnels.get(id)?.connId === connId;
    });
    await Promise.allSettled(ids.map((id) => this.closeTunnel(id)));
  }
}
