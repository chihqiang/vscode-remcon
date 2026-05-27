import * as vscode from 'vscode';
import * as os from 'os';
import * as crypto from 'crypto';

export function resolveHome(filePath: string): string {
  return filePath.replace(/^~/, os.homedir());
}

export function genId(): string {
  return crypto.randomUUID();
}

export function copy(content: string) {
  vscode.env.clipboard.writeText(content);
}

export function confirm(placeholder: string): Promise<boolean> {
  return new Promise((resolve) => {
    vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: placeholder }).then((res) => {
      resolve(res === 'Yes');
    });
  });
}

export async function input(prompt: string, placeHolder?: string, value?: string, password?: boolean): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt,
    placeHolder,
    value,
    password,
    ignoreFocusOut: true,
  });
}

export async function pick<T extends vscode.QuickPickItem>(items: T[], placeHolder: string): Promise<T | undefined> {
  return vscode.window.showQuickPick(items, { placeHolder, ignoreFocusOut: true });
}
