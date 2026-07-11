import { clsx, type ClassValue } from "clsx"

// 移除 tailwind-merge（twMerge）以消除 j.slice 错误和高 CPU 开销
// twMerge 会对每个类名做复杂解析，在 31000+ 种子虚拟滚动场景下频繁调用导致 CPU 飙升
// clsx 已足够处理条件类名拼接，本项目不依赖 twMerge 的冲突合并能力
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}
