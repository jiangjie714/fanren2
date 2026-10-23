/**
 * 每日天劫（8 秒同种子挑战）的纯逻辑层：每日种子、天劫词条、计分。
 *
 * **分层约束**：零 `import 'cc'`、零 System 依赖，可脱离引擎单测（tests/tianjie.test.ts）。
 *
 * 设计要点：
 * - **同种子**：种子 = `dateNum × 10 + 当日词条版本`（见 `dailySeed`，非 ×1000），
 *   所有玩家当天面对同一场雨、同一组词条；
 * - **词条只改参数、不改公式**：波次速率/权重/落速/成排/连击加成在 `RainSystem` 内按
 *   `session.tianjie` 读取修正，渡劫/秘境路径（`tianjie === null`）bit-exact 不变；
 * - **计分沿用 #26 渡劫评分**（金×3 + 最大连击×2 + 蓝×1 − 劫×2，clamp 0–100），再乘词条倍率；
 * - **确定性**：同日同词条同种子 → 雨滴序列完全一致（单测锁定），这是「公平挑战」的前提。
 */
import { Rng } from './rng';

export const TIANJIE = {
    /** 每日挑战次数（打进榜单的次数；后续可看广告加次，首版不加） */
    attemptsPerDay: 3,
    /** 单局时长（秒） */
    duration: 8,
    /** 每日词条条数 */
    modifierCount: 3,
    /** 计分倍率上限（防止词条叠加出 5 倍以上） */
    maxScoreMult: 2.5,
} as const;

/** 词条 id（新增只能追加，不要改动既有 id —— 影响同一天的历史种子可复现性） */
export type ModifierId =
    | 'redRowGold'
    | 'swiftTide'
    | 'noBlue'
    | 'doubleCombo'
    | 'crowdedSky'
    | 'heavyRed'
    | 'magnetGrace'
    | 'mindDemonEarly'
    | 'goldRush'
    | 'thinSky'
    | 'fragileCalm'
    | 'longCombo';

/**
 * 单条词条的三类效果：
 * 1. 生成层（rateMult / goldWeightMult / redWeightMult / redRow / noBlue / noRed）
 * 2. 物理层（fallSpeedMult）
 * 3. 结算层（scoreMult / comboMult）——由 RainSystem / 计分函数读取
 */
export interface Modifier {
    id: ModifierId;
    /** 面板文案（带正负号，玩家一眼看懂是「福利」还是「阴间」） */
    name: string;
    desc: string;
    /** 是否负面（只影响文案色与筛选，不影响数值） */
    negative: boolean;
    /** 词条带来的计分倍率 */
    scoreMult: number;
    // ---------- 可选数值修正 ----------
    /** 波次生成速率倍率 */
    rateMult?: number;
    /** 金雨权重倍率 */
    goldWeightMult?: number;
    /** 清雨权重倍率（v2：清雨易碎） */
    blueWeightMult?: number;
    /** 劫雨权重倍率 */
    redWeightMult?: number;
    /** 劫雨成排（覆盖波次默认，仅波③生效语义与渡劫一致） */
    redRow?: [number, number];
    /** 不生成清雨 */
    noBlue?: boolean;
    /** 不生成劫雨（纯福利日） */
    noRed?: boolean;
    /** 落速倍率 */
    fallSpeedMult?: number;
    /** 连击加成倍率（作用于结算的 comboBonus） */
    comboMult?: number;
    /** 心魔干扰触发阈值覆盖（默认 MIND_DEMON_RED_COUNT） */
    mindDemonRed?: number;
    /**
     * 语义互斥组：同组词条不得出现在同一天。
     * 例：noBlue（清雨彻底禁用）与 fragileCalm（清雨权重 x0.5）叠加时后者完全无效，
     * 玩家看到的是「两条词条但实际只有一条生效」——面板会说谎，必须互斥。
     */
    conflict?: 'blue';
}

/** 词条池（当前 8 条，按 [福利, 负面] 成对设计，保证每日组合有取舍） */
export const MODIFIERS: readonly Modifier[] = [
    {
        id: 'redRowGold',
        name: '金雨临劫',
        desc: '劫雨成排 · 金雨权重 ×1.25 · 计分 ×1.15',
        negative: false,
        scoreMult: 1.15,
        goldWeightMult: 1.25,
        redRow: [2, 2],
    },
    {
        id: 'swiftTide',
        name: '疾风过境',
        desc: '生成速率 ×1.2 · 落速 ×1.08 · 计分 ×1.2',
        negative: false,
        scoreMult: 1.2,
        rateMult: 1.2,
        fallSpeedMult: 1.08,
    },
    {
        id: 'noBlue',
        name: '清雨断绝',
        desc: '不再生成清雨 · 金雨权重 ×1.2 · 计分 ×1.1',
        negative: false,
        scoreMult: 1.1,
        noBlue: true,
        goldWeightMult: 1.2,
        conflict: 'blue',
    },
    {
        id: 'doubleCombo',
        name: '连携天道',
        desc: '连击加成 ×1.5 · 计分 ×1.1',
        negative: false,
        scoreMult: 1.1,
        comboMult: 1.5,
    },
    {
        id: 'crowdedSky',
        name: '天雨如注',
        desc: '生成速率 ×1.35 · 计分 ×1.35',
        negative: false,
        scoreMult: 1.35,
        rateMult: 1.35,
    },
    {
        id: 'heavyRed',
        name: '劫云压顶',
        desc: '劫雨权重 ×1.6 · 成排 · 金雨权重 ×1.15 · 计分 ×1.3',
        negative: true,
        scoreMult: 1.3,
        redWeightMult: 1.6,
        redRow: [2, 3],
        goldWeightMult: 1.15,
    },
    {
        id: 'magnetGrace',
        name: '灵光乍现',
        desc: '生成速率 ×0.9 · 落速 ×0.92 · 计分 ×0.9',
        negative: true,
        scoreMult: 0.9,
        rateMult: 0.9,
        fallSpeedMult: 0.92,
    },
    {
        id: 'mindDemonEarly',
        name: '心魔先兆',
        desc: '吃到 3 片劫雨即心魔 · 劫雨权重 ×1.25 · 计分 ×1.2',
        negative: true,
        scoreMult: 1.2,
        redWeightMult: 1.25,
        mindDemonRed: 3,
    },
    // ---------- v2 扩池（2026-10-22）：8 → 12 条 ----------
    // 目的：让每日组合从「三种口味轮转」变成「每天都有新题」。新增条目全部沿用同一
    // [福利/负面] 语义与同一个计分倍率标尺，不引入新的判定公式。
    {
        id: 'goldRush',
        name: '金雨如潮',
        desc: '金雨权重 ×1.6 · 清雨不再生成 · 计分 ×1.25',
        negative: false,
        scoreMult: 1.25,
        goldWeightMult: 1.6,
        noBlue: true,
        conflict: 'blue',
    },
    {
        id: 'thinSky',
        name: '雨疏风骤',
        desc: '生成速率 ×0.75 · 落速 ×1.15 · 计分 ×1.15',
        negative: false,
        scoreMult: 1.15,
        rateMult: 0.75,
        fallSpeedMult: 1.15,
    },
    {
        id: 'fragileCalm',
        name: '清雨易碎',
        desc: '清雨权重 ×0.5 · 劫雨权重 ×1.3 · 计分 ×1.15',
        negative: true,
        scoreMult: 1.15,
        blueWeightMult: 0.5,
        redWeightMult: 1.3,
        conflict: 'blue',
    },
    {
        id: 'longCombo',
        name: '连绵不绝',
        desc: '生成速率 ×1.1 · 连击加成 ×2 · 漏接金雨即断 · 计分 ×1.3',
        negative: false,
        scoreMult: 1.3,
        rateMult: 1.1,
        comboMult: 2,
    },
];

const MODIFIER_INDEX: Record<string, Modifier> = (() => {
    const m: Record<string, Modifier> = {};
    MODIFIERS.forEach((x) => { m[x.id] = x; });
    return m;
})();

/** 词条池全 id（按池序；给测试与「词条版本」用） */
export const MODIFIER_IDS: ModifierId[] = Array.from(MODIFIERS).map((m) => m.id);

/**
 * 词条池版本：池变更（增删/改数值）必须 +1。
 * v1 = 8 条首发池；v2 = 12 条（2026-10-22 扩池）。
 * ⚠ 注意：晋升版本会让**同日种子整体换一套**（旧版本的历史当天已经过去，不影响已发生的对局），
 * 但同一天内若版本变更需重新统一发版——故只允许在发版时晋升。
 */
export const MODIFIER_POOL_VERSION = 2;

/** 本地自然日键 YYYY-MM-DD */
export function dateKeyOf(now: number): string {
    const d = new Date(now);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 日键 → 数字（YYYYMMDD） */
export function dateNumOf(dateKey: string): number {
    return Number(dateKey.replace(/-/g, '')) || 0;
}

/** 每日种子：同日全服一致，且随词条版本变化（0 ≤ seed < 2^32） */
export function dailySeed(dateKey: string): number {
    return (dateNumOf(dateKey) * 10 + MODIFIER_POOL_VERSION) >>> 0;
}

/**
 * 当日词条：用「与对局无关的独立 Rng」抽取，同日全服一致。
 * 规则：从池中不重复抽 `TIANJIE.modifierCount` 条，且至少 1 条福利（scoreMult ≥ 1）。
 */
export function dailyModifiers(dateKey: string): Modifier[] {
    const rng = new Rng(dailySeed(dateKey) ^ 0x9e3779b9);
    const picked: Modifier[] = [];
    const groups: string[] = [];
    const usable = () => MODIFIERS.filter(
        (m) => picked.indexOf(m) < 0 && (!m.conflict || groups.indexOf(m.conflict) < 0),
    );
    while (picked.length < Math.min(TIANJIE.modifierCount, MODIFIERS.length)) {
        const pool = usable();
        if (!pool.length) break;
        const m = pool[rng.int(0, pool.length - 1)];
        picked.push(m);
        if (m.conflict) groups.push(m.conflict);
    }
    // 保底：至少一条福利（否则新手打不动）
    if (!picked.some((m) => m.scoreMult >= 1)) {
        const good = MODIFIERS.filter((m) => m.scoreMult >= 1 && picked.indexOf(m) < 0);
        if (good.length) {
            const pick = good[rng.int(0, good.length - 1)];
            // 优先替换一条「非福利」且不破坏互斥的条目
            const idx = picked.findIndex((x) => x.scoreMult < 1
                && !(pick.conflict && picked.some((y) => y !== x && y.conflict === pick.conflict)));
            if (idx >= 0) picked[idx] = pick;
            else picked[picked.length - 1] = pick;
        }
    }
    return picked;
}

/** 按 id 取词条（脏档/旧种子兼容：未知 id 返回 null） */
export function modifierById(id: string): Modifier | null {
    return MODIFIER_INDEX[id] ?? null;
}

/** 词条合计计分倍率（钳制在 [1, maxScoreMult]：负面倍率只作用于词条增减，不让玩家白亏） */
export function combinedScoreMult(mods: readonly Modifier[]): number {
    if (!mods.length) return 1;
    let mult = 1;
    mods.forEach((m) => { mult *= m.scoreMult; });
    // 下限 1：一条负面词条不应该让玩家比「无词条」拿得更少（赛道上不比基础渡劫更难拿分）
    return Math.min(TIANJIE.maxScoreMult, Math.max(1, Math.round(mult * 1000) / 1000));
}

/** 词条是否让对局更极端（面板配色用：≥1.5 标「极难」，1.15–1.5「偏难」，其余「标准」） */
export function difficultyOf(mods: readonly Modifier[]): 'standard' | 'hard' | 'extreme' {
    const mult = combinedScoreMult(mods);
    if (mult >= 1.5) return 'extreme';
    if (mult >= 1.15) return 'hard';
    return 'standard';
}

/**
 * 今日天劫结算评分：基础评分（沿用 #26 公式）× 词条倍率，clamp 0–100。
 * 与渡劫评分共用 0–100 区间，方便和「历史最高渡劫分」放在同一张榜上对比。
 */
export function tianjieScore(gold: number, maxCombo: number, blue: number, red: number, mods: readonly Modifier[]): number {
    const base = gold * 3 + maxCombo * 2 + blue * 1 - red * 2;
    const raw = Math.max(0, base) * combinedScoreMult(mods);
    return Math.min(100, Math.max(0, Math.round(raw)));
}

/** 今日天劫评级（沿用渡劫 40/75 两档，文案不同） */
export function tianjieRating(score: number): string {
    if (score >= 75) return '仙阶';
    if (score >= 40) return '灵阶';
    return '凡阶';
}

/**
 * 天劫周榜编码（好友榜键 `tianjie_week`，与 SocialRank 的 illusion_week 同构）：
 * 周键 YYYYMMDD（周一）× 1000 + min(周最佳分, 999)。
 * 跨周自然单调递增，子域可直接按数值排序；`% 1000` 即分数。
 */
export function tianjieWeekValue(weekMonday: string, weekBest: number): number {
    const n = Number(weekMonday.replace(/^W-/, '').replace(/-/g, '')) || 0;
    return n * 1000 + Math.max(0, Math.min(999, Math.round(weekBest)));
}

/** 天劫周榜解码（主域展示用；子域有独立镜像，见 open-data-context/game.js） */
export function decodeTianjieWeek(v: number): { score: number } {
    return { score: Math.max(0, Math.round(v) % 1000) };
}

/** 本周一日期（YYYY-MM-DD，本地时区；周一 0 点换周，与 weekKeyOf 同口径） */
export function weekMondayOf(now: number): string {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return dateKeyOf(d.getTime());
}
