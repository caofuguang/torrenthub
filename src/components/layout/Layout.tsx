// 主布局容器
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950 grid-bg">
      <Sidebar />
      <div className="ml-[72px] flex flex-col min-h-screen">
        <Topbar />
        <main className="flex-1 p-6 animate-fade-up">{children}</main>
      </div>
    </div>
  );
}
