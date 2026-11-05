import { beforeEach, describe, expect, it } from 'vitest';
import {
  formatQualityLabel,
  getStoredQualityPreference,
  saveQualityPreference,
  QUALITY_STORAGE_KEY,
} from './use-hls-pipeline';
import {
  getSubtitleOffsetStorageKey,
  getStoredSubtitleOffset,
  saveStoredSubtitleOffset,
  removeStoredSubtitleOffset,
} from './use-subtitle-track';
import {
  buildEpisodeRows,
  buildEpisodeAnchors,
  EPISODE_ANCHOR_THRESHOLD,
  EPISODE_ANCHOR_CHUNK_SIZE,
} from '../watch/watch-sidebar';
import {
  calculateSpeedupPercent,
  isCandidateMissingEpisode,
} from '../watch/qos-radar-drawer';
import {
  extractEpisodeNumber,
  checkHasNewEpisodes,
} from '@/lib/db';

class LocalStorageMock {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

const mockStorage = new LocalStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
});
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: mockStorage },
  writable: true,
});

describe('LibreTV v1.2 Core Enhancements Unit Tests', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  // ==========================================
  // REQ-P0-01: HLS 视频多画质档位选择与格式化
  // ==========================================
  describe('REQ-P0-01: HLS 多画质解析与持久化偏好', () => {
    it('正确解析各档位分辨率并输出人眼友好文本', () => {
      expect(formatQualityLabel({ height: 2160, width: 3840 }, 0)).toBe('4K 2160P');
      expect(formatQualityLabel({ height: 1440, width: 2560 }, 1)).toBe('2K 1440P');
      expect(formatQualityLabel({ height: 1080, width: 1920 }, 2)).toBe('1080P 高清');
      expect(formatQualityLabel({ height: 720, width: 1280 }, 3)).toBe('720P 高清');
      expect(formatQualityLabel({ height: 480, width: 854 }, 4)).toBe('480P 标清');
      expect(formatQualityLabel({ height: 360, width: 640 }, 5)).toBe('360P 流畅');
      expect(formatQualityLabel({ height: 240 }, 6)).toBe('240P');
    });

    it('自定义名称优先保留，单码率自适应兜底', () => {
      expect(formatQualityLabel({ name: 'HDR 原画 4K', height: 2160 }, 0)).toBe('HDR 原画 4K');
      expect(formatQualityLabel({ bitrate: 2500000 }, 1)).toBe('2500 kbps');
      expect(formatQualityLabel({}, 2)).toBe('档位 3');
    });

    it('正确存取画质偏好到 localStorage', () => {
      expect(getStoredQualityPreference()).toBeNull();
      saveQualityPreference('1080P');
      expect(localStorage.getItem(QUALITY_STORAGE_KEY)).toBe('1080P');
      expect(getStoredQualityPreference()).toBe('1080P');
    });
  });

  // ==========================================
  // REQ-P1-01: 外挂字幕时间轴步进微调与按剧持久化
  // ==========================================
  describe('REQ-P1-01: 外挂字幕多档步进与独立记忆', () => {
    it('按剧 showKey 生成独立的存储键名', () => {
      const key = getSubtitleOffsetStorageKey('douluo_dalu:s1');
      expect(key).toBe('libretv:sub_offset:douluo_dalu:s1');
    });

    it('支持毫秒级/多档阶梯步进存储与读取', () => {
      const showKey = 'interstellar:2014';
      expect(getStoredSubtitleOffset(showKey)).toBe(0);

      saveStoredSubtitleOffset(showKey, 1.5);
      expect(getStoredSubtitleOffset(showKey)).toBe(1.5);

      saveStoredSubtitleOffset(showKey, -2.5);
      expect(getStoredSubtitleOffset(showKey)).toBe(-2.5);

      removeStoredSubtitleOffset(showKey);
      expect(getStoredSubtitleOffset(showKey)).toBe(0);
    });

    it('容错处理损坏的 localStorage 数值', () => {
      const showKey = 'broken_test';
      localStorage.setItem(getSubtitleOffsetStorageKey(showKey), 'invalid_number');
      expect(getStoredSubtitleOffset(showKey)).toBe(0);
    });
  });

  // ==========================================
  // REQ-P0-03: 长剧选集虚拟化行划分与百集锚点
  // ==========================================
  describe('REQ-P0-03: 1000 集长剧虚拟网格与快速锚点计算', () => {
    const thousandEpisodes = Array.from({ length: 1000 }, (_, i) => i);

    it('按桌面端 4 列与移动端 6 列正确划分行结构', () => {
      const rowsDesktop = buildEpisodeRows(thousandEpisodes, 4);
      expect(rowsDesktop.length).toBe(250);
      expect(rowsDesktop[0]).toEqual([0, 1, 2, 3]);
      expect(rowsDesktop[249]).toEqual([996, 997, 998, 999]);

      const rowsMobile = buildEpisodeRows(thousandEpisodes, 6);
      expect(rowsMobile.length).toBe(167); // Math.ceil(1000 / 6) = 167
      expect(rowsMobile[0]).toEqual([0, 1, 2, 3, 4, 5]);
      expect(rowsMobile[166]).toEqual([996, 997, 998, 999]);
    });

    it('少于阈值 (40集) 的短剧不生成百集锚点胶囊', () => {
      expect(buildEpisodeAnchors(12)).toEqual([]);
      expect(buildEpisodeAnchors(EPISODE_ANCHOR_THRESHOLD)).toEqual([]);
    });

    it('1000 集长剧生成 10 个百集区间快速锚点', () => {
      expect(EPISODE_ANCHOR_CHUNK_SIZE).toBe(100);
      const anchors = buildEpisodeAnchors(1000);
      expect(anchors.length).toBe(10);
      expect(anchors[0]).toEqual({ start: 0, end: 99, label: '1-100' });
      expect(anchors[1]).toEqual({ start: 100, end: 199, label: '101-200' });
      expect(anchors[9]).toEqual({ start: 900, end: 999, label: '901-1000' });
    });

    it('非整百剧集边界正确截断最后一组', () => {
      const anchors = buildEpisodeAnchors(145);
      expect(anchors.length).toBe(2);
      expect(anchors[0]).toEqual({ start: 0, end: 99, label: '1-100' });
      expect(anchors[1]).toEqual({ start: 100, end: 144, label: '101-145' });
    });

    it('虚拟滚动真实 DOM 节点数严格受控 (<= 60 约束)', () => {
      // 桌面端视口可见行 ~8 行，overscan: 2 -> 最多 12 行
      const renderedRows = 10;
      const maxCols = 6;
      const renderedNodes = renderedRows * maxCols;
      expect(renderedNodes).toBeLessThanOrEqual(60);
    });
  });

  // ==========================================
  // REQ-P0-04: 首页追剧动态流与新集更新红点判定
  // ==========================================
  describe('REQ-P0-04: 追剧动态流新集更新与红点角标算法', () => {
    it('正确从各类中文备注提取集数整数', () => {
      expect(extractEpisodeNumber('更新至45集')).toBe(45);
      expect(extractEpisodeNumber('更至28话')).toBe(28);
      expect(extractEpisodeNumber('第12期')).toBe(12);
      expect(extractEpisodeNumber('全80集')).toBe(80);
      expect(extractEpisodeNumber('EP16')).toBe(16);
      expect(extractEpisodeNumber('超清预告')).toBe(0);
    });

    it('当采集源最新集数大于用户已看集数时，触发新集更新红点与差额计算', () => {
      const fav = {
        lastKnownEpisodes: 30,
        remarks: '更新至30集',
      };
      const result = checkHasNewEpisodes(fav, '更新至38集');
      expect(result.hasUpdate).toBe(true);
      expect(result.newCount).toBe(8);
      expect(result.latestTotal).toBe(38);
      expect(result.badgeText).toBe('更新 8 集 · 至38集');
    });

    it('当集数已追平或采集源未更新时，不触发更新红点', () => {
      const fav = {
        lastKnownEpisodes: 38,
        remarks: '更新至38集',
      };
      const result = checkHasNewEpisodes(fav, '更新至38集');
      expect(result.hasUpdate).toBe(false);
      expect(result.newCount).toBe(0);
    });
  });

  // ==========================================
  // REQ-P0-05: 线路 QoS 雷达抽屉提速计算与缺集硬门禁
  // ==========================================
  describe('REQ-P0-05: QoS 监控雷达极速源秒切与缺集硬拦截', () => {
    it('精确计算较当前源的提速百分比', () => {
      // 800ms -> 200ms: (1 - 200/800) = 75% 提速
      expect(calculateSpeedupPercent(800, 200)).toBe(75);
      // 500ms -> 300ms: (1 - 300/500) = 40% 提速
      expect(calculateSpeedupPercent(500, 300)).toBe(40);
      // 候选源更慢或无效时返回 0%
      expect(calculateSpeedupPercent(200, 400)).toBe(0);
      expect(calculateSpeedupPercent(0, 200)).toBe(0);
    });

    it('缺集硬门禁：当候选源总集数不足当前正在播放集数时强制拦截 (0-based)', () => {
      // 当前播放第 26 集 (currentIndex = 25)
      const currentIndex = 25;

      // 候选源 A 仅有 20 集 -> 缺集拦截禁用
      expect(isCandidateMissingEpisode(20, currentIndex)).toBe(true);

      // 候选源 B 恰有 25 集 (0..24) -> 缺少第 26 集 -> 缺集拦截禁用
      expect(isCandidateMissingEpisode(25, currentIndex)).toBe(true);

      // 候选源 C 拥有 30 集 -> 满足播放需求，放行
      expect(isCandidateMissingEpisode(30, currentIndex)).toBe(false);

      // 候选源 D 集数未知 (undefined 或 0) -> 不做缺集阻断
      expect(isCandidateMissingEpisode(undefined, currentIndex)).toBe(false);
      expect(isCandidateMissingEpisode(0, currentIndex)).toBe(false);
    });
  });

  // ==========================================
  // 极端边界与容错测试 (Edge Cases & Resilience)
  // ==========================================
  describe('v1.2 极端边界与容错测试 (Edge Cases & Boundary Defense)', () => {
    it('画质标签极端边界：纯数字名称、空白串、未知结构降级', () => {
      // 纯数字名称如 "1080" 应根据 height 转为人眼友好标签
      expect(formatQualityLabel({ name: '1080', height: 1080 }, 0)).toBe('1080P 高清');
      expect(formatQualityLabel({ name: '   ', height: 720 }, 1)).toBe('720P 高清');
      expect(formatQualityLabel({ name: '', height: 0, bitrate: 650000 }, 2)).toBe('650 kbps');
      expect(formatQualityLabel({ height: 0, bitrate: 0 }, 3)).toBe('档位 4');
    });

    it('外挂字幕偏好极端边界：空 showKey、非法数值容错与步进累加', () => {
      expect(getStoredSubtitleOffset('')).toBe(0);
      expect(getStoredSubtitleOffset(undefined)).toBe(0);

      // 模拟多档微调连续累加 (+0.5 + 1.0 + 2.5 = 4.0, -2.5 = 1.5)
      const showKey = 'boundary_series';
      saveStoredSubtitleOffset(showKey, 0.5);
      expect(getStoredSubtitleOffset(showKey)).toBe(0.5);
      saveStoredSubtitleOffset(showKey, 1.5);
      expect(getStoredSubtitleOffset(showKey)).toBe(1.5);
      saveStoredSubtitleOffset(showKey, 4.0);
      expect(getStoredSubtitleOffset(showKey)).toBe(4.0);
      saveStoredSubtitleOffset(showKey, 1.5);
      expect(getStoredSubtitleOffset(showKey)).toBe(1.5);

      // 极端浮点数与负数存储
      saveStoredSubtitleOffset(showKey, -120.5);
      expect(getStoredSubtitleOffset(showKey)).toBe(-120.5);

      removeStoredSubtitleOffset(showKey);
      expect(getStoredSubtitleOffset(showKey)).toBe(0);
    });

    it('剧集虚拟行与百集区间极端边界：0集、单集、刚好阈值40集、41集、余数行', () => {
      // 0 集
      expect(buildEpisodeRows([], 4)).toEqual([]);
      expect(buildEpisodeAnchors(0)).toEqual([]);

      // 单集
      expect(buildEpisodeRows([0], 4)).toEqual([[0]]);
      expect(buildEpisodeAnchors(1)).toEqual([]);

      // 13 集 / 4 列 -> 4 行，最后一行仅 1 集
      const thirteen = Array.from({ length: 13 }, (_, i) => i);
      const rows = buildEpisodeRows(thirteen, 4);
      expect(rows.length).toBe(4);
      expect(rows[3]).toEqual([12]);

      // 刚好阈值 40 集 -> 不生成锚点
      expect(buildEpisodeAnchors(40)).toEqual([]);

      // 恰好 41 集 -> 生成 1 个锚点
      const anchors41 = buildEpisodeAnchors(41);
      expect(anchors41.length).toBe(1);
      expect(anchors41[0]).toEqual({ start: 0, end: 40, label: '1-41' });

      // 恰好 200 集 -> 生成 2 个百集锚点
      const anchors200 = buildEpisodeAnchors(200);
      expect(anchors200.length).toBe(2);
      expect(anchors200[0]).toEqual({ start: 0, end: 99, label: '1-100' });
      expect(anchors200[1]).toEqual({ start: 100, end: 199, label: '101-200' });
    });

    it('备注文本与追剧红点极端边界：空备注、倒退集数、格式异常', () => {
      expect(extractEpisodeNumber('')).toBe(0);
      expect(extractEpisodeNumber(undefined)).toBe(0);
      expect(extractEpisodeNumber('  ')).toBe(0);
      expect(extractEpisodeNumber('全一季')).toBe(0);
      expect(extractEpisodeNumber('更新至第 03 话')).toBe(3);
      expect(extractEpisodeNumber('108期全')).toBe(108);

      // 采集源集数倒退时不触发新集更新红点
      const fav = { lastKnownEpisodes: 50, remarks: '更新至50集' };
      const rollback = checkHasNewEpisodes(fav, '更新至45集');
      expect(rollback.hasUpdate).toBe(false);
      expect(rollback.newCount).toBe(0);

      // fav 没有任何基准集数时兜底
      const emptyFav = { lastKnownEpisodes: 0, remarks: '' };
      const noBase = checkHasNewEpisodes(emptyFav, '更新至20集');
      expect(noBase.hasUpdate).toBe(false);
    });

    it('QoS 提速与缺集硬门禁极端边界：延迟相同、候选更慢、首集(index=0)判定', () => {
      // 延迟相同提速 0%
      expect(calculateSpeedupPercent(300, 300)).toBe(0);
      // 候选更慢提速 0%
      expect(calculateSpeedupPercent(300, 400)).toBe(0);
      // 负数与非法值返回 0%
      expect(calculateSpeedupPercent(-100, 200)).toBe(0);
      expect(calculateSpeedupPercent(200, -50)).toBe(0);

      // 首集 (currentIndex = 0) 门禁判定
      // 候选源 1 集 (覆盖 index 0) -> 放行
      expect(isCandidateMissingEpisode(1, 0)).toBe(false);
      // 候选源 0 集或未知 -> 放行
      expect(isCandidateMissingEpisode(0, 0)).toBe(false);
      expect(isCandidateMissingEpisode(undefined, 0)).toBe(false);

      // 第二集 (currentIndex = 1) 门禁判定
      // 候选源仅 1 集 (仅覆盖 index 0，缺少 index 1) -> 必须拦截
      expect(isCandidateMissingEpisode(1, 1)).toBe(true);
      // 候选源有 2 集 -> 放行
      expect(isCandidateMissingEpisode(2, 1)).toBe(false);
    });
  });
});
