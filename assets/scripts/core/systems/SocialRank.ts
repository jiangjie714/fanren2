/**
 * M9b 好友排行榜纯逻辑：KV 值解码、对比计算、子域消息校验与展示格式化。
 * ⚠️ 语义与 open-data-context/game.js 内的实现保持同步（子域是独立 JS 环境无法 import 本文件，
 * 修改这里时必须同步子域），本文件为主域展示/测试与语义的唯一事实源。
 */
export type RankKey = 'realm_value' | 'illusion_week' | 'tribulation_best';

export const RANK_KEYS: RankKey[] = ['realm_value', 'illusion_week', 'tribulation_best'];

export interface FriendEntry {
    nickname: string;
    value: number;
}

export interface CompareResult {
    /** 值严格小于我的好友数（平局不算"超越"） */
    beat: number;
    /** 有该键数据的好友总数 */
    total: number;
    /** 好友最高值（无数据为 0） */
    top: number;
}

/** realm_value = 境界×1e6 + min(修为,999999)（编码见 infra/DouyinSocial） */
export function decodeRealmValue(v: number): { realmIndex: number; xiuwei: number } {
    const idx = Math.floor(Math.max(0, v) / 1_000_000);
    return { realmIndex: idx, xiuwei: Math.max(0, v - idx * 1_000_000) };
}

/** illusion_week = 周键(周一YYYYMMDD)×1000 + min(周最佳,999)；跨周自然单调 */
export function decodeIllusionWeek(v: number): { score: number } {
    return { score: Math.max(0, v % 1000) };
}

/**
 * 好友对比：主域拿不到好友明文，实际计算在子域 game.js 内执行；
 * 本函数是该语义的主域镜像（单测锁定），供降级展示与回归对照。
 */
export function computeCompare(myValue: number, friendValues: number[]): CompareResult {
    const vals = friendValues.filter((v) => Number.isFinite(v) && v > 0);
    return {
        beat: vals.filter((v) => myValue > v).length,
        total: vals.length,
        top: vals.length ? Math.max(...vals) : 0,
    };
}

/** 榜单排序：值降序，同值按昵称字典序稳定排列 */
export function sortEntries(entries: FriendEntry[]): FriendEntry[] {
    return [...entries].sort((a, b) => (b.value - a.value) || a.nickname.localeCompare(b.nickname, 'zh'));
}

export type SubMessage =
    | { type: 'rankReady' }
    | { type: 'compareResult'; beat: number; total: number; top: number };

/** 子域 → 主域消息校验：非法/未知消息返回 null（超时兜底由调用方处理） */
export function parseSubMessage(msg: unknown): SubMessage | null {
    if (!msg || typeof msg !== 'object') return null;
    const m = msg as Record<string, unknown>;
    if (m.type === 'rankReady') return { type: 'rankReady' };
    if (m.type === 'compareResult') {
        const beat = Number(m.beat);
        const total = Number(m.total);
        const top = Number(m.top);
        if (![beat, total, top].every(Number.isFinite)) return null;
        return {
            type: 'compareResult',
            beat: Math.max(0, Math.floor(beat)),
            total: Math.max(0, Math.floor(total)),
            top: Math.max(0, Math.floor(top)),
        };
    }
    return null;
}

/** 榜值展示格式化（论道页/调试用） */
export function formatRankValue(key: RankKey, v: number): string {
    if (key === 'realm_value') {
        const d = decodeRealmValue(v);
        return `境界${d.realmIndex} · 修为${d.xiuwei}`;
    }
    if (key === 'illusion_week') return `${decodeIllusionWeek(v).score} 分`;
    return `${Math.max(0, v)} 分`;
}
