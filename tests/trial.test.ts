/**
 * M14 秘境试炼单元测试（数值假设 #42–#45 的 M14-1 部分）：
 * 体力惰性回复、消耗、广告补给、主题确定性轮换、存档 v6 迁移。
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, migrate, SaveData } from '../assets/scripts/core/saveModel';
import { TrialSystem } from '../assets/scripts/core/systems/TrialSystem';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import {
    STAMINA_AD_PER_DAY,
    STAMINA_MAX,
    STAMINA_REGEN_MS,
    TRIAL_THEMES,
    dayIndexOf,
    themeForDay,
    themeOf,
} from '../assets/scripts/core/config/trial';

function makeSave(): SaveData {
    return defaultSave();
}

const T0 = new Date('2026-10-07T08:00:00');

describe('M14 体力惰性回复（#42）', () => {
    it('跨 45 分钟回 3 点；余数不吞（47 分钟仍 3 点且基准正确推进）', () => {
        const save = makeSave();
        const trial = new TrialSystem();
        save.trial.stamina = 0;
        save.trial.staminaAt = T0.getTime();

        trial.settleStamina(save, new Date(T0.getTime() + 45 * 60_000));
        expect(save.trial.stamina).toBe(3);
        expect(save.trial.staminaAt).toBe(T0.getTime() + 3 * STAMINA_REGEN_MS);

        // 再过 2 分钟（累计 47 分钟）：整周期仍只有 3 个，余数 2 分钟继续累积
        trial.settleStamina(save, new Date(T0.getTime() + 47 * 60_000));
        expect(save.trial.stamina).toBe(3);
        expect(save.trial.staminaAt).toBe(T0.getTime() + 3 * STAMINA_REGEN_MS);
    });

    it('回复到上限截断：满体力后基准推进到 now', () => {
        const save = makeSave();
        const trial = new TrialSystem();
        save.trial.stamina = STAMINA_MAX - 1;
        save.trial.staminaAt = T0.getTime();

        // 100 分钟 = 6 个整周期，但只差 1 点
        trial.settleStamina(save, new Date(T0.getTime() + 100 * 60_000));
        expect(save.trial.stamina).toBe(STAMINA_MAX);
        expect(save.trial.staminaAt).toBe(T0.getTime() + 100 * 60_000);

        // 满体力期间流逝时间不再折算，重复结算无变化
        expect(trial.settleStamina(save, new Date(T0.getTime() + 200 * 60_000))).toBe(false);
        expect(save.trial.stamina).toBe(STAMINA_MAX);
    });

    it('消耗后从当前余数继续回复（不重置周期）', () => {
        const save = makeSave();
        const trial = new TrialSystem();
        save.trial.stamina = 0;
        save.trial.staminaAt = T0.getTime();
        // 47 分钟：得 3 点，余 2 分钟
        const t47 = new Date(T0.getTime() + 47 * 60_000);
        trial.settleStamina(save, t47);
        trial.consumeStart(save, t47);
        expect(save.trial.stamina).toBe(2);

        // 13 分钟后（距基准 15 分钟整）：恰好再回 1 点
        trial.settleStamina(save, new Date(T0.getTime() + 60 * 60_000));
        expect(save.trial.stamina).toBe(3);
    });

    it('canStart/consumeStart：体力不足拒绝开局', () => {
        const save = makeSave();
        const trial = new TrialSystem();
        save.trial.stamina = 0;
        save.trial.staminaAt = T0.getTime();
        expect(trial.canStart(save, T0)).toBe(false);
        expect(trial.consumeStart(save, T0)).toBe(false);
        // 15 分钟后回 1 点即可开局
        expect(trial.consumeStart(save, new Date(T0.getTime() + STAMINA_REGEN_MS))).toBe(true);
        expect(save.trial.stamina).toBe(0);
    });
});

describe('M14 广告补给（#42）', () => {
    it('+5 点且不超上限；每日 3 次封顶', () => {
        const save = makeSave();
        const trial = new TrialSystem();
        save.trial.stamina = 2;
        save.trial.staminaAt = T0.getTime();

        expect(trial.refillByAd(save, T0)).toBe(true);
        expect(save.trial.stamina).toBe(7);
        expect(save.trial.adRefillToday).toBe(1);

        // 满体力附近补给：截断到 10，不溢出
        save.trial.stamina = 8;
        expect(trial.refillByAd(save, T0)).toBe(true);
        expect(save.trial.stamina).toBe(STAMINA_MAX);
        expect(save.trial.adRefillToday).toBe(2);

        // 第 3 次仍可（满体力时补给只计数）……第 4 次拒绝
        expect(trial.refillByAd(save, T0)).toBe(true);
        expect(save.trial.adRefillToday).toBe(3);
        expect(trial.refillByAd(save, T0)).toBe(false);
        expect(save.trial.stamina).toBe(STAMINA_MAX);
    });

    it('补给次数随每日重置（dailyReset），体力本身不随天清', () => {
        const save = makeSave();
        const trial = new TrialSystem();
        save.trial.stamina = 0;
        save.trial.staminaAt = T0.getTime();
        save.trial.adRefillToday = STAMINA_AD_PER_DAY;
        const eco = new EconomySystem(save);
        save.daily.date = '2000-01-01';
        eco.dailyReset(new Date('2026-10-08T08:00:00'));
        expect(save.trial.adRefillToday).toBe(0);
        // 惰性回复照常：距基准超过一天，直接回满
        expect(trial.stamina(save, new Date('2026-10-08T08:00:00'))).toBe(STAMINA_MAX);
    });
});

describe('M14 主题轮换（#42）', () => {
    it('按日序确定性派生，三主题循环', () => {
        expect(themeForDay(0).id).toBe('lingyu');
        expect(themeForDay(1).id).toBe('jieyun');
        expect(themeForDay(2).id).toBe('huanxin');
        expect(themeForDay(3).id).toBe('lingyu');
        expect(themeForDay(-1).id).toBe('huanxin'); // 负数安全
    });

    it('同日不同时刻主题一致；不同日轮换', () => {
        const morning = themeOf(new Date('2026-10-07T00:30:00'));
        const night = themeOf(new Date('2026-10-07T23:59:59'));
        expect(morning.id).toBe(night.id);
        expect(themeOf(new Date('2026-10-08T08:00:00')).id).not.toBe(morning.id);
    });

    it('dayIndexOf 与主题三主题参数齐备', () => {
        expect(dayIndexOf(new Date('2026-10-07T12:00:00')))
            .toBe(dayIndexOf(new Date('2026-10-07T00:00:00')));
        expect(TRIAL_THEMES.length).toBe(3);
        for (const t of TRIAL_THEMES) {
            expect(t.goldWeight + t.redWeight).toBe(100);
            expect(t.spawnRate).toBeGreaterThan(0);
            expect(t.rewardMult).toBeGreaterThanOrEqual(1.0);
        }
    });

    it('劫云成排 / 幻心随机落速 / 灵雨无特殊，参数与规格一致', () => {
        const [lingyu, jieyun, huanxin] = TRIAL_THEMES;
        expect(lingyu.redRows).toBe(false);
        expect(lingyu.fallSpeedMult).toBe(0.95);
        expect(jieyun.redRows).toBe(true);
        expect(jieyun.fallSpeedMult).toBe(1.25);
        expect(jieyun.rewardMult).toBe(1.3);
        expect(huanxin.randomFallSpeed).toBe(true);
        expect(huanxin.vignetteBursts).toBe(2);
    });
});

describe('M14 存档 v6 迁移', () => {
    it('v5 档升级：补 trial 默认与 daoxin=0，旧数据无损', () => {
        const v5 = { ...defaultSave(), version: 5 } as Record<string, unknown>;
        delete v5.trial;
        delete v5.daoxin;
        v5.lingshi = 4321;
        v5.realmIndex = 3;
        const s = migrate(v5);
        expect(s.version).toBe(6);
        expect(s.lingshi).toBe(4321);
        expect(s.realmIndex).toBe(3);
        expect(s.trial.stamina).toBe(STAMINA_MAX);
        expect(s.trial.streak).toBe(0);
        expect(s.trial.bestRank).toBe('xuetu');
        expect(s.daoxin).toBe(0);
        expect(typeof s.trial.staminaAt).toBe('number');
    });

    it('非法值钳制：负数/超上限/错类型回退安全默认', () => {
        const v6 = defaultSave();
        (v6.trial as { stamina: number }).stamina = -5;
        (v6 as { daoxin: number }).daoxin = 99;
        (v6.trial as { adRefillToday: number }).adRefillToday = 7;
        const s = migrate(JSON.parse(JSON.stringify(v6)));
        expect(s.trial.stamina).toBe(STAMINA_MAX); // 负数 → 回退满体力安全默认
        expect(s.daoxin).toBe(3); // 超上限 → 3
        expect(s.trial.adRefillToday).toBe(3); // 超 3 次 → 封顶 3
    });

    it('未知版本（高于当前）重置为新档', () => {
        const bad = { ...defaultSave(), version: 99 };
        const s = migrate(bad);
        expect(s.version).toBe(6);
        expect(s.lingshi).not.toBe(999999);
    });
});
