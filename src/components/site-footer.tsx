'use client';

import { useAuth } from '@/components/auth';

/** 全站统一页脚：仓库链接 + 版本号（悬停显示上游更新检测结果） */
export function SiteFooter() {
  const { version } = useAuth();
  return (
    <footer className="border-t border-line py-4">
      <p className="text-center text-xs text-faint">
        <a
          href="https://github.com/LibreSpark/LibreTV"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative inline-block cursor-help hover:text-accent"
        >
          LibreTV{version ? ` v${version}` : ''}
        </a>
        {' · '}
        AGPL-3.0 License
      </p>
    </footer>
  );
}
