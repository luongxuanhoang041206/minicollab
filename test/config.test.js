import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/core/config.js';

const validAuthEnv = {
    AUTH_SECRET: 'test-only-secret-that-is-at-least-32-characters',
};

test('dùng giá trị mặc định khi env trống', () => {
    const cfg = loadConfig(validAuthEnv);
    assert.equal(cfg.env, 'development');
    assert.equal(cfg.port, 3000);
    assert.equal(cfg.logLevel, 'info');
    assert.equal(cfg.auth.secret, validAuthEnv.AUTH_SECRET);
    assert.equal(cfg.auth.tokenTtlSeconds, 3600);
});

test('đọc PORT từ env và ép sang number', () => {
    assert.equal(loadConfig({ ...validAuthEnv, PORT: '8080' }).port, 8080);
});

test('PORT không hợp lệ thì throw và nêu tên biến', () => {
    assert.throws(() => loadConfig({ ...validAuthEnv, PORT: 'abc' }), /PORT/);
    assert.throws(() => loadConfig({ ...validAuthEnv, PORT: '70000' }), /PORT/);
});

test('LOG_LEVEL chỉ nhận debug|info|warn|error', () => {
    assert.throws(() => loadConfig({ ...validAuthEnv, LOG_LEVEL: 'loud' }), /LOG_LEVEL/);
});

test('AUTH_SECRET là bắt buộc và tối thiểu 32 ký tự', () => {
    assert.throws(() => loadConfig({}), /AUTH_SECRET/);
    assert.throws(
        () => loadConfig({ AUTH_SECRET: 'x'.repeat(31) }),
        /AUTH_SECRET/,
    );
    assert.throws(
        () => loadConfig({ AUTH_SECRET: ' '.repeat(32) }),
        /AUTH_SECRET/,
    );
    assert.equal(
        loadConfig({ AUTH_SECRET: 'x'.repeat(32) }).auth.secret,
        'x'.repeat(32),
    );
});

test('AUTH_TOKEN_TTL_SECONDS nhận số nguyên dương', () => {
    assert.equal(
        loadConfig({ ...validAuthEnv, AUTH_TOKEN_TTL_SECONDS: '7200' })
            .auth.tokenTtlSeconds,
        7200,
    );
    for (const value of ['0', '-1', '1.5', 'abc']) {
        assert.throws(
            () =>
                loadConfig({
                    ...validAuthEnv,
                    AUTH_TOKEN_TTL_SECONDS: value,
                }),
            /AUTH_TOKEN_TTL_SECONDS/,
        );
    }
});

test('config và auth bị freeze, không sửa được', () => {
    const cfg = loadConfig(validAuthEnv);
    assert.ok(Object.isFrozen(cfg));
    assert.ok(Object.isFrozen(cfg.auth));
});