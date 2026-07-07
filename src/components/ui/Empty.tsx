// 通用空状态
import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function Empty({ title = '暂无数据', description, icon, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-ink-500 mb-4">{icon || <Inbox className="w-12 h-12" strokeWidth={1} />}</div>
      <p className="text-ink-300 font-medium">{title}</p>
      {description && <p className="text-sm text-ink-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
