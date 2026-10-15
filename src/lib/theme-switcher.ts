/**
 * 通用主题平滑切换器（基于 W3C 原生 View Transitions API）
 * 移植自 template 项目，支持 circle（水波涟漪）、radar（雷达扫描）、eclipse（日蚀月相）等对偶动效
 */

export type ThemeTransitionStyle =
  | 'circle'
  | 'eclipse'
  | 'shutter'
  | 'radar'
  | 'fade';

export interface SwitchThemeOptions {
  /** 触发事件对象，用于定位起源点 */
  event?: React.MouseEvent | MouseEvent;
  /** 触发锚点元素，优先级高于 event（用于绝对居中吸附） */
  targetElement?: HTMLElement | null;
  /** 当前是否为暗黑模式（切换前状态） */
  isDark: boolean;
  /** 动效风格，默认经典引力水波扩散 'circle' */
  style?: ThemeTransitionStyle;
  /** 动画时长（毫秒），默认 450ms */
  duration?: number;
  /** 实际变更主题状态与 DOM 的业务回调函数 */
  callback: () => void | Promise<void>;
}

let latestTransitionId = 0;

/**
 * 通用主题平滑切换器
 */
export async function switchTheme(options: SwitchThemeOptions): Promise<void> {
  const {
    event,
    targetElement,
    isDark,
    style = 'circle',
    callback,
  } = options;

  // 1. 判断浏览器原生 View Transition 支持情况与无障碍降级偏好
  const doc = typeof document !== 'undefined' ? document : null;
  const isAppearanceTransition =
    doc !== null &&
    'startViewTransition' in doc &&
    typeof (doc as unknown as { startViewTransition: unknown }).startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!isAppearanceTransition || !doc) {
    await callback();
    return;
  }

  const root = doc.documentElement;

  // 2. 提取交互锚点几何坐标（针对 circle 模式）
  let x = window.innerWidth - 80;
  let y = 30;

  const el =
    targetElement ||
    (event?.currentTarget as HTMLElement) ||
    (event?.target as HTMLElement);

  if (el && typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    } else if (event) {
      x = event.clientX;
      y = event.clientY;
    }
  } else if (event) {
    x = event.clientX;
    y = event.clientY;
  }

  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const transitionId = ++latestTransitionId;

  // 3. 设置当前动效样式与状态标记
  root.dataset.themeStyle = style;
  root.dataset.themeTransition = isDark ? 'to-light' : 'to-dark';
  root.style.setProperty('--theme-transition-x', `${Math.round(x)}px`);
  root.style.setProperty('--theme-transition-y', `${Math.round(y)}px`);
  root.style.setProperty('--theme-transition-radius', `${Math.ceil(endRadius)}px`);

  // 4. 动画期间开启静默隔离，避免业务组件自身的 CSS transition 争抢 CPU
  root.classList.add('theme-transitioning');

  // 5. 开启浏览器原生视图过渡
  const transition = (doc as unknown as {
    startViewTransition: (cb: () => Promise<void>) => { finished: Promise<void> };
  }).startViewTransition(async () => {
    await callback();
  });

  // 6. 统一生命周期清理
  transition.finished.finally(() => {
    if (transitionId !== latestTransitionId) return;

    root.classList.remove('theme-transitioning');
    delete root.dataset.themeStyle;
    delete root.dataset.themeTransition;
    root.style.removeProperty('--theme-transition-x');
    root.style.removeProperty('--theme-transition-y');
    root.style.removeProperty('--theme-transition-radius');
  });
}
