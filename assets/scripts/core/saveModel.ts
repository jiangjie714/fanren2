/** 存档模型 v6：v5 字段 + M14 秘境试炼（体力/连胜/段位）与道心，字段与 docs/数值假设.md 对齐 */
import { DestId } from './config/expeditions';
import { STAMINA_MAX, STAMINA_AD_PER_DAY } from './config/trial';
import { weekKeyOf } from './config/illusion';

export interface DailyState {
    /** 最近重置日期 YYYY-MM-DD（本地时区） */
    date: string;
    /** 每日仙缘（广告领免费凡俗宝盒）当日是否已用 */
    dailyGiftUsed: boolean;
    /** 月卡今日奖励是否已领 */
    monthlyClaimed: boolean;
    /** 今日已用灵石救济次数（docs/数值假设.md #19） */
    lingshiAidCount: number;
    // ---------- v2（M8 日常循环，#27–#29） ----------
    /** 每日任务进度：任务 id → 累计计数 */
    questProgress: Record<string, number>;
    /** 已领取的活跃度宝箱档位（[30, 60, 100] 的子集） */
    activityClaimed: number[];
    /** 今日已出发历练次数 */
    expeditionUsed: number;
    /** 今日历练广告召回是否已用 */
    expeditionRecallUsed: boolean;
    /** 今日心魔幻境免费次数是否已用 */
    illusionFreeUsed: boolean;
    /** 今日心魔幻境广告加次是否已用 */
    illusionAdUsed: boolean;
    /** 今日幻境最佳分（档位奖励结算依据） */
    illusionBest: number;
    /** 今日已发放的最高幻境奖励档位（0/60/120/180） */
    illusionRewardedTier: number;
    /** 今日已进行的论武场次（M11 #36） */
    pkUsed: number;
}

export interface SettingsState {
    sound: boolean;
    bgm: boolean;
}

export interface SaveStats {
    opens: number;
    breakthroughWins: number;
    breakthroughFails: number;
    // ---------- v3（M9a 成就/长线，#31） ----------
    /** 渡劫评分历史最高（0–100） */
    bestTribScore: number;
    /** 单局最大连击历史最高 */
    bestCombo: number;
    /** 完美接引（仙阶且零劫雨）累计次数 */
    perfectTribulations: number;
    /** 累计获得灵石（正向入账合计，成就指标） */
    lingshiEarned: number;
}

export interface AchievementState {
    /** 已达成（可领取）的成就 id */
    reached: string[];
    /** 已领取奖励的成就 id */
    claimed: string[];
}

export interface ExpeditionState {
    /** 进行中的目的地；null = 空闲 */
    dest: DestId | null;
    /** 出发时间（epoch ms） */
    startedAt: number;
}

// ---------- v4（M11 捏人 / 战斗属性 / 论武） ----------

/** 道号档案：捏人一次成型，性别决定首页立绘（#32） */
export interface ProfileState {
    /** 'm' | 'f'，影响首页与捏人立绘 */
    gender: 'm' | 'f';
    /** 道号（2~6 字，空串 = 尚未捏人，启动时进 ProfileScene） */
    name: string;
    createdAt: number;
}

/** 战斗成长：锻体等级 + 已拥有的法器档位（自动佩最高档，#33/#34） */
export interface CombatState {
    /** 锻体等级 0~20 */
    forging: number;
    /** 已购法器 tier 列表 */
    weapons: number[];
}

/** 论武战绩（#36） */
export interface PkState {
    wins: number;
    losses: number;
    /** 当前连胜（败清零） */
    streak: number;
    bestStreak: number;
}

// ---------- v5（M13 炼丹淬体 / 福禄炼制，#39–#41） ----------

/** 炼丹四维本体属性（智力/速度/淬体/机缘），各自封顶，重复炼制叠加 */
export interface AlchemyState {
    /** 四维属性值 */
    wisdom: number;
    speed: number;
    forging: number;
    fate: number;
}

/** 福禄炼制：永久攻防加值（与锻体乘算、法器档位并列），按品阶记录炼制次数 */
export interface FortuneState {
    /** 各品阶已炼制次数（grade → count） */
    crafts: Record<string, number>;
    /** 灵材库存（材料 id → 数量） */
    materials: Record<string, number>;
}

// ---------- v6（M14 秘境试炼 / 道心，#42–#45） ----------

/** 秘境试炼进度：体力经济 + 连胜轨 + 段位轨 */
export interface TrialState {
    /** 当前体力（0..STAMINA_MAX），读取时惰性回复 */
    stamina: number;
    /** 体力结算基准时间戳（epoch ms），惰性回复用，不吞余数 */
    staminaAt: number;
    /** 今日广告补给次数（0..STAMINA_AD_PER_DAY），随每日重置 */
    adRefillToday: number;
    /** 当前连胜（评分 <60 中断清零；护持可保留） */
    streak: number;
    /** 历史最高连胜（成就指标，本期只落字段） */
    bestStreak: number;
    /** 段位分（赛季制：周一结算后清零） */
    rankScore: number;
    /** 历史最高段位 id（跨赛季只升不降） */
    bestRank: string;
    /** 周键（本周一日期，同 illusionWeekKey 口径） */
    weekKey: string;
    /** 上赛季达到的段位 id（周奖待领取；'' = 无可领，跨周不补发） */
    seasonRank: string;
    /** 本周周奖是否已领取（幂等） */
    weekRewardClaimed: boolean;
}

export interface SaveData {
    version: 6;
    lingshi: number;
    xiuwei: number;
    jiyuan: number;
    /** 大境界下标（0=凡人） */
    realmIndex: number;
    /** 保底计数：连续未出稀有的开箱次数 */
    pityCount: number;
    /** 灵根碎片：id → 数量 */
    fragments: Record<string, number>;
    /** 已解锁灵根 id */
    unlocked: string[];
    daily: DailyState;
    /** 月卡到期时间戳（epoch ms），0 = 无 */
    monthlyCardExpire: number;
    settings: SettingsState;
    stats: SaveStats;
    /** 修真宝盒券（活跃度宝箱获得，免费开 1 次修真宝盒；不入每日重置） */
    xiuzhenTickets: number;
    /** 进行中的历练 */
    expedition: ExpeditionState;
    /** 幻境本周最佳分（周榜上报用，M9b） */
    illusionWeekBest: number;
    /** 幻境周键（本周一日期，跨周清零） */
    illusionWeekKey: string;
    // ---------- v3（M9a） ----------
    /** 幻境历史最高分（成就指标） */
    illusionBestEver: number;
    /** 成就达成/领取状态 */
    achievements: AchievementState;
    // ---------- v4（M11） ----------
    /** 道号档案（性别 + 道号），捏人前 name 为空串 */
    profile: ProfileState;
    /** 锻体与法器 */
    combat: CombatState;
    /** 论武战绩 */
    pk: PkState;
    // ---------- v5（M13） ----------
    /** 炼丹四维本体属性 */
    alchemy: AlchemyState;
    /** 福禄炼制与灵材库存 */
    fortune: FortuneState;
    // ---------- v6（M14） ----------
    /** 秘境试炼进度（体力/连胜/段位） */
    trial: TrialState;
    /** 道心层数（0..3），突破失败累积 +1（看 protect 广告 +2），突破成功清零（#45） */
    daoxin: number;
}

import { INITIAL_LINGSHI } from './config/economy';

export function defaultSave(): SaveData {
    return {
        version: 6,
        lingshi: INITIAL_LINGSHI,
        xiuwei: 0,
        jiyuan: 0,
        realmIndex: 0,
        pityCount: 0,
        fragments: {},
        unlocked: [],
        daily: {
            date: todayString(),
            dailyGiftUsed: false,
            monthlyClaimed: false,
            lingshiAidCount: 0,
            questProgress: {},
            activityClaimed: [],
            expeditionUsed: 0,
            expeditionRecallUsed: false,
            illusionFreeUsed: false,
            illusionAdUsed: false,
            illusionBest: 0,
            illusionRewardedTier: 0,
            pkUsed: 0,
        },
        monthlyCardExpire: 0,
        settings: { sound: true, bgm: true },
        stats: {
            opens: 0,
            breakthroughWins: 0,
            breakthroughFails: 0,
            bestTribScore: 0,
            bestCombo: 0,
            perfectTribulations: 0,
            lingshiEarned: 0,
        },
        xiuzhenTickets: 0,
        expedition: { dest: null, startedAt: 0 },
        illusionWeekBest: 0,
        illusionWeekKey: '',
        illusionBestEver: 0,
        achievements: { reached: [], claimed: [] },
        profile: { gender: 'm', name: '', createdAt: 0 },
        combat: { forging: 0, weapons: [] },
        pk: { wins: 0, losses: 0, streak: 0, bestStreak: 0 },
        alchemy: { wisdom: 0, speed: 0, forging: 0, fate: 0 },
        fortune: { crafts: {}, materials: {} },
        trial: {
            stamina: STAMINA_MAX,
            staminaAt: Date.now(),
            adRefillToday: 0,
            streak: 0,
            bestStreak: 0,
            rankScore: 0,
            bestRank: 'xuetu',
            weekKey: weekKeyOf(),
            seasonRank: '',
            weekRewardClaimed: false,
        },
        daoxin: 0,
    };
}

/**
 * 兼容旧版本存档：v1/v2/v3 → v4 保留全部玩家数据并补齐新字段；
 * 缺失字段回退默认值；未知版本（高于当前/损坏）一律重置。
 * 注意 profile.name 默认为空串：老玩家首次进入新版会走一次捏人流（保留原有进度）。
 */
export function migrate(raw: unknown): SaveData {
    const d = defaultSave();
    if (!raw || typeof raw !== 'object') return d;
    const r = raw as Record<string, unknown>;
    if (r.version !== 1 && r.version !== 2 && r.version !== 3 && r.version !== 4 && r.version !== 5 && r.version !== 6) return d;
    const profile = { ...d.profile, ...(r.profile as object ?? {}) };
    const srcTrial = (r.trial as Partial<TrialState>) ?? {};
    return {
        ...d,
        ...(r as object),
        daily: { ...d.daily, ...(r.daily as object ?? {}) },
        settings: { ...d.settings, ...(r.settings as object ?? {}) },
        stats: { ...d.stats, ...(r.stats as object ?? {}) },
        achievements: { ...d.achievements, ...(r.achievements as object ?? {}) },
        expedition: { ...d.expedition, ...(r.expedition as object ?? {}) },
        fragments: { ...(r.fragments as object ?? {}) },
        unlocked: Array.isArray(r.unlocked) ? (r.unlocked as string[]) : [],
        profile: {
            ...profile,
            // 性别字段只接受合法值，防止手改存档注入
            gender: profile.gender === 'f' ? 'f' : 'm',
            name: typeof profile.name === 'string' ? profile.name.slice(0, 8) : '',
        },
        combat: {
            ...d.combat,
            ...(r.combat as object ?? {}),
            weapons: Array.isArray(r.combat && (r.combat as CombatState).weapons)
                ? (r.combat as CombatState).weapons.filter((x) => Number.isInteger(x) && x >= 0 && x < 6)
                : [],
        },
        pk: { ...d.pk, ...(r.pk as object ?? {}) },
        // v5：四维与福禄/灵材，数值字段做非负整数钳制，防手改存档注入负数
        alchemy: {
            wisdom: clampInt((r.alchemy as AlchemyState)?.wisdom),
            speed: clampInt((r.alchemy as AlchemyState)?.speed),
            forging: clampInt((r.alchemy as AlchemyState)?.forging),
            fate: clampInt((r.alchemy as AlchemyState)?.fate),
        },
        fortune: {
            crafts: { ...((r.fortune as FortuneState)?.crafts as object ?? {}) },
            materials: { ...((r.fortune as FortuneState)?.materials as object ?? {}) },
        },
        // v6：秘境进度与道心。缺失字段（v5 老档）回退默认值，非法值（手改/损坏）同样回退
        // 安全默认而非 0——体力字段非法时按满体力起步，避免玩家因坏档被锁在秘境门外。
        trial: {
            stamina: Math.min(STAMINA_MAX, clampIntOr(srcTrial.stamina, d.trial.stamina)),
            staminaAt: typeof srcTrial.staminaAt === 'number' && Number.isFinite(srcTrial.staminaAt)
                ? srcTrial.staminaAt : d.trial.staminaAt,
            adRefillToday: Math.min(STAMINA_AD_PER_DAY, clampIntOr(srcTrial.adRefillToday, 0)),
            streak: clampIntOr(srcTrial.streak, 0),
            bestStreak: clampIntOr(srcTrial.bestStreak, 0),
            rankScore: clampIntOr(srcTrial.rankScore, 0),
            bestRank: typeof srcTrial.bestRank === 'string' ? srcTrial.bestRank : 'xuetu',
            weekKey: typeof srcTrial.weekKey === 'string' ? srcTrial.weekKey : d.trial.weekKey,
            seasonRank: typeof srcTrial.seasonRank === 'string' ? srcTrial.seasonRank : '',
            weekRewardClaimed: srcTrial.weekRewardClaimed === true,
        },
        daoxin: Math.min(3, clampIntOr(r.daoxin, 0)),
        version: 6,
    } as SaveData;
}

function clampInt(v: unknown): number {
    return Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0;
}

/** 非负整数钳制；缺失或非法回退 fallback（v6 迁移用，防手改存档注入） */
function clampIntOr(v: unknown, fallback: number): number {
    return Number.isInteger(v) && (v as number) >= 0 ? (v as number) : fallback;
}

export function todayString(now: Date = new Date()): string {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
