import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { Locale } from '../../remcon/locale';

function createMockContext(extensionPath: string): vscode.ExtensionContext {
  return {
    extensionPath,
    extensionUri: vscode.Uri.file(extensionPath),
    subscriptions: [],
    workspaceState: { get: () => undefined, update: async () => {} } as any,
    globalState: { get: () => undefined, update: async () => {} } as any,
    secrets: { get: async () => undefined, store: async () => {}, delete: async () => {} } as any,
    storageUri: undefined,
    globalStorageUri: vscode.Uri.file(path.join(extensionPath, 'global-storage')),
    logUri: vscode.Uri.file(path.join(extensionPath, 'logs')),
    extensionMode: vscode.ExtensionMode.Test,
    environmentVariableCollection: {
      get: () => undefined,
      replace: () => {},
      append: () => {},
      prepend: () => {},
      forEach: () => {},
      clear: () => {},
      persistent: false,
    } as any,
    asAbsolutePath: (p: string) => path.join(extensionPath, p),
    storagePath: undefined,
    globalStoragePath: path.join(extensionPath, 'global-storage'),
    logPath: path.join(extensionPath, 'logs'),
  } as any;
}

suite('Locale', () => {
  let tmpDir: string;
  let context: vscode.ExtensionContext;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remcon-test-'));
    const enPath = path.join(tmpDir, 'package.nls.json');
    const zhPath = path.join(tmpDir, 'package.nls.zh-cn.json');
    fs.writeFileSync(enPath, JSON.stringify({ key1: 'Hello {0}', key2: 'Test' }));
    fs.writeFileSync(zhPath, JSON.stringify({ key1: '你好 {0}' }));
    context = createMockContext(tmpDir);
    delete process.env.VSCODE_NLS_CONFIG;
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.VSCODE_NLS_CONFIG;
  });

  test('getCurrentLocale returns en by default', () => {
    const locale = new Locale(context);
    assert.strictEqual(locale.getCurrentLocale(), 'en');
  });

  test('getCurrentLocale reads from VSCODE_NLS_CONFIG', () => {
    process.env.VSCODE_NLS_CONFIG = JSON.stringify({ locale: 'zh-cn' });
    const locale = new Locale(context);
    assert.strictEqual(locale.getCurrentLocale(), 'zh-cn');
    delete process.env.VSCODE_NLS_CONFIG;
  });

  test('localize returns value from bundle', () => {
    const locale = new Locale(context);
    assert.strictEqual(locale.localize('key2'), 'Test');
  });

  test('localize formats arguments', () => {
    const locale = new Locale(context);
    assert.strictEqual(locale.localize('key1', 'World'), 'Hello World');
  });

  test('localize uses zh-cn bundle when locale is set', () => {
    process.env.VSCODE_NLS_CONFIG = JSON.stringify({ locale: 'zh-cn' });
    const locale = new Locale(context);
    assert.strictEqual(locale.localize('key1', '世界'), '你好 世界');
    delete process.env.VSCODE_NLS_CONFIG;
  });

  test('localize returns key when missing from bundle', () => {
    const locale = new Locale(context);
    assert.strictEqual(locale.localize('nonexistent.key'), 'nonexistent.key');
  });
});
