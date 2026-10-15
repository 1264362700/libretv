'use client';

import { useAuth } from '@/components/auth';

/** 全站统一页脚：仓库链接 + 版本号（悬停显示上游更新检测结果） */
export function SiteFooter() {
  const { version } = useAuth();
  return (
    <footer className="border-t border-line py-4">
      <p className="text-center text-xs text-faint">
        <span className="font-medium text-muted">
          星芒影院 Nova Cinema{version ? ` v${version}` : ''}
        </span>
        {' · '}
        影院级超清影视探索平台
      </p>
    </footer>
  );
}
