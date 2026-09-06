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
        return ctx?.canvas ?? null;
    }

    /** 请求子域渲染好友榜（三个榜键之一）；不可用时 no-op */
    static requestRank(key: RankKey): void {
        const ctx = this.openContext();
        if (!ctx) return;
        try {
            ctx.postMessage({ type: 'renderRank', key });
            if (this.isDevtoolsSimulator()) console.log(`[fanren][social] requestRank ${key} sent`);
        } catch (e) {
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
                cb({ beat: parsed.beat, total: parsed.total, top: parsed.top });
            }
        };
        try {
            tt.onMessage(handler);
            ctx.postMessage({ type: 'compare', key, myValue: Math.max(0, Math.round(myValue)) });
        } catch (e) {
            cleanup();
            cb(null);
            return;
        }
        setTimeout(() => {
            if (!done) {
                done = true;
                cleanup();
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
        } catch (e) {
            console.warn('[fanren] social report failed', e);
        }
    }
}
