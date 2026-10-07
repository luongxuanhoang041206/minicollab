export function normalizePath(path) {
    if (typeof path != 'string' || !path.startsWith('/')) {
        throw new TypeError(`Path phải bắt đầu bằng "/": ${JSON.stringify(path)}`);
    }

    if(path.length > 1 && path.endsWith('/') && !path.endsWith('//')) {
        return path.slice(0, -1);
    }

    return path;
}

export function splitSegments(path) {
    return path === '/' ? [] : path.slice(1).split('/');
}

// Ghép prefix của group với path con. prefix đã chuẩn hóa ('' nếu là root).
// get('') và get('/') trong group('/api') đều thành '/api'.
export function joinPath(prefix, path) {
  const tail = path === '/' ? '' : path;
  if (tail !== '' && !tail.startsWith('/')) {
    throw new TypeError(`Path con phải bắt đầu bằng "/" hoặc rỗng: ${JSON.stringify(path)}`);
  }
  return normalizePath(prefix + tail || '/');
}

// "/a/:id/b/:x" → "/a/:/b/:" : dùng để phát hiện route trùng cấu trúc
export function shapeOf(path) {
  return path.replace(/:[^/]+/g, ':');
}

// Phân tích pattern lúc ĐĂNG KÝ. Pattern sai thì throw, vì đây là lỗi của lập trình viên.
export function parsePattern(path) {
  const normalized = normalizePath(path);
  const segments = splitSegments(normalized);
  const names = new Set();
  for (const seg of segments) {
    if (seg === '') throw new Error(`Pattern có segment rỗng: "${path}"`);
    if (seg.startsWith(':')) {
      const name = seg.slice(1);
      if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error(`Tên param không hợp lệ "${seg}" trong "${path}"`);
      if (names.has(name)) throw new Error(`Param bị lặp ":${name}" trong "${path}"`);
      names.add(name);
    }
  }
  return { path: normalized, segments };
}

// Phân tích path của REQUEST. Không throw, vì đây là dữ liệu từ bên ngoài.
export function parseRequestPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return { ok: false, type: 'not_found' };
  const raw = splitSegments(normalizePath(pathname));
  const segments = [];
  for (const seg of raw) {
    if (seg === '') return { ok: false, type: 'not_found' };
    try {
      segments.push(decodeURIComponent(seg));   // split TRƯỚC, decode SAU
    } catch {
      return { ok: false, type: 'bad_request' };
    }
  }
  return { ok: true, segments };
}