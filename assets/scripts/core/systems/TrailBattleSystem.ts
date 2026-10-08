/**
 * M15 妖径闯关引擎（数值假设 #47）：复用 #35 SLAY 公式族为内核，
 * 叠加破绽 QTE、妖怪性格修正、Boss 二阶段。纯逻辑无渲染——时间由调用方
 * advance(nowMs) 注入，Rng 可注入种子，整局可单测可复现。
 */
import { Rng } from '../rng';
import {
    SLAY_HP_ATK_RATIO,
    SLAY_PLAYER_HP_BASE,
    SLAY_PLAYER_HP_RATIO,
    SLAY_STRIKE_ATK_RATIO,
    SLAY_STRIKE_DEF_RATIO,
    SLAY_STRIKE_EVERY_TAPS,
    SLAY_STRIKE_INTERVAL_S,
    SLAY_TAP_ATK_RATIO,
    TRAIL_BOSS_PHASE2_MULT,
    TRAIL_PERSONALITY_MODS,
    TRAIL_QTE_HITS_PER_PHASE,
    TRAIL_QTE_WINDOW_MS,
} from '../config/combat';
import { TrailPersonality } from '../config/trail';

/** 性格轮换序（Boss 二阶段切换用） */
const PERSONALITY_CYCLE: readonly TrailPersonality[] = ['swift', 'iron', 'blood'];

export interface TrailBattleSpec {
    /** 玩家攻击 */
    atk: number;
    /** 玩家防御 */
    def: number;
    /** 章节难度系数（config/trail.chapterScale） */
    scale: number;
    personality: TrailPersonality;
    isBoss: boolean;
}

export type TrailBattleStatus = 'ongoing' | 'win' | 'lose';

export class TrailBattleSession {
    // ---------- 妖怪 ----------
    monsterHpMax: number;
    monsterHp: number;
    /** 当前反扑间隔 ms（狂化时动态减半） */
    strikeIntervalMs: number;
    /** 额外反扑所需斩击数 */
    strikeEveryTaps: number;
    personality: TrailPersonality;
    readonly isBoss: boolean;
    phase = 1;

    // ---------- 玩家 ----------
    playerHpMax: number;
    playerHp: number;

    // ---------- 战斗态 ----------
    taps = 0;
    status: TrailBattleStatus = 'ongoing';
    /** 破绽窗口是否开启 */
    qteOpen = false;
    qteHits = 0;
    qteTotal: number;
    /** 窗口开启的绝对时刻（advance 里判超时） */
    private qteOpenedAt = 0;
    /** 下次反扑时刻（epoch ms，由调用方时间轴定义） */
    nextStrikeAt: number;
    /** 已斩次数计数（每 N 斩额外反扑） */
    private tapsSinceStrike = 0;

    constructor(
        private spec: TrailBattleSpec,
        private rng: Rng,
    ) {
        const mods = TRAIL_PERSONALITY_MODS[spec.personality];
        this.personality = spec.personality;
        this.isBoss = spec.isBoss;
        this.monsterHpMax = Math.round(spec.atk * SLAY_HP_ATK_RATIO * spec.scale * mods.hpMult);
        this.monsterHp = this.monsterHpMax;
        this.strikeIntervalMs = SLAY_STRIKE_INTERVAL_S * 1000 * mods.strikeIntervalMult;
        this.strikeEveryTaps = mods.strikeEveryTaps;
        this.playerHpMax = SLAY_PLAYER_HP_BASE + Math.round((spec.atk + spec.def) * SLAY_PLAYER_HP_RATIO);
        this.playerHp = this.playerHpMax;
        this.qteTotal = TRAIL_QTE_HITS_PER_PHASE * (spec.isBoss ? 2 : 1);
        this.nextStrikeAt = this.strikeIntervalMs;
    }

    /** 噬血狂化是否激活（血量 < 阈值，反扑间隔减半） */
    get frenzyActive(): boolean {
        const mods = TRAIL_PERSONALITY_MODS[this.personality];
        return mods.frenzyBelow > 0 && this.monsterHp / this.monsterHpMax < mods.frenzyBelow;
    }

    /** 当前实际反扑间隔（狂化 ×0.5） */
    get effectiveStrikeInterval(): number {
        return this.frenzyActive ? this.strikeIntervalMs * 0.5 : this.strikeIntervalMs;
    }

    /** 玩家斩击一次（t 时刻）；返回本次伤害 */
    tap(t: number): number {
        if (this.status !== 'ongoing') return 0;
        this.taps++;
        this.tapsSinceStrike++;
        const dmg = Math.round(this.spec.atk * SLAY_TAP_ATK_RATIO * (0.85 + this.rng.float() * 0.3));
        this.damageMonster(dmg, t);
        // 每 N 斩额外反扑（性格可改 N）
        if (this.tapsSinceStrike >= this.strikeEveryTaps) {
            this.tapsSinceStrike = 0;
            this.monsterStrike(t);
        }
        return dmg;
    }

    /**
     * 失败回魂（广告续命，trailRevive 位）：气血回复至 ratio 比例并恢复战斗。
     * 仅 lose 态有效；Boss 二阶段进度保留。回魂后的反扑时刻由调用方重排
     * （nextStrikeAt = 当前时刻 + effectiveStrikeInterval）。
     */
    revive(ratio = 0.5): boolean {
        if (this.status !== 'lose') return false;
        this.playerHp = Math.max(1, Math.round(this.playerHpMax * ratio));
        this.status = 'ongoing';
        return true;
    }

    /** 推进时间：妖怪定时反扑与 QTE 超时（每帧调用） */
    advance(t: number): void {
        if (this.status !== 'ongoing') return;
        // QTE 超时自动关闭（无惩罚）
        if (this.qteOpen && t - this.qteOpenedAt > TRAIL_QTE_WINDOW_MS) {
            this.qteOpen = false;
        }
        while (this.status === 'ongoing' && t >= this.nextStrikeAt) {
            this.monsterStrike(t);
            this.nextStrikeAt += this.effectiveStrikeInterval;
        }
    }

    /**
     * 破绽窗口内点选：hit=true 点中符文 → 额外伤害（斩击 ×2）且打断下次反扑；
     * hit=false 点空 → 反扑提前到当前时刻。窗口外调用无效返回 false。
     */
    qteResolve(hit: boolean, t: number): boolean {
        if (this.status !== 'ongoing' || !this.qteOpen) return false;
        this.qteOpen = false;
        if (hit) {
            this.qteHits++;
            this.damageMonster(Math.round(this.spec.atk * SLAY_TAP_ATK_RATIO * 2), t);
            // 打断：下次反扑至少在当前间隔之后（不提前）
            if (this.nextStrikeAt < t + this.effectiveStrikeInterval) {
                this.nextStrikeAt = t + this.effectiveStrikeInterval;
            }
        } else {
            // 反扑提前
            this.nextStrikeAt = t;
        }
        return true;
    }

    // ---------- 内部 ----------

    private damageMonster(dmg: number, t: number): void {
        this.monsterHp -= dmg;
        // 血量每破 25%/50%/75% 开破绽窗口（击杀瞬间不开窗，见 onMonsterDown）
        const quarters = 4;
        const phaseBase = this.isBoss && this.phase === 2 ? this.qteTotal - TRAIL_QTE_HITS_PER_PHASE : 0;
        const openedInPhase = Math.max(0, this.qteHits + (this.qteOpen ? 1 : 0)) - phaseBase;
        const fallenRatio = 1 - Math.max(0, this.monsterHp) / this.monsterHpMax;
        if (!this.qteOpen && openedInPhase < TRAIL_QTE_HITS_PER_PHASE && fallenRatio >= (openedInPhase + 1) / quarters) {
            this.qteOpen = true;
            this.qteOpenedAt = t;
        }
        if (this.monsterHp <= 0) this.onMonsterDown(t);
    }

    private onMonsterDown(t: number): void {
        // 倒地瞬间关闭未决窗口（避免变身后的伤害/判定串阶段）
        this.qteOpen = false;
        if (this.isBoss && this.phase === 1) {
            // 二阶段：满血变身（全参数 ×1.2，性格轮换）
            this.phase = 2;
            this.monsterHpMax = Math.round(this.monsterHpMax * TRAIL_BOSS_PHASE2_MULT);
            this.monsterHp = this.monsterHpMax;
            const idx = PERSONALITY_CYCLE.indexOf(this.personality);
            this.personality = PERSONALITY_CYCLE[(idx + 1) % PERSONALITY_CYCLE.length];
            const mods = TRAIL_PERSONALITY_MODS[this.personality];
            this.strikeEveryTaps = mods.strikeEveryTaps;
            this.tapsSinceStrike = 0;
            return;
        }
        this.monsterHp = 0;
        this.status = 'win';
    }

    private monsterStrike(t: number): void {
        const mods = TRAIL_PERSONALITY_MODS[this.personality];
        const phaseMult = this.isBoss && this.phase === 2 ? TRAIL_BOSS_PHASE2_MULT : 1;
        const raw = this.spec.atk * SLAY_STRIKE_ATK_RATIO - this.spec.def * SLAY_STRIKE_DEF_RATIO;
        const dmg = Math.max(1, Math.round(raw * (0.9 + this.rng.float() * 0.2) * mods.strikeDmgMult * phaseMult));
        this.playerHp -= dmg;
        if (this.playerHp <= 0) {
            this.playerHp = 0;
            this.status = 'lose';
        }
    }

    /** 战意（本章 QTE 全中口径，供 TrailSystem 结算） */
    get morale(): boolean {
        return this.qteHits === this.qteTotal;
    }
}
