/**
 * M15-T4 闯关引擎测试（数值假设 #47）：
 * SLAY 内核复用、破绽 QTE（命中打断/落空提前/超时关闭）、三种性格修正、
 * Boss 二阶段变身、注入时间步进模拟必胜/必败路径。
 */
import { describe, expect, it } from 'vitest';
import {
    SLAY_HP_ATK_RATIO,
    SLAY_PLAYER_HP_BASE,
    TRAIL_PERSONALITY_MODS,
    TRAIL_QTE_HITS_PER_PHASE,
    TRAIL_QTE_WINDOW_MS,
} from '../assets/scripts/core/config/combat';
import { TrailBattleSession } from '../assets/scripts/core/systems/TrailBattleSystem';
import { Rng } from '../assets/scripts/core/rng';

const ATK = 100;
const DEF = 50;
const SCALE = 1.0;

/** 无干扰新局 */
function fresh(personality: 'swift' | 'iron' | 'blood' = 'blood', isBoss = false, seed = 7) {
    return new TrailBattleSession(
        { atk: ATK, def: DEF, scale: SCALE, personality, isBoss },
        new Rng(seed),
    );
}

/** 固定时间步进：每 tick 斩一刀（不停手），返回结算后的局 */
function grind(s: TrailBattleSession, msPerTap = 100, maxTaps = 500): TrailBattleSession {
    let t = 0;
    let taps = 0;
    while (s.status === 'ongoing' && taps < maxTaps) {
        t += msPerTap;
        s.tap(t);
        s.advance(t);
        // 若破绽窗口开启，稳定命中（按需用 qteHit 版本测试）
        if (s.qteOpen) s.qteResolve(true, t);
        taps++;
    }
    return s;
}

describe('M15-T4 SLAY 内核', () => {
    it('妖怪血量 = 攻×4.5×性格血量倍率；我方气血 = 100+(攻+防)×1.8', () => {
        const s = fresh('blood');
        expect(s.monsterHpMax).toBe(Math.round(ATK * SLAY_HP_ATK_RATIO * TRAIL_PERSONALITY_MODS.blood.hpMult));
        expect(s.playerHpMax).toBe(SLAY_PLAYER_HP_BASE + Math.round((ATK + DEF) * 1.8));
    });

    it('无反扑压力下连斩可胜（时间步进模拟）', () => {
        const s = grind(fresh());
        expect(s.status).toBe('win');
        expect(s.taps).toBeLessThanOrEqual(60);
    });
});

describe('M15-T4 破绽 QTE', () => {
    it('血量每破 25% 开窗；命中 → 额外伤害且打断下次反扑', () => {
        const s = fresh();
        // 打掉 25% 血量触发窗口
        const quarter = s.monsterHpMax * 0.25;
        let t = 0;
        while (!s.qteOpen && s.status === 'ongoing' && t < 60_000) {
            t += 100;
            s.tap(t);
            s.advance(t);
        }
        expect(s.qteOpen).toBe(true);
        const hpBefore = s.monsterHp;
        const nextStrikeBefore = s.nextStrikeAt;
        s.qteResolve(true, t);
        expect(s.qteOpen).toBe(false);
        expect(s.monsterHp).toBeLessThan(hpBefore); // 额外伤害已结算
        expect(s.nextStrikeAt).toBeGreaterThanOrEqual(nextStrikeBefore); // 打断：反扑时间点未被提前
    });

    it('落空 → 反扑提前到来', () => {
        const s = fresh();
        let t = 0;
        while (!s.qteOpen && s.status === 'ongoing' && t < 60_000) {
            t += 100;
            s.tap(t);
            s.advance(t);
        }
        const before = s.nextStrikeAt;
        s.qteResolve(false, t);
        expect(s.nextStrikeAt).toBeLessThanOrEqual(before);
    });

    it('窗口 1.5 秒超时自动关闭，resolve 无效', () => {
        const s = fresh();
        let t = 0;
        while (!s.qteOpen && s.status === 'ongoing' && t < 60_000) {
            t += 100;
            s.tap(t);
            s.advance(t);
        }
        s.qteResolve(true, t + TRAIL_QTE_WINDOW_MS + 1);
        expect(s.qteOpen).toBe(false);
    });

    it('QTE 全中 → morale 可用（qteHits === qteTotal）', () => {
        const s = grind(fresh());
        expect(s.status).toBe('win');
        expect(s.qteTotal).toBe(TRAIL_QTE_HITS_PER_PHASE);
        expect(s.qteHits).toBe(TRAIL_QTE_HITS_PER_PHASE);
        expect(s.morale).toBe(true);
    });
});

describe('M15-T4 妖怪性格', () => {
    it('疾风型：反扑间隔 ×0.7', () => {
        const s = fresh('swift');
        expect(s.strikeIntervalMs).toBeCloseTo(2800 * 0.7);
    });

    it('铁壁型：血量 ×1.3、每 12 斩额外反扑', () => {
        const s = fresh('iron');
        expect(s.monsterHpMax).toBe(Math.round(ATK * SLAY_HP_ATK_RATIO * 1.3));
        expect(s.strikeEveryTaps).toBe(12);
    });

    it('噬血型：血量 <30% 后反扑间隔减半', () => {
        const s = fresh('blood');
        // 压到 30% 以下
        let t = 0;
        while (s.monsterHp > s.monsterHpMax * 0.29 && s.status === 'ongoing' && t < 60_000) {
            t += 100;
            s.tap(t);
            s.advance(t);
        }
        expect(s.frenzyActive).toBe(true);
        expect(s.effectiveStrikeInterval).toBeCloseTo(2800 * 0.5);
    });
});

describe('M15-T4 Boss 二阶段', () => {
    it('一阶段倒下 → 满血变身（血 ×1.2、性格切换、QTE 总数 ×2）', () => {
        const s = fresh('swift', true);
        const p1Personality = s.personality;
        // 第一阶段打空
        let t = 0;
        while (s.phase === 1 && s.status === 'ongoing' && t < 120_000) {
            t += 100;
            s.tap(t);
            s.advance(t);
            if (s.qteOpen) s.qteResolve(true, t);
        }
        expect(s.phase).toBe(2);
        expect(s.monsterHp).toBe(s.monsterHpMax);
        expect(s.personality).not.toBe(p1Personality);
        expect(s.qteTotal).toBe(TRAIL_QTE_HITS_PER_PHASE * 2);
    });

    it('Boss 两阶段打完 → win；被打死 → lose', () => {
        const boss = grind(fresh('iron', true), 80);
        expect(boss.status).toBe('win');
        // 必败路径：妖伤巨大（atk 高 def 低）——直接构造极端面板
        const doomed = new TrailBattleSession(
            { atk: 10, def: 0, scale: 50, personality: 'swift', isBoss: false },
            new Rng(7),
        );
        let t = 0;
        while (doomed.status === 'ongoing' && t < 600_000) {
            t += 100;
            doomed.advance(t); // 挂机不动手 → 反扑至死
        }
        expect(doomed.status).toBe('lose');
    });
});
