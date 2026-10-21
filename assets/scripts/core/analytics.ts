/**
 * 埋点事件表（唯一事实源，2026-10-22）。
 *
 * **分层约束**：本模块零 `import 'cc'`、零 System 依赖，只做「事件白名单 + 参数清洗 +
 * 首开日计算」，由 `infra/Analytics.ts` 负责抖音 `tt.reportAnalytics` / Web 调试实现。
 *
 * 新增事件：先在本文件 `ANALYTICS_EVENTS` 登记（事件名 + 参数名），再在调用点
 * `Analytics.track(...)`。未登记的事件会被静默丢弃 —— 防止拼写错误污染后台。
 *
 * 命名口径：小写 snake_case；参数只用 ASCII 字母/数字/下划线，值最多 64 字符。
 * 不在参数里放道号、设备号等可识别信息（隐私政策只承诺匿名行为统计）。
 */

export type AnalyticsEventName =
    | 'app_launch'
    | 'onboarding_profile_view'
    | 'onboarding_profile_complete'
    | 'first_home'
    | 'box_open'
    | 'first_box'
    | 'breakthrough_start'
    | 'breakthrough_result'
    | 'first_breakthrough_success'
    | 'first_breakthrough_fail'
    | 'ad_request'
    | 'ad_result'
    | 'first_ad_success';

export interface AnalyticsEventMeta {
    /** 中文说明，给运营在字节后台「自定义分析」登记时抄 */
    desc: string;
    /** 事件参数名（公共参数 realm_index / day_index 由 infra 自动附加，不重复列） */
    params: string[];
}

export const ANALYTICS_EVENTS: Record<AnalyticsEventName, AnalyticsEventMeta> = {
    app_launch: {
        desc: '启动：首开日索引 / 新老用户 / 进度快照（D1 回访看 day_index）',
        params: ['day_index', 'is_new_user', 'realm_index', 'total_opens', 'total_wins', 'total_fails'],
    },
    onboarding_profile_view: {
        desc: '打开捏人 / 道友档案页',
        params: ['realm_index'],
    },
    onboarding_profile_complete: {
        desc: '捏人确认（不传道号本身，只传性别/字数/是否随机）',
        params: ['gender', 'name_len', 'used_random'],
    },
    first_home: {
        desc: '首次进入主页（一次安装只发一次；60 秒漏斗的起点）',
        params: ['realm_index', 'total_opens'],
    },
    box_open: {
        desc: '每次开箱（含连开 / 继续求索；首日漏斗的核心步）',
        params: ['box_id', 'tier', 'mode', 'cost', 'resonated', 'pity', 'jiyuan', 'opens', 'used_ticket'],
    },
    first_box: {
        desc: '首次开箱（一次安装只发一次）',
        params: ['box_id', 'tier'],
    },
    breakthrough_start: {
        desc: '进入灵气雨渡劫（首战 100% 也照发，用于看「到渡劫前流失」）',
        params: ['target_realm', 'base_rate', 'first_battle', 'daoxin'],
    },
    breakthrough_result: {
        desc: '渡劫结算（成功/失败、最终概率、评分）',
        params: ['success', 'target_realm', 'rate', 'score', 'first_result', 'first_battle'],
    },
    first_breakthrough_success: {
        desc: '首次渡劫成功（一次安装只发一次；60 秒漏斗的终点）',
        params: ['target_realm', 'rate', 'score'],
    },
    first_breakthrough_fail: {
        desc: '首次渡劫失败（一次安装只发一次）',
        params: ['target_realm', 'rate', 'score'],
    },
    ad_request: {
        desc: '点击广告入口（request 不一定有 fill / 播完）',
        params: ['place', 'configured', 'sim', 'limit'],
    },
    ad_result: {
        desc: '广告结算：成功 / 跳过 / 异常',
        params: ['place', 'result', 'duration_ms', 'sim'],
    },
    first_ad_success: {
        desc: '首次广告完整播完（一次安装只发一次；看首日广告渗透）',
        params: ['place'],
    },
};

export type AnalyticsValue = string | number | boolean;
export type AnalyticsParams = Record<string, AnalyticsValue>;

export const ANALYTICS_MAX_KEYS = 20;
export const ANALYTICS_MAX_STRING = 64;

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;

/** 事件名是否在白名单内（类型守卫） */
export function isAnalyticsEvent(name: string): name is AnalyticsEventName {
    return Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, name);
}

/**
 * 参数清洗：丢弃非法键 / 非有限数字 / 空串，布尔统一 1/0，字符串截断 64 字符。
 * 返回新对象，不改调用方入参。
 */
export function sanitizeAnalyticsParams(params?: AnalyticsParams): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    if (!params) return out;
    let count = 0;
    for (const key of Object.keys(params)) {
        if (count >= ANALYTICS_MAX_KEYS) break;
        if (!KEY_RE.test(key)) continue;
        const raw = params[key];
        if (raw === undefined || raw === null) continue;
        if (typeof raw === 'boolean') {
            out[key] = raw ? 1 : 0;
            count += 1;
            continue;
        }
        if (typeof raw === 'number') {
            if (!Number.isFinite(raw)) continue;
            out[key] = raw;
            count += 1;
            continue;
        }
        const text = String(raw).trim().slice(0, ANALYTICS_MAX_STRING);
        if (!text) continue;
        out[key] = text;
        count += 1;
    }
    return out;
}

/** 本地自然日键 YYYY-MM-DD（与存档 `daily.date` 同口径） */
export function dayKeyOf(ms: number): string {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * 首开日至今天然日差（0 = 首日，1 = 次日）。
 * 用「本地日期分量 → UTC 毫秒」计算，避免夏令时/23 小时日造成 ±1 天漂移。
 */
export function dayIndexBetween(firstMs: number, nowMs: number): number {
    if (!Number.isFinite(firstMs) || !Number.isFinite(nowMs)) return 0;
    const a = dayKeyOf(firstMs).split('-').map(Number);
    const b = dayKeyOf(nowMs).split('-').map(Number);
    const utcA = Date.UTC(a[0], a[1] - 1, a[2]);
    const utcB = Date.UTC(b[0], b[1] - 1, b[2]);
    return Math.max(0, Math.round((utcB - utcA) / 86400000));
}

/** 启动事件只依赖存档的这几个字段，避免 core 反向依赖完整 SaveData */
export interface AnalyticsSaveSlice {
    realmIndex: number;
    stats: {
        opens: number;
        breakthroughWins: number;
        breakthroughFails: number;
    };
}

/** 组装 app_launch 参数（纯函数，便于单测） */
export function buildLaunchParams(
    save: AnalyticsSaveSlice,
    dayIndex: number,
    isNewUser: boolean,
): AnalyticsParams {
    return {
        day_index: Math.max(0, Math.floor(dayIndex)),
        is_new_user: isNewUser ? 1 : 0,
        realm_index: save.realmIndex,
        total_opens: save.stats.opens,
        total_wins: save.stats.breakthroughWins,
        total_fails: save.stats.breakthroughFails,
    };
}
