import * as net from 'net';
import { SSHConnection } from '../core/const';
import type { Ping } from '../core/types';

export class Pinger implements Ping {
  private reachableCache = new Map<string, boolean>();

  private cacheKey(conn: SSHConnection): string {
    return `${conn.host}:${conn.port}`;
  }

  isReachable(conn: SSHConnection): boolean | undefined {
    return this.reachableCache.get(this.cacheKey(conn));
  }

  private tcpCheck(host: string, port: number, timeout = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeout);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, host);
    });
  }

  async pingOfflineHosts(offlineConns: SSHConnection[]): Promise<void> {
    await Promise.allSettled(
      offlineConns.map(async (conn) => {
        const ok = await this.tcpCheck(conn.host, conn.port);
        this.reachableCache.set(this.cacheKey(conn), ok);
      }),
    );
  }
}
