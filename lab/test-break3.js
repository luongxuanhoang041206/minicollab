async function run() {
  console.log('[1] Gửi request /block?ms=3000 vào server...');
  const blockPromise = fetch('http://localhost:3000/block?ms=3000').then(r => r.json());

  // Chờ 200ms để request /block chắc chắn đã vào Call Stack của server
  await new Promise(r => setTimeout(r, 200));

  console.log('[2] Ngay lập tức gửi request /health để đo thời gian phản hồi...');
  const start = performance.now();
  const healthRes = await fetch('http://localhost:3000/health');
  const healthData = await healthRes.json();
  const duration = (performance.now() - start).toFixed(2);

  console.log(`[3] /health phản hồi:`, healthData);
  console.log(`[4] Thời gian chờ của /health: ${duration} ms (dù /health chỉ là hàm trả về text tĩnh!)`);

  const blockData = await blockPromise;
  console.log(`[5] /block hoàn thành:`, blockData);
}

run();
