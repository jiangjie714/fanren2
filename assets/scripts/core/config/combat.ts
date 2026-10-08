/** M11 战斗玩法配置：攻防属性 / 锻体 / 法器 / 斩妖 / 论武（数值假设 #32–#37） */
import { DestId } from './expeditions';

// ---------- #33 攻防属性：境界基础 + 锻体系数 + 法器加值 ----------

/** 各境界基础攻防（小写口径：atk/def，乘锻体系数后与法器加值相加） */
export const REALM_COMBAT: Array<{ atk: number; def: number }> = [
    { atk: 10, def: 6 },        // 凡人
    { atk: 45, def: 24 },       // 练气
    { atk: 150, def: 80 },      // 筑基
    { atk: 450, def: 240 },     // 金丹
    { atk: 1250, def: 650 },    // 元婴
    { atk: 3200, def: 1700 },   // 化神
];

/** 锻体：每级攻防基础 ×(1 + 5%)，上限 20 级（×2） */
export const FORGING_MAX_LEVEL = 20;
export const FORGING_BONUS_PER_LEVEL = 0.05;
/** 升到下一级锻体的灵石成本 = base × growth^当前级 */
export const FORGING_COST_BASE = 150;
export const FORGING_COST_GROWTH = 1.35;

/** 锻体攻防系数（1 + 每级 5%） */
export function forgingFactor(level: number): number {
    return 1 + Math.max(0, Math.min(FORGING_MAX_LEVEL, level)) * FORGING_BONUS_PER_LEVEL;
}

/** 当前锻体级升下一级的成本（满级返回 Infinity） */
export function forgingCost(level: number): number {
    if (level >= FORGING_MAX_LEVEL) return Infinity;
    return Math.round(FORGING_COST_BASE * Math.pow(FORGING_COST_GROWTH, level));
}

// ---------- #34 法器：六档对应六境界，一次性购入永久生效 ----------

export interface WeaponConfig {
    /** 档位 = 需求境界下标 */
    tier: number;
    name: string;
    atk: number;
    def: number;
    cost: number;
}

export const WEAPONS: WeaponConfig[] = [
    { tier: 0, name: '桃木剑',     atk: 12,   def: 6,    cost: 300 },
    { tier: 1, name: '青霜飞剑',   atk: 60,   def: 30,   cost: 1_200 },
    { tier: 2, name: '赤焰宝扇',   atk: 200,  def: 100,  cost: 4_000 },
    { tier: 3, name: '紫霄雷锤',   atk: 620,  def: 310,  cost: 13_000 },
    { tier: 4, name: '山河社稷印', atk: 1_700, def: 850,  cost: 42_000 },
    { tier: 5, name: '诛仙古剑',   atk: 4_600, def: 2_300, cost: 130_000 },
];

// ---------- #35 斩妖：历练归来拦路妖兽（点按斩击） ----------

export interface SlayReward {
    lingshi: [number, number];
    xiuwei: number;
    jiyuan?: number;
    /** 灵根碎片（凡俗池 ×1）出现概率 */
    fragmentChance: number;
}

export interface MonsterConfig {
    dest: DestId;
    name: string;
    intro: string;
    reward: SlayReward;
}

export const MONSTERS: Record<DestId, MonsterConfig> = {
    qianshan: {
        dest: 'qianshan', name: '咬财妖鼠', intro: '一只妖鼠拦在山道中央，盯着你的储物袋吱吱作响。',
        reward: { lingshi: [40, 80], xiuwei: 25, fragmentChance: 0.1 },
    },
    migu: {
        dest: 'migu', name: '落霞雾狼', intro: '雾气里窜出一头灰狼，双目泛着幽光，封住了去路。',
        reward: { lingshi: [120, 200], xiuwei: 80, fragmentChance: 0.3 },
    },
    gudong: {
        dest: 'gudong', name: '荒古石魔', intro: '洞府深处的石像轰然转身，掌风裹着上古煞气压来。',
        reward: { lingshi: [280, 420], xiuwei: 200, jiyuan: 5, fragmentChance: 0.5 },
    },
};

/** 斩妖血量 = 攻击 ×4.5（约 15 次斩击） */
export const SLAY_HP_ATK_RATIO = 4.5;
/** 单次斩击伤害 = 攻击 ×30%（±15% 浮动） */
export const SLAY_TAP_ATK_RATIO = 0.3;
/** 妖兽反扑伤害 = 攻击 ×50% − 防御 ×18%（±10% 浮动） */
export const SLAY_STRIKE_ATK_RATIO = 0.5;
export const SLAY_STRIKE_DEF_RATIO = 0.18;
/** 妖兽反扑节奏：每 2.8 秒一次；每斩 8 下额外触发一次 */
export const SLAY_STRIKE_INTERVAL_S = 2.8;
export const SLAY_STRIKE_EVERY_TAPS = 8;
/** 我方气血 = 100 + (攻+防)×1.8 */
export const SLAY_PLAYER_HP_BASE = 100;
export const SLAY_PLAYER_HP_RATIO = 1.8;
/** 斩妖胜利后的「战意」：同一事件的灵石产出 ×1.15 */
export const SLAY_MORALE_BONUS = 0.15;

// ---------- M15 妖径闯关（#47）：SLAY 内核 + 破绽 QTE + 妖怪性格 + Boss 二阶段 ----------

import { TrailPersonality } from './trail';

/** 破绽窗口时长与每阶段窗口数（妖怪血量被打掉 25%/50%/75% 时各开一次；击杀瞬间不设窗） */
export const TRAIL_QTE_WINDOW_MS = 1500;
export const TRAIL_QTE_HITS_PER_PHASE = 3;
/** Boss 二阶段：全参数倍率（满血变身） */
export const TRAIL_BOSS_PHASE2_MULT = 1.2;
/** 妖怪性格修正表（层号派生，见 config/trail.deriveBattle） */
export const TRAIL_PERSONALITY_MODS: Record<TrailPersonality, {
    /** 反扑间隔倍率 */
    strikeIntervalMult: number;
    /** 反扑伤害倍率 */
    strikeDmgMult: number;
    /** 血量倍率 */
    hpMult: number;
    /** 额外反扑所需斩击数（替代 SLAY_STRIKE_EVERY_TAPS） */
    strikeEveryTaps: number;
    /** 噬血狂化：血量低于该比例时反扑间隔再 ×0.5（0 = 无狂化） */
    frenzyBelow: number;
}> = {
    swift: { strikeIntervalMult: 0.7, strikeDmgMult: 0.8, hpMult: 1.0, strikeEveryTaps: 8, frenzyBelow: 0 },
    iron:  { strikeIntervalMult: 1.0, strikeDmgMult: 1.0, hpMult: 1.3, strikeEveryTaps: 12, frenzyBelow: 0 },
    blood: { strikeIntervalMult: 1.0, strikeDmgMult: 1.0, hpMult: 1.0, strikeEveryTaps: 8, frenzyBelow: 0.3 },
};

// ---------- #36 论武（PK）：随机切磋 / 约人切磋 ----------

export const PK_DAILY_LIMIT = 5;
/** 胜方灵石基准（×0.9~1.15 浮动 ×连胜系数），修为 = 灵石 ×0.9 */
export const PK_WIN_LINGSHI = [50, 140, 320, 640, 1200, 2200];
export const PK_WIN_XIUWEI_RATIO = 0.9;
/** 连胜加成：每连胜一层 +5%，封顶 +25%（含本层） */
export const PK_STREAK_STEP = 0.05;
export const PK_STREAK_CAP = 0.25;
/**
 * 对手战力带宽（对手攻/防各自按我方未蓄力面板 ×带宽生成）。
 * 胜负由战力 logistic 判定（#36），回合演出只做展示——race 式血量对拼会把
 * 蓄力的乘算攻防复利成碾压（+30% 属性 ≈ +69% 战力），曲线全靠 logistic 拉平。
 */
export const PK_OPP_BAND_RANDOM: [number, number] = [1.0, 1.25];
export const PK_OPP_BAND_FRIEND: [number, number] = [1.05, 1.3];
/** 我方先手优势：战力平方比上的固定系数 */
export const PK_FIRST_STRIKE_EDGE = 1.15;

// ---------- #37 论武蓄力：看广告提升本次论武攻防 ----------

/** 每支广告 +10% 攻防（本次论武有效），单场最多 10 支 */
export const PK_CHARGE_PER_AD = 0.1;
export const PK_CHARGE_MAX_ADS = 10;

/** 蓄力系数（1 + 10%×支数） */
export function pkChargeFactor(ads: number): number {
    return 1 + Math.min(PK_CHARGE_MAX_ADS, Math.max(0, ads)) * PK_CHARGE_PER_AD;
}

// ---------- 对手与道号随机名池 ----------

export const PK_OPP_NAMES = [
    '青阳子', '白芷仙子', '石破岳', '洛清寒', '燕归尘', '苏慕晚', '秦无衣', '顾长风',
    '柳如烟', '裴玄霜', '陆沉舟', '温挽月', '沈孤鸿', '薛映雪', '程惊蛰', '韩碧霄',
    '叶扶摇', '楚听澜', '段惊鸿', '谢青崖',
];

export const NAME_PREFIXES = ['云', '墨', '霜', '青', '玄', '月', '风', '雪', '凌', '洛', '白', '苏'];
export const NAME_SUFFIXES = ['隐', '尘', '歌', '渊', '轩', '痕', '翎', '溪', '潇', '眠', '舟', '岚'];
