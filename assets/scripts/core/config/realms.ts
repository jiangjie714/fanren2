/** 表 1：境界配置表（PRD 2.1 / 附件表1） */
export interface RealmConfig {
    name: string;
    /** 基础突破成功率（突破到本境界时使用） */
    baseRate: number;
    /** 突破到本境界所需机缘 */
    needJiyuan: number;
    /** 灵气雨时长（秒） */
    rainDuration: number;
    /** 角色外观 ID */
    avatarId: number;
    /** 解锁说明 */
    unlockDesc: string;
}

export const REALMS: RealmConfig[] = [
    { name: '凡人', baseRate: 0,    needJiyuan: 0,    rainDuration: 0, avatarId: 0, unlockDesc: '基础角色外观，解锁凡俗宝盒' },
    { name: '练气', baseRate: 0.6,  needJiyuan: 100,  rainDuration: 8, avatarId: 1, unlockDesc: '第 1 次灵气雨；解锁修真宝盒' },
    { name: '筑基', baseRate: 0.55, needJiyuan: 300,  rainDuration: 8, avatarId: 2, unlockDesc: '第 2 次灵气雨；角色外观升级' },
    { name: '金丹', baseRate: 0.5,  needJiyuan: 800,  rainDuration: 8, avatarId: 3, unlockDesc: '第 3 次灵气雨；角色外观升级' },
    { name: '元婴', baseRate: 0.45, needJiyuan: 2000, rainDuration: 8, avatarId: 4, unlockDesc: '第 4 次灵气雨；角色外观升级' },
    { name: '化神', baseRate: 0.4,  needJiyuan: 5000, rainDuration: 8, avatarId: 5, unlockDesc: '第 5 次灵气雨；最终外观，通关成就' },
];

export const MAX_REALM_INDEX = REALMS.length - 1;
