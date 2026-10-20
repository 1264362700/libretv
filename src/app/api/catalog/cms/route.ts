import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchCmsCatalog } from '@/lib/cms-catalog';

export const runtime = 'nodejs';

/**
 * 采集站原生全量分类片库服务（TVBox / 影视仓标准直连引擎）：
 * 支持分类映射、真分页（500+页）、实时入库最新剧集状态透出与敏感过滤
 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const sourceUrl = url.searchParams.get('url') || '';
  const type = url.searchParams.get('type') || 'movie';
  const page = Math.max(1, parseInt(url.searchParams.get('pg') || '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(12, parseInt(url.searchParams.get('pagesize') || '24', 10) || 24));
  const sourceKey = url.searchParams.get('sourceKey') || undefined;
  const filterAdult = url.searchParams.get('filterAdult') !== '0';
  const rawTypeId = url.searchParams.get('typeId');
  const typeId = rawTypeId && !Number.isNaN(parseInt(rawTypeId, 10)) ? parseInt(rawTypeId, 10) : undefined;
  const rawWd = url.searchParams.get('wd') || url.searchParams.get('keyword') || '';
  const keyword = rawWd.trim() || undefined;
  const sort = url.searchParams.get('sort') || 'recommend';

  if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) {
    return NextResponse.json({ error: '无效的点播源地址' }, { status: 400 });
  }

  try {
    const result = await fetchCmsCatalog({
      url: sourceUrl,
      type,
      typeId,
      keyword,
      sort,
      page,
      pageSize,
      sourceKey,
      filterAdult,
    });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=180, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error(`[API catalog/cms] 获取采集站(${sourceUrl})片库失败:`, err);
    return NextResponse.json(
      {
        items: [],
        total: 0,
        pagecount: 1,
        page,
        pageSize,
        subCategories: [],
        warning: err instanceof Error ? err.message : '采集站片库暂时不可用',
      },
      { status: 200 }
    );
  }
}
