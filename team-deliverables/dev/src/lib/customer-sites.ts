import type { SourceConfig } from "./types";

/**
 * 权威全网与海外高可用采集源矩阵 (CUSTOMER_SITES)
 * 优先置顶海外专线、全球 CDN 加速、无国内版权屏蔽、4K/蓝光大片库稳定源
 */
export const CUSTOMER_SITES: Record<string, { api: string; name: string }> = {
  // === 第一梯队：顶级海外专线 / 全球 CDN / 无版权审查稳定大源 ===
  "haiwaikan": {
    "api": "https://haiwaikan.com/api.php/provide/vod/",
    "name": "海外看·欧美全球(免翻/无版权限制)"
  },
  "suoni": {
    "api": "https://suoniapi.com/api.php/provide/vod/",
    "name": "索尼资源·海外蓝光(4K全片库/极速)"
  },
  "jisu": {
    "api": "https://jszyapi.com/api.php/provide/vod/",
    "name": "极速影视·海外集群(11万+超大底库)"
  },
  "feifan": {
    "api": "https://api.ffzyapi.com/api.php/provide/vod/",
    "name": "非凡影视·全球CDN(欧美无删减/极稳)"
  },
  "baofeng": {
    "api": "https://bfzyapi.com/api.php/provide/vod/",
    "name": "暴风影视·海外专线(超清片库/高可用)"
  },
  "tiankong": {
    "api": "https://m3u8.tiankongapi.com/api.php/provide/vod/",
    "name": "天空资源·境外专线(4K蓝光专线)"
  },
  "guangsu": {
    "api": "https://api.guangsuapi.com/api.php/provide/vod/",
    "name": "光速资源·海外原盘(蓝光原画质)"
  },
  "ikun": {
    "api": "https://ikunzyapi.com/api.php/provide/vod/",
    "name": "IKun资源·海外大带宽(超清专线)"
  },
  "uku": {
    "api": "https://api.ukuapi.com/api.php/provide/vod/",
    "name": "U酷资源·海外直连(全球热播同步)"
  },
  "wujin": {
    "api": "https://api.wujinapi.com/api.php/provide/vod/",
    "name": "无尽资源·海外底库(海量全网搜)"
  },
  "liangzi": {
    "api": "https://cj.lziapi.com/api.php/provide/vod/",
    "name": "量子资源·双栈高可用(蓝光秒播)"
  },
  "hongniu": {
    "api": "https://www.hongniuzy2.com/api.php/provide/vod/",
    "name": "红牛资源·经典剧集(全量收录)"
  },
  "yinghua": {
    "api": "https://m3u8.apiyhzy.com/api.php/provide/vod/",
    "name": "樱花资源·海外番剧(新番无删减)"
  },
  "xinlang": {
    "api": "https://api.xinlangapi.com/xinlangapi.php/provide/vod/",
    "name": "新浪资源·全球加速(全网同步)"
  },
  "kuaiche": {
    "api": "https://caiji.kczyapi.com/api.php/provide/vod/from/kcm3u8/",
    "name": "快车资源·纯净专线(稳定出流)"
  },
  "sijiu": {
    "api": "https://49zyw.com/api.php/provide/vod/",
    "name": "四九资源·海外分发(全网影视)"
  },
  "wolong": {
    "api": "https://collect.wolongzyw.com/api.php/provide/vod/",
    "name": "卧龙资源·经典片库(冷门佳作)"
  },
  "subo": {
    "api": "https://subocaiji.com/api.php/provide/vod/",
    "name": "速博资源·极速分发(热门精选)"
  },
  "modu": {
    "api": "https://caiji.moduapi.cc/api.php/provide/vod/",
    "name": "魔都资源·高清综合(多线聚合)"
  },
  "haohua": {
    "api": "https://hhzyapi.com/api.php/provide/vod/",
    "name": "豪华火狐·高画质(热门大片)"
  },

  // === 第二梯队：全网知名老牌热播聚合源（全量 HTTPS 规避混合内容拦截） ===
  "qiqi": {
    "api": "https://www.qiqidys.com/api.php/provide/vod",
    "name": "七七资源"
  },
  "heimuer": {
    "api": "https://www.heimuer.tv/api.php/provide/vod",
    "name": "黑木耳影视"
  },
  "sanliuling": {
    "api": "https://360zy.com/api.php/provide/vod/",
    "name": "360资源"
  },
  "kuaiikan": {
    "api": "https://www.kuaikan-api.com/api.php/provide/vod/",
    "name": "快看影视"
  },
  "xiongzhang": {
    "api": "https://xzcjz.com/api.php/provide/vod/",
    "name": "熊掌影视"
  },
  "shandian": {
    "api": "https://sdzyapi.com/api.php/provide/vod/",
    "name": "闪电资源"
  },
  "feisu": {
    "api": "https://www.feisuzyapi.com/api.php/provide/vod/",
    "name": "飞速影视"
  },
  "huya": {
    "api": "https://www.huyaapi.com/api.php/provide/vod/",
    "name": "虎牙影视"
  },
  "tianyi": {
    "api": "https://www.911ysw.top/tianyi.php/provide/vod/",
    "name": "天翼影视"
  },
  "piaoling": {
    "api": "https://p2100.net/api.php/provide/vod/",
    "name": "飘零影视"
  },
  "qihu": {
    "api": "https://caiji.qhzyapi.com/api.php/provide/vod/",
    "name": "奇虎资源"
  },
  "kuaiyun": {
    "api": "https://www.kuaiyunzy.com/api.php/provide/vod/",
    "name": "快云影视"
  },
  "jinying": {
    "api": "https://jyzyapi.com/provide/vod/from/jinyingm3u8",
    "name": "金鹰资源"
  },
  "aosika": {
    "api": "https://aosikazy.com/api.php/provide/vod",
    "name": "奥斯卡资源"
  },
  "beidouxing": {
    "api": "https://m3u8.bdxzyapi.com/api.php/provide/vod",
    "name": "北斗星资源"
  },
  "baidu": {
    "api": "https://api.apibdzy.com/api.php/provide/vod/",
    "name": "百度影视"
  },
  "youzhi": {
    "api": "https://api.1080zyku.com/inc/api.php/provide/vod",
    "name": "优质资源库"
  },
  "kuaibo": {
    "api": "https://www.kuaibozy.com/api.php/provide/vod",
    "name": "快播资源"
  },
  "yeyu": {
    "api": "https://yyff.540734621.xyz/api.php/provide/vod/",
    "name": "业余影视"
  },
  "huaweiba": {
    "api": "https://hw8.live/api.php/provide/vod/",
    "name": "华为吧资源"
  },
  "xiaohuangren": {
    "api": "https://iqyi.xiaohuangrentv.com/api.php/provide/vod/",
    "name": "小黄人影视"
  },
  "niuniu": {
    "api": "https://api.niuniuzy.me/api.php/provide/vod/",
    "name": "牛牛影视"
  },
  "yaya": {
    "api": "https://cj.yayazy.net/api.php/provide/vod/",
    "name": "丫丫影视"
  },
  "tantan": {
    "api": "https://apittzy.com/api.php/provide/vod",
    "name": "探探资源"
  },
  "kudian": {
    "api": "https://kudian10.com/api.php/provide/vod",
    "name": "酷点资源"
  },
  "tangrenjie": {
    "api": "https://tangrenjie.tv/api.php/provide/vod",
    "name": "唐人街影院"
  },
  "senlin": {
    "api": "https://slapibf.com/api.php/provide/vod",
    "name": "森林资源"
  },
  "yingku": {
    "api": "https://api.ykapi.net/api.php/provide/vod",
    "name": "影库资源"
  },
  "laoya": {
    "api": "https://api.apilyzy.com/api.php/provide/vod",
    "name": "老鸭资源"
  },
  "aidan": {
    "api": "https://lovedan.net/api.php/provide/vod",
    "name": "艾旦影视"
  },
  "piaohua": {
    "api": "https://www.zzrhgg.com/api.php/provide/vod",
    "name": "飘花影视"
  },
  "wangmin": {
    "api": "https://prinevillesda.org/api.php/provide/vod",
    "name": "网民电影"
  },
  "citong": {
    "api": "https://ys9.cttv.vip/api.php/provide/vod/",
    "name": "刺桐影视"
  },
  "guanwang": {
    "api": "https://gwcms.cttv.vip/api.php/provide/vod/",
    "name": "官网采集"
  },
  "zuida": {
    "api": "https://zuidazy.me/api.php/provide/vod/",
    "name": "最大资源"
  }
};

/** 转换为标准 SourceConfig 数组列表 */
export const CUSTOMER_SOURCES_LIST: SourceConfig[] = Object.entries(CUSTOMER_SITES).map(([key, item]) => {
  let safeUrl = item.api.trim().replace(/\/+$/, "");
  // 针对已知双栈域名优先升级为 https 规避 Mixed Content
  if (safeUrl.startsWith("http://")) {
    safeUrl = safeUrl.replace("http://", "https://");
  }
  return {
    key: `custom_${key}`,
    name: item.name.trim(),
    url: safeUrl,
    isAdult: false,
  };
});
