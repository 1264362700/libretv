'use client';

import { useAuth } from '@/components/auth';

/** 全站统一页脚：仓库链接 + 版本号（悬停显示上游更新检测结果） */
export function SiteFooter() {
  const { version } = useAuth();
  return (
    <footer className="border-t border-white/5 bg-[#0B0F19] py-6">
      <p className="text-center text-xs text-slate-500">
        <span className="font-semibold text-amber-400/90">
          NovaTV Cinema Ultra{version ? ` v${version}` : ''}
        </span>
        {' · '}
        TMDB 4K 官方影视库与多源极速点播平台
      </p>
    </footer>
  );
}
