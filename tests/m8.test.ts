import { describe, expect, it } from 'vitest';
import { Rng } from '../assets/scripts/core/rng';
import { defaultSave, migrate, SaveData } from '../assets/scripts/core/saveModel';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { BoxSystem } from '../assets/scripts/core/systems/BoxSystem';
import { QuestSystem } from '../assets/scripts/core/systems/QuestSystem';
import { ExpeditionSystem } from '../assets/scripts/core/systems/ExpeditionSystem';
import { IllusionSystem } from '../assets/scripts/core/systems/IllusionSystem';
import { AlchemySystem } from '../assets/scripts/core/systems/AlchemySystem';
import { TrialSystem } from '../assets/scripts/core/systems/TrialSystem';
import { STAMINA_MAX } from '../assets/scripts/core/config/trial';
import { RainSystem } from '../assets/scripts/core/systems/RainSystem';
import { ACTIVITY_CHESTS } from '../assets/scripts/core/config/quests';
import { EXPEDITION_DAILY_LIMIT } from '../assets/scripts/core/config/expeditions';
import { ILLUSION, judgeIllusionScore, judgeIllusionTier, weekKeyOf } from '../assets/scripts/core/config/illusion';
import { TRIAL_THEMES } from '../assets/scripts/core/config/trial';

const NOW = new Date('2026-10-06T12:00:00').getTime();

function makeSave(): SaveData {
    return defaultSave();
}

function makeEco(save: SaveData) {
    return new EconomySystem(save);
}

// ---------- 存档 v2 迁移 ----------

describe('M9a 存档 v3 迁移（v1/v2 无损升级）', () => {
    it('v1 → v2：保留全部旧数据并补齐新字段', () => {
        const v1 = {
            version: 1,
            lingshi: 1234,
            xiuwei: 300,
            jiyuan: 40,
            realmIndex: 2,
            pityCount: 1,
            fragments: { jinmu: 3 },
            unlocked: ['jinmu'],
            daily: { date: '2026-01-01', dailyGiftUsed: true, monthlyClaimed: false, lingshiAidCount: 2 },
            monthlyCardExpire: 123,
            settings: { sound: false, bgm: true },
            stats: { opens: 9, breakthroughWins: 1, breakthroughFails: 0 },
        };
        const s = migrate(v1);
        expect(s.version).toBe(6); // M14 存档 v6：迁移后版本随当前模型
        expect(s.lingshi).toBe(1234);
        expect(s.realmIndex).toBe(2);
        expect(s.pityCount).toBe(1);
        expect(s.daily.dailyGiftUsed).toBe(true);
        expect(s.daily.questProgress).toEqual({});
        expect(s.daily.activityClaimed).toEqual([]);
        expect(s.xiuzhenTickets).toBe(0);
        expect(s.expedition.dest).toBeNull();
        expect(s.illusionWeekBest).toBe(0);
    });

    it('v2 缺失字段回退默认；未知版本重置', () => {
        const partial = migrate({ version: 2, lingshi: 555 });
        expect(partial.lingshi).toBe(555);
        expect(partial.xiuzhenTickets).toBe(0);
        expect(migrate({ version: 99 }).lingshi).toBe(200);
    });
});

// ---------- 修行任务与活跃度 ----------

describe('M8 修行任务（数值假设 #27）', () => {
    it('进度上报与完成判定；活跃度 = 完成数 ×25 封顶 100', () => {
        const save = makeSave();
        const qs = new QuestSystem(makeEco(save));
        expect(qs.progressOf(save, 'openBoxes')).toBe(0);
        qs.progress(save, 'openBoxes');
        qs.progress(save, 'openBoxes');
        expect(qs.isCompleted(save, 'openBoxes')).toBe(false);
        qs.progress(save, 'openBoxes');
        expect(qs.isCompleted(save, 'openBoxes')).toBe(true);
        expect(qs.activityOf(save)).toBe(25);
        ['tribulation', 'expedition', 'goldRain'].forEach((id) => {
            for (let i = 0; i < 20; i++) qs.progress(save, id as never);
        });
        expect(qs.activityOf(save)).toBe(100); // 封顶
    });

    it('宝箱领取：未达标/重复领拒绝；奖励正确入账（灵石/券/机缘+碎片）', () => {
        const save = makeSave();
        const eco = makeEco(save);
        const qs = new QuestSystem(eco);
        expect(qs.claimChest(save, 30, new Rng(1))).toEqual([]); // 未达标
        for (let i = 0; i < 3; i++) qs.progress(save, 'openBoxes');   // 淬体完成 → 25
        qs.progress(save, 'tribulation');                              // 问心完成 → 50
        const items30 = qs.claimChest(save, 30, new Rng(1));
        expect(items30.map((i) => i.label)).toEqual(['灵石 +250']);
        expect(save.lingshi).toBe(200 + 250);
        expect(qs.claimChest(save, 30, new Rng(1))).toEqual([]); // 重复领
        qs.progress(save, 'expedition');  // → 75 活跃
        const items60 = qs.claimChest(save, 60, new Rng(1));
        expect(items60.map((i) => i.label)).toEqual(['修真宝盒券 ×1']);
        expect(save.xiuzhenTickets).toBe(1);
        expect(qs.claimChest(save, 100, new Rng(1))).toEqual([]); // 活跃不足（75 < 100）
        qs.progress(save, 'goldRain', 15); // → 100
        const items100 = qs.claimChest(save, 100, new Rng(1));
        expect(save.jiyuan).toBe(50);
        const fragTotal = Object.values(save.fragments).reduce((a, b) => a + b, 0);
        expect(fragTotal).toBe(3); // 活跃度 100 档：随机普通灵根碎片 ×3
        expect(ACTIVITY_CHESTS.map((c) => c.at)).toEqual([30, 60, 100]);
    });
});

// ---------- 修真宝盒券 ----------

describe('M8 修真宝盒券', () => {
    it('持券可免费开修真宝盒并消耗一张；保底与统计口径不变', () => {
        // 同种子两次开箱：持券 vs 无券（同产出），差值应恰为一张券的面值 200
        const run = (ticket: boolean) => {
            const save = makeSave();
            save.realmIndex = 1;
            save.lingshi = 10000;
            save.xiuzhenTickets = ticket ? 1 : 0;
            const eco = makeEco(save);
            const box = new BoxSystem(save, eco, new Rng(8));
            const r = box.open('xiuzhen');
            return { r, delta: save.lingshi - 10000 };
        };
        const a = run(true);
        const b = run(false);
        expect(a.r.usedTicket).toBe(true);
        expect(b.r.usedTicket).toBe(false);
        expect(b.r.tier).toBe(a.r.tier);
        expect(a.delta).toBe(b.delta + 200); // 持券 = 免 200 灵石
        // 无券且无灵石 → 不可开；券不影响凡俗
        const save2 = makeSave();
        save2.realmIndex = 1;
        save2.lingshi = 0;
        const box2 = new BoxSystem(save2, makeEco(save2), new Rng(8));
        expect(box2.canOpen('xiuzhen').ok).toBe(false);
        expect(box2.canOpen('fansu').ok).toBe(false);
    });
});

// ---------- 历练 ----------

describe('M8 历练系统（数值假设 #28）', () => {
    const DUR = 20 * 60_000;

    it('出发占用每日次数；20 分钟后 complete；次数用尽 exhausted', () => {
        const save = makeSave();
        const sys = new ExpeditionSystem(makeEco(save), new Rng(1));
        expect(sys.start(save, 'qianshan', NOW)).toBe(true);
        expect(sys.stateOf(save, NOW + 1000)).toBe('running');
        expect(sys.start(save, 'migu', NOW + 2000)).toBe(false); // 途中不可再出发
        const r = sys.resolve(save, 0, NOW + 1000);
        expect(r).toBeNull(); // 未归来不可结算
        expect(sys.stateOf(save, NOW + DUR)).toBe('complete');
        sys.resolve(save, 1, NOW + DUR);
        expect(save.expedition.dest).toBeNull();
        expect(sys.stateOf(save, NOW + DUR)).toBe('idle'); // 还剩 1 次
        expect(sys.start(save, 'gudong', NOW + DUR)).toBe(true);
        save.expedition.dest = null;
        expect(sys.stateOf(save, NOW + DUR)).toBe('exhausted'); // 2 次用尽
        expect(EXPEDITION_DAILY_LIMIT).toBe(2);
    });

    it('召回：5 分钟后可用、每日 1 次；召回后立即 complete', () => {
        const save = makeSave();
        const sys = new ExpeditionSystem(makeEco(save), new Rng(1));
        sys.start(save, 'migu', NOW);
        expect(sys.recallable(save, NOW + 4 * 60_000)).toBe(false);
        expect(sys.recallable(save, NOW + 5 * 60_000)).toBe(true);
        expect(sys.recall(save, NOW + 5 * 60_000)).toBe(true);
        expect(sys.stateOf(save, NOW + 5 * 60_000)).toBe('complete');
        // 第二次历练：召回次数已用尽
        sys.resolve(save, 0, NOW + 5 * 60_000);
        sys.start(save, 'gudong', NOW + 5 * 60_000);
        expect(sys.recallable(save, NOW + 10 * 60_000)).toBe(false);
    });

    it('归来结算：按选项入账，劫难扣修为，无事不扣', () => {
        // 固定 float：事件由出发时间派生；权重/区间走确定性路径
        const rng = new Rng(1);
        (rng as unknown as { float: () => number }).float = () => 0.0; // 恒取首个结果/区间下限
        const save = makeSave();
        save.xiuwei = 1000;
        const sys = new ExpeditionSystem(makeEco(save), rng);
        sys.start(save, 'migu', NOW);
        const ev = sys.previewEvent(save);
        const [lo, hi] = ev.options[0].outcomes[0].effect.lingshiRange!;
        const r = sys.resolve(save, 0, NOW + DUR); // 进取项 → 权重最高的好结果
        expect(r).not.toBeNull();
        expect(r!.disaster).toBe(false);
        expect(save.lingshi).toBeGreaterThanOrEqual(200 + lo);  // 初始 200 + 产出
        expect(save.lingshi).toBeLessThanOrEqual(200 + hi);
        expect(save.xiuwei).toBe(1000);

        // 权重 1 的劫难结果：float 阈值推到 0.95
        const rng2 = new Rng(1);
        (rng2 as unknown as { float: () => number }).float = () => 0.95;
        const save2 = makeSave();
        save2.xiuwei = 1000;
        const sys2 = new ExpeditionSystem(makeEco(save2), rng2);
        sys2.start(save2, 'gudong', NOW);
        const r2 = sys2.resolve(save2, 0, NOW + DUR);
        expect(r2!.disaster).toBe(true);
        expect(save2.xiuwei).toBe(920); // -8%
        expect(save2.lingshi).toBe(200);
    });
});

// ---------- 心魔幻境 ----------

describe('M8 心魔幻境（数值假设 #29）', () => {
    it('计分公式与档位判定', () => {
        expect(judgeIllusionScore(20, 10, 2)).toBe(94); // 80+20-6
        expect(judgeIllusionScore(50, 30, 0)).toBe(200); // 上限夹取
        expect(judgeIllusionTier(59)).toBeNull();
        expect(judgeIllusionTier(60)).toBe('初入幻境');
        expect(judgeIllusionTier(120)).toBe('心魔退散');
        expect(judgeIllusionTier(180)).toBe('心魔大圣');
    });

    it('M14 体力制入口：体力 ≥1 可开局并扣 1 点，体力耗尽不可再战', () => {
        const save = makeSave();
        const trial = new TrialSystem();
        expect(trial.canStart(save, new Date(NOW))).toBe(true);
        expect(trial.consumeStart(save, new Date(NOW))).toBe(true);
        expect(save.trial.stamina).toBe(STAMINA_MAX - 1);
        // 次数经济已被 #42 取代：旧每日字段不再被入口读写
        expect(save.daily.illusionFreeUsed).toBe(false);
    });

    it('档位奖励只发高于已领档位的一档（TRIAL_TIERS：灵石减半+灵材，连胜倍率相乘）；周最佳随周切换清零', () => {
        const save = makeSave();
        const eco = makeEco(save);
        const sys = new IllusionSystem(eco, new AlchemySystem(eco));
        sys.checkWeek(save, new Date('2026-10-06T12:00:00'));
        let r = sys.finish(save, 10, 4, 0); // 40+8 = 48 < 60 无档位，且连胜清零（本就 0）
        expect(r.tier).toBeNull();
        expect(r.rewards).toEqual([]);
        expect(r.streak).toBe(0);
        // 69 → 初入幻境；连胜 0→1，倍率 ×1.0：灵石 75 + 灵草 1（#42 灵石减半主产灵材）
        r = sys.finish(save, 15, 6, 1); // 60+12-3 = 69
        expect(r.tier).toBe('初入幻境');
        expect(r.streak).toBe(1);
        expect(r.mult).toBe(1.0);
        expect(r.rewards.map((i) => i.label)).toEqual(['灵石 +75', '灵草 ×1']);
        expect(save.lingshi).toBe(200 + 75);
        expect(save.fortune.materials['lingcao']).toBe(1);
        expect(save.daily.illusionRewardedTier).toBe(60);
        // 再打 74 分：仍在 60 档不重复发放；连胜 1→2（倍率升 ×1.2 但无新档位可吃）
        r = sys.finish(save, 18, 4, 2); // 72+8-6 = 74
        expect(r.tier).toBe('初入幻境');
        expect(r.rewards).toEqual([]);
        expect(r.streak).toBe(2);
        // 跨入 120 档：连胜 2→3 → 倍率 ×1.5；灵石 floor(150×1.5)=225，
        // 灵材 ceil（灵草 2→3、灵石髓 1→2）；碎片不吃倍率仍 ×2
        r = sys.finish(save, 28, 8, 0); // 112+16 = 128
        expect(r.tier).toBe('心魔退散');
        expect(r.streak).toBe(3);
        expect(r.mult).toBe(1.5);
        expect(save.lingshi).toBe(200 + 75 + 225);
        expect(save.fortune.materials['lingcao']).toBe(1 + 3);
        expect(save.fortune.materials['lingshi_core']).toBe(2);
        expect(save.fragments['jinmu']).toBe(2);
        expect(save.trial.bestStreak).toBe(3);
        expect(save.daily.illusionBest).toBe(128);
        expect(save.illusionWeekBest).toBe(128);
        // 中断：59 分 <60 → 连胜清零、待护持标记、无奖励
        r = sys.finish(save, 13, 3, 2); // 52+6-6 = 52
        expect(r.streak).toBe(0);
        expect(r.interrupted).toBe(true);
        expect(r.streakBefore).toBe(3);
        // 护持恢复后续写
        const trial = new TrialSystem();
        trial.reviveStreak(save, r.streakBefore);
        expect(save.trial.streak).toBe(3);
        // 跨周清零
        sys.checkWeek(save, new Date('2026-10-13T08:00:00'));
        expect(save.illusionWeekBest).toBe(0);
        expect(save.illusionWeekKey).toBe(weekKeyOf(new Date('2026-10-13T08:00:00')));
    });
});

// ---------- 幻境玩法模式（RainSystem） ----------

describe('M8 幻境模式（RainSystem）', () => {
    it('会话参数：15 秒、无净化、主题化生成（灵雨：无蓝雨、落速 ×0.95）', () => {
        const rs = new RainSystem(new Rng(7));
        const lingyu = TRIAL_THEMES.find((t) => t.id === 'lingyu')!;
        const s = rs.createSession(1, false, 'illusion', lingyu);
        expect(s.duration).toBe(ILLUSION.duration);
        expect(s.theme).toBe(lingyu);
        expect(rs.usePurify(s)).toBe(false); // 秘境无净化
        // 3 秒生成 ≈ 12 滴，全部为金/红（无蓝雨），落速都在主题倍率区间
        for (let i = 0; i < 30; i++) rs.tick(s, 0.1, 0);
        expect(s.drops.length).toBeGreaterThanOrEqual(10);
        expect(s.drops.every((d) => d.type !== 'blue')).toBe(true);
        expect(s.drops.every((d) => d.vy >= 380 * lingyu.fallSpeedMult - 1e-6)).toBe(true);
        // 渡劫会话不受影响：仍可用净化，且不带主题
        const t = rs.createSession(1, false);
        expect(rs.usePurify(t)).toBe(true);
        expect(t.theme).toBeNull();
    });

    it('finish 汇总：幻境走独立计分（金×4+连击×2−红×3），comboBonus 恒 0', () => {
        const rs = new RainSystem(new Rng(7));
        const s = rs.createSession(1, false, 'illusion');
        for (let i = 0; i < 10; i++) rs['applyCatch'](s, 'gold');
        for (let i = 0; i < 3; i++) rs['applyCatch'](s, 'red');
        const r = rs.finish(s);
        expect(r.mode).toBe('illusion');
        expect(r.score).toBe(judgeIllusionScore(r.goldCount, r.maxCombo, r.redCount));
        expect(r.comboBonus).toBe(0);
        expect(r.rating).toBe(judgeIllusionTier(r.score));
    });
});

// ---------- 每日重置覆盖 v2 字段 ----------

describe('M8 跨天重置覆盖任务/历练/幻境', () => {
    it('dailyReset 重置 v2 每日字段但保留券与周最佳', () => {
        const save = makeSave();
        save.daily.questProgress = { openBoxes: 3 };
        save.daily.activityClaimed = [30];
        save.daily.expeditionUsed = 2;
        save.daily.expeditionRecallUsed = true;
        save.daily.illusionFreeUsed = true;
        save.daily.illusionAdUsed = true;
        save.daily.illusionBest = 99;
        save.daily.illusionRewardedTier = 60;
        save.xiuzhenTickets = 2;
        save.illusionWeekBest = 88;
        const eco = makeEco(save);
        save.daily.date = '2000-01-01';
        eco.dailyReset(new Date('2026-10-06T08:00:00'));
        expect(save.daily.questProgress).toEqual({});
        expect(save.daily.activityClaimed).toEqual([]);
        expect(save.daily.expeditionUsed).toBe(0);
        expect(save.daily.illusionFreeUsed).toBe(false);
        expect(save.daily.illusionBest).toBe(0);
        expect(save.daily.illusionRewardedTier).toBe(0);
        expect(save.xiuzhenTickets).toBe(2);      // 券不随天清
        expect(save.illusionWeekBest).toBe(88);   // 周最佳由 checkWeek 管理
    });
});
