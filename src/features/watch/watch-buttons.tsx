'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';
import { cn } from '@/lib/utils';

/** 播放页的多个小型按钮组件（从 app/watch/page.tsx 抽出） */

export function EpisodeButton({ index, active, onClick }: { index: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <button
      ref={ref}
      className={cn(
        'btn btn-sm !px-1 h-9 font-medium text-xs rounded-lg transition-all',
        active ? 'episode-active font-bold shadow-sm' : 'btn-ghost bg-surface hover:bg-hover'
      )}
      onClick={onClick}
    >
      {index + 1}
    </button>
  );
}

export function BackButton() {
  const router = useRouter();
  return (
    <button
      className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-hover transition-colors shrink-0"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push('/');
      }}
      aria-label="返回"
      title="返回"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  );
}

/** 首页按钮：直达首页，避免从外链进入时逐级 back */

export function HomeButton() {
  return (
    <Link
      href="/"
      className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-hover transition-colors shrink-0"
      aria-label="回首页"
      title="回首页"
    >
      <Icon name="home" className="w-5 h-5" />
    </Link>
  );
}
