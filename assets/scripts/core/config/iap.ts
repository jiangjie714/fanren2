/** 表 5：内购配置表（PRD 2.6 / 附件表5）——纯外观特权，不影响任何概率 */
export type IapId = 'monthlyCard' | 'skinLiuyun' | 'skinJinlong';

export interface IapConfig {
    id: IapId;
    name: string;
    price: number;       // 元
    effect: string;
    affectRate: false;
}

export const IAP_ITEMS: IapConfig[] = [
    { id: 'monthlyCard', name: '仙尊月卡', price: 18, effect: '每日领取 1 个免费修真宝盒；灵气雨劫雨刷新数量 -20%', affectRate: false },
    { id: 'skinLiuyun',  name: '仙光外观·流云', price: 6,  effect: '角色外观 + 突破特效', affectRate: false },
    { id: 'skinJinlong', name: '仙光外观·金龙', price: 12, effect: '角色外观 + 突破特效', affectRate: false },
];

/** 月卡有效期（天） */
export const MONTH_CARD_DURATION_DAYS = 30;

/**
 * 合规开关：抖音小游戏虚拟支付需版号，无版号时内购入口整体隐藏（仅广告变现）。
 * Web 调试版可开启模拟购买。
 */
export const IAP_ENABLED = false;
