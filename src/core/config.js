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

    // 7. Return frozen object
    return Object.freeze({
        env: nodeEnv,
        port,
        logLevel,
    });
}
 