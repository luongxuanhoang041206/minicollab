import { loadConfig } from '../src/core/config.js';
import { createLogger } from '../src/core/logger.js';
import { createApp } from '../src/core/app.js';
import { startEventLoopMonitor } from '../src/core/event-loop-monitor.js';

const config = loadConfig();
const logger = createLogger({
    level: config.logLevel,
    service: 'minicollab',
});

const server = createApp({
    logger,
    limits: { bodyBytes: 1_048_576 },
    timeouts: {
        headersTimeout: 5000,
        requestTimeout: 10000,
        keepAliveTimeout: 5000,
    },
});

startEventLoopMonitor({ logger, intervalMs: 10_000 });

server.listen(config.port, () => {
    logger.info('Server listening', { port: config.port, env: config.env });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false;

async function shutdown(signal) {
    // Guard: chạy duy nhất một lần dù tín hiệu đến nhiều lần
    if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal', { signal });
        return;
    }
    isShuttingDown = true;

    logger.info('Shutdown initiated', { signal });

    // Timer cứng: nếu sau 10 giây vẫn chưa thoát được, kill ngay
    const hardKillTimer = setTimeout(() => {
        logger.error('Graceful shutdown timed out (10s), force closing all connections');
        server.closeAllConnections();
        process.exit(1);
    }, 10_000);

    // unref() để timer này KHÔNG giữ process sống nếu mọi thứ thoát sạch trước đó
    hardKillTimer.unref();

    // Bước 1: Ngừng nhận kết nối mới (server sẽ không accept socket mới)
    logger.info('Closing idle connections...');
    server.closeIdleConnections();

    // Bước 2: Chờ tất cả request đang chạy hoàn tất (server.close callback gọi khi xong)
    logger.info('Waiting for in-flight requests to complete...');
    server.close((err) => {
        if (err) {
            logger.error('Error during server.close()', { message: err.message });
            process.exit(1);
        }
        logger.info('All requests completed. Server shut down cleanly.');
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
