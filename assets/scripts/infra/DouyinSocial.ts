/**
 * 抖音社交能力封装（M9b 好友排行榜）。
 * 主域只负责"上报"（tt.setUserCloudStorage）与"请求"（postMessage 到开放数据域）；
 * 好友明文数据只能在子域内读取（tt.getFriendCloudStorage），渲染与对比计算都在子域完成。
 * 所有方法在非抖音端 / 子域不可用时安全降级（available() = false / 回调 null），页面层不感知差异。
 * 纯逻辑部分（解码/对比/消息校验）在 core/systems/SocialRank.ts，本文件不 import 'cc'（可被单测引用）。
 */
import { SaveData } from '../core/saveModel';
import { CompareResult, RankKey, parseSubMessage } from '../core/systems/SocialRank';
import { isDouyinRuntime } from './DouyinAd';

/** 排行上报键（docs/项目现状与后续规划.md 三、3.2，数值假设 #30） */
export const SOCIAL_KEYS = {
    /** 境界榜：realmIndex × 1e6 + min(xiuwei, 999999) */
    realmValue: 'realm_value',
    /** 幻境周榜：周键数值 × 1000 + 周最佳分 */
    illusionWeek: 'illusion_week',
    /** 渡劫评分榜：历史最高单局评分 */
    tribulationBest: 'tribulation_best',
} as const;

/** 对比回传超时（ms）：子域无响应走降级（docs/项目现状与后续规划.md 3.2） */
const COMPARE_TIMEOUT_MS = 800;

/**
 * M9b 真机联调自检快照：只读记录每个集成点最新状态，逻辑路径完全不受影响。
 * 真机/开发者工具里游戏 VM 与页面 global 隔离（CDP 摸不到内部），故用屏内诊断面板读取，
 * 而非依赖外部工具读状态。由 getDiag() 暴露给 SettingsScene 长按诊断面板。
 */
export interface SocialDiag {
    /** 是否检测到抖音运行时（tt 全局对象存在） */
    runtime: boolean;
    /** 开放数据域是否可用（tt.getOpenDataContext 为函数） */
    available: boolean;
    /** 主域取到的共享画布尺寸（子域绘制目标）；不可用时 null */
    sharedCanvas: { w: number; h: number } | null;
    /** 最近一次上报的三榜 KV 值与时间戳；未上报过为 null */
    lastReport: { values: Record<string, number>; at: number } | null;
    /** 最近一次好友对比结果（beat/total/top）；未对比过为 null */
    lastCompare: CompareResult | null;
    /** 最近一次捕获的错误（上报/请求/对比异常）；无错误为 null */
    lastError: string | null;
    /** compare 成功回传次数（验证子域消息回路） */
    compareCount: number;
    /** requestRank 发送次数（验证主→子渲染通路） */
    rankRequestCount: number;
}

const diagState: SocialDiag = {
    runtime: false,
    available: false,
    sharedCanvas: null,
    lastReport: null,
    lastCompare: null,
    lastError: null,
    compareCount: 0,
    rankRequestCount: 0,
};

/** 周键 → 榜值（跨周单调递增）：YYYYMMDD（周一日期）×1000 + 分数 */
export function encodeIllusionWeek(weekKey: string, best: number): number {
    const n = Number(weekKey.replace(/^W-/, '').replace(/-/g, '')) || 0;
    return n * 1000 + Math.max(0, Math.min(999, Math.round(best)));
}

export function encodeRealmValue(realmIndex: number, xiuwei: number): number {
    return realmIndex * 1_000_000 + Math.max(0, Math.min(999_999, Math.round(xiuwei)));
}

function ttApi(): any | null {
    if (!isDouyinRuntime()) return null;
    const tt = (globalThis as any).tt;
    return tt && typeof tt === 'object' ? tt : null;
}

export class DouyinSocial {
    /** 排行榜能力是否可用：抖音端且平台提供开放数据域（子域工程已随包发布） */
    static available(): boolean {
        const tt = ttApi();
        const ok = !!tt && typeof tt.getOpenDataContext === 'function';
        diagState.runtime = !!tt;
        diagState.available = ok;
        if (this.isDevtoolsSimulator()) console.log(`[fanren][social] available=${ok}`);
        return ok;
    }

    /** 开发者工具模拟器（日志诊断只在这里输出，真机保持安静） */
    static isDevtoolsSimulator(): boolean {
        try {
            const tt = ttApi();
            return !!tt?.getSystemInfoSync && tt.getSystemInfoSync().platform === 'devtools';
        } catch {
            return false;
        }
    }

    private static openContext(): any | null {
        if (!this.available()) return null;
        try {
            return (ttApi() as any).getOpenDataContext();
        } catch (e) {
            console.warn('[fanren] getOpenDataContext failed', e);
            return null;
        }
    }

    /** 子域共享画布（主域上传纹理用；不可用时 null，页面走降级展示） */
    static getSharedCanvas(): any | null {
        const ctx = this.openContext();
        const canvas = ctx?.canvas ?? null;
        if (canvas) diagState.sharedCanvas = { w: canvas.width ?? 0, h: canvas.height ?? 0 };
        return canvas;
    }

    /** 请求子域渲染好友榜（三个榜键之一）；不可用时 no-op */
    static requestRank(key: RankKey): void {
        const ctx = this.openContext();
        if (!ctx) return;
        try {
            ctx.postMessage({ type: 'renderRank', key });
            diagState.rankRequestCount++;
            if (this.isDevtoolsSimulator()) console.log(`[fanren][social] requestRank ${key} sent`);
        } catch (e) {
            diagState.lastError = `[requestRank] ${String(e).slice(0, 200)}`;
            console.warn('[fanren] requestRank failed', e);
        }
    }

    /**
     * 好友对比（"超越 n/m 位好友 · 最高 x"）：计算在子域，800ms 无响应或无数据 → null。
     * 回调保证恰好触发一次。
     */
    static compare(key: RankKey, myValue: number, cb: (r: CompareResult | null) => void): void {
        const tt = ttApi();
        const ctx = this.openContext();
        if (!ctx || !tt || typeof tt.onMessage !== 'function') {
            cb(null);
            return;
        }
        let done = false;
        const cleanup = () => {
            try {
                if (typeof tt.offMessage === 'function') tt.offMessage(handler);
            } catch { /* 平台差异，忽略 */ }
        };
        const handler = (msg: unknown) => {
            if (done) return;
            const parsed = parseSubMessage(msg);
            if (parsed && parsed.type === 'compareResult') {
                done = true;
                cleanup();
                const res = { beat: parsed.beat, total: parsed.total, top: parsed.top };
                diagState.lastCompare = res;
                diagState.compareCount++;
                cb(res);
            }
        };
        try {
            tt.onMessage(handler);
            ctx.postMessage({ type: 'compare', key, myValue: Math.max(0, Math.round(myValue)) });
        } catch (e) {
            cleanup();
            diagState.lastError = `[compare] ${String(e).slice(0, 200)}`;
            cb(null);
            return;
        }
        setTimeout(() => {
            if (!done) {
                done = true;
                cleanup();
                diagState.lastError = '[compare] 子域 800ms 无响应（超时降级）';
                cb(null);
            }
        }, COMPARE_TIMEOUT_MS);
    }

    /** 上报三榜数据（init / 回前台 / 渡劫与幻境结算后调用）；非抖音端 no-op */
    reportScores(save: SaveData): void {
        const tt = ttApi();
        if (!tt || typeof tt.setUserCloudStorage !== 'function') return;
        const values: Record<string, number> = {
            [SOCIAL_KEYS.realmValue]: encodeRealmValue(save.realmIndex, save.xiuwei),
            [SOCIAL_KEYS.illusionWeek]: encodeIllusionWeek(save.illusionWeekKey, save.illusionWeekBest),
            [SOCIAL_KEYS.tribulationBest]: save.stats.bestTribScore,
        };
        try {
            for (const [key, value] of Object.entries(values)) {
                tt.setUserCloudStorage({
                    KVDataList: [{ key, value: String(value) }],
                });
            }
            if (DouyinSocial.isDevtoolsSimulator()) console.log('[fanren][social] report', JSON.stringify(values));
            diagState.lastReport = { values, at: Date.now() };
        } catch (e) {
            diagState.lastError = `[reportScores] ${String(e).slice(0, 200)}`;
            console.warn('[fanren] social report failed', e);
        }
    }

    /** 真机联调自检快照：只读最近状态，逻辑不受影响。供 SettingsScene 长按诊断面板读取。 */
    static getDiag(): SocialDiag {
        const d = diagState;
        return {
            runtime: d.runtime,
            available: d.available,
            sharedCanvas: d.sharedCanvas ? { ...d.sharedCanvas } : null,
            lastReport: d.lastReport ? { values: { ...d.lastReport.values }, at: d.lastReport.at } : null,
            lastCompare: d.lastCompare ? { ...d.lastCompare } : null,
            lastError: d.lastError,
            compareCount: d.compareCount,
            rankRequestCount: d.rankRequestCount,
        };
    }
}
