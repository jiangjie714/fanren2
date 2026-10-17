/**
 * M31 宗门社交（A18，docs/数值假设.md #57）判定层。
 *
 * **分层约束**：本模块零 `import 'cc'`，也**不依赖任何 System**（入账在
 * `systems/SectSystem.ts`），只负责「能不能做 / 做了以后变成什么状态 / 得到什么」，
 * 可脱离引擎与 UI 单测（tests/sect.test.ts）。
 *
 * 设计要点：
 * - 三候选加入制（免费，不做自建）；`id` 是存档唯一事实，其余全部派生；
 * - 成员 / 助力 / 候选成员数全部**确定性派生**（FNV-1a 字符串哈希 + 宗门 id 盐），
 *   同存档恒同结果——「认识」后能记住强弱（同 M25 道友档案化范式）；
 * - 日常三件事（俸禄 / 捐献 / 助力）走**惰性日键翻新**（同 offline.ts 口径），
 *   不占 DailyState、不进 dailyReset 扫描；
 * - 视图函数纯读不改存档；claim/donate/buy 才推进状态（调用方负责入账与落盘）。
 */
import { SaveData, todayString } from './saveModel';
import {
    SECTS,
    SECT_IDS,
    SectId,
    SECT_LEVELS,
    SECT_DONATE_TIERS,
    SECT_DONATE_CAP,
    SECT_CONTRIB_RATE,
    SECT_POSITIONS,
    SECT_HELP_XIUWEI,
    SECT_HELP_CONTRIB,
    SECT_SHOP_ITEMS,
    SectShopItem,
    SectShopGive,
    SECT_MEMBER_NAMES,
    SECT_MEMBER_CONTRIB_MIN,
    SECT_MEMBER_CONTRIB_SPAN,
    SECT_MEMBER_COUNT_MIN,
    SECT_MEMBER_COUNT_SPAN,
} from './config/sect';

// ---------- 确定性哈希（FNV-1a，无依赖纯函数） ----------

function hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

// ---------- 基础派生 ----------

export function sectOf(id: string | null | undefined) {
    return SECTS.find((s) => s.id === id) ?? null;
}

export function isSectId(id: unknown): id is SectId {
    return typeof id === 'string' && SECT_IDS.indexOf(id as SectId) >= 0;
}

/** 宗门等级（1..SECT_LEVELS.length） */
export function sectLevelOf(save: SaveData): number {
    if (!save.sect.id) return 0;
    let lv = 1;
    for (let i = 1; i < SECT_LEVELS.length; i++) {
        if (save.sect.exp >= SECT_LEVELS[i]) lv = i + 1;
    }
    return lv;
}

/** 职位（按累计贡献点推导，纯装饰） */
export function sectPositionOf(save: SaveData): string {
    let name = SECT_POSITIONS[0].name;
    for (const p of SECT_POSITIONS) {
        if (save.sect.totalContrib >= p.at) name = p.name;
    }
    return name;
}

/** 等级进度条视图（纯读） */
export function sectLevelProgress(save: SaveData): { level: number; cur: number; next: number | null; ratio: number } {
    const level = sectLevelOf(save);
    const cur = Math.max(0, save.sect.exp);
    const idx = level - 1;
    const base = SECT_LEVELS[idx] ?? 0;
    const next = idx + 1 < SECT_LEVELS.length ? SECT_LEVELS[idx + 1] : null;
    const ratio = next === null ? 1 : Math.max(0, Math.min(1, (cur - base) / (next - base)));
    return { level, cur, next, ratio };
}

// ---------- 候选 / 成员 ----------

export interface SectCandidateView {
    id: SectId;
    name: string;
    tagline: string;
    perk: string;
    /** 派生成员数（加入态展示） */
    memberCount: number;
}

/** 三候选视图（成员数按宗门 id 确定性派生） */
export function sectCandidates(): SectCandidateView[] {
    return SECTS.map((s) => ({
        id: s.id,
        name: s.name,
        tagline: s.tagline,
        perk: s.perk,
        memberCount: SECT_MEMBER_COUNT_MIN + (hashStr('members#' + s.id) % SECT_MEMBER_COUNT_SPAN),
    }));
}

/** 加入宗门（幂等：已加入同门返回 false；非法 id 返回 false） */
export function joinSect(save: SaveData, id: unknown): boolean {
    if (!isSectId(id)) return false;
    if (save.sect.id === id) return false;
    save.sect.id = id;
    return true;
}

export interface SectMemberView {
    name: string;
    contrib: number;
    isMe: boolean;
}

/** NPC 成员贡献派生（宗门 id 盐 + index，同存档恒同值） */
function memberContrib(sectId: string, index: number): number {
    return SECT_MEMBER_CONTRIB_MIN + (hashStr(sectId + '#' + index) % SECT_MEMBER_CONTRIB_SPAN);
}

/** 成员榜（top5 + 「我」按 totalContrib 插队；未加入返回空） */
export function sectMembers(save: SaveData): SectMemberView[] {
    if (!save.sect.id) return [];
    const npcs: SectMemberView[] = SECT_MEMBER_NAMES.map((name, i) => ({
        name,
        contrib: memberContrib(save.sect.id!, i),
        isMe: false,
    }));
    const mine: SectMemberView = { name: '我', contrib: Math.max(0, save.sect.totalContrib), isMe: true };
    const all = npcs.concat([mine]).sort((a, b) => b.contrib - a.contrib);
    const top = all.slice(0, 5);
    if (top.some((m) => m.isMe)) return top;
    const myRank = all.filter((m) => m.contrib > mine.contrib).length + 1;
    return top.concat([{ ...mine, name: `我（第 ${myRank} 名）` }]);
}

/** 我的成员排名（1 起） */
export function sectMyRank(save: SaveData): number {
    if (!save.sect.id) return 0;
    let rank = 1;
    for (let i = 0; i < SECT_MEMBER_NAMES.length; i++) {
        if (memberContrib(save.sect.id, i) > save.sect.totalContrib) rank++;
    }
    return rank;
}

/** 今日助力道友（按日键确定性轮选；未加入返回 null） */
export function todayHelper(save: SaveData, today: string): string | null {
    if (!save.sect.id) return null;
    const idx = hashStr('helper#' + today) % SECT_MEMBER_NAMES.length;
    return SECT_MEMBER_NAMES[idx];
}

// ---------- 日常三件事 ----------

export interface SectGain {
    xiuwei: number;
    contrib: number;
    /** 碎片（金乌） */
    frag: number;
}

/** 俸禄视图（纯读；未加入/已领返回 null） */
export function sectSalary(save: SaveData, today: string): SectGain | null {
    const s = sectOf(save.sect.id);
    if (!s) return null;
    if (save.sect.salaryDay === today) return null;
    const lv = sectLevelOf(save);
    return {
        xiuwei: s.salary.xiuweiPerLevel * lv,
        contrib: s.salary.contribPerLevel * lv,
        frag: s.salary.fragPerLevel * lv,
    };
}

/** 领俸禄（一日一次，幂等）；成功推进状态并返回奖励（入账由 SectSystem 做） */
export function claimSalary(save: SaveData, today: string): SectGain | null {
    const gain = sectSalary(save, today);
    if (!gain) return null;
    save.sect.salaryDay = today;
    save.sect.contrib += gain.contrib;
    save.sect.totalContrib += gain.contrib;
    return gain;
}

export interface SectDonateView {
    tiers: number[];
    /** 当日剩余可捐额度 */
    remaining: number;
    /** 各档当前可否捐（余额 + 日限） */
    canTiers: boolean[];
}

/** 捐献视图（纯读；日键过期时 remaining 按全额计） */
export function sectDonateView(save: SaveData, today: string): SectDonateView {
    const donated = save.sect.donateDay === today ? Math.max(0, save.sect.donatedToday) : 0;
    const remaining = Math.max(0, SECT_DONATE_CAP - donated);
    return {
        tiers: SECT_DONATE_TIERS.slice(),
        remaining,
        canTiers: SECT_DONATE_TIERS.map((t) => t <= remaining && save.lingshi >= t),
    };
}

export interface SectDonateResult {
    tier: number;
    contrib: number;
    exp: number;
}

/**
 * 捐献一档（日累计 20000 封顶 + 灵石余额判定）。
 * 成功：扣灵石由 SectSystem 执行，本函数推进 exp/contrib/日计数并返回结果。
 */
export function donate(save: SaveData, tier: number, today: string): SectDonateResult | null {
    if (SECT_DONATE_TIERS.indexOf(tier) < 0) return null;
    if (save.lingshi < tier) return null;
    if (save.sect.donateDay !== today) {
        save.sect.donateDay = today;
        save.sect.donatedToday = 0;
    }
    if (save.sect.donatedToday + tier > SECT_DONATE_CAP) return null;
    save.sect.donatedToday += tier;
    const contrib = Math.floor(tier * SECT_CONTRIB_RATE);
    save.sect.contrib += contrib;
    save.sect.totalContrib += contrib;
    save.sect.exp += tier;
    return { tier, contrib, exp: tier };
}

/** 助力视图（纯读；未加入/已助力返回 null） */
export function sectHelp(save: SaveData, today: string): { helper: string; gain: SectGain } | null {
    const s = sectOf(save.sect.id);
    const helper = todayHelper(save, today);
    if (!s || !helper) return null;
    if (save.sect.helpedDay === today) return null;
    const lv = sectLevelOf(save);
    return {
        helper,
        gain: { xiuwei: SECT_HELP_XIUWEI + 30 * lv, contrib: SECT_HELP_CONTRIB, frag: 0 },
    };
}

/** 领取助力（一日一次，幂等） */
export function claimHelp(save: SaveData, today: string): { helper: string; gain: SectGain } | null {
    const v = sectHelp(save, today);
    if (!v) return null;
    save.sect.helpedDay = today;
    save.sect.contrib += v.gain.contrib;
    save.sect.totalContrib += v.gain.contrib;
    return v;
}

// ---------- 商店 ----------

export interface SectShopRowView {
    item: SectShopItem;
    /** 当日已购次数（日键过期按 0 计） */
    boughtToday: number;
    /** 可否购买（贡献点足额 + 日限未尽） */
    canBuy: boolean;
}

/** 商店视图（纯读） */
export function sectShopView(save: SaveData, today: string): SectShopRowView[] {
    const fresh = save.sect.shopDay === today;
    return SECT_SHOP_ITEMS.map((item) => {
        const boughtToday = fresh ? Math.max(0, save.sect.bought[item.id] ?? 0) : 0;
        return { item, boughtToday, canBuy: save.sect.contrib >= item.cost && boughtToday < item.daily };
    });
}

/**
 * 购买商店商品（贡献点扣减 + 日限 + 惰性日键翻新）。
 * 成功返回 give（入账由 SectSystem 执行）；失败返回 null。
 */
export function buyShopItem(save: SaveData, id: string, today: string): SectShopGive | null {
    const item = SECT_SHOP_ITEMS.find((x) => x.id === id);
    if (!item) return null;
    if (save.sect.shopDay !== today) {
        save.sect.shopDay = today;
        save.sect.bought = {};
    }
    const bought = Math.max(0, save.sect.bought[item.id] ?? 0);
    if (bought >= item.daily) return null;
    if (save.sect.contrib < item.cost) return null;
    save.sect.contrib -= item.cost;
    save.sect.bought[item.id] = bought + 1;
    return item.give;
}

/** 今日日期键（供 UI 层调用，避免场景直接 import todayString 的散落） */
export function sectToday(now: Date = new Date()): string {
    return todayString(now);
}
