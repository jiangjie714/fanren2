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
    doubleAvailable,
    doubleCheckin,
    makeupAvailable,
    makeupCheckin,
    nextStreakIfClaim,
    rewardForDay,
    shiftDay,
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

describe('A20 补签与双倍签到（core/checkin.ts 扩展，spec 2026-10-18，数值假设 #58）', () => {
    it('shiftDay：跨月 / 跨年 / 闰年 / 非法输入', () => {
        expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
        expect(shiftDay('2026-03-01', 0)).toBe('2026-03-01');
        expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
        expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29'); // 闰年
        expect(shiftDay('2027-02-28', 1)).toBe('2027-03-01'); // 平年
        expect(shiftDay('garbage', -1)).toBeNull();
        expect(shiftDay('', 1)).toBeNull();
        expect(shiftDay('2026-13-01', -1)).toBeNull();
    });

    it('补签：恰好漏昨日（gap=2）可补，补领昨日档位完整奖励且连续不断', () => {
        const s = defaultSave();
        runDays(s, '2026-03-01', 5); // streak=5，lastDay=03-05
        // 漏了 03-06，03-07 回来
        expect(makeupAvailable(s, '2026-03-07')).toBe(true);
        const r = makeupCheckin(s, '2026-03-07');
        expect(r).toEqual(CHECKIN_REWARDS[5]); // 补的是「第 6 天」档 350
        expect(s.checkin.streak).toBe(6);
        expect(s.checkin.totalDays).toBe(6);
        expect(s.checkin.lastDay).toBe('2026-03-06');
        expect(s.checkin.makeupDay).toBe('2026-03-06');
        // 补后今日照常领 → 第 7 天周期大奖（补+领 = 单日 1150 灵石，护栏②口径）
        const today = claimCheckin(s, '2026-03-07');
        expect(today).toEqual(CHECKIN_REWARDS[6]);
        expect(s.checkin.streak).toBe(7);
        expect(s.checkin.totalDays).toBe(7);
        expect(s.checkin.lastDay).toBe('2026-03-07');
    });

    it('补签：gap=1 无需补 / gap=3 断太久不可补 / 从未领取不可补', () => {
        const a = defaultSave();
        claimCheckin(a, '2026-03-01');
        expect(makeupAvailable(a, '2026-03-02')).toBe(false); // gap=1
        expect(makeupCheckin(a, '2026-03-02')).toBeNull();

        const b = defaultSave();
        claimCheckin(b, '2026-03-01');
        expect(makeupAvailable(b, '2026-03-04')).toBe(false); // gap=3
        expect(makeupCheckin(b, '2026-03-04')).toBeNull();

        const c = defaultSave();
        expect(makeupAvailable(c, '2026-03-02')).toBe(false); // lastDay=''
        expect(makeupCheckin(c, '2026-03-02')).toBeNull();
    });

    it('补签幂等：补后当日不可再补；手改存档回退 gap=2 也被 makeupDay 拦下', () => {
        const s = defaultSave();
        runDays(s, '2026-03-01', 5);
        makeupCheckin(s, '2026-03-07');
        expect(makeupAvailable(s, '2026-03-07')).toBe(false); // gap 已变 1
        expect(makeupCheckin(s, '2026-03-07')).toBeNull();
        // 手改：把 lastDay 拨回两天前，但 makeupDay 记得这天补过
        s.checkin.lastDay = '2026-03-05';
        expect(makeupAvailable(s, '2026-03-07')).toBe(false);
        expect(makeupCheckin(s, '2026-03-07')).toBeNull();
    });

    it('补签与「先领今日」互斥：先领则补签入口消失（特性不是 bug，spec R1）', () => {
        const s = defaultSave();
        runDays(s, '2026-03-01', 5);
        claimCheckin(s, '2026-03-07'); // 先领 → streak 归 1，lastDay=today
        expect(s.checkin.streak).toBe(1);
        expect(makeupAvailable(s, '2026-03-07')).toBe(false);
        expect(makeupCheckin(s, '2026-03-07')).toBeNull();
    });

    it('双倍：今日已领可翻，灵石 = 当日档位、机缘/灵材恒 0、totalDays 不动', () => {
        const s = defaultSave();
        runDays(s, '2026-03-01', 7); // 第 7 天已领，streak=7
        expect(doubleAvailable(s, '2026-03-07')).toBe(true);
        const beforeTotal = s.checkin.totalDays;
        const r = doubleCheckin(s, '2026-03-07');
        expect(r).toEqual({ lingshi: 800, jiyuan: 0, mats: {} });
        expect(s.checkin.doubledDay).toBe('2026-03-07');
        expect(s.checkin.totalDays).toBe(beforeTotal); // 不加（防广告刷 30 天里程碑）
        expect(s.checkin.streak).toBe(7); // 不动
    });

    it('双倍幂等与前置条件：同日再翻 null / 未领不可翻 / 跨日可再翻', () => {
        const s = defaultSave();
        runDays(s, '2026-03-01', 7);
        doubleCheckin(s, '2026-03-07');
        expect(doubleAvailable(s, '2026-03-07')).toBe(false);
        expect(doubleCheckin(s, '2026-03-07')).toBeNull();
        expect(s.checkin.totalDays).toBe(7);

        const b = defaultSave(); // 未领
        expect(doubleAvailable(b, '2026-03-07')).toBe(false);
        expect(doubleCheckin(b, '2026-03-07')).toBeNull();

        // 次日再领（第 8 天 = 轮回第 1 档 100），可再翻
        claimCheckin(s, '2026-03-08');
        expect(doubleAvailable(s, '2026-03-08')).toBe(true);
        expect(doubleCheckin(s, '2026-03-08')).toEqual({ lingshi: 100, jiyuan: 0, mats: {} });
    });

    it('补签与翻倍互斥：补签态不可翻、翻倍态不可补（同一天二者永不并存）', () => {
        const s = defaultSave();
        runDays(s, '2026-03-01', 5);
        expect(makeupAvailable(s, '2026-03-07')).toBe(true);
        expect(doubleAvailable(s, '2026-03-07')).toBe(false); // 未领
        makeupCheckin(s, '2026-03-07');
        claimCheckin(s, '2026-03-07'); // 今日已领 → 翻倍态
        expect(doubleAvailable(s, '2026-03-07')).toBe(true);
        expect(makeupAvailable(s, '2026-03-07')).toBe(false); // gap=1
    });

    it('view 三态派生：常规态 / 补签态 / 翻倍态', () => {
        const regular = defaultSave();
        claimCheckin(regular, '2026-03-01');
        const v1 = checkinView(regular, '2026-03-02');
        expect(v1.makeupAvailable).toBe(false);
        expect(v1.makeupReward).toBeNull();
        expect(v1.doubleAvailable).toBe(false);

        const mk = defaultSave();
        runDays(mk, '2026-03-01', 5);
        const v2 = checkinView(mk, '2026-03-07');
        expect(v2.makeupAvailable).toBe(true);
        expect(v2.makeupReward).toEqual(CHECKIN_REWARDS[5]); // 昨日档位预览
        expect(v2.doubleAvailable).toBe(false);

        const db = defaultSave();
        runDays(db, '2026-03-01', 7);
        const v3 = checkinView(db, '2026-03-07');
        expect(v3.makeupAvailable).toBe(false);
        expect(v3.makeupReward).toBeNull();
        expect(v3.doubleAvailable).toBe(true);
    });

    it('脏数据防线：lastDay 非法时补签/翻倍均按不可用处理（R4）', () => {
        const s = defaultSave();
        s.checkin.lastDay = 'garbage';
        s.checkin.streak = 9;
        expect(makeupAvailable(s, '2026-03-07')).toBe(false);
        expect(makeupCheckin(s, '2026-03-07')).toBeNull();
        expect(doubleAvailable(s, '2026-03-07')).toBe(false);
        expect(doubleCheckin(s, '2026-03-07')).toBeNull();
    });
});

describe('M26 存档迁移（v9 → … → v14 A20 补签/双倍字段）', () => {
    it('v8 老档 → 最新版：保留全部数据 + checkin 补缺省（首日即可领第 1 档）', () => {
        const old = { ...defaultSave(), version: 8 as const, lingshi: 12345, realmIndex: 3 };
        const s = migrate(JSON.parse(JSON.stringify(old)));
        expect(s.version).toBe(14);
        expect(s.lingshi).toBe(12345);
        expect(s.realmIndex).toBe(3);
        expect(s.checkin).toEqual({ lastDay: '', streak: 0, totalDays: 0, milestonesClaimed: [], makeupDay: '', doubledDay: '' });
        expect(checkinView(s, '2026-10-16').canClaim).toBe(true);
    });

    it('非法值钳制：负数归 0、去重排序、lastDay 非字符串回退空串', () => {
        const s = migrate({
            version: 9,
            checkin: { lastDay: 123, streak: -5, totalDays: -1, milestonesClaimed: [15, 7, 7, 'x', -3] },
        });
        expect(s.version).toBe(14);
        expect(s.checkin.lastDay).toBe('');
        expect(s.checkin.streak).toBe(0);
        expect(s.checkin.totalDays).toBe(0);
        expect(s.checkin.milestonesClaimed).toEqual([7, 15]);
    });

    it('v13 老档 → v14：签到数据全保留，makeupDay/doubledDay 补空串（没补过没翻过）', () => {
        const s = migrate({
            version: 13,
            checkin: { lastDay: '2026-10-15', streak: 4, totalDays: 12, milestonesClaimed: [7] },
        });
        expect(s.version).toBe(14);
        expect(s.checkin.lastDay).toBe('2026-10-15');
        expect(s.checkin.streak).toBe(4);
        expect(s.checkin.totalDays).toBe(12);
        expect(s.checkin.milestonesClaimed).toEqual([7]);
        expect(s.checkin.makeupDay).toBe('');
        expect(s.checkin.doubledDay).toBe('');
        // 语义正确：漏了 10-16，10-17 可补
        expect(makeupAvailable(s, '2026-10-17')).toBe(true);
        expect(doubleAvailable(s, '2026-10-17')).toBe(false);
    });

    it('v14 脏值钳制：makeupDay/doubledDay 非字符串回退空串（防手改存档注入）', () => {
        const s = migrate({
            version: 13,
            checkin: { lastDay: '2026-10-15', streak: 4, totalDays: 12, milestonesClaimed: [], makeupDay: 123, doubledDay: null },
        });
        expect(s.version).toBe(14);
        expect(s.checkin.makeupDay).toBe('');
        expect(s.checkin.doubledDay).toBe('');
    });

    it('v1 原始档也能一路迁到最新版', () => {
        const s = migrate({ version: 1, lingshi: 500 });
        expect(s.version).toBe(14);
        expect(s.lingshi).toBe(500);
        expect(s.checkin.lastDay).toBe('');
    });

    it('损坏档（null / 字符串 / 未知版本）→ 重置为最新版缺省', () => {
        expect(migrate(null).version).toBe(14);
        expect(migrate('oops').version).toBe(14);
        expect(migrate({ version: 99 }).version).toBe(14);
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

    it('A20 补签入账：灵石按昨日档位（不吃加成），无依赖时只推进状态', () => {
        const s = defaultSave();
        s.xiuwei = 6000; // 抬高小等级，若吃加成则入账会被放大
        const eco = new EconomySystem(s);
        const sys = new CheckinSystem(eco, new AlchemySystem(eco));
        for (let i = 1; i <= 5; i++) sys.claim(s, new Date(Date.UTC(2026, 2, i)));
        const before = s.lingshi;
        const earnedBefore = s.stats.lingshiEarned;
        // 漏 03-06，03-07 补签
        expect(sys.makeup(s, new Date(Date.UTC(2026, 2, 7)))!.lingshi).toBe(350);
        expect(s.lingshi - before).toBe(350);
        expect(s.stats.lingshiEarned - earnedBefore).toBe(350);
        expect(sys.makeup(s, new Date(Date.UTC(2026, 2, 7)))).toBeNull(); // 幂等

        const pure = defaultSave();
        const pureSys = new CheckinSystem();
        runDays(pure, '2026-03-01', 5);
        expect(pureSys.makeup(pure, new Date(Date.UTC(2026, 2, 7)))!.lingshi).toBe(350);
        expect(pure.lingshi).toBe(defaultSave().lingshi); // 不入账
        expect(pure.checkin.lastDay).toBe('2026-03-06'); // 但推进状态
    });

    it('A20 双倍入账：仅灵石一份（机缘/灵材不翻倍），totalDays 不动', () => {
        const s = defaultSave();
        const eco = new EconomySystem(s);
        const alch = new AlchemySystem(eco);
        const sys = new CheckinSystem(eco, alch);
        for (let i = 1; i <= 7; i++) sys.claim(s, new Date(Date.UTC(2026, 2, i)));
        expect(s.jiyuan).toBe(10); // 第 7 天档机缘已入账一次
        const before = s.lingshi;
        const totalBefore = s.checkin.totalDays;
        const r = sys.double(s, new Date(Date.UTC(2026, 2, 7)));
        expect(r).toEqual({ lingshi: 800, jiyuan: 0, mats: {} });
        expect(s.lingshi - before).toBe(800);
        expect(s.jiyuan).toBe(10); // 不翻倍
        expect(alch.materialOf(s, 'lingcao')).toBe(2); // 不翻倍
        expect(s.checkin.totalDays).toBe(totalBefore);
        expect(sys.double(s, new Date(Date.UTC(2026, 2, 7)))).toBeNull(); // 幂等
    });
});
