import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/core/logger.js';

function setup(level = 'info') {
    const lines = [];
    const log = createLogger({
        level,
        service: 'test',
        write: (l) => lines.push(JSON.parse(l)),
        now: () => new Date('2026-01-01T00:00:00Z'),
    });
    return { log, lines };
}

test('ghi 1 dòng JSON có ts, level, service, msg', () => {
    const { log, lines } = setup();
    log.info('hello', { a: 1 });
    assert.deepEqual(lines[0], {
        ts: '2026-01-01T00:00:00.000Z', level: 'info', service: 'test', msg: 'hello', a: 1,
    });
});

test('bỏ qua log dưới mức level', () => {
    const { log, lines } = setup('warn');
    log.debug('test debug');
    log.info('test info');
    assert.equal(lines.length, 0);
    log.warn('test warn');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].level, 'warn');
});

test('child() gắn field vào mọi dòng', () => {
    const { log, lines } = setup();
    const childLog = log.child({ reqId: '123' });
    childLog.info('hello child');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].reqId, '123');
    assert.equal(lines[0].msg, 'hello child');
});

test('child() không làm thay đổi logger cha', () => {
    const { log, lines } = setup();
    log.child({ reqId: '123' });
    log.info('hello parent');
    assert.equal(lines.length, 1);
    assert.equal(lines[0].reqId, undefined);
    assert.equal(lines[0].msg, 'hello parent');
});