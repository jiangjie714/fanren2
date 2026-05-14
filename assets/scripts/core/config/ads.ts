/** 表 4：广告配置表（PRD 2.5 / 附件表4 + M8 历练召回/幻境加次 + M11 论武蓄力） */
export type AdPlace = 'dailyGift' | 'purify' | 'protect' | 'doubleXiuwei' | 'expeditionRecall' | 'illusionExtra' | 'pkCharge';

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
    protect:     { place: 'protect',     name: '渡劫护道', location: '突破失败结算页', dailyLimit: -1, reward: '保留 50% 修为' },
    doubleXiuwei:{ place: 'doubleXiuwei',name: '修为加倍', location: '开箱结算页',  dailyLimit: -1, reward: '本次修为奖励 ×2' },
    expeditionRecall: { place: 'expeditionRecall', name: '历练召回', location: '历练页', dailyLimit: 1, reward: '立即结束历练并结算' },
    illusionExtra:    { place: 'illusionExtra',    name: '幻境加次', location: '心魔幻境', dailyLimit: 1, reward: '额外 1 次幻境挑战' },
    pkCharge:         { place: 'pkCharge',         name: '论武蓄力', location: '论武切磋', dailyLimit: -1, reward: '本次论武攻防 +10%（单场最多 10 支）' },
};

/** 抖音激励广告位 ID（上线前在字节后台申请后填入） */
export const DOUYIN_AD_UNIT_IDS: Record<AdPlace, string> = {
    dailyGift: '',
    purify: '',
    protect: '',
    doubleXiuwei: '',
    expeditionRecall: '',
    illusionExtra: '',
    pkCharge: '',
};
