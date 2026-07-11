// 结构化日志
import pino from 'pino';

// 生产模式或无 TTY（launchd 后台）时不使用 pino-pretty，减少 CPU 开销
const isDev = process.env.NODE_ENV !== 'production' && process.stdout.isTTY;

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'info' : 'warn'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export const logStream = {
  // 用于 SSE 日志推送
  buffer: [] as { time: string; level: string; msg: string }[],
  max: 200,
  push(entry: { time: string; level: string; msg: string }) {
    this.buffer.push(entry);
    if (this.buffer.length > this.max) this.buffer.shift();
    emit(entry);
  },
  list() {
    return [...this.buffer];
  },
};

const subscribers = new Set<(e: { time: string; level: string; msg: string }) => void>();

function emit(entry: { time: string; level: string; msg: string }) {
  for (const sub of subscribers) {
    try {
      sub(entry);
    } catch {
      /* ignore */
    }
  }
}

export function subscribeLogs(cb: (e: { time: string; level: string; msg: string }) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
