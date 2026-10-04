import net from 'node:net';

const client = net.connect({ port: 3000, host: 'localhost' }, () => {
    console.log('[+] Đã kết nối TCP. Bắt đầu gửi partial header...');
    client.write('GET /health HTTP/1.1\r\nHost: localhost\r\n');

    // Mỗi 1 giây nhỏ giọt thêm 1 header
    let count = 0;
    const interval = setInterval(() => {
        count++;
        console.log(`[+] Gửi header nhỏ giọt lần ${count}`);
        client.write(`X-Drip-${count}: foo\r\n`);
    }, 1000);

    client.on('close', () => {
        clearInterval(interval);
        console.log('[-] Socket đã bị đóng bởi server!');
    });
});

client.on('data', (data) => {
    console.log('[Server phản hồi]:', data.toString());
});
