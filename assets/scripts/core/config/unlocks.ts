/**
 * 境界解锁表（D1-60s spec §4 / P1·P5，数值假设 #59）。
 *
 * **分层约束**：纯数据 + 纯函数，零 `cc`、零 System 依赖，可脱离引擎单测
 * （`tests/unlocks.test.ts`）。页面层只调 `isUnlocked` / `unlockedSlots`。
 *
 * 设计要点：
 * - **按境界解锁，不按天数**：天数会随版本/时区漂移，境界是确定进度；且「解锁」本身
 *   就是突破的奖励之一（第一次突破从 3 入口变 7 入口，玩家能感知到变强）；
 * - **凡人只有 3 个可点**：首日 60 秒内不做选择（spec §3 P1 的核心）；
 * - **修行必须与妖径同为筑基**：`QUESTS` 含「妖径通关 1 层」，若修行在练气解锁而妖径在
 *   筑基，练气期只有 3 个任务可完成、活跃度上限 75，100 档宝箱永远拿不到。筑基后
 *   开箱/渡劫/妖径/金雨 4 项正好 100（金丹再加剑冢，仍按「任意 4 项」满额）——这条
 *   不是风格偏好，是**活跃度可达性**的硬约束，改动前者必须同时改后者；
 * - **环形位保留占位、rail 位不构建**：未解锁的环形位渲染灰标「{境界}解锁」，
 *   让玩家看见「还有东西」，但**不绑点击**；rail 位整钮不建（否则右侧一列灰钮）。
 *
 * ⚠ 本期（2026-10-23）只落地**判定层**：HomeScene 的按表构建是独立一期（见
 * `docs/项目现状与后续规划.md` §9.5i）。原因：接入会把练气期玩家的可见入口从 17
 * 降到 7（妖径/论道/法器/吐纳/剑冢/炼丹/福禄全部收起），属**对存量玩家可见的功能削减**，
 * 需产品确认后再动首页。
 */

/** 功能 id（新增只能追加，不改既有 id —— 存档/埋点/测试都按 id 引用） */
export type FeatureId =
    // ---------- 凡人（3） ----------
    | 'box'
    | 'breakthrough'
    | 'settings'
    // ---------- 练气（4 → 累计 7） ----------
    | 'checkin'
    | 'collection'
    | 'shop'
    | 'dailyGift'
    // ---------- 筑基（5 → 累计 12） ----------
    | 'quests'
    | 'trail'
    | 'ludao'
    | 'weapon'
    | 'offline'
    // ---------- 金丹（4 → 累计 16） ----------
    | 'tower'
    | 'alchemy'
    | 'fortune'
    | 'sect'
    // ---------- 元婴（1 → 累计 17） ----------
    | 'path';

/** 首页落位：环形五钮 / 右 rail / 左 rail / 剑冢横幅 / 每日仙缘条 / 主 CTA / 页面内 */
export type UnlockSlot = 'ring' | 'railR' | 'railL' | 'tower' | 'gift' | 'cta' | 'page';

export interface UnlockEntry {
    id: FeatureId;
    /** 展示名（配置层直接带中文，与 REALMS/BOXES 的 name 同惯例） */
    label: string;
    /** 解锁所需的大境界下标（`realmIndex >= unlockRealm` 即可用） */
    unlockRealm: number;
    slot: UnlockSlot;
    /** 备注：为什么放这一档（给后续调表的人看） */
    why?: string;
}

/**
 * 全表（17 项，顺序即「解锁感知顺序」：同一档内先环形后 rail）。
 * `unlockRealm` 用境界下标（0 凡人 / 1 练气 / 2 筑基 / 3 金丹 / 4 元婴 / 5 化神）。
 */
export const UNLOCKS: readonly UnlockEntry[] = [
    // ---------- 凡人：只留一条路 ----------
    { id: 'box', label: '仙缘宝盒', unlockRealm: 0, slot: 'ring', why: '唯一产出修为的入口，必须开局可用' },
    { id: 'breakthrough', label: '冲击境界', unlockRealm: 0, slot: 'cta', why: '首日 60 秒的终点，主 CTA' },
    { id: 'settings', label: '设置', unlockRealm: 0, slot: 'railL', why: '协议/隐私/档案入口，合规必需' },

    // ---------- 练气：日常钩子 + 收集 + 第一个广告位 ----------
    { id: 'collection', label: '灵根图鉴', unlockRealm: 1, slot: 'ring', why: '开箱产出碎片的去处，形成第一个闭环' },
    { id: 'shop', label: '仙府商店', unlockRealm: 1, slot: 'ring', why: '灵石花掉的第一个出口' },
    { id: 'checkin', label: '签到', unlockRealm: 1, slot: 'railL', why: '次日回访的第一钩子' },
    { id: 'dailyGift', label: '每日仙缘', unlockRealm: 1, slot: 'gift', why: '首个广告位（首日上限 1 次）；首胜后才出现' },

    // ---------- 筑基：系统层展开（修行与妖径必须同档，见文件头） ----------
    { id: 'quests', label: '修行', unlockRealm: 2, slot: 'railR', why: '活跃度系统；与妖径同档才能把活跃度打到 100' },
    { id: 'trail', label: '妖径', unlockRealm: 2, slot: 'railR', why: '内容纵深；QUESTS 含「妖径通关 1 层」' },
    { id: 'ludao', label: '论道', unlockRealm: 2, slot: 'railR', why: '排行/论武/幻境/成就/宗门五个 tab，社交面' },
    { id: 'weapon', label: '法器', unlockRealm: 2, slot: 'railR', why: '锻体与六档法器，第二个成长轴' },
    { id: 'offline', label: '吐纳', unlockRealm: 2, slot: 'railL', why: '回访第二钩子；练气期单次收益过低，展示反而劝退' },

    // ---------- 金丹：中后期内容与社交 ----------
    { id: 'tower', label: '剑冢', unlockRealm: 3, slot: 'tower', why: '无限塔是长线续命内容，前置内容没消化完会分散' },
    { id: 'alchemy', label: '炼丹淬体', unlockRealm: 3, slot: 'ring', why: '灵石/灵材的第二出口，金丹期产出量才撑得起' },
    { id: 'fortune', label: '福禄炼制', unlockRealm: 3, slot: 'ring', why: '同上' },
    { id: 'sect', label: '宗门', unlockRealm: 3, slot: 'page', why: '论道页第 5 tab；社交是金丹后的留存主力' },

    // ---------- 元婴：长线目标可视化 ----------
    { id: 'path', label: '仙路总览', unlockRealm: 4, slot: 'railR', why: '五线进度总览，前四条线都没走完时看了只会焦虑' },
];

const INDEX: Record<string, UnlockEntry> = (() => {
    const m: Record<string, UnlockEntry> = {};
    UNLOCKS.forEach((u) => { m[u.id] = u; });
    return m;
})();

/** 全 id 列表（按表序；给测试与「全开」校验用） */
export const UNLOCK_IDS: FeatureId[] = Array.from(UNLOCKS).map((u) => u.id);

/** 取表项（未知 id 返回 null —— 脏档/旧存档兼容） */
export function unlockOf(id: string): UnlockEntry | null {
    return INDEX[id] ?? null;
}

/**
 * 是否已解锁。`realmIndex` 小于 0 或非有限值按凡人处理（脏档防御：
 * 宁可当新号，也不要把高阶入口误开给一个脏存档）。
 */
export function isUnlocked(id: FeatureId, realmIndex: number): boolean {
    const u = INDEX[id];
    if (!u) return false;
    const realm = Number.isFinite(realmIndex) && realmIndex > 0 ? realmIndex : 0;
    return realm >= u.unlockRealm;
}

/** 当前境界已解锁的项（按表序） */
export function unlockedAt(realmIndex: number): UnlockEntry[] {
    return UNLOCKS.filter((u) => isUnlocked(u.id, realmIndex));
}

/** 指定落位里已解锁的项（HomeScene 按 slot 构建时用） */
export function unlockedSlots(realmIndex: number, slot: UnlockSlot): UnlockEntry[] {
    return UNLOCKS.filter((u) => u.slot === slot && isUnlocked(u.id, realmIndex));
}

/** 下一档解锁所需的境界下标；已全开返回 null */
export function nextUnlockRealm(realmIndex: number): number | null {
    let next: number | null = null;
    UNLOCKS.forEach((u) => {
        if (u.unlockRealm > realmIndex && (next === null || u.unlockRealm < next)) next = u.unlockRealm;
    });
    return next;
}

/** 下一档将要解锁的项（「新功能已解锁」提示/仙路总览用）；已全开返回空数组 */
export function nextUnlockEntries(realmIndex: number): UnlockEntry[] {
    const next = nextUnlockRealm(realmIndex);
    return next === null ? [] : UNLOCKS.filter((u) => u.unlockRealm === next);
}

/** 刚刚（`realmIndex` 这一档）解锁的项 —— 首胜结算「新功能已解锁」卡片用 */
export function unlockedInTier(realmIndex: number): UnlockEntry[] {
    return UNLOCKS.filter((u) => u.unlockRealm === realmIndex);
}

/**
 * 计数校验（spec §4 的 3/7/12/16/17）。
 * 导出给测试与「仙路总览」共用：数字写死在两处必然漂移。
 */
export const UNLOCK_COUNT_BY_REALM: readonly number[] = [3, 7, 12, 16, 17, 17];
