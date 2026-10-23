/**
 * 离线战报缓存（M36 优化）：把「上次每日天劫的结果」写进平台 storage，
 * 用于「回来第一屏」的即时反馈与分享素材复用。
 *
 * 为什么不用存档：存档只记分数/次数，不记「这一局的明细与词条」；战报只是展示缓存，
 * 丢了不影响任何数值（损坏/缺失一律当没有）。放平台 storage 也避免 bump 存档版本。
 *
 * 与 `core/tianjie.ts` 同层约束：零 `cc` 依赖，可单测。
 */
import { Modifier, modifierById } from './tianjie';

export const TIANJIE_REPORT_KEY = 'fanren_tianjie_report_v1';

/** 一份战报快照（只存渲染需要的字段；分数已含词条倍率） */
export interface TianjieReport {
    /** 对局日期 YYYY-MM-DD */
    day: string;
    /** 分数 0–100 */
    score: number;
    /** 评级文案 */
    rating: string;
    gold: number;
    blue: number;
    red: number;
    maxCombo: number;
    /** 词条 id 列表（渲染时用 modifierById 还原文案；未知 id 自动丢弃） */
    mods: string[];
    /** 是否当日新纪录 */
    newBest: boolean;
    /** 写入时间戳 */
    at: number;
}

export interface ReportStorage {
    get(key: string): string | null;
    set(key: string, value: string): void;
}

/** 序列化（只 white-list 字段，绝不透传未知属性） */
export function encodeReport(r: TianjieReport): string {
    return JSON.stringify({
        d: r.day,
        s: r.score,
        rt: r.rating,
        g: r.gold,
        b: r.blue,
        x: r.red,
        c: r.maxCombo,
        m: r.mods,
        n: r.newBest ? 1 : 0,
        t: r.at,
    });
}

/** 反序列化 + 钳制（脏数据返回 null，不抛） */
export function decodeReport(raw: string | null): TianjieReport | null {
    if (!raw) return null;
    let o: any;
    try {
        o = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!o || typeof o !== 'object') return null;
    const num = (v: unknown, max: number) => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return 0;
        return Math.min(max, Math.round(n));
    };
    const day = typeof o.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.d) ? o.d : '';
    if (!day) return null;
    const mods = Array.isArray(o.m)
        ? o.m.filter((id: unknown): id is string => typeof id === 'string' && !!modifierById(id))
        : [];
    return {
        day,
        score: num(o.s, 100),
        rating: typeof o.rt === 'string' ? o.rt.slice(0, 8) : '',
        gold: num(o.g, 999),
        blue: num(o.b, 999),
        red: num(o.x, 999),
        maxCombo: num(o.c, 999),
        mods,
        newBest: o.n === 1,
        at: num(o.t, Number.MAX_SAFE_INTEGER),
    };
}

/** 词条 id → 词条对象（未知 id 丢弃，保证面板文案永不出现空行） */
export function resolveMods(ids: readonly string[]): Modifier[] {
    const out: Modifier[] = [];
    ids.forEach((id) => {
        const m = modifierById(id);
        if (m) out.push(m);
    });
    return out;
}
