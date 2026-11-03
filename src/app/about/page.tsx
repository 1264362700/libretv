'use client';

import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { Icon } from '@/components/icon';

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-page text-content transition-colors duration-200">
      <Header />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 space-y-12">
        {/* 顶部 Hero 介绍 */}
        <section className="text-center space-y-4 pt-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-panel text-xs font-medium text-accent">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            新一代极简视听聚合体验
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-content">
            关于我们
          </h1>
          <p className="max-w-2xl mx-auto text-sm sm:text-base text-muted leading-relaxed">
            我们致力于打造一个纯净、无任何商业干扰、注重个人隐私的流媒体聚合平台。
            以国际一流的现代 Web 工程标准，提供极致的高清视觉与秒级直达体验。
          </p>
        </section>

        {/* 核心架构理念：双层解耦 */}
        <section className="space-y-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <Icon name="filter" className="w-4 h-4" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-content">
              核心架构：元数据中心化与即时流匹配
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 上层 */}
            <div className="p-6 rounded-2xl glass-panel space-y-3 border border-line">
              <div className="flex items-center gap-2 text-accent font-semibold text-sm">
                <span className="w-6 h-6 rounded-lg bg-accent/20 flex items-center justify-center text-xs">1</span>
                全球权威影视元数据库 (Metadata Core)
              </div>
              <p className="text-xs sm:text-sm text-muted leading-relaxed">
                全站的搜索、推荐流、分类片库及影视档案，均由全球官方权威影视资料库统一提供。
                涵盖超高清海报壁纸、权威演职员名录、真实观众评分与完整剧情梗概，
                杜绝传统采集站低清杂乱、文字广告与劣质水印的干扰。
              </p>
            </div>

            {/* 下层 */}
            <div className="p-6 rounded-2xl glass-panel space-y-3 border border-line">
              <div className="flex items-center gap-2 text-emerald-500 font-semibold text-sm">
                <span className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-xs">2</span>
                JIT 即时切片流匹配引擎 (Playback Engine)
              </div>
              <p className="text-xs sm:text-sm text-muted leading-relaxed">
                浏览与搜索阶段彻底与具体播放源解耦。
                只有当您点击“立即播放”的一瞬间，系统后台才并发向全球数十条海外优质专线与高速节点发起毫秒级测速，
                智能对齐集数并自动挂载最优线路，实现真正的点播秒播与全天候高可用。
              </p>
            </div>
          </div>
        </section>

        {/* 平台四大核心优势 */}
        <section className="space-y-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <Icon name="check" className="w-4 h-4" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-content">
              体验与技术亮点
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-surface-raised border border-line space-y-2">
              <div className="flex items-center gap-2 text-content font-semibold text-sm">
                <Icon name="bolt" className="w-4 h-4 text-amber-500" />
                智能动态故障转移
              </div>
              <p className="text-xs text-muted leading-relaxed">
                播放过程中一旦遇到上游网络抖动或视频切片失效，换源引擎会在后台毫秒级自动切换至下一条备用高速线路，精准保留当前观看进度与播放集数。
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-surface-raised border border-line space-y-2">
              <div className="flex items-center gap-2 text-content font-semibold text-sm">
                <Icon name="link" className="w-4 h-4 text-indigo-500" />
                本地优先与纯隐私保护
              </div>
              <p className="text-xs text-muted leading-relaxed">
                您的全部搜索历史、影视收藏夹、观看进度 100% 存储在您本机设备的 IndexedDB 数据库中。无需注册任何账号，平台绝不在云端收集或追踪您的任何隐私数据。
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-surface-raised border border-line space-y-2">
              <div className="flex items-center gap-2 text-content font-semibold text-sm">
                <Icon name="refresh" className="w-4 h-4 text-emerald-500" />
                全球全片库海外专线
              </div>
              <p className="text-xs text-muted leading-relaxed">
                聚合包括海外蓝光原盘、4K 超清专线在内的优质全球影视资源，片库覆盖极其完整，免除国内下架、版权屏蔽与画面删减困扰。
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-surface-raised border border-line space-y-2">
              <div className="flex items-center gap-2 text-content font-semibold text-sm">
                <Icon name="bolt" className="w-4 h-4 text-pink-500" />
                深度定制播放控制
              </div>
              <p className="text-xs text-muted leading-relaxed">
                基于 ArtPlayer 与 hls.js 深度工程调优，支持智能切片广告过滤、无缝自动连播、0.5x~3.0x 任意倍速调节、移动端长按 3 倍速快进与影院宽屏模式。
              </p>
            </div>
          </div>
        </section>

        {/* 快捷键指南 */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-accent">
              <Icon name="gear" className="w-4 h-4" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-content">
              键盘快捷操作
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: '空格 (Space)', desc: '播放 / 暂停' },
              { key: '← / →', desc: '快退 / 快进 5 秒' },
              { key: '↑ / ↓', desc: '音量增加 / 减小' },
              { key: 'F', desc: '进入 / 退出全屏' },
              { key: 'Alt + ← / →', desc: '切换 上一集 / 下一集' },
              { key: '移动端长按', desc: '视频 3 倍速极速快进' },
            ].map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl glass-panel border border-line flex flex-col justify-between gap-1"
              >
                <code className="text-xs font-mono font-semibold text-accent px-1.5 py-0.5 rounded bg-chip/60 w-fit">
                  {item.key}
                </code>
                <span className="text-xs text-muted">{item.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 免责声明 */}
        <section className="p-5 rounded-2xl bg-surface/50 border border-line/60 space-y-2.5">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
            免责声明 (Disclaimer)
          </h3>
          <p className="text-xs text-faint leading-relaxed">
            本项目是一个纯粹的开源技术研究与流媒体聚合前端系统。本项目自身不存储、不上传、不制作任何视频文件，亦不对任何第三方网络服务提供商业托管。
            平台所展示的元数据与视频切片均来自公网第三方公开接口，相关知识产权与法律责任均由原始发布者及数据接口提供方所有。请支持正版影视作品。
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
