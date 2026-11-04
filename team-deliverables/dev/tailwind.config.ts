import type { Config } from 'tailwindcss';

/**
 * 语义化颜色 token：全部通过 CSS 变量驱动，支持亮暗主题切换。
 * 深色主题默认启用，沿用旧版 LibreTV（backup-2025）赛博配色并整体调深一档（#0b101a 页面 / #141c29 面板 / #0d141f 卡片 / #00ccff 霓虹蓝主色）。
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'rgb(var(--c-page) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          raised: 'rgb(var(--c-surface-raised) / <alpha-value>)',
        },
        card: 'rgb(var(--c-card) / <alpha-value>)',
        chip: 'rgb(var(--c-chip) / <alpha-value>)',
        hover: 'rgb(var(--c-hover) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        content: 'rgb(var(--c-content) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          hover: 'rgb(var(--c-accent-hover) / <alpha-value>)',
        },
        // 语义状态色：随亮/暗主题切换，替代直接使用 red/green/amber 等调色板
        danger: {
          DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)',
          hover: 'rgb(var(--c-danger-hover) / <alpha-value>)',
        },
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
        rating: 'rgb(var(--c-rating) / <alpha-value>)',
        // accent 实心底上的文字色：亮色=白、暗色=深（霓虹蓝底对白字对比度不足）
        'on-accent': 'rgb(var(--c-on-accent) / <alpha-value>)',
        // 实心状态底色（配白字），比语义色更深一档保证对比度
        'danger-solid': 'rgb(var(--c-danger-solid) / <alpha-value>)',
        'success-solid': 'rgb(var(--c-success-solid) / <alpha-value>)',
        'warning-solid': 'rgb(var(--c-warning-solid) / <alpha-value>)',
        'info-solid': 'rgb(var(--c-info-solid) / <alpha-value>)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'stagger-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'bounce-pop': {
          '0%': { transform: 'scale(0.8)' },
          '60%': { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
        'shake-warn': {
          '0%, 100%': { transform: 'rotate(0)' },
          '20%': { transform: 'rotate(-3deg)' },
          '40%': { transform: 'rotate(3deg)' },
          '60%': { transform: 'rotate(-2deg)' },
          '80%': { transform: 'rotate(2deg)' },
        },
        'float-gentle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'ken-burns': {
          '0%': { transform: 'scale(1) translate(0, 0)' },
          '100%': { transform: 'scale(1.08) translate(-1.5%, -1.5%)' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'progress-shine': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'stagger-up': 'stagger-up 0.4s ease-out both',
        'slide-in-left': 'slide-in-left 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'bounce-pop': 'bounce-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'shake-warn': 'shake-warn 0.4s ease-in-out',
        'float-gentle': 'float-gentle 3s ease-in-out infinite',
        'ken-burns': 'ken-burns 15s ease-out infinite alternate',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'progress-shine': 'progress-shine 1.5s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
