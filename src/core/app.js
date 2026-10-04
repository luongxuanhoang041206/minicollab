import http from 'node:http';
import { sendJson } from './response.js';

export function createApp({
    logger,
    limits = {
        bodyBytes: 1_048_576
    },
    timeouts = {}
} = {}) {
    async function handleRequest(req, res) {
        const start = Date.now();

        // Gắn Access Log (đo thời gian và nghe event 'close')
        res.on('close', () => {
            const durationMs = Date.now() - start;
            logger.info('request completed', {
                method: req.method,
                url: req.url,
                status: res.statusCode,
                durationMs
            });
        });

        try {
            // Parse URL an toàn (xử lý đúng query string và encoding)
            const parseUrl = new URL(req.url, 'http://localhost');
            const pathname = parseUrl.pathname;
            const searchParams = parseUrl.searchParams;

            // ─── Routes ───────────────────────────────────────────────────────

            if (pathname === '/health') {
                if (req.method !== 'GET') {
                    res.setHeader('Allow', 'GET');
                    sendJson(res, 405, { error: 'method_not_allowed' });
                    return;
                }
                sendJson(res, 200, { status: 'ok' });
                return;

            } else if (pathname === '/echo') {
                const limit = limits.bodyBytes;

                // Phòng thủ vòng ngoài: từ chối ngay nếu Content-Length đã khai báo quá lớn
                const declaredLength = Number(req.headers['content-length']);
                if (declaredLength && declaredLength > limit) {
                    res.setHeader('Connection', 'close');
                    sendJson(res, 413, { error: 'payload_too_large', limit });
                    req.resume();
                    return;
                }

                if (req.method !== 'POST') {
                    res.setHeader('Allow', 'POST');
                    sendJson(res, 405, { error: 'method_not_allowed' });
                    return;
                }

                // Phòng thủ vòng trong: đếm byte trong lúc nhận stream
                const chunks = [];
                let receivedBytes = 0;

                for await (const chunk of req) {
                    receivedBytes += chunk.length;
                    if (receivedBytes > limit) {
                        res.setHeader('Connection', 'close');
                        sendJson(res, 413, { error: 'payload_too_large', limit });
                        req.resume(); // xả bỏ phần còn lại, không lưu vào RAM
                        return;
                    }
                    chunks.push(chunk);
                }

                const body = Buffer.concat(chunks);
                const contentType = req.headers['content-type'] || 'application/octet-stream';
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Content-Length': body.length,
                    'X-Powered-By': 'MiniCollab'
                });
                res.end(body);
                return;

            // ─── Lab routes (TẠM THỜI – sẽ xóa sau khi có router ở M2) ───────
            } else if (pathname === '/slow' && req.method === 'GET') {
                // LAB: mô phỏng request chậm. Dùng ở bài shutdown và timeout.
                const ms = Number(searchParams.get('ms')) || 1000;
                await new Promise((resolve) => setTimeout(resolve, ms));
                sendJson(res, 200, { status: 'slow done', ms });
                return;

            } else if (pathname === '/block' && req.method === 'GET') {
                // LAB: busy-wait chặn Event Loop. Dùng ở bài event loop blocking.
                const ms = Number(searchParams.get('ms')) || 1000;
                const end = Date.now() + ms;
                while (Date.now() < end) { }
                sendJson(res, 200, { status: 'block done', ms });
                return;

            } else if (pathname === '/boom') {
                // LAB: cố tình throw để test handler 500.
                throw new Error('Test boom 500 error');

            } else {
                sendJson(res, 404, { error: 'Not Found' });
                return;
            }

        } catch (err) {
            // Log đầy đủ server-side, KHÔNG lộ stack trace ra client
            logger.error('Unhandled server error', {
                message: err.message,
                stack: err.stack,
            });
            if (!res.headersSent) {
                sendJson(res, 500, { error: 'Internal Server Error' });
            }
        }
    }

    const server = http.createServer(handleRequest);

    // Cấu hình timeouts bảo vệ chống Slowloris và request treo
    if (timeouts.headersTimeout)  server.headersTimeout  = timeouts.headersTimeout;
    if (timeouts.requestTimeout)  server.requestTimeout  = timeouts.requestTimeout;
    if (timeouts.keepAliveTimeout) server.keepAliveTimeout = timeouts.keepAliveTimeout;

    server.on('clientError', (err, socket) => {
        logger.warn('Client HTTP parse error', { error: err.message });
        if (socket.writable) {
            socket.end('HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n400 Bad Request\r\n');
        } else {
            socket.destroy(err);
        }
    });

    return server;
}