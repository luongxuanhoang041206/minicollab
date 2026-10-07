// src/routes.js — tất cả route handlers và đăng ký route
import { sendJson } from './core/response.js';
import { requireAuth } from './middleware/authenticate.js';

// ─── Handlers ────────────────────────────────────────────────────────────────

async function healthHandler(ctx) {
  sendJson(ctx.res, 200, { status: 'ok' });
}

async function echoHandler(ctx) {
  const { req, res } = ctx;
  const contentType = req.headers['content-type'] || 'application/octet-stream';

  if (contentType.toLowerCase().startsWith('application/json')) {
    ctx.json(200, ctx.body);
    return;
  }

  // Phòng thủ vòng ngoài: từ chối ngay nếu Content-Length đã khai báo quá lớn
  const limit = ctx.bodyLimit ?? 1_048_576;
  const declaredLength = Number(req.headers['content-length'] ?? 0);
  if (declaredLength && declaredLength > limit) {
    res.setHeader('Connection', 'close');
    sendJson(res, 413, { error: 'payload_too_large', limit });
    req.resume();
    return;
  }

  // Phòng thủ vòng trong: đếm byte trong lúc nhận stream
  const chunks = [];
  let receivedBytes = 0;
  let exceededLimit = false;

  for await (const chunk of req) {
    receivedBytes += chunk.length;
    if (receivedBytes > limit) {
      exceededLimit = true;
      chunks.length = 0;
      continue;
    }
    if (!exceededLimit) chunks.push(chunk);
  }

  if (exceededLimit) {
    sendJson(res, 413, { error: 'payload_too_large', limit });
    return;
  }

  const body = Buffer.concat(chunks);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.length,
    'X-Powered-By': 'MiniCollab',
  });
  res.end(body);
}

// ─── Lab handlers (chỉ chạy ngoài production) ────────────────────────────────

async function slowHandler(ctx) {
  const ms = Number(ctx.query.ms) || 1000;
  await new Promise((resolve) => setTimeout(resolve, ms));
  sendJson(ctx.res, 200, { status: 'slow done', ms });
}

function blockHandler(ctx) {
  const ms = Number(ctx.query.ms) || 1000;
  const end = Date.now() + ms;
  while (Date.now() < end) {}
  sendJson(ctx.res, 200, { status: 'block done', ms });
}

function boomHandler() {
  throw new Error('Test boom 500 error');
}

function callbackThrowHandler(ctx) {
  setTimeout(() => {
    throw new Error('Test callback throw');
  }, 0);
  sendJson(ctx.res, 200, { status: 'callback scheduled' });
}

// ─── Registrar ────────────────────────────────────────────────────────────────

export function registerRoutes(router, { config, limits = {}, auth } = {}) {
  router.get('/health', healthHandler);
  router.post('/echo', (ctx) => {
    ctx.limits = limits;
    return echoHandler(ctx);
  });

  if (config.env !== 'production') {
    router.group('/_lab', (g) => {
      g.get('/slow', slowHandler);
      g.get('/block', blockHandler);
      g.get('/boom', boomHandler);
      g.get('/callback-throw', callbackThrowHandler);
    });
  }

  if (auth) {
    router.group('/auth', (g) => {
      g.post('/register', auth.register);
      g.post('/login', auth.login);
      g.get('/me', requireAuth(auth.me));
    });
  }
}
