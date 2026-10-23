/**
 * 客户端多源并发熔断器与动态 QoS 健康度量化引擎 (Source Circuit Breaker & QoS Scorer)
 *
 * 核心职责：
 * 1. 熔断防阻塞 (Circuit Breaker)：当某第三方 CMS 源连续超时或报错达到阈值（默认 3 次）时，
 *    自动进入 Open 熔断态，在冷却期内跳过该源，防止死源/慢源长时间霸占浏览器 6 条并发连接池；
 *    冷却期满后进入 Half-Open 半开态，允许单次探测，成功则立刻恢复 Closed 正常态。
 * 2. 动态 QoS 评分 (0 ~ 100)：基于 EWMA（指数移动加权平均）延迟、历史成功率与近期稳定性，
 *    实时计算每个源的综合服务质量分，辅助排序置顶高速稳定源。
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface SourceQoSMetrics {
  sourceKey: string;
  state: CircuitState;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  /** 指数加权移动平均延迟（毫秒） */
  ewmaLatencyMs: number;
  lastUpdatedAt: number;
  openedAt?: number;
}

export interface SourceQoSBadge {
  score: number;
  grade: 'S' | 'A' | 'B' | 'C';
  label: '极速' | '良好' | '一般' | '受阻';
}

/** 连续失败多少次触发熔断 */
export const CIRCUIT_FAILURE_THRESHOLD = 3;
/** 熔断冷却时长（默认 3 分钟） */
export const CIRCUIT_COOLDOWN_MS = 3 * 60 * 1000;
/** EWMA 平滑系数 */
const EWMA_ALPHA = 0.35;
/** 未探测过的源默认基准分 */
export const DEFAULT_QOS_SCORE = 75;

const metricsMap = new Map<string, SourceQoSMetrics>();

/** 获取或初始化指定源的指标 */
export function getSourceMetrics(sourceKey: string, now = Date.now()): SourceQoSMetrics {
  const existing = metricsMap.get(sourceKey);
  if (existing) {
    // 动态检查是否已过熔断冷却期，自动晋升为 half-open
    if (
      existing.state === 'open' &&
      existing.openedAt &&
      now - existing.openedAt >= CIRCUIT_COOLDOWN_MS
    ) {
      existing.state = 'half-open';
    }
    return existing;
  }

  const init: SourceQoSMetrics = {
    sourceKey,
    state: 'closed',
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
    ewmaLatencyMs: 0,
    lastUpdatedAt: 0,
  };
  metricsMap.set(sourceKey, init);
  return init;
}

/** 判断指定源当前是否允许发起网络探测（未处于硬熔断期） */
export function canProbeSource(sourceKey: string, now = Date.now()): boolean {
  if (!sourceKey) return false;
  const m = metricsMap.get(sourceKey);
  if (!m) return true;

  if (m.state === 'open') {
    if (m.openedAt && now - m.openedAt >= CIRCUIT_COOLDOWN_MS) {
      m.state = 'half-open';
      return true;
    }
    return false;
  }
  return true;
}

/** 记录一次源请求成功及其耗时（毫秒） */
export function recordSourceSuccess(sourceKey: string, latencyMs: number, now = Date.now()): SourceQoSMetrics {
  const m = getSourceMetrics(sourceKey, now);
  const clampedMs = Math.max(10, Math.min(15000, Math.round(latencyMs || 300)));

  // 若从熔断/半开态成功恢复，对历史偶发失败计数做减半衰减，避免历史包袱长期压低健康分
  if (m.state !== 'closed' || m.consecutiveFailures > 0) {
    m.failureCount = Math.floor(m.failureCount / 2);
  }

  m.successCount += 1;
  m.consecutiveFailures = 0;
  m.state = 'closed';
  m.openedAt = undefined;
  m.ewmaLatencyMs =
    m.ewmaLatencyMs === 0
      ? clampedMs
      : Math.round(EWMA_ALPHA * clampedMs + (1 - EWMA_ALPHA) * m.ewmaLatencyMs);
  m.lastUpdatedAt = now;

  return m;
}

/** 记录一次源请求失败或超时 */
export function recordSourceFailure(sourceKey: string, now = Date.now()): SourceQoSMetrics {
  const m = getSourceMetrics(sourceKey, now);
  m.failureCount += 1;
  m.consecutiveFailures += 1;
  m.lastUpdatedAt = now;

  if (m.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD || m.state === 'half-open') {
    m.state = 'open';
    m.openedAt = now;
  }

  return m;
}

/**
 * 计算指定源的动态 QoS 健康度综合评分（0 ~ 100）
 *
 * 评分构成：
 * - 成功率维度 (0 ~ 50分)
 * - 响应延迟维度 (0 ~ 40分)：<= 300ms 满分，>= 3500ms 0分
 * - 连续稳定奖励 (0 ~ 10分)
 * - 连续失败惩罚：每次连续失败扣 18 分；处于 open 熔断态直接 0 分
 */
export function getSourceQoSScore(sourceKey: string, now = Date.now()): number {
  const m = metricsMap.get(sourceKey);
  if (!m || (m.successCount === 0 && m.failureCount === 0)) {
    return DEFAULT_QOS_SCORE;
  }

  if (m.state === 'open' && (!m.openedAt || now - m.openedAt < CIRCUIT_COOLDOWN_MS)) {
    return 0;
  }

  const total = m.successCount + m.failureCount;
  const successRate = total > 0 ? m.successCount / total : 0.75;
  const successPoints = successRate * 50;

  let latencyPoints = 25;
  if (m.ewmaLatencyMs > 0) {
    if (m.ewmaLatencyMs <= 300) {
      latencyPoints = 40;
    } else if (m.ewmaLatencyMs >= 3500) {
      latencyPoints = 0;
    } else {
      latencyPoints = 40 * (1 - (m.ewmaLatencyMs - 300) / 3200);
    }
  }

  const stabilityBonus = m.consecutiveFailures === 0 && m.successCount >= 2 ? 10 : 0;
  const failurePenalty = m.consecutiveFailures * 18;

  const raw = Math.round(successPoints + latencyPoints + stabilityBonus - failurePenalty);
  return Math.max(5, Math.min(100, raw));
}

/** 获取用于 UI 徽标展示的 QoS 等级 */
export function getSourceQoSBadge(sourceKey: string, now = Date.now()): SourceQoSBadge {
  const score = getSourceQoSScore(sourceKey, now);
  if (score >= 85) return { score, grade: 'S', label: '极速' };
  if (score >= 70) return { score, grade: 'A', label: '良好' };
  if (score >= 40) return { score, grade: 'B', label: '一般' };
  return { score, grade: 'C', label: '受阻' };
}

/** 重置全部或单个源的熔断与 QoS 状态（供测试或用户手动刷新重试） */
export function resetSourceCircuit(sourceKey?: string): void {
  if (sourceKey) {
    metricsMap.delete(sourceKey);
  } else {
    metricsMap.clear();
  }
}
