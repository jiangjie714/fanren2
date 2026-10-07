/** 表 4：广告配置表（PRD 2.5 / 附件表4 + M8 历练召回 + M11 论武蓄力 + M14 秘境三件套）
 *  M14-5（#46）：移除 illusionExtra（幻境加次——次数经济已被体力制取代，无调用方），
 *  新增 trialStamina / trialRevive / doubleReward，总数 7 → 9。 */
export type AdPlace = 'dailyGift' | 'purify' | 'protect' | 'doubleXiuwei' | 'expeditionRecall' | 'pkCharge' | 'trialRevive' | 'trialStamina' | 'doubleReward';

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
    expeditionRecall: { place: 'expeditionRecall', name: '历练召回', location: '历练页', dailyLimit: 1, reward: '立即结束历练并结算' },
    pkCharge:         { place: 'pkCharge',         name: '论武蓄力', location: '论武切磋', dailyLimit: -1, reward: '本次论武攻防 +10%（单场最多 10 支）' },
    trialRevive:      { place: 'trialRevive',      name: '道心护持', location: '秘境试炼结算页', dailyLimit: -1, reward: '连胜中断时保留连胜层数（单次中断 1 支）' },
    trialStamina:     { place: 'trialStamina',     name: '体力补给', location: '秘境入口',    dailyLimit: 3,  reward: '体力 +5 点' },
    doubleReward:     { place: 'doubleReward',     name: '奖励翻倍', location: '秘境试炼结算页', dailyLimit: 3, reward: '本次秘境灵石与灵材奖励 ×2' },
};

/** 抖音激励广告位 ID（上线前在字节后台申请后填入） */
export const DOUYIN_AD_UNIT_IDS: Record<AdPlace, string> = {
    dailyGift: '',
    purify: '',
    protect: '',
    doubleXiuwei: '',
    expeditionRecall: '',
    pkCharge: '',
    trialRevive: '',
    trialStamina: '',
    doubleReward: '',
};
