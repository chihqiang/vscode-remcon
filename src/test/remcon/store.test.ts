import * as assert from 'assert';
import { SSHConnection, SSHStatus, OSType } from '../../core/const';
import { Store } from '../../remcon/store';

function createMockContext(): any {
  const state = new Map<string, any>();
  return {
    globalState: {
      get: (key: string, defaultValue?: any) => state.get(key) ?? defaultValue,
      update: async (key: string, value: any) => {
        state.set(key, value);
      },
    },
    subscriptions: [],
  };
}

function makeConn(id: string, name: string): SSHConnection {
  return {
    id,
    name,
    host: '1.1.1.1',
    port: 22,
    username: 'u',
    group: 'default',
    ostype: OSType.LINUX,
    status: SSHStatus.OFFLINE,
    createTime: Date.now(),
  };
}

suite('Store', () => {
  let context: any;
  let store: Store;

  setup(() => {
    context = createMockContext();
    store = new Store(context);
  });

  test('getSSHList returns empty list initially', () => {
    assert.deepStrictEqual(store.getSSHList(), []);
  });

  test('addSSH appends connection', async () => {
    const c = makeConn('1', 'test');
    await store.addSSH(c);
    assert.strictEqual(store.getSSHList().length, 1);
    assert.strictEqual(store.getSSHList()[0].name, 'test');
  });

  test('setSSHList replaces all connections', async () => {
    await store.addSSH(makeConn('1', 'a'));
    await store.setSSHList([makeConn('2', 'b'), makeConn('3', 'c')]);
    assert.strictEqual(store.getSSHList().length, 2);
  });

  test('updateSSH modifies existing connection', async () => {
    await store.addSSH(makeConn('1', 'old'));
    await store.updateSSH('1', { name: 'new', port: 2222 });

    const updated = store.getSSHList().find((s) => s.id === '1');
    assert.ok(updated);
    assert.strictEqual(updated.name, 'new');
    assert.strictEqual(updated.port, 2222);
  });

  test('updateSSH does nothing for unknown id', async () => {
    await store.addSSH(makeConn('1', 'a'));
    await store.updateSSH('nonexistent', { name: 'x' });
    assert.strictEqual(store.getSSHList().length, 1);
  });

  test('deleteSSH removes by id', async () => {
    await store.addSSH(makeConn('1', 'a'));
    await store.addSSH(makeConn('2', 'b'));
    await store.deleteSSH('1');
    assert.strictEqual(store.getSSHList().length, 1);
    assert.strictEqual(store.getSSHList()[0].id, '2');
  });

  test('clearAllSSH removes all', async () => {
    await store.addSSH(makeConn('1', 'a'));
    await store.addSSH(makeConn('2', 'b'));
    await store.clearAllSSH();
    assert.strictEqual(store.getSSHList().length, 0);
  });

  test('getCollapseState returns empty object initially', () => {
    assert.deepStrictEqual(store.getCollapseState(), {});
  });

  test('setCollapseState persists state', async () => {
    await store.setCollapseState({ key1: true, key2: false });
    assert.deepStrictEqual(store.getCollapseState(), { key1: true, key2: false });
  });

  test('getStatusKeys returns empty object initially', () => {
    assert.deepStrictEqual(store.getStatusKeys(), {});
  });

  test('setStatusKeys persists keys', async () => {
    await store.setStatusKeys({ conn1: 'online', conn2: 'offline' });
    assert.strictEqual(store.getStatusKeys().conn1, 'online');
  });
});
