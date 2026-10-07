import { parsePattern, parseRequestPath, shapeOf } from './path.js';

export function createLinearEngine() {
  const routes = [];   // { method, shape, segments, handler }

  return {
    insert(method, path, handler) {
      const { path: normalized, segments } = parsePattern(path);
      const shape = shapeOf(normalized);
      if (routes.some((r) => r.method === method && r.shape === shape)) {
        throw new Error(`Route trùng hoặc mơ hồ: ${method} ${normalized}`);
      }
      routes.push({ method, shape, segments, handler });
    },

    match(method, pathname) {
      const req = parseRequestPath(pathname);
      if (!req.ok) return { type: req.type };

      const allowed = new Set();
      for (const route of routes) {                      // quét từ đầu đến cuối
        const params = matchSegments(route.segments, req.segments);
        if (params === null) continue;
        if (route.method === method) {
          return { type: 'found', handler: route.handler, params };   // khớp ĐẦU TIÊN thắng
        }
        allowed.add(route.method);
      }
      if (allowed.size > 0) return { type: 'method_not_allowed', allowed: [...allowed].sort() };
      return { type: 'not_found' };
    },
  };
}

function matchSegments(patternSegs, reqSegs) {
  if (patternSegs.length !== reqSegs.length) return null;
  const entries = [];
  for (let i = 0; i < patternSegs.length; i++) {
    const p = patternSegs[i];
    if (p.startsWith(':')) entries.push([p.slice(1), reqSegs[i]]);
    else if (p !== reqSegs[i]) return null;
  }
  return Object.fromEntries(entries);   // an toàn với key '__proto__' (tạo own property)
}