/**
 * M14 秘境试炼单元测试（数值假设 #42–#45 的 M14-1 部分）：
 * 体力惰性回复、消耗、广告补给、主题确定性轮换、存档 v6 迁移。
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, migrate, SaveData } from '../assets/scripts/core/saveModel';
import { TrialSystem } from '../assets/scripts/core/systems/TrialSystem';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { AlchemySystem } from '../assets/scripts/core/systems/AlchemySystem';
import { IllusionSystem } from '../assets/scripts/core/systems/IllusionSystem';
import { RewardItem } from '../assets/scripts/core/systems/BoxSystem';
import {
    STAMINA_AD_PER_DAY,
    STAMINA_MAX,
    STAMINA_REGEN_MS,
    TRIAL_THEMES,
    dayIndexOf,
    rankBadge,
    rankById,
    rankGain,
    rankOf,
    streakMult,
    themeForDay,
    themeOf,
} from '../assets/scripts/core/config/trial';
import { weekKeyOf } from '../assets/scripts/core/config/illusion';

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

describe('M14 连胜轨（#43）', () => {
    it('倍率表边界：1→1.0 / 2→1.2 / 3-4→1.5 / 5-6→2.0 / ≥7→2.5 封顶', () => {
        const cases: Array<[number, number]> = [
            [0, 1.0], [1, 1.0], [2, 1.2], [3, 1.5], [4, 1.5],
            [5, 2.0], [6, 2.0], [7, 2.5], [12, 2.5], [99, 2.5],
        ];
        for (const [streak, mult] of cases) expect(streakMult(streak)).toBe(mult);
    });

    it('中断清零 / 护持恢复 / bestStreak 只增不减', () => {
        const save = makeSave();
        const trial = new TrialSystem();
        save.trial.streak = 5;
        save.trial.bestStreak = 5;
        // 中断：清零并返回中断前层数
        expect(trial.breakStreak(save)).toBe(5);
        expect(save.trial.streak).toBe(0);
        expect(save.trial.bestStreak).toBe(5);
        // 护持：恢复中断前层数（bestStreak 已有记录，不回写更高）
        trial.reviveStreak(save, 5);
        expect(save.trial.streak).toBe(5);
        // 护持非法值（0/负）不生效
        trial.breakStreak(save);
        trial.reviveStreak(save, 0);
        expect(save.trial.streak).toBe(0);
        // 恢复高于历史 best 时同步刷新
        trial.reviveStreak(save, 8);
        expect(save.trial.streak).toBe(8);
        expect(save.trial.bestStreak).toBe(8);
    });
});

describe('M14 段位轨（#44，M14-3）', () => {
    it('段位分公式：max(0, floor((score-60)/5))，60 分起计、每 5 分 +1', () => {
        const cases: Array<[number, number]> = [
            [0, 0], [59, 0], [60, 0], [64, 0], [65, 1], [70, 2],
            [98, 7], [128, 13], [180, 24], [200, 28],
        ];
        for (const [score, gain] of cases) expect(rankGain(score)).toBe(gain);
    });

    it('段位阶梯：学徒 0 / 登堂 200 / 入室 600 / 登峰 1400 / 造极 2800 / 超凡 5000', () => {
        expect(rankOf(0).id).toBe('xuetu');
        expect(rankOf(199).id).toBe('xuetu');
        expect(rankOf(200).id).toBe('dengtang');
        expect(rankOf(600).id).toBe('rushi');
        expect(rankOf(1400).id).toBe('dengfeng');
        expect(rankOf(2800).id).toBe('zaoji');
        expect(rankOf(5000).id).toBe('chaofan');
        expect(rankOf(99999).id).toBe('chaofan');
        // 未知 id 回退学徒
        expect(rankById('bogus').id).toBe('xuetu');
        expect(rankBadge('chaofan')).toContain('rank_chaofan');
    });

    it('settleRank：累计段位分、bestRank 只升不降', () => {
        const save = makeSave();
        const trial = new TrialSystem();
        let r = trial.settleRank(save, 98); // +7
        expect(r.gained).toBe(7);
        expect(r.rankScore).toBe(7);
        expect(save.trial.bestRank).toBe('xuetu');
        save.trial.rankScore = 199; // 模拟累计
        r = trial.settleRank(save, 180); // +24 → 223 → 登堂
        expect(r.rankScore).toBe(223);
        expect(r.rank.id).toBe('dengtang');
        expect(save.trial.bestRank).toBe('dengtang');
        // 赛季清零后 bestRank 保留
        save.trial.rankScore = 0;
        trial.settleRank(save, 65);
        expect(save.trial.bestRank).toBe('dengtang');
    });

    it('赛季结算：换周记 seasonRank 待领奖并清零段位分；0 分不发周奖', () => {
        const save = makeSave();
        const trial = new TrialSystem();
        save.trial.weekKey = weekKeyOf(new Date('2026-09-28T12:00:00')); // 上周
        save.trial.rankScore = 700; // 入室
        save.trial.weekRewardClaimed = true; // 上周的领取状态应被重置
        expect(trial.checkWeek(save, new Date('2026-10-05T00:00:01'))).toBe(true);
        expect(save.trial.seasonRank).toBe('rushi');
        expect(save.trial.rankScore).toBe(0);
        expect(save.trial.weekRewardClaimed).toBe(false);
        expect(save.trial.weekKey).toBe(weekKeyOf(new Date('2026-10-05T00:00:01')));
        // 本周未参与（0 分）→ 下次换周无周奖可领
        save.trial.weekKey = weekKeyOf(new Date('2026-10-05T00:00:01'));
        save.trial.rankScore = 0;
        trial.checkWeek(save, new Date('2026-10-12T00:00:01'));
        expect(save.trial.seasonRank).toBe('');
    });

    it('claimSeason：按周奖表发放（灵石/灵材/碎片/机缘）且幂等；未注入依赖返回 null', () => {
        const save = makeSave();
        save.trial.seasonRank = 'dengfeng'; // 2400 灵石 + 灵石髓2 妖兽丹1 + 碎片2
        const eco = new EconomySystem(save);
        const alch = new AlchemySystem(eco);
        const bare = new TrialSystem();
        expect(bare.claimSeason(save)).toBeNull(); // 未注入依赖
        const trial = new TrialSystem(eco, alch);
        const before = save.lingshi;
        const got = trial.claimSeason(save)!;
        expect(got.map((r) => r.label)).toEqual(['灵石 +2400', '灵石髓 ×2', '妖兽丹 ×1', '灵根碎片 ×2']);
        expect(save.lingshi).toBe(before + 2400);
        expect(save.fortune.materials['lingshi_core']).toBe(2);
        expect(save.fortune.materials['yaodan_core']).toBe(1);
        expect(save.fragments['jinmu']).toBe(2);
        // 幂等：领取后再领返回 null
        expect(trial.claimSeason(save)).toBeNull();
        // 机缘段位（造极）
        save.trial.weekRewardClaimed = false;
        save.trial.seasonRank = 'zaoji';
        const jiyuanBefore = save.jiyuan;
        trial.claimSeason(save);
        expect(save.jiyuan).toBe(jiyuanBefore + 20);
    });
});

describe('M14 奖励翻倍（doubleReward，#46/M14-5）', () => {
    it('灵石与灵材再补一份；碎片与机缘不加倍', () => {
        const save = makeSave();
        const eco = new EconomySystem(save);
        const alch = new AlchemySystem(eco);
        const illusion = new IllusionSystem(eco, alch);
        save.fragments['jinmu'] = 0;
        const before = save.lingshi;
        const rewards: RewardItem[] = [
            { kind: 'lingshi', amount: 150, label: '灵石 +150' },
            { kind: 'material', amount: 2, materialId: 'lingcao', label: '灵草 ×2' },
            { kind: 'fragment', amount: 1, lingengId: 'jinmu', label: '灵根碎片 ×1' },
            { kind: 'jiyuan', amount: 10, label: '突破机缘 +10' },
        ];
        const extra = illusion.applyDouble(save, rewards);
        // 只补灵石与灵材两项
        expect(extra.map((r) => r.kind)).toEqual(['lingshi', 'material']);
        expect(save.lingshi).toBe(before + 150);
        expect(save.fortune.materials['lingcao']).toBe(2);
        expect(save.fragments['jinmu']).toBe(0); // 碎片不加倍
        expect(save.jiyuan).toBe(defaultSave().jiyuan); // 机缘不加倍
    });

    it('空奖励清单返回空（未入档局无翻倍效果）', () => {
        const save = makeSave();
        const eco = new EconomySystem(save);
        const illusion = new IllusionSystem(eco);
        expect(illusion.applyDouble(save, [])).toEqual([]);
    });
});

describe('M14 存档 v6→v7 迁移', () => {
    it('v5 档升级：补 trial 默认与 daoxin=0，旧数据无损', () => {
        const v5 = { ...defaultSave(), version: 5 } as Record<string, unknown>;
        delete v5.trial;
        delete v5.daoxin;
        v5.lingshi = 4321;
        v5.realmIndex = 3;
        const s = migrate(v5);
        expect(s.version).toBe(7);
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
        expect(s.version).toBe(7);
        expect(s.lingshi).not.toBe(999999);
    });
});
