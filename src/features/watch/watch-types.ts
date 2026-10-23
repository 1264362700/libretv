import type { SourceConfig, SearchResultItem } from '@/lib/types';

export interface CandidateItem {
  source: SourceConfig;
  result: SearchResultItem;
  ms?: number;
  /** 该候选源已知解析出的总集数（供断流自动换源与比优时校验集数是否达标） */
  episodeCount?: number;
  /** 测速对比基准：当前线路的耗时（仅最优线路提示弹框用） */
  baselineMs?: number;
  /** 相对基准的提速百分比（仅最优线路提示弹框用） */
  gainPercent?: number;
}
