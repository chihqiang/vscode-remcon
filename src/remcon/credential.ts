import * as vscode from 'vscode';
import type { Credential } from '../core/types';

export class Creds implements Credential {
  constructor(private secrets: vscode.SecretStorage) {}

  async storeCredentials(connId: string, password: string, passphrase: string): Promise<void> {
    if (password) {
      await this.secrets.store(`remcon.pwd.${connId}`, password);
    } else {
      try {
        await this.secrets.delete(`remcon.pwd.${connId}`);
      } catch {}
    }
    if (passphrase) {
      await this.secrets.store(`remcon.pph.${connId}`, passphrase);
    } else {
      try {
        await this.secrets.delete(`remcon.pph.${connId}`);
      } catch {}
    }
  }

  async getCredentials(connId: string): Promise<{ password: string; passphrase: string }> {
    const [password, passphrase] = await Promise.all([this.secrets.get(`remcon.pwd.${connId}`), this.secrets.get(`remcon.pph.${connId}`)]);
    return { password: password || '', passphrase: passphrase || '' };
  }

  async deleteCredentials(connId: string): Promise<void> {
    await Promise.allSettled([this.secrets.delete(`remcon.pwd.${connId}`), this.secrets.delete(`remcon.pph.${connId}`)]);
  }
}
