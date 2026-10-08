import { describe, expect, it } from 'vitest';
import { Rng } from '../assets/scripts/core/rng';
import { defaultSave, migrate, SaveData } from '../assets/scripts/core/saveModel';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { AchievementSystem } from '../assets/scripts/core/systems/AchievementSystem';
import { recordIllusion, recordTribulation } from '../assets/scripts/core/systems/StatsRecorder';
import { ACHIEVEMENTS } from '../assets/scripts/core/config/achievements';
import { encodeIllusionWeek, encodeRealmValue } from '../assets/scripts/infra/DouyinSocial';

function makeSave(): SaveData {
    return defaultSave();
}

function makeEco(save: SaveData) {
    return new EconomySystem(save);
}

// ---------- 存档 v3 迁移 ----------

describe('M9a 存档 v3 迁移', () => {
    it('v1 → v3：保留旧数据并补齐成就/计数器字段', () => {
        const v1 = {
            version: 1, lingshi: 777, realmIndex: 2, pityCount: 1,
            fragments: { jinmu: 2 }, unlocked: ['jinmu'],
            stats: { opens: 30, breakthroughWins: 1, breakthroughFails: 2 },
        };
        const s = migrate(v1);
        expect(s.version).toBe(7); // M15 存档 v7：迁移后版本随当前模型
        expect(s.lingshi).toBe(777);
        expect(s.stats.opens).toBe(30);
        expect(s.stats.bestTribScore).toBe(0);
        expect(s.stats.lingshiEarned).toBe(0);
        expect(s.achievements.reached).toEqual([]);
        expect(s.illusionBestEver).toBe(0);
        expect(s.xiuzhenTickets).toBe(0); // v2 字段补默认
    });

    it('v2 → v3：保留 v2 全部字段；缺失字段回退默认；未知版本重置', () => {
        const v2 = migrate({ version: 2, lingshi: 888, xiuzhenTickets: 3, illusionWeekBest: 99 });
        expect(v2.xiuzhenTickets).toBe(3);
        const s = migrate({ version: 2, lingshi: 888, xiuzhenTickets: 3, illusionWeekBest: 99 });
        expect(s.illusionBestEver).toBe(0);
        expect(s.achievements.reached).toEqual([]);
        expect(migrate({ version: 99 }).lingshi).toBe(200);
    });
});

// ---------- 长线计数器 ----------

describe('M9a 长线计数器（StatsRecorder）', () => {
    it('recordTribulation：最高评分/最大连击/完美接引计数', () => {
        const save = makeSave();
        const base = { goldBonus: 0, penalty: 0, mindDemon: false, extraXiuwei: 0, goldCount: 10, blueCount: 2, redCount: 0, comboBonus: 0, mode: 'tribulation' as const, maxCombo: 8 };
        recordTribulation(save, { ...base, score: 60, rating: '灵阶接引' } as never);
        recordTribulation(save, { ...base, score: 82, rating: '仙阶完美接引' } as never);
        recordTribulation(save, { ...base, score: 50, rating: '灵阶接引' } as never);
        expect(save.stats.bestTribScore).toBe(82);
        expect(save.stats.bestCombo).toBe(8);
        expect(save.stats.perfectTribulations).toBe(1); // 只有 82 分那局是零劫雨仙阶
    });

    it('recordIllusion：历史最高分只增不减', () => {
        const save = makeSave();
        recordIllusion(save, 88);
        recordIllusion(save, 66);
        expect(save.illusionBestEver).toBe(88);
    });

    it('addLingshi 正向入账累计 lingshiEarned（负向/救济不计）', () => {
        const save = makeSave();
        const eco = makeEco(save);
        eco.addLingshi(100);
        eco.addLingshi(50, false);
        expect(save.stats.lingshiEarned).toBe(150);
        save.lingshi -= 30; // 直接扣减（消费）不影响累计获得
        eco.addLingshi(0);
        expect(save.stats.lingshiEarned).toBe(150);
    });
});

// ---------- 成就系统 ----------

describe('M9a 成就系统', () => {
    it('12 项成就配置齐备且 id 唯一', () => {
        expect(ACHIEVEMENTS.length).toBe(12);
        expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(12);
        for (const a of ACHIEVEMENTS) {
            expect(a.target).toBeGreaterThan(0);
            expect(a.reward.lingshi ?? 0).toBeGreaterThan(0);
        }
    });

    it('check 幂等：达标入列一次，重复扫描返回空', () => {
        const save = makeSave();
        const ach = new AchievementSystem(makeEco(save));
        save.stats.opens = 1;
        const fresh1 = ach.check(save);
        expect(fresh1.map((a) => a.id)).toContain('firstOpen');
        expect(save.achievements.reached).toContain('firstOpen');
        expect(ach.check(save)).toEqual([]);
    });

    it('claim 幂等发放奖励；未达成/重复领返回空', () => {
        const save = makeSave();
        const eco = makeEco(save);
        const ach = new AchievementSystem(eco);
        expect(ach.claim(save, 'firstOpen', new Rng(1))).toEqual([]); // 未达成
        save.stats.opens = 1;
        ach.check(save);
        const items = ach.claim(save, 'firstOpen', new Rng(1));
        expect(items.map((i) => i.label)).toEqual(['灵石 +200']);
        expect(save.lingshi).toBe(200 + 200);
        expect(save.stats.lingshiEarned).toBe(200); // 成就奖励灵石也计入累计获得
        expect(ach.claim(save, 'firstOpen', new Rng(1))).toEqual([]); // 重复领
        expect(save.achievements.claimed).toEqual(['firstOpen']);
    });

    it('指标联动：图鉴/幻境/渡劫成就随对应字段达成', () => {
        const save = makeSave();
        const ach = new AchievementSystem(makeEco(save));
        save.unlocked.push('jinmu', 'shuituo', 'huoyan', 'fenglei');
        save.illusionBestEver = 130;
        save.stats.bestCombo = 15;
        save.stats.lingshiEarned = 100000;
        const fresh = ach.check(save);
        const ids = fresh.map((a) => a.id);
        expect(ids).toContain('collection4');
        expect(ids).toContain('illusion120');
        expect(ids).toContain('combo15');
        expect(ids).toContain('lingshi100k');
        expect(ids).not.toContain('collectionAll'); // 8 件未集齐
        expect(ids).not.toContain('illusion180');
        // claimableCount 供红点
        expect(ach.claimableCount(save)).toBe(fresh.length);
    });
});

// ---------- 月卡每日券 ----------

describe('M9a 月卡每日修真宝盒券（#14 后半）', () => {
    it('月卡有效且今日未领 → 发券并标记；重复/过期/无卡拒绝', () => {
        const save = makeSave();
        const eco = makeEco(save);
        expect(eco.claimMonthlyTicket()).toBe(false); // 无月卡
        eco.activateMonthlyCard(30, 30 * 24 * 3600 * 1000);
        expect(eco.claimMonthlyTicket()).toBe(true);
        expect(save.xiuzhenTickets).toBe(1);
        expect(save.daily.monthlyClaimed).toBe(true);
        expect(eco.claimMonthlyTicket()).toBe(false); // 今日已领
        save.daily.date = '2000-01-01';
        eco.dailyReset(new Date()); // 跨天重置 monthlyClaimed
        expect(eco.claimMonthlyTicket()).toBe(true); // 次日可再领
        expect(save.xiuzhenTickets).toBe(2);
    });
});

// ---------- 排行编码（M9b 上报值，先行单测） ----------

describe('M9a 排行值编码（#30）', () => {
    it('realm_value：境界 × 1e6 + 修为（修为封顶 999999）', () => {
        expect(encodeRealmValue(0, 0)).toBe(0);
        expect(encodeRealmValue(2, 1234)).toBe(2_001_234);
        expect(encodeRealmValue(5, 99999999)).toBe(5_999_999);
    });

    it('illusion_week：周键日期 ×1000 + 分数（分数封顶 999）', () => {
        expect(encodeIllusionWeek('W-2026-10-05', 128)).toBe(20261005_128);
        expect(encodeIllusionWeek('', 0)).toBe(0);
        expect(encodeIllusionWeek('W-2026-10-05', 99999)).toBe(20261005_999); // 分数夹取
    });
});
