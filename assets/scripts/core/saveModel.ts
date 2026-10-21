/** 存档模型 v15：v14 字段 + D1-60s 新手三连（starter，#59） */
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
    /** 今日秘境结算奖励翻倍已用次数（M14-5 #46，上限 3） */
    doubleRewardUsed: number;
    /** 今日已领交情礼灵石（M25 #50：friend 胜利 100/场，日封顶 200） */
    pkFriendGift?: number;
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

// ---------- v7（M15 妖径，#47） ----------

/** 妖径爬关进度：线性层号单指针，首通状态由 curLayer 推导，零冗余 */
export interface TrailState {
    /** 当前可挑战层（= 已通关最高层 +1）；非法值迁移时钳制为 1 */
    curLayer: number;
    /** 已领章节大礼的章节号列表（每章一次） */
    chapterGifts: number[];
    /** 今日重刷产出计数（5 次护栏，#47；day = 日期键，跨日翻新） */
    dailyRepeat: { day: string; count: number };
}

// ---------- v8（M22 剑冢试炼，#48） ----------

/** 剑冢爬塔进度：只存整数淬剑等级，剑气/成本一律运行时派生（规避浮点累积与溢出） */
export interface TowerState {
    /** 历史最深层（只升不降，起点 1） */
    best: number;
    /** 淬剑等级（整数 ≥0）；剑气 = 10 × 1.05^n */
    swordLevel: number;
    /** 煞晶余额（塔内专属货币，跨局跨日累积） */
    crystal: number;
    /** 今日主线回灌进度（day = 日期键，跨日翻新） */
    daily: { day: string; lingshi: number; mats: number; xiuwei: number };
}

// ---------- v9（M26 连续登录签到，#53） ----------

/**
 * 签到进度。**刻意放顶层而非 daily**：连续天数是跨日持久语义，
 * 放进 daily 会让「每日状态」与「连续状态」混淆（daily 语义是「每天清一次」）。
 * `lastDay` 同时承担「今日是否已领」的判定（=== today 即已领），故无需额外布尔字段。
 *
 * v14（A20 补签/双倍，#58）：新增 `makeupDay`/`doubledDay` 两个日键幂等字段，
 * 空串 = 从未补过/翻过——老档（v13）迁移时无脑补空串即正确语义。
 */
export interface CheckinState {
    /** 上次领取日期 YYYY-MM-DD；'' = 从未领取（首日即可领第 1 档） */
    lastDay: string;
    /** 连续天数（断签重置为 1，随领取递增） */
    streak: number;
    /** 累计登录天数（只增，里程碑依据） */
    totalDays: number;
    /** 已领取的里程碑天数（幂等） */
    milestonesClaimed: number[];
    /** 上次补签补的是哪一天（'' = 从未补签）；UI 展示 + 防重复补 */
    makeupDay: string;
    /** 上次双倍签到发生在哪一天（'' = 从未翻倍）；幂等键，同 claimedToday 范式 */
    doubledDay: string;
}

/**
 * 新手引导进度（M27，#54）。**刻意放顶层而非 daily**：引导完成是跨会话持久语义，
 * 放进 daily 会被每日重置清掉，玩家每天重看一遍引导。
 * 只存 `done` 一个布尔 —— 当前展示哪一步由 `core/guide.ts` 从存档状态推导，
 * 再存一份 `step` 会造成「存档里的步 vs 实际状态」双源真相。
 */
export interface GuideState {
    /** 已完成 / 主动跳过；true 后引导永不再现 */
    done: boolean;
}

// ---------- v11（M29 离线吐纳，#55） ----------

/**
 * 离线吐纳进度（#55）。**刻意放顶层而非 daily**：daily 是「每天清一次的开关集合」，
 * 而 offline 是带时间戳的连续量，且它的跨日重置发生在**结算那一瞬**（惰性），
 * 与 dailyReset() 的自然日扫描不同步 —— 混在一起就会出现「先结算还是先重置」的竞态。
 *
 * 只存三个数：**收益一分钱都不落盘**。最后一帧的速率变了（如境界提升）只会影响
 * 未来的结算，不会追溯改写已发放的量，也不存在孤立的「待领取池」需要维护。
 */
export interface OfflineState {
    /** 最后一次在线心跳（epoch ms）；在线时每 ~1s 前移，离线期间冻结 */
    lastAt: number;
    /** 日累计额度的日键 YYYY-MM-DD（惰性翻新，非 dailyReset 扫描） */
    day: string;
    /** 当日已结算分钟数（0..480） */
    dayMin: number;
}

// ---------- v12（M30 剧情文本，#56） ----------

/**
 * 剧情节拍进度（#56）。**刻意放顶层而非 daily**：「听过哪些故事」是跨会话持久语义，
 * 放进 daily 会被每日重置清掉，玩家每天重听一遍开局。
 * 只存 `seen`（听过的节拍 id 列表）—— 当前该播哪节由 `core/story.ts` 从存档状态推导，
 * 文案在 `core/config/story.ts`，存档里不落一句对白。
 */
export interface StoryState {
    /** 已听过（含主动跳过）的节拍 id；迁移时只保留注册表内 id 并去重 */
    seen: string[];
}

// ---------- v13（M31 宗门社交，#57） ----------

/**
 * 宗门状态。`id` 是唯一事实源（三宗门之一或 null），等级/职位/成员全部派生不存；
 * `contrib` 是**可花余额**，`totalContrib` 是**累计获得**（职位推导用）——两者分开，
 * 否则花掉贡献点会把职位降级（「当过长老了不可能贬回弟子」）。
 */
export interface SectState {
    id: string | null;
    /** 宗门经验（只来自捐献，累计值） */
    exp: number;
    /** 累计获得的贡献点（职位推导，只增不减） */
    totalContrib: number;
    /** 当前可花贡献点余额 */
    contrib: number;
    /** 俸禄已领日键 YYYY-MM-DD；'' = 从未领取 */
    salaryDay: string;
    /** 捐献日键（惰性翻新） */
    donateDay: string;
    /** 当日已捐献灵石合计（日上限 20000） */
    donatedToday: number;
    /** 助力已领日键 */
    helpedDay: string;
    /** 商店日限日键（惰性翻新） */
    shopDay: string;
    /** 商品 id → 当日已购次数 */
    bought: Record<string, number>;
}

// ---------- v15（D1-60s 首日 60 秒，#59） ----------

/**
 * 新手三连开箱进度（D1-60s）。**刻意放顶层而非 daily**：done 是跨会话持久语义
 * （「这个号是否走过 60 秒新手流」），放进 daily 会被每日重置清掉，玩家每天重看一遍新手流。
 * 两个布尔分工：`done` = 新手流已走完/已跳过（主页据此切常规布局）；
 * `jiyuanGranted` = 60 机缘一次性赠送已发放（幂等键，与 done 构成双重保险）。
 */
export interface StarterState {
    /** 新手三连流是否已走完（true 后主页走常规布局） */
    done: boolean;
    /** 60 机缘赠送是否已发放（一次性，幂等） */
    jiyuanGranted: boolean;
}

export interface SaveData {
    version: 15;
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
    // ---------- v7（M15） ----------
    /** 妖径爬关进度（历练重构，#47） */
    trail: TrailState;
    // ---------- v8（M22） ----------
    /** 剑冢爬塔进度（#48） */
    tower: TowerState;
    // ---------- v9（M26） ----------
    /** 连续登录签到进度（#53） */
    checkin: CheckinState;
    // ---------- v10（M27） ----------
    /** 新手引导进度（#54） */
    tutorial: GuideState;
    // ---------- v11（M29） ----------
    /** 离线吐纳进度（#55） */
    offline: OfflineState;
    // ---------- v12（M30） ----------
    /** 剧情节拍进度（#56） */
    story: StoryState;
    // ---------- v13（M31） ----------
    /** 宗门社交进度（#57）；id=null = 未加入 */
    sect: SectState;
    // ---------- v15（D1-60s） ----------
    /** 新手三连开箱进度（#59）；done=true = 已走完 60 秒新手流 */
    starter: StarterState;
}

import { INITIAL_LINGSHI } from './config/economy';
import { STORY_BEAT_IDS } from './config/story';
import { SECT_IDS } from './config/sect';

/**
 * 与 `core/offline.ts` 的 OFFLINE_DAY_CAP 同步。**刻意不 import**：offline.ts 依赖
 * 本文件的 SaveData/todayString，反过来引会形成循环依赖；此处镜像由
 * tests/offline.test.ts 的「配置一致性」用例守护（两处常量必须相等）。
 */
const OFFLINE_DAY_CAP_MIRROR = 480;

export function defaultSave(): SaveData {
    return {
        version: 15,
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
            illusionFreeUsed: false,
            illusionAdUsed: false,
            illusionBest: 0,
            illusionRewardedTier: 0,
            pkUsed: 0,
            doubleRewardUsed: 0,
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
        trail: {
            curLayer: 1,
            chapterGifts: [],
            dailyRepeat: { day: '', count: 0 },
        },
        tower: {
            best: 1,
            swordLevel: 0,
            crystal: 0,
            daily: { day: '', lingshi: 0, mats: 0, xiuwei: 0 },
        },
        checkin: {
            lastDay: '',
            streak: 0,
            totalDays: 0,
            milestonesClaimed: [],
            // v14 A20：没补过没翻过
            makeupDay: '',
            doubledDay: '',
        },
        tutorial: { done: false },
        // v11 离线吐纳：lastAt 取「此刻」——新玩家不会一进门就收到「离线十年」的假象
        offline: { lastAt: Date.now(), day: todayString(), dayMin: 0 },
        // v12 剧情文本：白纸开局 —— 开局节拍条件含 realmIndex===0，新玩家必然听到
        story: { seen: [] },
        // v13 宗门社交：未加入 —— 进论道页看到三候选，自选加入（不补课）
        sect: {
            id: null,
            exp: 0,
            totalContrib: 0,
            contrib: 0,
            salaryDay: '',
            donateDay: '',
            donatedToday: 0,
            helpedDay: '',
            shopDay: '',
            bought: {},
        },
        // v15 新手三连：白纸开局 —— 新号直进主页走 60 秒新手流
        starter: { done: false, jiyuanGranted: false },
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
    if (r.version !== 1 && r.version !== 2 && r.version !== 3 && r.version !== 4 && r.version !== 5 && r.version !== 6 && r.version !== 7 && r.version !== 8 && r.version !== 9 && r.version !== 10 && r.version !== 11 && r.version !== 12 && r.version !== 13 && r.version !== 14 && r.version !== 15) return d;
    const profile = { ...d.profile, ...(r.profile as object ?? {}) };
    const srcTrial = (r.trial as Partial<TrialState>) ?? {};
    return {
        ...d,
        ...(r as object),
        daily: { ...d.daily, ...(r.daily as object ?? {}) },
        settings: { ...d.settings, ...(r.settings as object ?? {}) },
        stats: { ...d.stats, ...(r.stats as object ?? {}) },
        achievements: { ...d.achievements, ...(r.achievements as object ?? {}) },
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
        // v7：妖径爬关进度。curLayer 非法（0/负/非整数）钳制为 1；
        // chapterGifts 只保留非负整数并去重有序（损坏数据清洗）；
        // dailyRepeat.count 非负钳制、day 非字符串回退空串（跨日翻新时自然重置）。
        trail: migrateTrail(r.trail),
        // v8：剑冢爬塔进度（v7 老档无此字段 → 缺省补齐；非法值钳制，防手改存档注入）
        tower: migrateTower(r.tower),
        // v9：连续登录签到（v8 老档无此字段 → 缺省补齐，首日即可领第 1 档）
        checkin: migrateCheckin(r.checkin),
        // v10：新手引导（v9 老档无此字段 → 未跳过；老玩家多半 realmIndex > 0，
        // 首次 sync 即被判定「目标已达成」并补写 done，实际不会挡路）
        tutorial: migrateTutorial(r.tutorial),
        // v11：离线吐纳（v10 老档无此字段 → 从「此刻」起算，不给白条收益）
        offline: migrateOffline(r.offline),
        // v12：剧情文本（v11 老档无此字段 → 全未听过；老玩家 realmIndex>0 不触发 opening，
        // 境界节拍只在新的成功结算页触发 —— 与剧情擦肩过，仙闻录里留「未听闻」，不补课）
        story: migrateStory(r.story),
        // v13：宗门社交（v12 老档无此字段 → 未加入，进论道页自选，不补课）
        sect: migrateSect(r.sect),
        // v15：新手三连（v14 及更老无此字段 → 按进度推导：有进度 = 老玩家直接 done，
        // 不补课、不重复发 60 机缘；零进度新档走白纸，进 60 秒新手流）
        starter: migrateStarter(r.starter, r.realmIndex, (r.stats as SaveStats | undefined)?.opens),
        version: 15,
    } as SaveData;
}

/**
 * v11 离线字段迁移（防手改存档注入）：
 * - `lastAt` 必须是有限正数，**且不能在未来**（时钟回拨/改系统时间刷收益 → 归为「此刻」）；
 * - `day` 非日期格式字符串 → 回退今天；
 * - `dayMin` 钳到 [0, 480]。
 */
function migrateOffline(raw: unknown): OfflineState {
    const now = Date.now();
    const o = (raw ?? {}) as Partial<OfflineState>;
    const lastAt = typeof o.lastAt === 'number' && Number.isFinite(o.lastAt) && o.lastAt > 0
        ? Math.min(o.lastAt, now)
        : now;
    const dayStr = typeof o.day === 'string' ? o.day : '';
    return {
        lastAt,
        day: /^\d{4}-\d{2}-\d{2}$/.test(dayStr) ? dayStr : todayString(),
        dayMin: Math.max(0, Math.min(OFFLINE_DAY_CAP_MIRROR, clampIntOr(o.dayMin, 0))),
    };
}

/** v10 引导字段迁移：非对象一律回退 { done: false }，done 取真值布尔（防手改存档注入） */
function migrateTutorial(raw: unknown): GuideState {
    if (!raw || typeof raw !== 'object') return { done: false };
    const t = raw as Partial<GuideState>;
    return { done: Boolean(t.done) };
}

/**
 * v12 剧情字段迁移（防手改存档注入）：
 * - 非数组 → 空（全未听过，与新档一致）；
 * - 元素必须是字符串且命中注册表 id（`config/story.ts` 的 STORY_BEAT_IDS）—— 未注册 id 一律丢弃，
 *   否则仙闻录回看一个不存在的节拍会拿到 null 演出；
 * - 去重且按注册序排列（保序确定性：列表顺序不依赖玩家乱序点击）。
 */
function migrateStory(raw: unknown): StoryState {
    if (!raw || typeof raw !== 'object' || !Array.isArray((raw as StoryState).seen)) return { seen: [] };
    const seen = (raw as StoryState).seen;
    const clean = seen.filter((x): x is string => typeof x === 'string' && STORY_BEAT_IDS.indexOf(x) >= 0);
    const ordered = STORY_BEAT_IDS.filter((id) => clean.indexOf(id) >= 0);
    return { seen: ordered };
}

/**
 * v13 宗门字段迁移（防手改存档注入）：
 * - 非对象 → 全默认（未加入态，与 v12 老档体验一致）；
 * - `id` 必须命中三宗门白名单（`config/sect.ts` 的 SECT_IDS）—— 未注册 id 一律丢弃，
 *   否则玩家会顶着一个不存在的宗门名卡在判定层之外；
 * - exp/totalContrib/contrib/donatedToday 非负整数钳制；
 * - 四个日键非字符串 → ''（惰性翻新时自然按「未做过」处理）；
 * - `bought` 非对象 → {}，值非负整数钳制。
 */
function migrateSect(raw: unknown): SectState {
    const d = defaultSave().sect;
    if (!raw || typeof raw !== 'object') return { ...d, bought: {} };
    const s = raw as Partial<SectState>;
    const id = typeof s.id === 'string' && SECT_IDS.indexOf(s.id as (typeof SECT_IDS)[number]) >= 0 ? s.id : null;
    const dayOf = (v: unknown) => (typeof v === 'string' ? v : '');
    const boughtRaw = (s.bought ?? {}) as Record<string, unknown>;
    const bought: Record<string, number> = {};
    Object.keys(boughtRaw).forEach((k) => {
        const v = boughtRaw[k];
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) bought[k] = Math.floor(v);
    });
    return {
        id,
        exp: clampIntOr(s.exp, 0),
        totalContrib: clampIntOr(s.totalContrib, 0),
        contrib: clampIntOr(s.contrib, 0),
        salaryDay: dayOf(s.salaryDay),
        donateDay: dayOf(s.donateDay),
        donatedToday: clampIntOr(s.donatedToday, 0),
        helpedDay: dayOf(s.helpedDay),
        shopDay: dayOf(s.shopDay),
        bought,
    };
}

/**
 * v15 新手三连字段迁移（D1-60s，#59）：
 * - v15 档（有 starter 对象）：done/jiyuanGranted 布尔化（同 migrateTutorial 口径，
 *   信任存档不按进度覆写——roundtrip 保真）；
 * - v14 及更老（无 starter 对象/非对象）：按进度推导。`realmIndex>0` 或 `stats.opens>0`
 *   = 老玩家，直接 `{done:true, jiyuanGranted:true}`——不弹新手流、不补发 60 机缘
 *   （jiyuanGranted 同步置真是双重保险：即使 done 被手改，发放侧还有一道幂等）；
 * - realmIndex/opens 读取做防御式收敛（脏档按 0 处理，宁可当新号也不误判老玩家——
 *   误判老玩家会跳过新手流，误判新号最多重走一次三连，后者更轻）。
 */
function migrateStarter(raw: unknown, realmIndex: unknown, opens: unknown): StarterState {
    const veteran = (typeof realmIndex === 'number' && Number.isFinite(realmIndex) && realmIndex > 0)
        || (typeof opens === 'number' && Number.isFinite(opens) && opens > 0);
    if (raw && typeof raw === 'object') {
        const s = raw as Partial<StarterState>;
        return { done: Boolean(s.done), jiyuanGranted: Boolean(s.jiyuanGranted) };
    }
    return { done: veteran, jiyuanGranted: veteran };
}

/** v9 签到字段迁移：streak/totalDays 非负整数钳制，milestonesClaimed 去重有序，lastDay 非字符串回退空串；
 *  v14（A20）：makeupDay/doubledDay 非字符串钳制为空串（老档无此字段 → 没补过没翻过） */
function migrateCheckin(raw: unknown): CheckinState {
    const d = defaultSave().checkin;
    const c = (raw ?? {}) as Partial<CheckinState>;
    // ⚠ 同 migrateTrail：必须用 Array.from 而非 [...new Set(...)]（降级编译会变成
    // [].concat(new Set(...))，concat 不展开 Set，产物里会变成 [Set]）。
    const ms = Array.isArray(c.milestonesClaimed)
        ? Array.from(new Set(c.milestonesClaimed.filter((x): x is number => Number.isInteger(x) && x >= 0))).sort((a, b) => a - b)
        : [];
    return {
        lastDay: typeof c.lastDay === 'string' ? c.lastDay : d.lastDay,
        streak: clampIntOr(c.streak, 0),
        totalDays: clampIntOr(c.totalDays, 0),
        milestonesClaimed: ms,
        makeupDay: typeof c.makeupDay === 'string' ? c.makeupDay : d.makeupDay,
        doubledDay: typeof c.doubledDay === 'string' ? c.doubledDay : d.doubledDay,
    };
}

/** v8 剑冢字段迁移：best ≥1、swordLevel/crystal ≥0，非数字一律填缺省（剑气/成本由等级派生，不存浮点） */
function migrateTower(raw: unknown): TowerState {
    const d = defaultSave().tower;
    const t = (raw ?? {}) as Partial<TowerState>;
    const day = (t.daily ?? {}) as Partial<TowerState['daily']>;
    return {
        best: Math.max(1, clampIntOr(t.best, d.best)),
        swordLevel: clampIntOr(t.swordLevel, 0),
        crystal: numOr(t.crystal, 0),
        daily: {
            day: typeof day.day === 'string' ? day.day : '',
            lingshi: clampIntOr(day.lingshi, 0),
            mats: clampIntOr(day.mats, 0),
            xiuwei: clampIntOr(day.xiuwei, 0),
        },
    };
}

/** 非负有限数钳制（煞晶允许浮点余额，但不接受 NaN/负数/Infinity） */
function numOr(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** v7 妖径字段迁移（防手改注入，口径见各字段注释） */
function migrateTrail(raw: unknown): TrailState {
    const d = defaultSave().trail;
    const t = (raw ?? {}) as Partial<TrailState>;
    // ⚠ 必须用 Array.from 而非 [...new Set(...)]：本项目构建目标的降级编译会把
    // 展开语法编成 `[].concat(new Set(...))`，而 concat **不展开 Set/迭代器**，
    // 结果会变成 [Set]（单测跑 node 原生展开，测不出来，只有产物会坏）。
    const gifts = Array.isArray(t.chapterGifts)
        ? Array.from(new Set(t.chapterGifts.filter((x): x is number => Number.isInteger(x) && x >= 0))).sort((a, b) => a - b)
        : [];
    const rep = (t.dailyRepeat ?? {}) as Partial<TrailState['dailyRepeat']>;
    return {
        curLayer: clampIntOr(t.curLayer, 1) < 1 ? 1 : clampIntOr(t.curLayer, 1),
        chapterGifts: gifts,
        dailyRepeat: {
            day: typeof rep.day === 'string' ? rep.day : '',
            count: clampIntOr(rep.count, 0),
        },
    };
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
