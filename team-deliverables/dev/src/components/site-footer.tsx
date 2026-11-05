'use client';

import { useAuth } from '@/components/auth';

/** 全站统一页脚：仓库链接 + 版本号（悬停显示上游更新检测结果） */
export function SiteFooter() {
  const { version } = useAuth();
  return (
    <footer className="border-t border-line bg-page py-6 transition-colors">
      <p className="text-center text-xs text-muted">
        <span className="font-semibold text-amber-500 dark:text-amber-400">
          NovaTV Cinema Ultra{version ? ` v${version}` : ''}
        </span>
        {' · '}
        4K 全球影视资料库与多源极速点播平台
      </p>
    </footer>
  );
}
