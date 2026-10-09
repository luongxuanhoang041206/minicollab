import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compose } from '../src/core/pipeline.js';

const scriptPath = fileURLToPath(import.meta.url);
const childMode = process.argv[2];

const logPrediction = (number, prediction) => {
  console.log(`\n[Break #${number}] Dự đoán trước khi chạy: ${prediction}`);
};

async function runBreak1() {
  const ctx = { responseEnded: false };
  let downstreamRan = false;
  const forgetful = async (ctx) => {
    // Cố ý không gọi next() và cũng không kết thúc response.
  };
  const response = async (ctx) => {
    downstreamRan = true;
    ctx.responseEnded = true;
  };

  await compose([forgetful, response])(ctx);

  assert.equal(downstreamRan, false);
  assert.equal(ctx.responseEnded, false);
  console.log(
    '[Quan sát] compose đã resolve, nhưng middleware sau không chạy và response chưa kết thúc.',
  );
  console.log(
    '[Kết luận] Trong app HTTP, client vẫn chờ. compose không thể xem đây là lỗi vì middleware được phép short-circuit hợp lệ; app cần luật pipeline hoàn tất nhưng res chưa kết thúc (chặng 7).',
  );
}

async function runBreak2Child() {
  const sloppy = async (ctx, next) => {
    next(); // Cố ý bỏ await: rejection của Promise này bị bỏ rơi.
    ctx.after = 'chạy quá sớm';
    console.log(`[child] sloppy tiếp tục: ${ctx.after}`);
  };
  const failingMiddleware = async () => {
    throw new Error('lỗi từ middleware phía sau');
  };

  await compose([sloppy, failingMiddleware])({});
  console.log('[child] compose resolve');
}

async function runBreak3Child() {
  const errorHandler = async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      console.error('[errorHandler] bắt được:', error.message);
      throw error;
    }
  };
  const callbackStyle = async (ctx, next) => {
    setTimeout(() => {
      throw new Error('trong callback');
    }, 0);
    await next();
  };

  process.on('uncaughtException', (error) => {
    console.error('[child] uncaughtException:', error.message);
    process.exitCode = 1;
  });

  await compose([errorHandler, callbackStyle])({});
  console.log('[child] pipeline đã resolve trước khi callback chạy');
}

function runChild(mode, expectedDiagnostic) {
  const result = spawnSync(
    process.execPath,
    ['--unhandled-rejections=strict', scriptPath, mode],
    { encoding: 'utf8' },
  );

  if (result.error) {
    throw result.error;
  }

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.notEqual(result.status, 0, `${mode} phải kết thúc với lỗi`);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    expectedDiagnostic,
    `${mode} phải tạo ra lỗi như dự đoán`,
  );
  console.log(`[runner] Tiến trình con kết thúc với mã ${result.status}, đúng dự đoán.`);
}

if (childMode === '--break-2') {
  await runBreak2Child();
} else if (childMode === '--break-3') {
  await runBreak3Child();
} else if (childMode) {
  throw new Error(`Chế độ không hợp lệ: ${childMode}`);
} else {
  logPrediction(
    1,
    'compose sẽ resolve mà không chạy middleware sau; response giả lập vẫn chưa kết thúc.',
  );
  await runBreak1();

  logPrediction(
    2,
    'sloppy chạy tiếp ngay; lỗi phía sau trở thành unhandled rejection và tiến trình con bị kết thúc.',
  );
  runChild('--break-2', /lỗi từ middleware phía sau/);
  console.log(
    '[Kết luận] compose không thể tự thêm await vào lời gọi next() của middleware; phải test và đọc code.',
  );

  logPrediction(
    3,
    'errorHandler không bắt lỗi throw trong setTimeout; lỗi xuất hiện dưới dạng uncaughtException.',
  );
  runChild('--break-3', /uncaughtException: trong callback/);
  console.log(
    '[Kết luận] try/catch quanh await next() đã rời call stack trước khi callback chạy; xử lý uncaughtException ở chặng 8.',
  );
}