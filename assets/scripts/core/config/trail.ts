/**
 * M15 妖径配置：章节外壳 + 层内确定性派生 + 奖励表（数值假设 #47）。
 * 纯函数、无渲染、无外部随机源——同层号任何时刻派生结果一致（防退出重进刷局）。
 * 玩法引擎分期接入：M15 battle；M16 puzzle（妖像拼图）；M17 match3（妖影三消）。
 */

export const TRAIL_LAYERS_PER_CHAPTER = 10;
/** 重刷奖励日护栏：每日前 5 次重刷有产出 */
export const TRAIL_REPEAT_PER_DAY = 5;
/** 重刷灵草概率（期望 = 5 × 0.6 = 3 株/日，对齐 #38 护栏） */
export const TRAIL_MAT_CHANCE = 0.6;
/** 重刷灵石 = 首通区间中值 ×30% */
export const TRAIL_REPEAT_RATIO = 0.3;
/** 战意（本章 QTE 全中）作用于重刷灵石，语义承接 #35 SLAY_MORALE_BONUS */
export const TRAIL_MORALE_BONUS = 0.15;

export type TrailGameId = 'battle' | 'puzzle' | 'match3';
export type TrailPersonality = 'swift' | 'iron' | 'blood';

/** 已可进入轮换的玩法引擎（随分期扩容；派生命中未接入类型时回退 battle） */
export const AVAILABLE_GAMES: readonly TrailGameId[] = ['battle', 'puzzle', 'match3'];

/** 玩法引擎是否已接入（indexOf 兼容项目 lib target，勿改 includes） */
export function gameAvailable(g: TrailGameId): boolean {
    return (AVAILABLE_GAMES as readonly string[]).indexOf(g) >= 0;
}

export interface TrailMonster {
    id: string;
    name: string;
}

export interface TrailChapter {
    id: string;
    name: string;
    blurb: string;
    /** 章节地图背景（ThemeLib art bundle 路径） */
    bg: string;
    /** 普通关妖怪池（拼图谜面/三消棋子同源复用） */
    monsters: TrailMonster[];
    /** 章末 Boss（第 10 关恒为 Boss 战斗） */
    boss: TrailMonster;
    /**
     * 普通关玩法计划（下标 = layerInChapter-1，长度 = 9；第 10 关恒 battle 不入表）。
     * 配比在表内落地并保证「同玩法不连续超 2 层」——约束由测试守护。
     */
    typePlan: TrailGameId[];
    /** 首通灵石区间：3 段普通关（层 1–3 / 4–6 / 7–9） */
    rewardSections: Array<[number, number]>;
    /** Boss 首通灵石区间 */
    bossReward: [number, number];
    /** 首通灵根碎片概率：3 段普通关（对齐 #35：10%/30%/50%）；Boss 必得 */
    fragmentChance: [number, number, number];
    /** Boss 首通修为/机缘（对齐 #35 斩妖档位） */
    bossSlay: { xiuwei: number; jiyuan: number };
    /** 章节大礼（10 关全通一次性） */
    gift: { lingshi: number; mats: Record<string, number>; fragments: number };
}

/** 第一章：前山小径(1–3) → 落霞秘谷(4–6/7–9) → 荒古洞天 Boss(10)，承接旧目的地叙事 */
export const TRAIL_CHAPTERS: readonly TrailChapter[] = [
    {
        id: 'qianshan',
        name: '前山小径',
        blurb: '山道妖影初现，正好试剑',
        bg: 'art/ui/bg_trail_qianshan/spriteFrame',
        monsters: [
            { id: 'yaoshu', name: '咬财妖鼠' },
            { id: 'shanyan', name: '山魈' },
            { id: 'duyao', name: '碧鳞毒蟾' },
            { id: 'yeyuan', name: '啸月野猿' },
            { id: 'wulang', name: '落霞雾狼' },
            { id: 'wuying', name: '雾影妖狐' },
            { id: 'shimo', name: '荒古石魔' },
        ],
        boss: { id: 'shimo_boss', name: '荒古石魔·真身' },
        // 配比 5:3:2（M16/M17 接入 puzzle/match3 后生效）；无连续 3 同玩法
        typePlan: [
            'battle', 'puzzle', 'battle', 'match3', 'battle',
            'puzzle', 'battle', 'match3', 'puzzle',
        ],
        rewardSections: [
            [80, 150],
            [150, 260],
            [280, 420],
        ],
        bossReward: [300, 500],
        fragmentChance: [0.1, 0.3, 0.5],
        bossSlay: { xiuwei: 200, jiyuan: 5 },
        gift: { lingshi: 1200, mats: { lingcao: 3 }, fragments: 1 },
    },
    {
        id: 'migu',
        name: '落霞秘谷',
        blurb: '雾谷深处，妖气渐浓',
        bg: 'art/ui/bg_trail_migu/spriteFrame',
        monsters: [
            { id: 'wulang2', name: '霜牙狼王' },
            { id: 'yanluo', name: '谷底妖蛾' },
            { id: 'shigan', name: '腐石干尸' },
            { id: 'huwan', name: '彩鳞蜥妖' },
            { id: 'xuehou', name: '啼血猿妖' },
            { id: 'guwan', name: '古棺尸魅' },
        ],
        boss: { id: 'xiagu', name: '霞谷妖帅' },
        typePlan: [
            'puzzle', 'battle', 'match3', 'battle', 'puzzle',
            'battle', 'match3', 'battle', 'puzzle',
        ],
        rewardSections: [
            [320, 460],
            [420, 560],
            [520, 680],
        ],
        bossReward: [560, 760],
        fragmentChance: [0.15, 0.35, 0.55],
        bossSlay: { xiuwei: 420, jiyuan: 10 },
        gift: { lingshi: 2600, mats: { lingcao: 4, lingshi_core: 2 }, fragments: 2 },
    },
    {
        id: 'gudong',
        name: '荒古洞天',
        blurb: '上古遗府，机缘凶险并存',
        bg: 'art/ui/bg_trail_huanggu/spriteFrame',
        monsters: [
            { id: 'shiling', name: '石灵卫' },
            { id: 'moxi', name: '墨息蟒' },
            { id: 'leiying', name: '雷婴' },
            { id: 'guhuo', name: '蛊惑妖姬' },
            { id: 'tiekui', name: '铁魁傀儡' },
        ],
        boss: { id: 'mozun', name: '镇魔碑灵' },
        typePlan: [
            'battle', 'match3', 'puzzle', 'battle', 'puzzle',
            'match3', 'battle', 'puzzle', 'match3',
        ],
        rewardSections: [
            [600, 800],
            [720, 940],
            [860, 1120],
        ],
        bossReward: [900, 1240],
        fragmentChance: [0.2, 0.4, 0.6],
        bossSlay: { xiuwei: 900, jiyuan: 20 },
        gift: { lingshi: 5200, mats: { lingcao: 5, lingshi_core: 3, yaodan_core: 2 }, fragments: 3 },
    },
    {
        id: 'yuanxue',
        name: '幽冥血渊',
        blurb: '血雾封渊，幽冥妖物蠢动',
        bg: 'art/ui/bg_trail_yuanxue/spriteFrame',
        monsters: [
            { id: 'xueying', name: '血影鬼婴' },
            { id: 'huangou', name: '玄火蜈妖' },
            { id: 'xiuluo', name: '白骨修罗' },
            { id: 'guijiao', name: '冥河鬼鲛' },
            { id: 'shizhu', name: '九幽蚀骨蛛' },
            { id: 'xuetan', name: '幽泉血蟾' },
        ],
        boss: { id: 'xuezu', name: '幽冥血祖' },
        typePlan: [
            'match3', 'battle', 'puzzle', 'battle', 'battle',
            'match3', 'puzzle', 'battle', 'puzzle',
        ],
        rewardSections: [
            [820, 1080],
            [980, 1260],
            [1160, 1500],
        ],
        bossReward: [1220, 1680],
        fragmentChance: [0.25, 0.45, 0.65],
        bossSlay: { xiuwei: 1500, jiyuan: 35 },
        gift: { lingshi: 8600, mats: { lingcao: 6, lingshi_core: 4, yaodan_core: 3 }, fragments: 4 },
    },
    {
        id: 'xuanming',
        name: '玄冥冰原',
        blurb: '千里冰封，玄冥寒煞蚀骨',
        bg: 'art/ui/bg_trail_xuanming/spriteFrame',
        monsters: [
            { id: 'bingcan', name: '冰蚕蛊' },
            { id: 'binggui', name: '冰原鬼叟' },
            { id: 'hanyi', name: '寒翼魔蝠' },
            { id: 'bingyuan', name: '玄冰巨猿' },
            { id: 'bingling', name: '玄冰傀儡' },
            { id: 'xuepo', name: '雪魄妖蝶' },
        ],
        boss: { id: 'bingzu', name: '玄冥冰主' },
        typePlan: [
            'puzzle', 'battle', 'match3', 'battle', 'puzzle',
            'battle', 'puzzle', 'match3', 'battle',
        ],
        rewardSections: [
            [1100, 1450],
            [1300, 1700],
            [1560, 2020],
        ],
        bossReward: [1650, 2270],
        fragmentChance: [0.3, 0.5, 0.7],
        bossSlay: { xiuwei: 2400, jiyuan: 55 },
        gift: { lingshi: 11600, mats: { lingcao: 7, lingshi_core: 5, yaodan_core: 4 }, fragments: 5 },
    },
    {
        id: 'leize',
        name: '九霄雷泽',
        blurb: '九霄雷落，雷泽紫电裂空',
        bg: 'art/ui/bg_trail_leize/spriteFrame',
        monsters: [
            { id: 'zidian', name: '紫电貂' },
            { id: 'leie', name: '雷泽巨鳄' },
            { id: 'leixi', name: '雷纹犀' },
            { id: 'mingying', name: '鸣雷鹰' },
            { id: 'leijia', name: '雷甲尸将' },
            { id: 'leiteng', name: '雷泽藤妖' },
        ],
        boss: { id: 'leizun', name: '九霄雷尊' },
        typePlan: [
            'battle', 'puzzle', 'match3', 'battle', 'puzzle',
            'match3', 'battle', 'puzzle', 'battle',
        ],
        rewardSections: [
            [1480, 1960],
            [1750, 2300],
            [2100, 2730],
        ],
        bossReward: [2230, 3060],
        fragmentChance: [0.35, 0.55, 0.75],
        bossSlay: { xiuwei: 3240, jiyuan: 74 },
        gift: { lingshi: 15600, mats: { lingcao: 9, lingshi_core: 7, yaodan_core: 5 }, fragments: 6 },
    },
];

// ---------- 章节/层换算 ----------

/** 全局层号 → 章节号（1 起；层 1–10 = 第 1 章） */
export function chapterOf(layer: number): number {
    return Math.floor((layer - 1) / TRAIL_LAYERS_PER_CHAPTER) + 1;
}

/** 全局层号 → 章内层（1..10） */
export function layerInChapter(layer: number): number {
    return ((layer - 1) % TRAIL_LAYERS_PER_CHAPTER) + 1;
}

export function chapterConfig(chapter: number): TrailChapter {
    return TRAIL_CHAPTERS[Math.min(TRAIL_CHAPTERS.length, Math.max(1, chapter)) - 1];
}

// ---------- 玩法派生 ----------

/** 层号 → 玩法类型：Boss 关恒 battle；普通关按章节计划，未接入引擎的类型回退 battle */
export function deriveGame(layer: number): TrailGameId {
    const lin = layerInChapter(layer);
    if (lin === TRAIL_LAYERS_PER_CHAPTER) return 'battle';
    const ch = chapterConfig(chapterOf(layer));
    const raw = ch.typePlan[lin - 1];
    return gameAvailable(raw) ? raw : 'battle';
}

/** 确定性散列（层号 → 0..n-1；无外部随机源） */
function hash(layer: number, salt: number, mod: number): number {
    let h = (layer * 2654435761 + salt * 40503) >>> 0;
    h ^= h >>> 13;
    h = (h * 1274126177) >>> 0;
    return h % mod;
}

const PERSONALITIES: readonly TrailPersonality[] = ['swift', 'iron', 'blood'];

export interface TrailBattleSpec {
    chapter: number;
    layer: number;
    isBoss: boolean;
    monsterId: string;
    monsterName: string;
    personality: TrailPersonality;
}

/** 层号 → 战斗局参数（确定性：同层恒同妖怪/性格） */
export function deriveBattle(layer: number): TrailBattleSpec {
    const chapter = chapterOf(layer);
    const ch = chapterConfig(chapter);
    const lin = layerInChapter(layer);
    const isBoss = lin === TRAIL_LAYERS_PER_CHAPTER;
    const monster = isBoss
        ? ch.boss
        : ch.monsters[hash(layer, 7, ch.monsters.length)];
    return {
        chapter,
        layer,
        isBoss,
        monsterId: monster.id,
        monsterName: monster.name,
        personality: PERSONALITIES[hash(layer, 11, PERSONALITIES.length)],
    };
}

// ---------- M16 妖像拼图派生 ----------

export interface TrailPuzzleSpec {
    chapter: number;
    layer: number;
    monsterId: string;
    monsterName: string;
    /** 网格边长（第 1 章 3×3，第 2 章起 4×4） */
    size: number;
    /** 限时秒（3×3=60 / 4×4=75） */
    timeLimitSec: number;
    /** 打乱交换步数（size²×3） */
    shuffleSteps: number;
}

/** 层号 → 拼图局参数（确定性：同层恒同谜面；D3 难度旋钮） */
export function derivePuzzle(layer: number): TrailPuzzleSpec {
    const chapter = chapterOf(layer);
    const ch = chapterConfig(chapter);
    const monster = ch.monsters[hash(layer, 7, ch.monsters.length)];
    const size = chapter <= 1 ? 3 : 4;
    return {
        chapter,
        layer,
        monsterId: monster.id,
        monsterName: monster.name,
        size,
        timeLimitSec: size === 3 ? 60 : 75,
        shuffleSteps: size * size * 3,
    };
}

// ---------- M17 妖影三消派生 ----------

export interface TrailMatch3Spec {
    chapter: number;
    layer: number;
    monsterId: string;
    monsterName: string;
    /** 棋盘边长（恒 6） */
    size: number;
    /** 棋子种类数（章内妖怪池前 5 只；spec 4–6 种防死局，5 种为标定甜点） */
    pieceKinds: number;
    /** 步数上限（恒 20） */
    steps: number;
    /** 妖怪 HP（3 消=1 点口径；28/32/36，随机模拟标定 0.85/0.63/0.44 通关率；38 封顶防第 4 章过难） */
    hp: number;
}

/** 层号 → 三消局参数（确定性：同层恒同目标与棋子集；D4 HP 标定） */
export function deriveMatch3(layer: number): TrailMatch3Spec {
    const chapter = chapterOf(layer);
    const ch = chapterConfig(chapter);
    const monster = ch.monsters[hash(layer, 7, ch.monsters.length)];
    return {
        chapter,
        layer,
        monsterId: monster.id,
        monsterName: monster.name,
        size: 6,
        pieceKinds: Math.min(5, ch.monsters.length),
        steps: 20,
        hp: Math.min(38, 24 + chapter * 4),
    };
}

// ---------- 奖励表（#47） ----------

export interface FirstClearReward {
    isBoss: boolean;
    /** 首通灵石区间（实际发放由系统侧按 rng 掷取） */
    lingshi: [number, number];
    /** 灵根碎片概率（Boss 必得 = 1） */
    fragmentChance: number;
    /** Boss 专属：修为/机缘（对齐 #35 斩妖档位） */
    xiuwei?: number;
    jiyuan?: number;
}

export function firstClearReward(layer: number): FirstClearReward {
    const ch = chapterConfig(chapterOf(layer));
    const lin = layerInChapter(layer);
    if (lin === TRAIL_LAYERS_PER_CHAPTER) {
        return { isBoss: true, lingshi: [...ch.bossReward] as [number, number], fragmentChance: 1, ...ch.bossSlay };
    }
    // 层 1–3 / 4–6 / 7–9 → 三段区间
    const section = Math.min(2, Math.floor((lin - 1) / 3));
    return {
        isBoss: false,
        lingshi: [...ch.rewardSections[section]] as [number, number],
        fragmentChance: ch.fragmentChance[section],
    };
}

/** 重刷灵石基准 = 首通区间中值 ×30%（floor） */
export function repeatLingshi(layer: number): number {
    const f = firstClearReward(layer);
    return Math.floor(((f.lingshi[0] + f.lingshi[1]) / 2) * TRAIL_REPEAT_RATIO);
}

export function chapterGift(chapter: number): TrailChapter['gift'] {
    return chapterConfig(chapter).gift;
}

/**
 * 章节难度系数：妖怪面板随章节线性爬升 1 → 1.8 封顶（#47，M19 修订：
 * 原 1.6 封顶在第 5 章即触顶，失去纵深空间，故抬封顶、斜率不变）。
 * 血量 = 玩家攻 × 4.5 × 系数——玩家成长不改变通关率，难度只随章节推进。
 */
export function chapterScale(chapter: number): number {
    return Math.min(1.8, 1 + (chapter - 1) * 0.15);
}
