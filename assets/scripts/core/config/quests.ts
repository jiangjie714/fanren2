/** M8 修行日常：每日任务与活跃度宝箱（数值假设 #27） */
export type QuestId = 'openBoxes' | 'tribulation' | 'expedition' | 'goldRain' | 'tower';

export interface QuestConfig {
    id: QuestId;
    name: string;
    desc: string;
    target: number;
}

export const QUESTS: QuestConfig[] = [
    { id: 'openBoxes',   name: '淬体', desc: '开启宝箱 3 次', target: 3 },
    { id: 'tribulation', name: '问心', desc: '完成 1 场灵气雨（渡劫或幻境）', target: 1 },
    { id: 'expedition',  name: '行走', desc: '妖径通关 1 层', target: 1 },
    { id: 'goldRain',    name: '接引', desc: '累计拾取 15 片金雨', target: 15 },
    { id: 'tower',       name: '入冢', desc: '剑冢推层 1 次', target: 1 },
];

/** 每个任务完成得 25 活跃度，上限 100 */
export const QUEST_ACTIVITY = 25;
export const ACTIVITY_MAX = 100;

export interface ActivityChest {
    /** 所需活跃度 */
    at: number;
    lingshi?: number;
    /** 修真宝盒券（免费开 1 次修真宝盒，不入每日重置） */
    ticket?: number;
    jiyuan?: number;
    fragments?: number;
}

export const ACTIVITY_CHESTS: ActivityChest[] = [
    { at: 30, lingshi: 250 },
    { at: 60, ticket: 1 },
    { at: 100, jiyuan: 50, fragments: 3 },
];
