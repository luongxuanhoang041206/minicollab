# M4 Breaks - bài thực hành từng bước

Mục tiêu của file này là để **bạn tự dự đoán, chạy và ghi kết quả**. Đừng đọc
phần kết quả gợi ý trước khi ghi cột dự đoán. Không chạy hai server cùng một
port. Những thay đổi cố ý gây lỗi chỉ được làm trong lab, không sửa code
production để tạo break.

## Trước khi bắt đầu

Mở PowerShell ở thư mục project. Tạo secret chỉ trong phiên terminal hiện tại:

```powershell
$env:AUTH_SECRET = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
$env:AUTH_TOKEN_TTL_SECONDS = "3600"
$env:PORT = "3000"
```

Chạy `npm test` trước. Mỗi lần khởi động server memory store bị làm rỗng; cần
đăng ký lại tài khoản sau mỗi restart. Khi test xong một chế độ, dừng server
bằng Ctrl+C trước khi mở chế độ tiếp theo.

## Break 1 - scrypt async và sync

### Dự đoán (ghi trước khi chạy)

Khi đang gửi nhiều request login, chế độ nào làm `/health` p99 tăng mạnh hơn?
Vì sao? Ghi dự đoán của bạn ở đây:

```text
Dự đoán:
```

### Chạy chế độ async

Terminal A:

```powershell
$env:AUTH_HASH_MODE = "async"
npm start
```

Terminal B, đăng ký tài khoản seed:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/auth/register `
  -ContentType "application/json" `
  -Body '{"email":"a@x.com","password":"correct horse"}'
```

Sau khi seed xong, chạy tải login (Terminal B):

```powershell
npx autocannon -m POST -c 50 -d 20 `
  -H "content-type: application/json" `
  -b '{"email":"a@x.com","password":"correct horse"}' `
  http://localhost:3000/auth/login
```

Trong Terminal C, cùng lúc chạy:

```powershell
npx autocannon -c 10 -d 20 http://localhost:3000/health
```

Ghi login/s, `/health` p99 và `event-loop delay max` từ log server. Dừng
server.

### Chạy chế độ sync

Terminal A:

```powershell
$env:AUTH_HASH_MODE = "sync"
npm start
```

Seed lại tài khoản (server vừa restart nên memory store rỗng), rồi chạy lại
đúng hai lệnh autocannon phía trên, không đổi concurrency/duration.

```text
Kết quả async:
  login/s:
  /health p99:
  event-loop delay max:

Kết quả sync:
  login/s:
  /health p99:
  event-loop delay max:

Giải thích sau khi đo:
```

`sync` chỉ được bật ngoài production. Async scrypt chạy phần tính toán trong
libuv threadpool; sync scrypt chiếm thread JavaScript nên event loop không xử lý
request khác trong lúc băm.

### Đổi kích thước threadpool

Chạy lại chế độ async với mỗi kích thước dưới đây. Mỗi lần phải dừng server cũ,
đặt biến **trước khi** `npm start`, seed user mới và giữ nguyên tải:

```powershell
$env:AUTH_HASH_MODE = "async"
$env:UV_THREADPOOL_SIZE = "1"
npm start
```

Lặp lại với `"4"` và `"16"`. Ghi bảng:

| `UV_THREADPOOL_SIZE` | Login/s | `/health` p99 | Event-loop max |
|---:|---:|---:|---:|
| 1 | | | |
| 4 | | | |
| 16 | | | |

Threadpool dùng chung với một số công việc filesystem, `dns.lookup` và zlib.
Nếu cả worker đều bận scrypt, công việc filesystem có thể nằm chờ. Throughput
thường tăng đến khi CPU/core thành giới hạn rồi phẳng; ghi số đo máy bạn, đừng
điền số dự đoán vào bảng kết quả.

## Break 2 - đăng ký đồng thời và race condition

### Dự đoán

Với **handler ngây thơ** bên dưới, dự đoán 20 request cùng email sẽ có bao
nhiêu status 201:

```js
if (await users.findByEmail(email)) throw duplicate;
const passwordHash = await hasher.hash(password);
await users.create({ email, passwordHash });
```

Ghi dự đoán trước:

```text
Dự đoán số 201:
Vì sao:
```

### Điều cần phân biệt trong thí nghiệm

Store hiện tại đã tự kiểm tra email trùng và ghi liên tục, không có `await`
giữa hai thao tác. Với store an toàn đó, kể cả handler ngây thơ cũng sẽ nhận
được nhiều lỗi duplicate ở `create()` và chỉ có một 201. Đây là một lớp bảo vệ
đúng, không phải thí nghiệm thất bại.

Muốn quan sát race của store, trong **bản lab tạm** hãy làm `create` không an
toàn: đọc map/check email, `await new Promise(resolve =>
setTimeout(resolve, 10))`, rồi mới ghi map. Giữ nguyên handler ngây thơ. Không
đưa store này vào server production hoặc commit. Nhiều request sẽ cùng vượt
qua check trước khi bất kỳ request nào ghi.

Ví dụ store hỏng tối thiểu để thay vào **lab riêng**:

```js
import { randomUUID } from 'node:crypto';
import { DuplicateEmailError } from '../src/storage/memory-users.js';

export function createRaceyUserStore() {
  const users = [];
  return {
    async findByEmail(email) {
      const normalized = email.trim().toLowerCase();
      return users.find((user) => user.email === normalized) ?? null;
    },
    async create({ email, passwordHash }) {
      const normalized = email.trim().toLowerCase();
      if (users.some((user) => user.email === normalized)) {
        throw new DuplicateEmailError(normalized);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      // LỖI CỐ Ý: không kiểm tra lại sau await; mọi request cùng ghi được.
      const user = {
        id: randomUUID(),
        email: normalized,
        passwordHash,
        createdAt: new Date(),
      };
      users.push(user);
      return user;
    },
  };
}
```

Kết quả của lab phụ thuộc scheduler nên ghi số thực tế. Sau thí nghiệm, xóa
hoặc bỏ hoàn toàn store lab này; test đúng phải tiếp tục dùng
[`memory-users.js`](../src/storage/memory-users.js).

### Gửi 20 request một lúc

Khởi động server và dùng email chưa đăng ký trong server hiện tại. Trong
PowerShell có thể chạy đoạn sau:

```powershell
$requests = 1..20 | ForEach-Object {
  Invoke-WebRequest -Method Post `
    -Uri http://localhost:3000/auth/register `
    -ContentType "application/json" `
    -Body '{"email":"race@x.com","password":"password123"}' `
    -SkipHttpErrorCheck
}
$requests.StatusCode
```

Để đảm bảo request thật sự đồng thời, nếu PowerShell client tuần tự hóa chúng,
dùng một file JS lab với `Promise.all(Array.from({length:20}, () => fetch(...)))`.
Chạy một lần với store lab không an toàn, rồi bỏ thay đổi lab và chạy lại với
store đúng.

```text
Kết quả store lab không an toàn: các status là
Kết quả store đúng: 201 = __ ; 409 = __
Giải thích:
```

Nguyên tắc: **kiểm tra và hành động phụ thuộc vào kết quả kiểm tra phải xảy ra
trong một bước không bị ngắt**. Trong một process Node, đoạn đồng bộ từ check
đến write không bị request khác chen vào. Khi chuyển sang Postgres/nhiều
process, ràng buộc `UNIQUE` của database mới là lớp bảo vệ cuối cùng.

## Break 3 - dò email qua thời gian phản hồi

### Dự đoán

Trước khi đo, dự đoán thời gian login sai của email có trong store và không có
trong store:

```text
Dự đoán khi chưa có dummy hash:
Email tồn tại chậm hơn/nhanh hơn vì:

Dự đoán sau khi có dummy hash:
```

### Thực hiện

Tạo `lab/auth-timing.js` (không thêm vào test runner). Script cần:

1. Nhận URL server qua biến hoặc đối số.
2. Gửi 30 request login sai với email đã đăng ký và 30 request với email chưa
   đăng ký.
3. Đo mỗi request bằng `performance.now()` quanh `fetch`.
4. Trộn thứ tự hai nhóm để warm-up không luôn ưu tiên một nhóm.
5. Tính median: sort danh sách ms, lấy phần tử giữa; in median và chênh lệch.
6. Chạy một lượt trước khi thêm dummy hash, rồi một lượt sau khi handler tạo
   một dummy hash và verify nó cho email không tồn tại.

Dùng cùng server, mật khẩu sai, request count và concurrency ở hai lượt. Không
chờ kết quả phải bằng nhau tuyệt đối; xem chênh lệch có còn tương đương thời
gian của một lần scrypt hay không.

| Phiên bản | Median email có | Median email không có | Chênh lệch |
|---|---:|---:|---:|
| Chưa có dummy hash | | | |
| Có dummy hash | | | |

`timingSafeEqual` bảo vệ thao tác so sánh byte khỏi phụ thuộc byte khác nhau.
Nó **không** khiến nhánh email không tồn tại tự chạy scrypt. Dummy hash cân
bằng công việc tốn thời gian giữa hai nhánh.

## Break 4 - thử giả mạo token

### Dự đoán

Với mỗi biến thể dưới đây, ghi status/code bạn dự kiến trước khi gửi request:

| Biến thể | Dự đoán |
|---|---|
| Đổi `sub`, giữ chữ ký cũ | |
| Đổi header thành `alg: none`, bỏ chữ ký | |
| Ký lại bằng secret khác | |
| Token hết hạn | |
| Cắt ngắn chữ ký | |
| Chuỗi token rỗng sau `Bearer ` | |
| `Authorization: Basic abc` | |
| Header Authorization 100 KB | |

### Thực hiện

1. Đăng ký và login để lấy token hợp lệ.
2. Tách token thành `header.payload.signature` bằng `split('.')`.
3. Decode từng phần bằng `Buffer.from(part, 'base64url')`.
4. Tạo từng biến thể trong bảng. Với `sub`, sửa payload nhưng **giữ** chữ ký
   gốc. Với `alg:none`, đổi header và bỏ signature. Với secret khác, ký cùng
   input bằng HMAC secret khác.
5. Gửi `GET /auth/me` với `Authorization: Bearer <token-biến-thể>`.
6. Đối với token hết hạn, dùng `createTokenService({ now })` với đồng hồ giả;
   không sleep/chờ token thật hết hạn.
7. Sau mỗi request lỗi, gọi `/health` để xác nhận server vẫn chạy.

Kết quả cần là 401 (`invalid_token`, trừ expiry là `token_expired`); header
100 KB được từ chối 4xx (thường là 431 ở tầng HTTP) nhưng server còn khỏe.
Chữ ký cắt ngắn không được làm `timingSafeEqual` ném `RangeError`: code phải
so byteLength trước khi so sánh.

```text
Kết quả thực tế và điểm khác dự đoán:
```

## Ghi kết quả

Sau khi tự chạy, chuyển số đo/bài học vào `notes/M4.md` và `bench/M4.md`.
Không ghi secret, bearer token, password hoặc password hash vào tài liệu.
Giữ các store/handler cố ý lỗi trong lab; chạy `npm test` sau khi bỏ chúng để
đảm bảo server đang dùng lại implementation an toàn.
