/**
 * 邀请码拼写归一化（纯函数，前后端共用）。
 *
 * 邀请码由服务端生成，形如 `LTV-ABCD-EFGH`：
 * - 字符集刻意剔除了 0/O/1/I 等易混字符（`auth-store.ts` 的 generateRandomCode）
 * - 但用户拿到码的路径是「微信/QQ 复制 + 手机手打」，必然产生大小写、
 *   全角横线、下划线、中间空格、甚至整段中文口令。
 *
 * 这里只做「拼写等价类」的还原，不做模糊搜索也不放宽码空间：
 * 归一化后仍需在服务端字典里精确命中才算通过。
 */

/** 默认邀请码前缀，与 generateRandomCode 的默认值保持一致 */
export const DEFAULT_INVITE_PREFIX = 'LTV';

/** 邀请码正文（不含前缀）长度 */
export const INVITE_BODY_LENGTH = 8;

/** 去掉大小写与非字母数字噪声：`ltv abcd-efgh` → `LTVABCDEFGH` */
export function normalizeInviteChars(raw: string): string {
  return (raw ?? '')
    .toUpperCase()
    // 全角数字/字母先归一，避免全角输入直接被下面这步清掉
    .replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .replace(/[^A-Z0-9]/g, '');
}

/** 拼接标准形态：`LTV` + `ABCDEFGH` → `LTV-ABCD-EFGH` */
export function joinInviteCode(prefix: string, body: string): string {
  if (body.length !== INVITE_BODY_LENGTH) return `${prefix ? `${prefix}-` : ''}${body}`;
  return `${prefix}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * 生成一串等价候选，按「最可能」优先返回。
 *
 * @param raw 用户输入
 * @param knownPrefixes 服务端现有邀请码里出现过的前缀，用于给「用户漏打前缀」补前缀
 */
export function inviteCodeCandidates(raw: string, knownPrefixes: string[] = []): string[] {
  const clean = normalizeInviteChars(raw);
  if (!clean) return [];

  const prefixes = Array.from(
    new Set([DEFAULT_INVITE_PREFIX, ...knownPrefixes.filter(Boolean).map((p) => p.toUpperCase())])
  );
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string) => {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    out.push(candidate);
  };

  if (clean.length >= INVITE_BODY_LENGTH) {
    const head = clean.slice(0, clean.length - INVITE_BODY_LENGTH);
    const body = clean.slice(-INVITE_BODY_LENGTH);
    if (head) push(joinInviteCode(head, body));
    if (clean.length === INVITE_BODY_LENGTH) {
      for (const p of prefixes) push(joinInviteCode(p, body));
    }
  }

  // 兜底：原样（兼容历史/自定义形态的码）
  push(clean);
  return out;
}

/**
 * 把输入规整成可读形态，用于失焦/粘贴后回填给用户核对：
 * `ltvabcd efgh` → `LTV-ABCD-EFGH`。
 * 未达 8 位正文时保留去噪结果，避免打字中途反复串味。
 */
export function prettyInviteCode(raw: string): string {
  const clean = normalizeInviteChars(raw);
  if (clean.length <= INVITE_BODY_LENGTH) return clean;
  const body = clean.slice(-INVITE_BODY_LENGTH);
  return `${clean.slice(0, clean.length - INVITE_BODY_LENGTH)}-${body.slice(0, 4)}-${body.slice(4)}`;
}
