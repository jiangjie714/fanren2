/** 表 4：广告配置表（PRD 2.5 / 附件表4 + M11 论武蓄力 + M14 秘境三件套 + M15 妖径）
 *  M14-5（#46）：移除 illusionExtra（幻境加次——次数经济已被体力制取代，无调用方），
 *  新增 trialStamina / trialRevive / doubleReward，总数 7 → 9。
 *  M15（#47）：移除 expeditionRecall（旧历练挂机召回——挂机玩法退役，无调用方），
 *  新增 trailRevive（妖径失败回魂，单局限 1 次）/ trailHint（妖径凝神一瞥/洗牌，
 *  M16/M17 玩法接入后启用），总数 9 → 10。 */
export type AdPlace = 'dailyGift' | 'purify' | 'protect' | 'doubleXiuwei' | 'pkCharge' | 'trialRevive' | 'trialStamina' | 'doubleReward' | 'trailRevive' | 'trailHint';

export interface AdPlaceConfig {
    place: AdPlace;
    name: string;
    /** 触发位置 */
    location: string;
    /** 每日可使用次数（-1 = 单局/单场计数，由玩法侧限制） */
    dailyLimit: number;
    reward: string;
}

export const AD_PLACES: Record<AdPlace, AdPlaceConfig> = {
    dailyGift:   { place: 'dailyGift',   name: '每日仙缘', location: '首页',        dailyLimit: 1,  reward: '免费凡俗宝盒' },
    purify:      { place: 'purify',      name: '净化劫雨', location: '灵气雨界面',  dailyLimit: -1, reward: '3 秒屏蔽劫雨（单局 1 次）' },
    protect:     { place: 'protect',     name: '渡劫护道', location: '突破失败结算页', dailyLimit: -1, reward: '修为仅损一成，道心 +2' },
    doubleXiuwei:{ place: 'doubleXiuwei',name: '修为加倍', location: '开箱结算页',  dailyLimit: -1, reward: '本次修为奖励 ×2' },
    pkCharge:         { place: 'pkCharge',         name: '论武蓄力', location: '论武切磋', dailyLimit: -1, reward: '本次论武攻防 +10%（单场最多 10 支）' },
    trialRevive:      { place: 'trialRevive',      name: '道心护持', location: '秘境试炼结算页', dailyLimit: -1, reward: '连胜中断时保留连胜层数（单次中断 1 支）' },
    trialStamina:     { place: 'trialStamina',     name: '体力补给', location: '秘境入口',    dailyLimit: 3,  reward: '体力 +5 点' },
    doubleReward:     { place: 'doubleReward',     name: '奖励翻倍', location: '秘境/妖径结算页', dailyLimit: 3, reward: '本次灵石与灵材奖励 ×2' },
    trailRevive:      { place: 'trailRevive',      name: '回魂再战', location: '妖径战斗页', dailyLimit: -1, reward: '气血回复五成，继续本层（单局 1 次）' },
    trailHint:        { place: 'trailHint',        name: '凝神一瞥', location: '妖径拼图/三消关', dailyLimit: 3, reward: '看完整原图 1 秒 / 洗牌重排（M16/M17 接入）' },
};

/** 抖音激励广告位 ID（上线前在字节后台申请后填入） */
export const DOUYIN_AD_UNIT_IDS: Record<AdPlace, string> = {
    dailyGift: '',
    purify: '',
    protect: '',
    doubleXiuwei: '',
    pkCharge: '',
    trialRevive: '',
    trialStamina: '',
    doubleReward: '',
    trailRevive: '',
    trailHint: '',
};
