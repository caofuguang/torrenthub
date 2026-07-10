// 并发控制工具 - 限制同时执行的异步任务数量，避免 20 客户端同时请求压垮下游

/**
 * 并发执行 mapper，限制同时运行的 Promise 数量。
 * @param items 输入数组
 * @param mapper 映射函数
 * @param concurrency 最大并发数
 * @returns 与 items 等长的结果数组（保留顺序，异常以 rejected 形式返回）
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        const value = await mapper(items[index], index);
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
