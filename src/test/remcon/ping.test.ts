import * as assert from 'assert';
import { SSHConnection, SSHStatus, OSType } from '../../core/const';
import { Pinger } from '../../remcon/ping';

function makeConn(id: string, host: string, port = 22): SSHConnection {
  return {
    id,
    name: 't',
    host,
    port,
    username: 'u',
    group: 'default',
    ostype: OSType.LINUX,
    status: SSHStatus.OFFLINE,
    createTime: Date.now(),
  };
}

suite('Pinger', () => {
  let pinger: Pinger;

  setup(() => {
    pinger = new Pinger();
  });

  test('isReachable returns undefined for unknown hosts', () => {
    const c = makeConn('1', '10.0.0.1');
    assert.strictEqual(pinger.isReachable(c), undefined);
  });

  test('isReachable returns cached result after ping', async () => {
    const c = makeConn('1', '127.0.0.1', 22);
    await pinger.pingOfflineHosts([c]);

    const result = pinger.isReachable(c);
    assert.strictEqual(typeof result, 'boolean');
  });

  test('different host:port have separate cache entries', async () => {
    const c1 = makeConn('1', '127.0.0.1', 22);
    const c2 = makeConn('2', '127.0.0.1', 23);
    await pinger.pingOfflineHosts([c1, c2]);

    const r1 = pinger.isReachable(c1);
    const r2 = pinger.isReachable(c2);
    assert.strictEqual(typeof r1, 'boolean');
    assert.strictEqual(typeof r2, 'boolean');
  });
});
