/**
 * M31 宗门社交（A18，docs/数值假设.md #57）配置层：三候选宗门 / 等级 / 捐献 / 商店 / 成员名池。
 *
 * **分层约束**：本模块纯数据零 `cc` 依赖，判定逻辑在 `core/sect.ts`，
 * 入账 glue 在 `core/systems/SectSystem.ts`。
 *
 * 设计口径（spec §4/§5）：
 * - 加入制三选一（免费），不做自建——a 层不碰 EditBox 命名；
 * - 三宗门**同商店同日常**，只在俸禄构成上小倾斜（选择有意义、不制造强度分裂）；
 * - 宗门 exp 只来自**捐献**（玩家驱动，无被动收入）；捐献的灵石是纯沉没（返 20% 贡献点）；
 * - 俸禄**零灵石**（修为 + 贡献点 + 碎片）——#38 护栏②日灵石净收入口径零增量；
 * - 商店机缘 ≤3/日、灵材零触碰（灵材日上限 40 已被签到占满）。
 */

/** 宗门 id（同时是存档 `sect.id` 的合法值域，migrate 白名单同源） */
export type SectId = 'qingyun' | 'bencao' | 'tianji';

export const SECT_IDS: SectId[] = ['qingyun', 'bencao', 'tianji'];

/** 俸禄构成（按宗门特质；contribPerLevel 等字段 × 宗门等级） */
export interface SectSalaryRule {
    /** 每级修为 */
    xiuweiPerLevel: number;
    /** 每级贡献点 */
    contribPerLevel: number;
    /** 每级碎片数（0 = 不发） */
    fragPerLevel: number;
}

export interface SectConfig {
    id: SectId;
    name: string;
    /** 一句话特质（加入态卡片） */
    tagline: string;
    /** 俸禄规则 */
    salary: SectSalaryRule;
    /** 特长描述（主态信息卡） */
    perk: string;
}

export const SECTS: SectConfig[] = [
    {
        id: 'qingyun',
        name: '青云剑宗',
        tagline: '剑修圣地，俸禄偏厚',
        salary: { xiuweiPerLevel: 120, contribPerLevel: 40, fragPerLevel: 0 },
        perk: '剑修辈出，俸禄修为冠绝三宗',
    },
    {
        id: 'bencao',
        name: '百草丹宗',
        tagline: '丹道传承，善赏勤勉',
        salary: { xiuweiPerLevel: 80, contribPerLevel: 60, fragPerLevel: 0 },
        perk: '丹道通神，俸禄贡献点冠绝三宗',
    },
    {
        id: 'tianji',
        name: '天机阁',
        tagline: '卜算万象，均衡周全',
        salary: { xiuweiPerLevel: 100, contribPerLevel: 50, fragPerLevel: 1 },
        perk: '天机莫测，俸禄另附碎片补贴',
    },
];

/** 宗门等级 exp 阈值（累计）：达到第 n 个阈值即 n 级，满级 5 */
export const SECT_LEVELS = [0, 500, 1500, 4000, 10000];

/** 捐献档位（灵石）；日累计上限 20000 */
export const SECT_DONATE_TIERS = [1000, 5000, 20000];
export const SECT_DONATE_CAP = 20000;
/** 捐献返贡献点比例（20% 是刻意口径：宗门是归属不是印钞机，防后人「好心」改高） */
export const SECT_CONTRIB_RATE = 0.2;

/** 职位阈值（按累计贡献点 totalContrib） */
export const SECT_POSITIONS: Array<{ at: number; name: string }> = [
    { at: 0, name: '弟子' },
    { at: 300, name: '执事' },
    { at: 1200, name: '长老' },
];

/** 每日助力奖励（修为 + 贡献点，按宗门等级加成） */
export const SECT_HELP_XIUWEI = 60;
export const SECT_HELP_CONTRIB = 30;

/** 商店商品（贡献点定价；give 由 SectSystem 入账） */
export interface SectShopGive {
    lingshi?: number;
    /** 碎片 id → 数量 */
    fragments?: Record<string, number>;
    jiyuan?: number;
    /** 秘境体力直接补（封顶 STAMINA_MAX） */
    stamina?: number;
    /** 论武次数 +1（pkUsed 回退 1） */
    pkCharge?: number;
}

export interface SectShopItem {
    id: string;
    name: string;
    cost: number;
    /** 日限次数 */
    daily: number;
    give: SectShopGive;
    /** 图标（art/ui/icons/ 下既有资产） */
    icon: string;
}

export const SECT_SHOP_ITEMS: SectShopItem[] = [
    { id: 'lingshi', name: '灵石 ×500', cost: 200, daily: 1, give: { lingshi: 500 }, icon: 'icon_lingshi' },
    { id: 'jinmu', name: '金乌碎片 ×5', cost: 150, daily: 2, give: { fragments: { jinmu: 5 } }, icon: 'icon_rune' },
    { id: 'jiyuan', name: '机缘 ×3', cost: 300, daily: 1, give: { jiyuan: 3 }, icon: 'icon_jiyuan' },
    { id: 'stamina', name: '秘境体力 ×3', cost: 250, daily: 1, give: { stamina: 3 }, icon: 'icon_stamina' },
    { id: 'pk', name: '论武次数 +1', cost: 250, daily: 1, give: { pkCharge: 1 }, icon: 'icon_weapon' },
];

/** 宗门成员名池（24 位）——**刻意不复用** PK_OPP_NAMES：道友与宗门成员是两套身份，撞名会穿帮 */
export const SECT_MEMBER_NAMES: string[] = [
    '沈孤鸿', '柳随云', '韩万里', '楚惊鸿', '燕十三',
    '谢长川', '温伯侯', '裴子潇', '宋青梧', '岑云朔',
    '阮星辞', '霍长缨', '闻人策', '祝大同', '晏无书',
    '许可图', '洪照夜', '齐光年', '甘沐阳', '冉闻笛',
    '屠景云', '谌莫问', '佘怀瑾', '胥子陵',
];

/** 成员贡献派生区间（确定性哈希 → [min, max]） */
export const SECT_MEMBER_CONTRIB_MIN = 200;
export const SECT_MEMBER_CONTRIB_SPAN = 1800;
/** 成员数派生区间（加入态展示用） */
export const SECT_MEMBER_COUNT_MIN = 12;
export const SECT_MEMBER_COUNT_SPAN = 9;
