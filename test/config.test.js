import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/core/config.js';

test('dùng giá trị mặc định khi env trống', () => {
    const cfg = loadConfig({});
    assert.equal(cfg.env, 'development');
    assert.equal(cfg.port, 3000);
    assert.equal(cfg.logLevel, 'info');
});

test('đọc PORT từ env và ép sang number', () => {
    assert.equal(loadConfig({ PORT: '8080' }).port, 8080);
});

test('PORT không hợp lệ thì throw và nêu tên biến', () => {
    assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT/);
    assert.throws(() => loadConfig({ PORT: '70000' }), /PORT/);
});

test('LOG_LEVEL chỉ nhận debug|info|warn|error', () => {
    assert.throws(() => loadConfig({ LOG_LEVEL: 'loud' }), /LOG_LEVEL/);
});

test('config bị freeze, không sửa được', () => {
    const cfg = loadConfig({});
    assert.ok(Object.isFrozen(cfg));
});