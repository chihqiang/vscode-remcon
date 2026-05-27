import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SSHStatus } from '../core/const';
import type { Connection, Sftp, Logger } from '../core/types';

export class Key {
  constructor(
    private connection: Connection,
    private sftp: Sftp,
    private logger: Logger,
  ) {}

  generateKeyPair = async () => {
    const typeItem = await vscode.window.showQuickPick(
      [
        { label: 'ED25519 (recommended)', description: 'Faster, better security', type: 'ed25519' },
        { label: 'RSA-4096', description: 'Widely compatible', type: 'rsa' },
      ],
      { placeHolder: 'Select key type', ignoreFocusOut: true },
    );
    if (!typeItem) {
      return;
    }

    const filePath = await vscode.window.showInputBox({
      prompt: 'Save private key as',
      value: path.join(os.homedir(), '.ssh', 'id_ed25519'),
      ignoreFocusOut: true,
    });
    if (!filePath) {
      return;
    }

    try {
      let privateKey: crypto.KeyObject;
      let publicKey: crypto.KeyObject;
      if (typeItem.type === 'ed25519') {
        const pair = crypto.generateKeyPairSync('ed25519', {});
        privateKey = pair.privateKey;
        publicKey = pair.publicKey;
      } else {
        const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 4096 });
        privateKey = pair.privateKey;
        publicKey = pair.publicKey;
      }

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
      fs.writeFileSync(`${filePath}.pub`, publicKey.export({ type: 'spki', format: 'pem' }));

      this.logger.notify.info(`Key pair generated: ${filePath}`);
      this.logger.key.info(`Generated ${typeItem.type} key pair: ${filePath}`);
    } catch (err) {
      this.logger.notify.error(`Key generation failed: ${err}`);
      this.logger.key.error('Key generation failed', err);
    }
  };

  deployPublicKey = async () => {
    const allConns = this.connection.getAllSSH();
    const online = allConns.filter((c) => c.status === SSHStatus.ONLINE);

    if (online.length === 0) {
      this.logger.notify.warn('No online connections. Connect to a server first.');
      return;
    }

    const picked = await vscode.window.showQuickPick(
      online.map((c) => ({
        label: c.name,
        description: `${c.username}@${c.host}:${c.port}`,
        conn: c,
      })),
      { placeHolder: 'Select target server', ignoreFocusOut: true },
    );
    if (!picked) {
      return;
    }

    const pubKeyPath = await vscode.window.showInputBox({
      prompt: 'Public key path',
      value: path.join(os.homedir(), '.ssh', 'id_ed25519.pub'),
      ignoreFocusOut: true,
    });
    if (!pubKeyPath) {
      return;
    }

    try {
      const pubKey = fs.readFileSync(pubKeyPath, 'utf-8').trim();

      const home = `/home/${picked.conn.username}`;
      const sshDir = path.posix.join(home, '.ssh');
      const authKeys = path.posix.join(sshDir, 'authorized_keys');

      try {
        await this.sftp.stat(picked.conn, sshDir);
      } catch {
        await this.sftp.createDir(picked.conn, sshDir);
      }

      let existing = '';
      try {
        const tmpLocal = path.join(os.tmpdir(), `authorized_keys_${Date.now()}`);
        await this.sftp.downloadFile(picked.conn, authKeys, tmpLocal);
        existing = fs.readFileSync(tmpLocal, 'utf-8');
        fs.unlinkSync(tmpLocal);
      } catch {
        /* file may not exist */
      }

      if (existing.includes(pubKey)) {
        this.logger.notify.info('Public key already deployed');
        return;
      }

      const newContent = existing ? `${existing}\n${pubKey}\n` : `${pubKey}\n`;
      await this.sftp.writeFile(picked.conn, authKeys, Buffer.from(newContent));

      this.logger.notify.info(`Public key deployed to ${picked.conn.name}`);
      this.logger.key.info(`Deployed public key to ${picked.conn.name}`);
    } catch (err) {
      this.logger.notify.error(`Deploy failed: ${err}`);
      this.logger.key.error('Deploy failed', err);
    }
  };
}
