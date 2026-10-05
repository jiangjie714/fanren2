/** 战斗系统：攻防属性、锻体、法器、斩妖与论武（数值假设 #33–#37，纯逻辑可单测） */
import { Rng } from '../rng';
import { SaveData } from '../saveModel';
import {
    FORGING_MAX_LEVEL,
    MONSTERS,
    NAME_PREFIXES,
    NAME_SUFFIXES,
    PK_DAILY_LIMIT,
    PK_FIRST_STRIKE_EDGE,
    PK_OPP_BAND_FRIEND,
    PK_OPP_BAND_RANDOM,
    PK_OPP_NAMES,
    PK_STREAK_CAP,
    PK_STREAK_STEP,
    PK_WIN_LINGSHI,
    PK_WIN_XIUWEI_RATIO,
    REALM_COMBAT,
    SLAY_HP_ATK_RATIO,
    SLAY_PLAYER_HP_BASE,
    SLAY_PLAYER_HP_RATIO,
    SLAY_STRIKE_ATK_RATIO,
    SLAY_STRIKE_DEF_RATIO,
    SLAY_TAP_ATK_RATIO,
    WEAPONS,
    forgingCost,
    forgingFactor,
    pkChargeFactor,
} from '../config/combat';
import { DestId } from '../config/expeditions';
import { fragmentPool } from '../config/lingens';
import { EconomySystem } from './EconomySystem';
import { RewardItem } from './BoxSystem';

/** 面板攻防与战力 */
export interface CombatStats {
    atk: number;
    def: number;
    /** 战力 = 攻 + 防（展示/对手带宽基准） */
    power: number;
}

export type WeaponBuyFail = 'locked' | 'owned' | 'lingshiNotEnough';

export type PkMode = 'random' | 'friend';

export interface PkOpponent {
    name: string;
    atk: number;
    def: number;
    mode: PkMode;
}

export interface BattleRound {
    /** 出手方：'me' | 'opp' */
    actor: 'me' | 'opp';
    dmg: number;
}

export interface BattleOutcome {
    win: boolean;
    rounds: BattleRound[];
    /** 双方剩余气血比例（0~1） */
    myHpLeft: number;
    oppHpLeft: number;
}

export class CombatSystem {
    constructor(private eco: EconomySystem, private rng: Rng) {}

    // ---------- #33 攻防属性 ----------

    /** 面板属性：境界基础 × 锻体系数 + 法器加值（法器自动佩最高档） */
    deriveStats(save: SaveData): CombatStats {
        const base = REALM_COMBAT[Math.min(REALM_COMBAT.length - 1, save.realmIndex)];
        const f = forgingFactor(save.combat.forging);
        const w = WEAPONS.find((x) => x.tier === this.equippedTier(save));
        const atk = Math.round(base.atk * f) + (w?.atk ?? 0);
        const def = Math.round(base.def * f) + (w?.def ?? 0);
        return { atk, def, power: atk + def };
    }

    /** 下一级锻体成本（满级 Infinity） */
    forgingNextCost(save: SaveData): number {
        return forgingCost(save.combat.forging);
    }

    canUpgradeForging(save: SaveData): boolean {
        return save.combat.forging < FORGING_MAX_LEVEL && this.eco.canAfford(this.forgingNextCost(save));
    }

    /** 锻体升级：成功返回 true 并扣灵石 */
    upgradeForging(save: SaveData): boolean {
        if (save.combat.forging >= FORGING_MAX_LEVEL) return false;
        if (!this.eco.spend(this.forgingNextCost(save))) return false;
        save.combat.forging += 1;
        return true;
    }

    // ---------- #34 法器 ----------

    /** 当前佩着的最高档法器档位；一件都没有返回 -1 */
    equippedTier(save: SaveData): number {
        return save.combat.weapons.length ? Math.max(...save.combat.weapons) : -1;
    }

    weaponBuyState(save: SaveData, tier: number): 'owned' | 'locked' | 'affordable' | 'poor' {
        if (save.combat.weapons.includes(tier)) return 'owned';
        if (save.realmIndex < tier) return 'locked';
        const w = WEAPONS.find((x) => x.tier === tier);
        return w && this.eco.canAfford(w.cost) ? 'affordable' : 'poor';
    }

    /** 购入法器：境界达标且未拥有；成功返回 true */
    buyWeapon(save: SaveData, tier: number): boolean {
        const w = WEAPONS.find((x) => x.tier === tier);
        if (!w || save.realmIndex < tier || save.combat.weapons.includes(tier)) return false;
        if (!this.eco.spend(w.cost)) return false;
        save.combat.weapons.push(tier);
        return true;
    }

    // ---------- #35 斩妖 ----------

    monsterOf(dest: DestId) {
        return MONSTERS[dest];
    }

    slayMonsterMaxHp(save: SaveData): number {
        return Math.max(10, Math.round(this.deriveStats(save).atk * SLAY_HP_ATK_RATIO));
    }

    slayPlayerMaxHp(save: SaveData): number {
        const s = this.deriveStats(save);
        return Math.max(30, Math.round(SLAY_PLAYER_HP_BASE + (s.atk + s.def) * SLAY_PLAYER_HP_RATIO));
    }

    /** 单次斩击伤害 */
    slayTapDamage(save: SaveData): number {
        return Math.max(1, Math.round(this.deriveStats(save).atk * SLAY_TAP_ATK_RATIO * this.rng.range(0.85, 1.15)));
    }

    /** 妖兽反扑伤害（防御减伤后，保底 1） */
    slayStrikeDamage(save: SaveData): number {
        const s = this.deriveStats(save);
        const raw = s.atk * SLAY_STRIKE_ATK_RATIO - s.def * SLAY_STRIKE_DEF_RATIO;
        return Math.max(1, Math.round(raw * this.rng.range(0.9, 1.1)));
    }

    /**
     * 斩妖胜利结算：按目的地发奖并入账。失败不调用、无惩罚。
     * fragmentChance 命中时发 1 枚凡俗池碎片。
     */
    slayRewards(save: SaveData, dest: DestId): RewardItem[] {
        const cfg = MONSTERS[dest];
        const items: RewardItem[] = [];
        const got = this.eco.addLingshi(this.rng.int(cfg.reward.lingshi[0], cfg.reward.lingshi[1]));
        items.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
        const xw = this.eco.addXiuwei(cfg.reward.xiuwei);
        items.push({ kind: 'xiuwei', amount: xw, label: `修为 +${xw}` });
        if (cfg.reward.jiyuan) {
            this.eco.addJiyuan(cfg.reward.jiyuan);
            items.push({ kind: 'jiyuan', amount: cfg.reward.jiyuan, label: `突破机缘 +${cfg.reward.jiyuan}` });
        }
        if (this.rng.chance(cfg.reward.fragmentChance)) {
            const pool = fragmentPool('fansu');
            const id = pool[this.rng.int(0, pool.length - 1)];
            save.fragments[id] = (save.fragments[id] ?? 0) + 1;
            items.push({ kind: 'fragment', amount: 1, lingengId: id, label: '灵根碎片 ×1' });
        }
        return items;
    }

    // ---------- #36 论武（PK） ----------

    pkRemaining(save: SaveData): number {
        return Math.max(0, PK_DAILY_LIMIT - save.daily.pkUsed);
    }

    canPk(save: SaveData): boolean {
        return this.pkRemaining(save) > 0;
    }

    /** 消耗一场论武次数（开战前调用；失败同样消耗，防刷奖励） */
    consumePk(save: SaveData): boolean {
        if (!this.canPk(save)) return false;
        save.daily.pkUsed += 1;
        return true;
    }

    /** 蓄力后的我方有效攻防 */
    chargedStats(save: SaveData, chargeAds: number): CombatStats {
        const s = this.deriveStats(save);
        const f = pkChargeFactor(chargeAds);
        return { atk: Math.round(s.atk * f), def: Math.round(s.def * f), power: s.power };
    }

    /**
     * 胜率预估（蓄力交互的实时反馈）：与 simulateBattle 同一套 logistic 公式，
     * 蓄力支数越多胜率越高；UI 每蓄一支刷新一次。
     */
    pkWinOdds(save: SaveData, chargeAds: number, opp: PkOpponent): number {
        const my = this.chargedStats(save, chargeAds);
        const myP2 = Math.pow(Math.max(1, my.atk + my.def), 2) * PK_FIRST_STRIKE_EDGE;
        const oppP2 = Math.pow(Math.max(1, opp.atk + opp.def), 2);
        return myP2 / (myP2 + oppP2);
    }

    /**
     * 生成对手：攻/防按**境界基础值**×带宽生成（不随我方锻体/法器水涨船高），
     * 投入成长的玩家在论武里直接体现为胜率上移；蓄力在其之上继续加成（#36/#37）。
     */
    makeOpponent(save: SaveData, mode: PkMode, rng: Rng): PkOpponent {
        const base = REALM_COMBAT[Math.min(REALM_COMBAT.length - 1, save.realmIndex)];
        const [lo, hi] = mode === 'friend' ? PK_OPP_BAND_FRIEND : PK_OPP_BAND_RANDOM;
        return {
            name: PK_OPP_NAMES[rng.int(0, PK_OPP_NAMES.length - 1)],
            atk: Math.max(1, Math.round(base.atk * rng.range(lo, hi))),
            def: Math.max(1, Math.round(base.def * rng.range(lo, hi))),
            mode,
        };
    }

    /**
     * 论武推演：胜负由战力 logistic 判定（我方先手系数 ×1.15），3~6 合的攻防
     * 数字作为演出生成（同一套攻防公式），落败方气血归零。纯函数，可复现。
     *
     * 为什么不用血量对拼 race：乘算攻防在 race 里按平方复利（+30% 属性 ≈
     * +69% 有效战力），蓄力几支广告就把曲线推到全胜/全败；logistic 让每支
     * 广告稳定抬几个百分点的胜率，锻体/法器/境界同样直接进入战力。
     */
    simulateBattle(my: CombatStats, opp: PkOpponent, rng: Rng): BattleOutcome {
        const myPower2 = Math.pow(Math.max(1, my.atk + my.def), 2) * PK_FIRST_STRIKE_EDGE;
        const oppPower2 = Math.pow(Math.max(1, opp.atk + opp.def), 2);
        const win = rng.float() < myPower2 / (myPower2 + oppPower2);

        const rounds: BattleRound[] = [];
        const exchanges = rng.int(3, 6);
        for (let i = 0; i < exchanges; i++) {
            rounds.push({
                actor: 'me',
                dmg: Math.max(1, Math.round(my.atk * rng.range(0.85, 1.15) - opp.def * 0.35)),
            });
            rounds.push({
                actor: 'opp',
                dmg: Math.max(1, Math.round(opp.atk * rng.range(0.85, 1.15) - my.def * 0.35)),
            });
        }
        // 收尾一合：胜方落下终结一击，败方气血归零
        const finalDmg = Math.max(1, Math.round((win ? my.atk : opp.atk) * rng.range(1.0, 1.2)));
        rounds.push({ actor: win ? 'me' : 'opp', dmg: finalDmg });
        return {
            win,
            rounds,
            myHpLeft: win ? rng.range(0.2, 0.65) : 0,
            oppHpLeft: win ? 0 : rng.range(0.2, 0.65),
        };
    }

    /** 胜方奖励：灵石（×0.9~1.15 ×连胜系数） + 修为（灵石×0.9） */
    pkWinRewards(save: SaveData, newStreak: number): RewardItem[] {
        const base = PK_WIN_LINGSHI[Math.min(PK_WIN_LINGSHI.length - 1, save.realmIndex)];
        const streakMult = 1 + Math.min(PK_STREAK_CAP, Math.max(0, newStreak - 1) * PK_STREAK_STEP);
        const items: RewardItem[] = [];
        const got = this.eco.addLingshi(Math.round(base * this.rng.range(0.9, 1.15) * streakMult));
        items.push({ kind: 'lingshi', amount: got, label: `灵石 +${got}` });
        const xw = this.eco.addXiuwei(Math.round(got * PK_WIN_XIUWEI_RATIO));
        items.push({ kind: 'xiuwei', amount: xw, label: `修为 +${xw}` });
        return items;
    }

    /** 记录一场论武结果并返回连胜层数（胜方为含本场的连胜数，败方清零） */
    recordPkResult(save: SaveData, win: boolean): number {
        if (win) {
            save.pk.wins += 1;
            save.pk.streak += 1;
            save.pk.bestStreak = Math.max(save.pk.bestStreak, save.pk.streak);
            return save.pk.streak;
        }
        save.pk.losses += 1;
        save.pk.streak = 0;
        return 0;
    }

    /** 随机道号（捏人流用） */
    randomName(): string {
        return NAME_PREFIXES[this.rng.int(0, NAME_PREFIXES.length - 1)]
            + NAME_SUFFIXES[this.rng.int(0, NAME_SUFFIXES.length - 1)];
    }
}
