/**
 * 埋点适配层（2026-10-22）。
 *
 * 抖音端：`tt.reportAnalytics(eventName, params)`；Web/单测：只写 `globalThis.__fanrenAnalytics`
 * 环形缓冲 + console.debug，绝不发网络请求。
 *
 * 设计要点：
 * - **不依赖 cc**：可在 Vitest 直接跑（tests/analytics.test.ts）。
 * - **首开日**存平台 storage 的 `fanren_analytics_first_open`，不进存档 —— 老档迁移零改动。
 * - **一次性事件**用 `trackOnce` 的 storage 幂等键，跨启动只发一次。
 * - 事件名/参数白名单在 `core/analytics.ts`；本文件只负责运输与存储。
 */
import {
    ANALYTICS_EVENTS,
    AnalyticsEventName,
    AnalyticsParams,
    AnalyticsSaveSlice,
    buildLaunchParams,
    dayIndexBetween,
    isAnalyticsEvent,
    sanitizeAnalyticsParams,
} from '../core/analytics';

export interface AnalyticsProvider {
    track(name: AnalyticsEventName, params: Record<string, string | number>): void;
}

export interface AnalyticsStorage {
    get(key: string): string | null;
    set(key: string, value: string): void;
}

const FIRST_OPEN_KEY = 'fanren_analytics_first_open';
const ONCE_PREFIX = 'fanren_analytics_once_';

/** 抖音小游戏自定义分析（老基础库无此 API 时静默 no-op） */
class DouyinAnalyticsProvider implements AnalyticsProvider {
    constructor(private tt: any) {}

    track(name: AnalyticsEventName, params: Record<string, string | number>): void {
        try {
            this.tt.reportAnalytics(name, params);
        } catch (e) {
            // 埋点失败绝不能影响玩法：广告/存档链路都可能是同一帧
            console.warn(`[fanren] reportAnalytics failed: ${name}`, e);
        }
    }
}

/** Web/单测：仅本地留痕，供调试面板/自动化脚本读取 */
class WebAnalyticsProvider implements AnalyticsProvider {
    track(name: AnalyticsEventName, params: Record<string, string | number>): void {
        try {
            const g = globalThis as any;
            let buf = g.__fanrenAnalytics;
            if (!Array.isArray(buf)) {
                buf = [];
                g.__fanrenAnalytics = buf;
            }
            buf.push({ t: Date.now(), name, params });
            if (buf.length > 200) buf.splice(0, buf.length - 200);
            // 默认安静：调试时在 Console 设 `__fanrenAnalyticsVerbose = true` 再开日志。
            // 测试/回归不会刷屏；`__fanrenAnalytics` 缓冲始终可读。
            if (g.__fanrenAnalyticsVerbose === true) console.debug('[fanren:analytics]', name, params);
        } catch {
            // 调试端埋点异常不阻断游戏
        }
    }
}

function defaultStorage(): AnalyticsStorage {
    const tt = (globalThis as any).tt;
    if (tt && typeof tt.getStorageSync === 'function' && typeof tt.setStorageSync === 'function') {
        return {
            get(key: string): string | null {
                try {
                    const v = tt.getStorageSync(key);
                    if (typeof v === 'string') return v || null;
                    if (typeof v === 'number') return String(v);
                    return null;
                } catch {
                    return null;
                }
            },
            set(key: string, value: string): void {
                try {
                    tt.setStorageSync(key, value);
                } catch {
                    // 存储满/权限异常：埋点降级为 no-op
                }
            },
        };
    }
    if (typeof localStorage !== 'undefined') {
        return {
            get(key: string): string | null {
                try {
                    return localStorage.getItem(key);
                } catch {
                    return null;
                }
            },
            set(key: string, value: string): void {
                try {
                    localStorage.setItem(key, value);
                } catch {
                    // 隐私模式/配额异常：忽略
                }
            },
        };
    }
    const mem = new Map<string, string>();
    return {
        get: (key) => (mem.has(key) ? mem.get(key)! : null),
        set: (key, value) => { mem.set(key, value); },
    };
}

function defaultProvider(): AnalyticsProvider {
    const tt = (globalThis as any).tt;
    if (tt && typeof tt.reportAnalytics === 'function') return new DouyinAnalyticsProvider(tt);
    return new WebAnalyticsProvider();
}

export interface AnalyticsOptions {
    provider?: AnalyticsProvider;
    storage?: AnalyticsStorage;
    now?: () => number;
}

export class AnalyticsClient {
    private provider: AnalyticsProvider;
    private storage: AnalyticsStorage;
    private now: () => number;
    private save: AnalyticsSaveSlice | null = null;
    private initialized = false;
    private firstOpenMs = 0;
    private dayIndex = 0;
    private newUser = false;

    constructor(opts: AnalyticsOptions = {}) {
        this.provider = opts.provider ?? defaultProvider();
        this.storage = opts.storage ?? defaultStorage();
        this.now = opts.now ?? (() => Date.now());
    }

    /**
     * 启动时调用一次：解析首开日、发 `app_launch`。
     * 重复调用只更新 save 引用，不重复发启动事件（防 Game.init 被重入时刷量）。
     */
    init(save: AnalyticsSaveSlice): void {
        this.save = save;
        if (this.initialized) return;
        this.initialized = true;

        const raw = this.storage.get(FIRST_OPEN_KEY);
        const parsed = raw ? Number(raw) : NaN;
        if (Number.isFinite(parsed) && parsed > 0) {
            this.firstOpenMs = parsed;
            this.newUser = false;
        } else {
            this.firstOpenMs = this.now();
            this.newUser = true;
            this.storage.set(FIRST_OPEN_KEY, String(this.firstOpenMs));
        }
        this.dayIndex = dayIndexBetween(this.firstOpenMs, this.now());
        this.track('app_launch', buildLaunchParams(save, this.dayIndex, this.newUser));
    }

    /** 发一个事件；未登记的事件名直接丢弃（拼写错误不会污染后台） */
    track(name: string, params?: AnalyticsParams): void {
        if (!isAnalyticsEvent(name)) {
            if (typeof console !== 'undefined') console.warn(`[fanren] unknown analytics event: ${name}`);
            return;
        }
        const base: AnalyticsParams = this.save
            ? { realm_index: this.save.realmIndex, day_index: this.dayIndex }
            : {};
        const clean = sanitizeAnalyticsParams({ ...base, ...(params ?? {}) });
        try {
            this.provider.track(name, clean);
        } catch (e) {
            console.warn(`[fanren] analytics track failed: ${name}`, e);
        }
    }

    /** 一次性事件（首箱/首渡劫/首广告）：storage 幂等，跨启动只发一次 */
    trackOnce(onceKey: string, name: string, params?: AnalyticsParams): void {
        const key = ONCE_PREFIX + onceKey;
        if (this.storage.get(key) === '1') return;
        this.storage.set(key, '1');
        this.track(name, params);
    }

    get installDayIndex(): number {
        return this.dayIndex;
    }

    get firstOpenAt(): number {
        return this.firstOpenMs;
    }

    get isNewInstall(): boolean {
        return this.newUser;
    }

    /** 仅测试/调试用：复位内存态（不清 storage） */
    resetForTest(): void {
        this.initialized = false;
        this.save = null;
        this.firstOpenMs = 0;
        this.dayIndex = 0;
        this.newUser = false;
    }
}

export function createAnalyticsClient(opts: AnalyticsOptions = {}): AnalyticsClient {
    return new AnalyticsClient(opts);
}

/** 全局单例：页面/广告层直接 `Analytics.track(...)` */
export const Analytics = createAnalyticsClient();

/** 事件表（调试面板/文档生成可读） */
export { ANALYTICS_EVENTS };
