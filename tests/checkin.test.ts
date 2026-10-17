/**
 * M26 连续登录签到（docs/数值假设.md #53）
 * 覆盖：判定层纯函数（续签/断签/轮回/幂等/跨月跨年闰日/里程碑）+ 存档 v9 迁移 + 入账层。
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, migrate, SaveData, todayString } from '../assets/scripts/core/saveModel';
import {
    CHECKIN_CYCLE,
    CHECKIN_REWARDS,
    claimCheckin,
    claimMilestone,
    checkinView,
    cycleDayOf,
    dayGap,
    nextStreakIfClaim,
    rewardForDay,
} from '../assets/scripts/core/checkin';
import { CheckinSystem } from '../assets/scripts/core/systems/CheckinSystem';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { AlchemySystem } from '../assets/scripts/core/systems/AlchemySystem';

/** 连续领取 n 天，返回每天实发奖励（null = 当天不可领） */
function runDays(save: SaveData, start: string, n: number, step = 1) {
    const out: Array<ReturnType<typeof claimCheckin>> = [];
    const [y, m, d] = start.split('-').map(Number);
    for (let i = 0; i < n; i++) {
        const day = new Date(Date.UTC(y, m - 1, d + i * step));
        out.push(claimCheckin(save, todayString(day)));
    }
    return out;
}

describe('M26 签到判定层（core/checkin.ts 纯函数）', () => {
    it('新档：首日即可领第 1 档，view 各字段自洽', () => {
        const s = defaultSave();
        const v = checkinView(s, '2026-10-16');
        expect(v.streak).toBe(0);
        expect(v.cycleDay).toBe(0);
        expect(v.nextStreak).toBe(1);
        expect(v.cycleDayAfter).toBe(1);
        expect(v.claimedToday).toBe(false);
        expect(v.canClaim).toBe(true);
        expect(v.pending).toEqual(CHECKIN_REWARDS[0]);
        expect(v.totalDays).toBe(0);
        expect(v.nextMilestone).toBeNull();
    });

    it('连续七天：档位逐日递增，第 7 天为周期大奖（含机缘与灵材）', () => {
        const s = defaultSave();
        const got = runDays(s, '2026-03-01', 7);
        expect(got.map((r) => r!.lingshi)).toEqual([100, 150, 200, 250, 300, 350, 800]);
        expect(got[6]!.jiyuan).toBe(10);
        expect(got[6]!.mats).toEqual({ lingcao: 2, lingshi_core: 1 });
        expect(s.checkin.streak).toBe(7);
        expect(s.checkin.totalDays).toBe(7);
        expect(s.checkin.lastDay).toBe('2026-03-07');
    });

    it('第 8 天轮回回第 1 档（长线不通胀）', () => {
        const s = defaultSave();
        runDays(s, '2026-03-01', 7);
        const d8 = claimCheckin(s, '2026-03-08');
        expect(s.checkin.streak).toBe(8);
        expect(s.checkin.totalDays).toBe(8);
        expect(d8!.lingshi).toBe(CHECKIN_REWARDS[0].lingshi);
        expect(cycleDayOf(8)).toBe(1);
        expect(cycleDayOf(14)).toBe(7);
        expect(rewardForDay(15)?.lingshi).toBe(CHECKIN_REWARDS[0].lingshi);
        expect(CHECKIN_REWARDS.length).toBe(CHECKIN_CYCLE);
    });

    it('断签（间隔 > 1 天）重置为第 1 天；隔 1 天算续签', () => {
        const a = defaultSave();
        claimCheckin(a, '2026-03-01');
        claimCheckin(a, '2026-03-02');
        expect(a.checkin.streak).toBe(2);

        const b = defaultSave();
        claimCheckin(b, '2026-03-01');
        const after = claimCheckin(b, '2026-03-03'); // 空 1 天 → 断
        expect(b.checkin.streak).toBe(1);
        expect(after!.lingshi).toBe(CHECKIN_REWARDS[0].lingshi);
        expect(nextStreakIfClaim(b, '2026-03-04')).toBe(2);
    });

    it('同日重复领取幂等：返回 null 且状态不变', () => {
        const s = defaultSave();
        expect(claimCheckin(s, '2026-03-01')!.lingshi).toBe(100);
        expect(claimCheckin(s, '2026-03-01')).toBeNull();
        expect(s.checkin.streak).toBe(1);
        expect(s.checkin.totalDays).toBe(1);
        const v = checkinView(s, '2026-03-01');
        expect(v.canClaim).toBe(false);
        expect(v.claimedToday).toBe(true);
        expect(v.pending).toBeNull();
        // 今日已领时 nextStreak 就是当前 streak（不虚报）
        expect(v.nextStreak).toBe(1);
    });

    it('dayGap：跨月 / 跨年 / 闰年 / 非法输入', () => {
        expect(dayGap('2026-01-31', '2026-02-01')).toBe(1);
        expect(dayGap('2025-12-31', '2026-01-01')).toBe(1);
        expect(dayGap('2028-02-28', '2028-02-29')).toBe(1); // 闰年
        expect(dayGap('2028-02-28', '2028-03-01')).toBe(2);
        expect(dayGap('2027-02-28', '2027-03-01')).toBe(1); // 平年
        expect(dayGap('2026-03-01', '2026-03-01')).toBe(0);
        expect(dayGap('2026-03-02', '2026-03-01')).toBe(-1);
        expect(dayGap('', '2026-03-01')).toBeNull();
        expect(dayGap('2026-13-01', '2026-03-01')).toBeNull();
        expect(dayGap('garbage', '2026-03-01')).toBeNull();
    });

    it('里程碑：未达标拒绝 / 达标可领 / 重复领取幂等', () => {
        const s = defaultSave();
        expect(claimMilestone(s, 7)).toBeNull(); // totalDays=0
        s.checkin.totalDays = 7;
        const m7 = claimMilestone(s, 7);
        expect(m7!.lingshi).toBe(500);
        expect(claimMilestone(s, 7)).toBeNull(); // 幂等
        expect(claimMilestone(s, 15)).toBeNull(); // 未达标
        expect(claimMilestone(s, 999)).toBeNull(); // 无此档位

        s.checkin.totalDays = 30;
        expect(claimMilestone(s, 15)!.tickets).toBe(1);
        const m30 = claimMilestone(s, 30);
        expect(m30!.jiyuan).toBe(30);
        expect(m30!.mats).toEqual({ lingcao: 5 });

        const v = checkinView(s, '2026-03-01');
        expect(v.milestones.every((m) => m.reached && m.claimed)).toBe(true);
        expect(v.nextMilestone).toBeNull();
    });

    it('日期非法（手改存档）按断签处理，不给白续', () => {
        const s = defaultSave();
        s.checkin.lastDay = 'garbage';
        s.checkin.streak = 9;
        expect(nextStreakIfClaim(s, '2026-03-01')).toBe(1);
        expect(claimCheckin(s, '2026-03-01')!.lingshi).toBe(100);
        expect(s.checkin.streak).toBe(1);
    });
});

describe('M26 存档 v9 迁移', () => {
    it('v8 老档 → v9：保留全部数据 + checkin 补缺省（首日即可领第 1 档）', () => {
        const old = { ...defaultSave(), version: 8 as const, lingshi: 12345, realmIndex: 3 };
        const s = migrate(JSON.parse(JSON.stringify(old)));
        expect(s.version).toBe(13);
        expect(s.lingshi).toBe(12345);
        expect(s.realmIndex).toBe(3);
        expect(s.checkin).toEqual({ lastDay: '', streak: 0, totalDays: 0, milestonesClaimed: [] });
        expect(checkinView(s, '2026-10-16').canClaim).toBe(true);
    });

    it('非法值钳制：负数归 0、去重排序、lastDay 非字符串回退空串', () => {
        const s = migrate({
            version: 9,
            checkin: { lastDay: 123, streak: -5, totalDays: -1, milestonesClaimed: [15, 7, 7, 'x', -3] },
        });
        expect(s.version).toBe(13);
        expect(s.checkin.lastDay).toBe('');
        expect(s.checkin.streak).toBe(0);
        expect(s.checkin.totalDays).toBe(0);
        expect(s.checkin.milestonesClaimed).toEqual([7, 15]);
    });

    it('v1 原始档也能一路迁到 v9', () => {
        const s = migrate({ version: 1, lingshi: 500 });
        expect(s.version).toBe(13);
        expect(s.lingshi).toBe(500);
        expect(s.checkin.lastDay).toBe('');
    });

    it('损坏档（null / 字符串 / 未知版本）→ 重置为 v9 缺省', () => {
        expect(migrate(null).version).toBe(13);
        expect(migrate('oops').version).toBe(13);
        expect(migrate({ version: 99 }).version).toBe(13);
        expect(migrate({ version: 99 }).checkin.streak).toBe(0);
    });
});

describe('M26 签到入账（CheckinSystem）', () => {
    it('灵石入账不吃小等级加成（与灵石救济 #19 同口径）', () => {
        const s = defaultSave();
        s.xiuwei = 6000; // 抬高小等级，若吃加成则入账会被放大
        const eco = new EconomySystem(s);
        const sys = new CheckinSystem(eco, new AlchemySystem(eco));
        const before = s.lingshi;
        expect(sys.claim(s, new Date(Date.UTC(2026, 2, 1)))!.lingshi).toBe(100);
        expect(s.lingshi - before).toBe(100);
        expect(s.stats.lingshiEarned).toBe(100);
    });

    it('机缘与灵材按档位入库（第 7 天周期大奖）', () => {
        const s = defaultSave();
        const eco = new EconomySystem(s);
        const alch = new AlchemySystem(eco);
        const sys = new CheckinSystem(eco, alch);
        for (let i = 1; i <= 7; i++) sys.claim(s, new Date(Date.UTC(2026, 2, i)));
        expect(s.jiyuan).toBe(10);
        expect(alch.materialOf(s, 'lingcao')).toBe(2);
        expect(alch.materialOf(s, 'lingshi_core')).toBe(1);
    });

    it('里程碑入账：灵石与修真宝盒券', () => {
        const s = defaultSave();
        const eco = new EconomySystem(s);
        const sys = new CheckinSystem(eco, new AlchemySystem(eco));
        s.checkin.totalDays = 15;
        const before = s.lingshi;
        expect(sys.claimMilestone(s, 7)!.lingshi).toBe(500);
        expect(s.lingshi - before).toBe(500);
        expect(sys.claimMilestone(s, 15)!.tickets).toBe(1);
        expect(s.xiuzhenTickets).toBe(1);
        expect(sys.claimMilestone(s, 15)).toBeNull();
    });

    it('无依赖注入（纯判定场景）时只推进状态、不入账，也不抛异常', () => {
        const s = defaultSave();
        const sys = new CheckinSystem();
        expect(sys.claim(s, new Date(Date.UTC(2026, 2, 1)))!.lingshi).toBe(100);
        expect(s.lingshi).toBe(defaultSave().lingshi);
        expect(s.checkin.streak).toBe(1);
        expect(sys.view(s, new Date(Date.UTC(2026, 2, 1))).canClaim).toBe(false);
    });
});
