import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { Localization } from '../core/types';

export class Locale implements Localization {
  private bundle: Record<string, string> = {};
  private currentLocale = 'en';

  constructor(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('remcon');
    let locale = config.get<string>('locale', 'auto');

    if (locale === 'auto') {
      const nlsConfig = process.env.VSCODE_NLS_CONFIG || '{}';
      try {
        const parsed = JSON.parse(nlsConfig);
        locale = parsed.locale || 'en';
      } catch {
        locale = 'en';
      }
    }

    this.currentLocale = locale;

    const extDir = context.extensionPath;
    const defaultPath = path.join(extDir, 'package.nls.json');
    const langPath = path.join(extDir, `package.nls.${locale}.json`);

    try {
      const defaultBundle = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));
      let langBundle: Record<string, string> = {};
      if (fs.existsSync(langPath) && langPath !== defaultPath) {
        langBundle = JSON.parse(fs.readFileSync(langPath, 'utf-8'));
      }
      this.bundle = { ...defaultBundle, ...langBundle };
    } catch {
      /* ignore */
    }
  }

  getCurrentLocale(): string {
    return this.currentLocale;
  }

  private format(message: string, args: string[]): string {
    return args.length ? message.replace(/\{(\d+)\}/g, (_, rest) => args[parseInt(rest)] || '') : message;
  }

  localize(key: string, ...args: string[]): string {
    const message = this.bundle[key] || key;
    return this.format(message, args);
  }
}
