import { monitorEventLoopDelay } from 'node:perf_hooks';

export function startEventLoopMonitor({ logger, intervalMs = 5000 }) {
    // 1. Khởi tạo histogram với độ phân giải 10ms
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();

    // 2. Thiết lập chu kỳ ghi log
    const timer = setInterval(() => {
        // Histogram trả về nanoseconds -> chia 1e6 để đổi ra milliseconds
        const p50 = (histogram.percentile(50) / 1e6).toFixed(2);
        const p99 = (histogram.percentile(99) / 1e6).toFixed(2);
        const max = (histogram.max / 1e6).toFixed(2);

        logger.info('event loop delay', {
            p50Ms: Number(p50),
            p99Ms: Number(p99),
            maxMs: Number(max),
        });

        // 3. Reset lại số đo cho chu kỳ tiếp theo
        histogram.reset();
    }, intervalMs);

    // 4. QUAN TRỌNG: unref() để timer không giữ tiến trình sống khi server muốn exit!
    timer.unref();

    // Trả về hàm stop để dọn dẹp khi cần
    return () => {
        clearInterval(timer);
        histogram.disable();
    };
}
