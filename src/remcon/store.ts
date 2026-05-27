import * as vscode from 'vscode';
import { CacheKey, SSHConnection, CollapseState, StatusKeys } from '../core/const';
import type { Storage } from '../core/types';

export class Store implements Storage {
  constructor(private context: vscode.ExtensionContext) {}

  private getState<T>(key: string, defaultValue: T): T {
    return this.context.globalState.get<T>(key) ?? defaultValue;
  }

  private setState<T>(key: string, value: T): Thenable<void> {
    return this.context.globalState.update(key, value);
  }

  getSSHList(): SSHConnection[] {
    return this.getState<SSHConnection[]>(CacheKey.SSH_LIST, []);
  }

  async setSSHList(list: SSHConnection[]): Promise<void> {
    await this.setState(CacheKey.SSH_LIST, list);
  }

  async addSSH(conn: SSHConnection): Promise<void> {
    const list = this.getSSHList();
    list.push(conn);
    await this.setSSHList(list);
  }

  async updateSSH(id: string, data: Partial<SSHConnection>): Promise<void> {
    const list = this.getSSHList();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) {
      return;
    }
    list[idx] = { ...list[idx], ...data };
    await this.setSSHList(list);
  }

  async deleteSSH(id: string): Promise<void> {
    const list = this.getSSHList();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) {
      return;
    }
    list.splice(idx, 1);
    await this.setSSHList(list);
  }

  async clearAllSSH(): Promise<void> {
    await this.setState(CacheKey.SSH_LIST, []);
  }

  getCollapseState(): CollapseState {
    return this.getState<CollapseState>(CacheKey.COLLAPSE_STATE, {});
  }

  async setCollapseState(state: CollapseState): Promise<void> {
    await this.setState(CacheKey.COLLAPSE_STATE, state);
  }

  getStatusKeys(): StatusKeys {
    return this.getState<StatusKeys>(CacheKey.STATUS_KEYS, {});
  }

  async setStatusKeys(keys: StatusKeys): Promise<void> {
    await this.setState(CacheKey.STATUS_KEYS, keys);
  }
}
