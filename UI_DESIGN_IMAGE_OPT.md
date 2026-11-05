# LibreTV / cl.tv 首页图片加载优化 — UI 设计稿

**版本**：v1.0  
**负责**：UI Designer（林夏薇） → 全栈工程师（张明远），抄送 Lead  
**依赖**：`src/components/smart-image.tsx`、`src/lib/utils.ts`、`tailwind.config.ts`、`src/app/globals.css`

---

## 0. 设计目标与约束

| 目标 | 量化标准 |
|------|----------|
| 首屏 LCP 图片 ≤ 3s | Hero 当前图 + 首屏卡片海报 `loading='eager'`，骨架屏兜底 |
| 图片加载失败率 ≤ 1% | 所有候选链耗尽后展示兜底占位，不展示破损图标 |
| 骨架屏覆盖 100% 首屏海报位 | Hero 轮播 + 首屏卡片网格加载前不留空白 |
| CLS ≈ 0 | 所有海报位固定 `aspect-ratio`，图片加载前后布局不抖动 |
| 平滑淡入 | 图片完成后 `opacity-0 → opacity-100`，`duration-300 ease-out` |
| 图片代理模式遵循用户设置 | `store.imageProxyMode` / `GET /api/status` `defaultImageMode`：direct / proxy / custom |

**禁忌**：禁止在图片相关组件中硬编码 `#xxxx` 色值；全部走 Tailwind 语义化 token（`bg-surface`、`bg-card`、`bg-chip`、`bg-line`、`text-content`、`text-muted`、`text-faint` 等），深色/亮色两套 CSS 变量必须同时对齐。

---

## 1. 核心组件：SmartImage（骨架屏 + 失败兜底 + 平滑淡入）

文件：`src/components/smart-image.tsx`（现有组件，需按本设计稿修改类名与占位 UI）

### 设计要点

1. **骨架屏（加载中）**：
   - 使用 `bg-surface`（深色/#131B2A、亮色/#FFFFFF）+ `animate-pulse` 脉冲动画
   - 固定 `aspect-[2/3]` 或 `aspect-video`，与真实海报比例一致，避免 CLS
   - `aria-hidden="true"`，屏蔽无障碍干扰

2. **加载失败兜底（所有候选链耗尽）**：
   - 背景：`bg-card`（深色/#0F1523、亮色/#FFFFFF）
   - 边框：`border border-line`（浅色边框）
   - 抖动类：`animate-shake-warn`（`globals.css` 已定义 `shake-warn` 关键帧）
   - 内部：⚠️ 图标 + 「封面加载失败」文字 + `aria-label` 说明失败原因
   - 不影响卡片点击进入播放页

3. **渐进式加载（平滑淡入）**：
   - `img` 类名：`transition-opacity duration-300 ease-out`
   - 未加载：`opacity-0`；加载完成：`opacity-100`
   - 避免图片突兀弹出

4. **加载策略**：
   - 首屏 Hero 当前图 + 首屏卡片：`loading='eager'`，立即加载
   - 非首屏卡片：`loading='lazy'` + `IntersectionObserver`（rootMargin 200px）

### 可直接落地的代码片段

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { buildImageCandidates, cn } from '@/lib/utils';

/** 所有候选地址均失败时的抖动状态（globals.css 已定义 shake-warn 关键帧） */
const FAILED_SHAKE_CLASS = 'animate-shake-warn';

interface SmartImageProps {
  url?: string;
  mode: 'direct' | 'proxy' | 'custom';
  customProxy?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  onExhausted?: () => void;
  /** 海报比例：'2/3'（电影海报）| 'video'（16:9）| 'square'，默认 2/3 */
  aspect?: '2/3' | 'video' | 'square';
}

export function SmartImage({
  url,
  mode,
  customProxy = '',
  alt,
  className,
  loading = 'lazy',
  onExhausted,
  aspect = '2/3',
}: SmartImageProps) {
  const candidates = buildImageCandidates(url, mode, customProxy);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(loading === 'eager');
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [allFailed, setAllFailed] = useState(false);

  // 地址或加载方式变化时重置降级进度与加载过渡态
  useEffect(() => {
    setIdx(0);
    setLoaded(false);
    setAllFailed(false);
    setShouldLoad(loading === 'eager');
  }, [url, mode, customProxy, loading]);

  // lazy 图片进入视口附近 200px 才设置 src，避免首屏外并发下载抢占带宽
  useEffect(() => {
    if (loading === 'eager') {
      setShouldLoad(true);
      return;
    }

    const target = containerRef.current;
    if (!target) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loading, url, mode, customProxy]);

  useEffect(() => {
    if (shouldLoad && idx >= candidates.length && !allFailed) {
      setAllFailed(true);
      onExhausted?.();
    }
  }, [shouldLoad, idx, candidates.length, allFailed, onExhausted]);

  const src = candidates[idx];

  // 固定 aspect-ratio，图片加载前后布局不抖动（CLS ≈ 0）
  const aspectClass =
    aspect === 'video' ? 'aspect-video' : aspect === 'square' ? 'aspect-square' : 'aspect-[2/3]';

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden', aspectClass, className)}>
      {/* 骨架屏：加载中占位，固定比例，不留空白 */}
      {!shouldLoad ? (
        <div
          className="absolute inset-0 bg-surface animate-pulse"
          aria-hidden="true"
        />
      ) : allFailed ? (
        {/* 失败兜底：带抖动提示，不影响卡片点击 */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center',
            'bg-card border border-line/60',
            FAILED_SHAKE_CLASS
          )}
          aria-label={`封面加载失败: ${alt}`}
          role="img"
        >
          <span className="text-faint text-[14px] mb-1.5">⚠️</span>
          <span className="text-xs text-muted text-center px-2">
            {tFailed(alt)}
          </span>
        </div>
      ) : !src ? null : (
        <img
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0 && !loaded) {
              setLoaded(true);
            }
          }}
          src={src}
          alt={alt}
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            'transition-opacity duration-300 ease-out',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
          loading={loading}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setIdx((i) => i + 1);
          }}
        />
      )}
    </div>
  );
}

function tFailed(alt: string): string {
  return `封面「${alt || '图片』」加载失败，可点击卡片进入播放页`;
}
```

**关键类名对照（语义化 token，无硬编码）：**

| 状态 | 深色主题 | 亮色主题 | Token 来源 |
|------|----------|----------|------------|
| 骨架屏背景 | `bg-surface` (#131B2A) | `bg-surface` (#FFFFFF) | `tailwind.config.ts` |
| 失败兜底背景 | `bg-card` (#0F1523) | `bg-card` (#FFFFFF) | `tailwind.config.ts` |
| 失败兜底边框 | `border-line` (#2D3A52) | `border-line` (#DADFE9) | `tailwind.config.ts` |
| 失败提示文字 | `text-muted` (#94A3B8) | `text-muted` (#475569) | `tailwind.config.ts` |
| 正常图片容器 | `bg-chip` (#182132) | `bg-chip` (#EBEEF4) | `tailwind.config.ts` |

---

## 2. Hero 轮播骨屏与预加载

文件：新建 `src/components/hero-skeleton.tsx`（Hero 轮播位加载中占位）

```tsx
'use client';

import { cn } from '@/lib/utils';

interface HeroSkeletonProps {
  /** 与真实 Hero 轮播一致的列数：桌面 1 列大卡，移动端 1 列 */
  count?: number;
}

export function HeroSkeleton({ count = 1 }: HeroSkeletonProps) {
  return (
    <section className="py-12 relative overflow-hidden">
      {/* 背景环境光影占位（与真实 Hero 背景色保持一致，避免切换闪烁） */}
      <div className="absolute inset-0 -z-10 bg-surface" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左侧内容骨架 */}
          <div className="lg:col-span-7 space-y-6">
            <div className="h-8 bg-surface rounded animate-pulse" />
            <div className="h-4 bg-surface rounded animate-pulse w-3/4" />
            <div className="h-4 bg-surface rounded animate-pulse w-1/2" />
            <div className="flex gap-3">
              <button className="h-10 bg-surface rounded-xl animate-pulse w-48" disabled />
              <button className="h-10 bg-surface border border-line rounded-xl animate-pulse w-32" disabled />
            </div>
          </div>

          {/* 右侧分页指示器骨架 */}
          <div className="lg:col-span-5 flex items-end justify-center">
            <div className="flex gap-1.5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-line/60 animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 右侧海报位骨架（大尺寸，与真实 Hero 海报位 aspect-[2/3] 一致） */}
      <div className="absolute top-12 right-0 lg:right-8 w-full lg:w-96 h-[60vh] bg-card rounded-2xl overflow-hidden animate-pulse" />
    </section>
  );
}
```

### Hero 轮播预加载策略（P0/P2）

在 `HeroCarousel` 中：

1. **当前可见图片**：`SmartImage loading='eager'`，立即加载，LCP ≤ 3s。
2. **预加载下一张**：轮播切换前，用 `new Image()` 预加载下一张轮播图的候选地址链中第一张，切换时无空白闪烁。
3. **固定高度**：Hero 轮播容器固定 `h-[60vh]`（桌面）或 `h-[50vh]`（移动端），图片加载前后不抖动。

```tsx
// 预加载下一张轮播图（在 HeroCarousel 内）
const preloadNext = (nextIndex: number) => {
  const nextItem = items[nextIndex];
  if (!nextItem?.cover) return;
  const candidates = buildImageCandidates(nextItem.cover, mode, customProxy);
  if (candidates[0]) {
    const img = new Image();
    img.src = candidates[0];
  }
};

// 轮播自动切换时调用
setActive((p) => {
  const next = (p + 1) % items.length;
  preloadNext(next);
  return next;
});
```

---

## 3. 首屏卡片网格骨屏

文件：新建 `src/components/card-grid-skeleton.tsx`（首屏卡片加载中占位）

```tsx
'use client';

import { cn } from '@/lib/utils';

interface CardGridSkeletonProps {
  /** 骨架卡片数量，与真实首屏卡片数一致，避免 CLS */
  count?: number;
  /** 卡片比例，默认 2/3 */
  aspect?: '2/3' | 'video' | 'square';
}

export function CardGridSkeleton({ count = 6, aspect = '2/3' }: CardGridSkeletonProps) {
  const aspectClass =
    aspect === 'video' ? 'aspect-video' : aspect === 'square' ? 'aspect-square' : 'aspect-[2/3]';

  // 响应式列数：移动端 2 列，平板 3 列，桌面 6 列
  return (
    <section className="py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            'grid gap-4',
            'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
          )}
        >
          {[...Array(count)].map((_, i) => (
            <div key={i} className="group relative flex flex-col rounded-xl overflow-hidden cursor-pointer">
              {/* 海报位骨架：固定 aspect-ratio，加载前后不抖动 */}
              <div className={cn('relative w-full', aspectClass, 'bg-surface animate-pulse')} />
              {/* 顶部角标骨架 */}
              <div className="absolute top-2 left-2 w-16 h-6 bg-surface rounded-md animate-pulse" />
              {/* 底部标题与副标题骨架 */}
              <div className="p-2.5 flex flex-col gap-1.5">
                <div className="h-5 bg-surface rounded animate-pulse w-3/4" />
                <div className="h-4 bg-surface rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**响应式断点**：`grid-cols-2`（移动端）→ `sm:grid-cols-3`（平板）→ `md:grid-cols-4` → `lg:grid-cols-6`（桌面），海报卡片在不同断点下不挤压、不折行。

---

## 4. 图片代理模式切换（首页生效）

首页图片加载遵循用户设置：

| 设置值 | 来源 | 表现 |
|--------|------|------|
| `direct` | `store.imageProxyMode` / `defaultImageMode` | 直连上游，`SmartImage mode='direct'` |
| `proxy` | `store.imageProxyMode` / `defaultImageMode` | 走 `/api/proxy?url=`，`SmartImage mode='proxy'` |
| `custom` | `store.customImageProxy` | 走自定义代理模板，`SmartImage mode='custom'` |

首页卡片与 Hero 调用 `SmartImage` 时，`mode` 从 `useAppStore((s) => s.imageProxyMode)` 读取，`customProxy` 从 `useAppStore((s) => s.customImageProxy)` 读取。设置页切换后，首页下次渲染自动生效，无需额外刷新。

---

## 5. 验收确认清单（对齐 PRD-IMAGE-OPT 第 7 节）

- [ ] 首屏 Hero 轮播当前图片 `loading='eager'` + 骨架屏兜底（非空白）
- [ ] 首屏卡片网格海报 `loading='eager'` + 骨架屏兜底 + 平滑淡入
- [ ] 非首屏卡片 `loading='lazy'` + `IntersectionObserver` 200px
- [ ] 图片加载失败兜底占位 + 抖动提示（`animate-shake-warn`，所有候选链耗尽）
- [ ] 图片代理模式切换（direct/proxy/custom）在首页生效，遵循用户设置
- [ ] 海报位固定 `aspect-ratio`，图片加载前后无布局抖动（CLS ≈ 0）
- [ ] Hero 预加载下一张轮播图（P2，可后续）
- [ ] 深色/亮色主题色值走语义化 token，无硬编码 `#xxxx`
- [ ] 失败占位 `aria-label` 说明失败原因，不影响卡片点击

---

## 6. 给全栈工程师的实施建议

1. 先修改 `src/components/smart-image.tsx`，将骨架屏和失败占位改为语义化 token + 固定 `aspect-ratio` 容器。
2. 新建 `src/components/hero-skeleton.tsx` 和 `src/components/card-grid-skeleton.tsx`，在首页 `/` 中图片加载前渲染骨架屏，加载完成后平滑替换为真实图片。
3. Hero 轮播增加 `new Image()` 预加载下一张，切换无空白闪烁。
4. 在 `tailwind.config.ts` 中确认 `animate-shake-warn` 已存在（`globals.css` `shake-warn` 关键帧 + Tailwind `animation` 配置已对齐，无需新增）。
5. 完成后请通知我，我将逐条审查开发结果，循环验收直至“完美”。
