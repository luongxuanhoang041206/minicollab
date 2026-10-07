// src/core/router/trie-engine.js
import { parsePattern, parseRequestPath } from './path.js';

const createNode = () => ({ statics: new Map(), param: null, handlers: new Map() });

export function createTrieEngine() {
  const root = createNode();

  return {
    insert(method, path, handler) {
      const { path: normalized, segments } = parsePattern(path);
      let node = root;
      for (const seg of segments) {
        if (seg.startsWith(':')) {
          const name = seg.slice(1);
          if (node.param === null) node.param = { name, node: createNode() };
          else if (node.param.name !== name) {
            throw new Error(`Route mơ hồ: "${normalized}" dùng ":${name}" nhưng vị trí này đã có ":${node.param.name}"`);
          }
          node = node.param.node;
        } else {
          let next = node.statics.get(seg);
          if (!next) { next = createNode(); node.statics.set(seg, next); }
          node = next;
        }
      }
      if (node.handlers.has(method)) throw new Error(`Route trùng: ${method} ${normalized}`);
      node.handlers.set(method, handler);
    },

    match(method, pathname) {
      const req = parseRequestPath(pathname);
      if (!req.ok) return { type: req.type };

      // Pha 1: tìm node có handler cho đúng method
      const captured = [];                                   // [[name, value], ...]
      const node = find(root, req.segments, 0, captured, (n) => n.handlers.has(method));
      if (node) {
        return { type: 'found', handler: node.handlers.get(method), params: Object.fromEntries(captured) };
      }

      // Pha 2: path có khớp với route nào đó không? Nếu có thì sai method (405), không thì 404
      const allowed = new Set();
      collect(root, req.segments, 0, allowed);
      if (allowed.size > 0) return { type: 'method_not_allowed', allowed: [...allowed].sort() };
      return { type: 'not_found' };
    },

    debugDump: () => dump(root),
  };
}

function dump(node, label = '/', indent = '') {
  const methods = [...node.handlers.keys()].join(',');
  let out = `${indent}${label}${methods ? ` [${methods}]` : ''}\n`;
  for (const [seg, child] of node.statics) out += dump(child, seg, indent + '  ');
  if (node.param) out += dump(node.param.node, `:${node.param.name}`, indent + '  ');
  return out;
}

// find(node, segs, i, captured, accept) → node | null
// Thử nhánh tĩnh trước (chắc chắn hơn), sau đó backtrack sang nhánh param nếu cần.
function find(node, segs, i, captured, accept) {
  // Đã đi hết path – kiểm tra xem node này có chấp nhận không
  if (i === segs.length) {
    return accept(node) ? node : null;
  }

  const seg = segs[i];

  // Bước 3: thử nhánh TĨNH trước
  const staticChild = node.statics.get(seg);
  if (staticChild) {
    const result = find(staticChild, segs, i + 1, captured, accept);
    if (result !== null) return result;
    // Nhánh tĩnh cụt → fall through để backtrack sang param
  }

  // Bước 4: thử nhánh PARAM (backtrack)
  if (node.param !== null) {
    captured.push([node.param.name, seg]);
    const result = find(node.param.node, segs, i + 1, captured, accept);
    if (result !== null) return result;
    captured.pop(); // hoàn tác nếu nhánh param cũng thất bại
  }

  return null;
}

// collect(node, segs, i, allowed) – duyệt MỌI nhánh khớp path, gộp tất cả methods vào allowed
// Khác find: không dừng sớm, phải thử cả hai nhánh để gộp 405 đầy đủ.
function collect(node, segs, i, allowed) {
  if (i === segs.length) {
    // Cuối path: thêm tất cả handlers của node này vào allowed
    for (const method of node.handlers.keys()) allowed.add(method);
    return;
  }

  const seg = segs[i];

  // Thử nhánh tĩnh – KHÔNG return sớm, tiếp tục thử param luôn
  const staticChild = node.statics.get(seg);
  if (staticChild) collect(staticChild, segs, i + 1, allowed);

  // Thử nhánh param song song
  if (node.param !== null) collect(node.param.node, segs, i + 1, allowed);
}