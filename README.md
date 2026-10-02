# MiniCollab

Nền tảng cộng tác và chia sẻ tài nguyên rút gọn, hiệu năng cao được xây dựng với Node.js ESM thuần túy.

## Mục tiêu Project
Xây dựng một hệ thống backend tinh gọn, mô-đun hóa cao, nắm vững kiến trúc Node.js nội tại (Event Loop, Stream, ESM module cache, Clean Architecture) và thực hành kiểm thử tự động.

## Cách chạy

### Yêu cầu
- Node.js >= 22
- pnpm (hoặc npm)

### Cài đặt & Khởi chạy
```bash
# Chạy ở môi trường phát triển (watch mode)
npm run dev

# Chạy server chính
npm start

# Chạy bộ unit tests
npm test

# Chạy benchmark
npm run bench
```

## Quy ước phát triển
1. **Kiểm thử là ưu tiên hàng đầu**: Test phải được viết trước hoặc cùng lúc với code (TDD / Test-alongside).
2. **Tài liệu theo Milestone**: Mỗi milestone đều có một file ghi chú tương ứng `notes/Mxx.md` để ghi nhận các quyết định kiến trúc, thí nghiệm và bài học rút ra.
3. **Phân tách tầng trách nhiệm**: Tầng hạ tầng/tiện ích lõi (`src/core/`) không được biết bất kỳ logic nghiệp vụ nào của ứng dụng.
