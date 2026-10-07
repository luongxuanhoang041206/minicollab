export function loadConfig(env = process.env) {
    // 1. Lấy NODE_ENV, default development
    const nodeEnv = env.NODE_ENV ?? 'development';

    // 2. Lấy PORT, default 3000
    const rawPort = env.PORT ?? '3000';

    // 3. Convert PORT sang number
    const port = Number(rawPort);

    // 4. Validate PORT
    if (isNaN(port) || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid PORT: ${rawPort}`);
    }

    // 5. Lấy LOG_LEVEL, default info
    const logLevel = env.LOG_LEVEL ?? 'info';

    // 6. Validate LOG_LEVEL
    const VALID_LEVELS = ['debug', 'info', 'warn', 'error'];
    if (!VALID_LEVELS.includes(logLevel)) {
        throw new Error(`Invalid LOG_LEVEL: ${logLevel}`);
    }

    const authSecret = env.AUTH_SECRET;
    if (typeof authSecret !== 'string' || authSecret.trim().length < 32) {
        throw new Error('AUTH_SECRET is required and must be at least 32 characters');
    }

    const rawTokenTtlSeconds = env.AUTH_TOKEN_TTL_SECONDS ?? '3600';
    const tokenTtlSeconds = Number(rawTokenTtlSeconds);
    if (!Number.isSafeInteger(tokenTtlSeconds) || tokenTtlSeconds <= 0) {
        throw new Error('Invalid AUTH_TOKEN_TTL_SECONDS: must be a positive integer');
    }

    const auth = Object.freeze({
        secret: authSecret,
        tokenTtlSeconds,
    });

    return Object.freeze({
        env: nodeEnv,
        port,
        logLevel,
        auth,
    });
}
 