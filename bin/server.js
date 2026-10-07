import { loadConfig } from '../src/core/config.js';
import { createLogger } from '../src/core/logger.js';
import { createApp } from '../src/core/app.js';
import { createRouter } from '../src/core/router/index.js';
import { registerRoutes } from '../src/routes.js';
import { startEventLoopMonitor } from '../src/core/event-loop-monitor.js';
import { accessLog } from '../src/middleware/access-log.js';
import { bodyParser } from '../src/middleware/body-parser.js';
import { cors } from '../src/middleware/cors.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { requestId } from '../src/middleware/request-id.js';
import { routerMiddleware } from '../src/middleware/router.js';

const config = loadConfig();
const logger = createLogger({
    level: config.logLevel,
    service: 'minicollab',
});

const limits = { bodyBytes: 1_048_576 };
const router = createRouter();
registerRoutes(router, { config, limits });

const server = createApp({
    logger,
    middleware: [
        errorHandler(),
        requestId,
        accessLog(),
        cors({ origins: ['http://localhost:5173'] }),
        bodyParser({ limit: limits.bodyBytes }),
        routerMiddleware(router),
    ],
    timeouts: {
        headersTimeout: 5000,
        requestTimeout: 10000,
        keepAliveTimeout: 5000,
    },
});

const stopEventLoopMonitor = startEventLoopMonitor({ logger, intervalMs: 10_000 });

server.listen(config.port, () => {
    logger.info('Server listening', { port: config.port, env: config.env });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false;
let shutdownExitCode = 0;

async function shutdown(signal, exitCode = 0) {
    shutdownExitCode = Math.max(shutdownExitCode, exitCode);
    // Guard: chạy duy nhất một lần dù tín hiệu đến nhiều lần
    if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal', { signal });
        return;
    }
    isShuttingDown = true;

    logger.info('Shutdown initiated', { signal });
    stopEventLoopMonitor();

    // Timer cứng: nếu sau 10 giây vẫn chưa thoát được, kill ngay
    const hardKillTimer = setTimeout(() => {
        logger.error('Graceful shutdown timed out (10s), force closing all connections');
        server.closeAllConnections();
        process.exit(shutdownExitCode || 1);
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
            process.exit(shutdownExitCode || 1);
        }
        logger.info('All requests completed. Server shut down.');
        process.exit(shutdownExitCode);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
    logger.error('fatal', {
        event: 'unhandledRejection',
        err: String(reason?.stack ?? reason),
    });
    void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
    logger.error('fatal', {
        event: 'uncaughtException',
        err: String(err?.stack ?? err),
    });
    void shutdown('uncaughtException', 1);
});
