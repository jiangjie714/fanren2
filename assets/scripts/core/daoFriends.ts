/**
 * M25 道友档案化（子项目② a 层，数值假设 #50）：
 * 20 位虚拟道友的确定性档案派生——境界偏移（跟随玩家境界）、个人攻防带宽、
 * 战斗倾向。纯函数、零存档（档案不落盘，玩家境界变 → 档案随之成长，
 * 形成「同境可战 / 高一境需努力」的本地比较目标梯度）。
 *
 * 为什么确定性派生而非随机区间：random 模式的随机带宽（#36 口径）是「遭遇战」，
 * 档案切磋是「约战」——玩家需要能记住「燕归尘比我强半筹」，故同境界下
 * 同道友战力恒定；强弱的辨识度来自固定个人带宽，而非每次掷骰。
 */
import { PK_OPP_NAMES, REALM_COMBAT } from './config/combat';
import { REALMS } from './config/realms';
import { SaveData } from './saveModel';
import { PkOpponent } from './systems/CombatSystem';

export const DAO_FRIEND_COUNT = PK_OPP_NAMES.length;

/** 境界偏移固定表：6 位 −1 / 8 位 0 / 6 位 +1（约战目标梯度的分布口径，#50） */
export const DAO_FRIEND_REALM_OFFSETS: readonly number[] = [
    -1, 0, 1, 0, -1, 0, 1, 0, 0, -1,
    0, 1, 0, -1, 1, 1, 0, -1, 1, -1,
];

export function daoFriendOffset(index: number): number {
    return DAO_FRIEND_REALM_OFFSETS[Math.max(0, Math.min(DAO_FRIEND_COUNT - 1, index))];
}

/** 道友境界 = clamp(0..5, 玩家境界 + 偏移)——跟随成长、双向封顶 */
export function daoFriendRealm(save: SaveData, index: number): number {
    const realm = save.realmIndex + daoFriendOffset(index);
    return Math.max(0, Math.min(REALM_COMBAT.length - 1, realm));
}

/** 个人攻防带宽（1.00–1.30，index 确定性派生；与 #36 random 带宽同区间口径） */
export function daoFriendAtkBand(index: number): number {
    return 1 + ((index * 37) % 31) / 100;
}
export function daoFriendDefBand(index: number): number {
    return 1 + ((index * 53 + 11) % 31) / 100;
}

/** 战斗倾向：攻强 / 守固 / 均衡（带宽差 > ±0.04 分型） */
export function daoFriendStance(index: number): string {
    const diff = daoFriendAtkBand(index) - daoFriendDefBand(index);
    if (diff > 0.04) return '攻强';
    if (diff < -0.04) return '守固';
    return '均衡';
}

/** 指定道友生成对手（纯派生：同玩家境界下恒同战力，同境界恒可复现） */
export function makeFriendOpponent(save: SaveData, index: number): PkOpponent {
    const i = Math.max(0, Math.min(DAO_FRIEND_COUNT - 1, index));
    const base = REALM_COMBAT[daoFriendRealm(save, i)];
    return {
        name: PK_OPP_NAMES[i],
        atk: Math.max(1, Math.round(base.atk * daoFriendAtkBand(i))),
        def: Math.max(1, Math.round(base.def * daoFriendDefBand(i))),
        mode: 'friend',
        friendIndex: i,
    };
}

/** 档案行文案：名字 · N境 · 倾向（列表页行内即档案，无二级页） */
export function daoFriendLabel(save: SaveData, index: number): string {
    return `${PK_OPP_NAMES[index]} · ${REALMS[daoFriendRealm(save, index)].name} · ${daoFriendStance(index)}`;
}
