import { beforeEach, describe, expect, it } from 'vitest';
import {
  CIRCUIT_COOLDOWN_MS,
  DEFAULT_QOS_SCORE,
  canProbeSource,
  getSourceMetrics,
  getSourceQoSBadge,
  getSourceQoSScore,
  recordSourceFailure,
  recordSourceSuccess,
  resetSourceCircuit,
} from './source-circuit-breaker';

describe('source-circuit-breaker & QoS scoring', () => {
  beforeEach(() => {
    resetSourceCircuit();
  });

  it('未探测过的新源默认允许请求且返回基准分 75', () => {
    expect(canProbeSource('new_source')).toBe(true);
    expect(getSourceQoSScore('new_source')).toBe(DEFAULT_QOS_SCORE);
    expect(getSourceQoSBadge('new_source').grade).toBe('A');
  });

  it('连续成功且低延迟的源获得 S 级高分 (>= 85)', () => {
    recordSourceSuccess('fast_src', 180);
    recordSourceSuccess('fast_src', 220);
    const score = getSourceQoSScore('fast_src');
    expect(score).toBeGreaterThanOrEqual(90);
    expect(getSourceQoSBadge('fast_src')).toEqual({
      score,
      grade: 'S',
      label: '极速',
    });
  });

  it('连续失败达到 3 次触发 Open 熔断，冷却期内拒绝请求且评分为 0', () => {
    const t0 = 1_000_000;
    recordSourceFailure('bad_src', t0);
    expect(canProbeSource('bad_src', t0 + 100)).toBe(true);

    recordSourceFailure('bad_src', t0 + 200);
    expect(canProbeSource('bad_src', t0 + 300)).toBe(true);

    recordSourceFailure('bad_src', t0 + 400);
    expect(getSourceMetrics('bad_src', t0 + 400).state).toBe('open');
    expect(canProbeSource('bad_src', t0 + 1000)).toBe(false);
    expect(getSourceQoSScore('bad_src', t0 + 1000)).toBe(0);
    expect(getSourceQoSBadge('bad_src', t0 + 1000).grade).toBe('C');
  });

  it('熔断冷却期满后自动进入 Half-Open，一旦探测成功立刻恢复 Closed', () => {
    const t0 = 1_000_000;
    recordSourceFailure('recover_src', t0);
    recordSourceFailure('recover_src', t0 + 100);
    recordSourceFailure('recover_src', t0 + 200);
    expect(canProbeSource('recover_src', t0 + 500)).toBe(false);

    // 冷却期过后允许半开探测
    const afterCooldown = t0 + 200 + CIRCUIT_COOLDOWN_MS + 10;
    expect(canProbeSource('recover_src', afterCooldown)).toBe(true);
    expect(getSourceMetrics('recover_src').state).toBe('half-open');

    // 半开探测成功，恢复正常态
    recordSourceSuccess('recover_src', 260, afterCooldown + 100);
    expect(getSourceMetrics('recover_src').state).toBe('closed');
    expect(getSourceMetrics('recover_src').consecutiveFailures).toBe(0);
    expect(getSourceQoSScore('recover_src', afterCooldown + 200)).toBeGreaterThan(60);
  });
});
