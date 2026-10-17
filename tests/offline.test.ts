/**
 * M29 离线吐纳（docs/数值假设.md #55）
 * 覆盖：判定层纯函数（门槛 / 单次上限 / 日累计上限 / 跨日翻新 / 境界速率 / floor 取整 /
 * 脏时间戳 / 幂等）+ 存档 v11 迁移钳制 + 入账口径 + 两条配置一致性护栏。
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, migrate, SaveData } from '../assets/scripts/core/saveModel';
import { REALMS } from '../assets/scripts/core/config/realms';
import {
    OFFLINE_ABSENCE_CAP,
    OFFLINE_DAY_CAP,
    OFFLINE_MIN_MINUTES,
    OFFLINE_RATES,
    elapsedMinutes,
    heartbeat,
    offlineView,
    rateOf,
    settleOffline,
} from '../assets/scripts/core/offline';
import { OfflineSystem } from '../assets/scripts/core/systems/OfflineSystem';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';

const MIN = 60_000;
/** 固定「现在」= 2026-10-17 12:00 本地时间 */
const NOW = new Date(2026, 9, 17, 12, 0, 0).getTime();

/** 构造：离线 N 分钟后的存档（默认金丹 realmIndex=3） */
function away(minutes: number, realmIndex = 3, lastAt = NOW - minutes * MIN): SaveData {
    const s = defaultSave();
    s.realmIndex = realmIndex;
    s.offline.lastAt = lastAt;
    s.offline.day = '2026-10-17';
    s.offline.dayMin = 0;
    return s;
}

describe('M29 离线吐纳判定层（core/offline.ts 纯函数）', () => {
    it('新档首登：lastAt 就是此刻 → 零收益，不结算', () => {
        const s = defaultSave();
        expect(settleOffline(s, s.offline.lastAt)).toBeNull();
        const v = offlineView(s, s.offline.lastAt + 60_000);
        expect(v.minutes).toBe(1);
        expect(v.canSettle, '1 分钟远低于 5 分钟门槛').toBe(false);
    });

    it('门槛：4 分 59 秒不结算 / 5 分钟整结算（含 floor 语义）', () => {
        const a = away(5);
        const just = settleOffline(a, NOW - 59_000);
        expect(just, '4 分 59 秒（299 秒）不足 5 分钟').toBeNull();
        expect(settleOffline(a, NOW)!.minutes).toBe(OFFLINE_MIN_MINUTES);
        // 每日额度足够时，不低于门槛就是全额
        const b = away(60);
        expect(settleOffline(b, NOW)!.minutes).toBe(60);
    });

    it('单次上限：离线 48 小时也只按 8 小时（480 分钟）算，且标记 capped', () => {
        const s = away(48 * 60);
        const v = offlineView(s, NOW);
        expect(v.minutes).toBe(OFFLINE_ABSENCE_CAP);
        expect(v.capped, '超过单次上限必须给 UI 提示「已达上限」').toBe(true);
        const g = settleOffline(s, NOW)!;
        expect(g.minutes).toBe(480);
        expect(g.lingshi, '金丹 0.4/分钟 × 480 → 192').toBe(192);
        expect(g.xiuwei, '金丹 1.6/分钟 × 480 → 768').toBe(768);
    });

    it('日累计上限：三段各 8 小时 → 全天只给 480 分钟（只封单次会漏 3 倍）', () => {
        const s = away(480);
        const first = settleOffline(s, NOW)!;
        expect(first.minutes).toBe(480);
        expect(s.offline.dayMin).toBe(480);

        // 同一天内再次离线 8 小时：日额度已尽 → 不再发放
        s.offline.lastAt = NOW + 8 * 60 * MIN - 480 * MIN; // 仍然 480 分钟前
        const second = settleOffline(s, NOW + 8 * 60 * MIN);
        expect(second, '当日额度耗尽后不该再发放').toBeNull();
        expect(s.offline.dayMin).toBe(480);

        // 跨自然日 → 额度翻新（这里用 +2 天确保翻日历）
        const nextDay = NOW + 2 * 24 * 60 * MIN;
        s.offline.lastAt = nextDay - 480 * MIN;
        const third = settleOffline(s, nextDay)!;
        expect(third.minutes).toBe(480);
        expect(s.offline.dayMin).toBe(480);
        expect(s.offline.day).not.toBe('2026-10-17');
    });

    it('未结算时不推进 lastAt（这段时间不会被吞，跨日后仍拿得到）', () => {
        const s = away(3); // 未过门槛
        expect(settleOffline(s, NOW)).toBeNull();
        expect(s.offline.lastAt, '未结算必须保留原心跳，否则玩家白丢 3 分钟').toBe(NOW - 3 * MIN);
        expect(s.offline.dayMin).toBe(0);
    });

    it('结算后立刻再结算一次幂等（心跳已前移 → 第二次为 null）', () => {
        const s = away(120);
        expect(settleOffline(s, NOW)!.minutes).toBe(120);
        expect(settleOffline(s, NOW)).toBeNull();
        expect(settleOffline(s, NOW + MIN)).toBeNull();
    });

    it('六档境界速率逐一对表 + floor 取整（绝不向上取整抬高产出）', () => {
        const expect31: Array<[number, number]> = [
            [Math.floor(31 * 0.6), Math.floor(31 * 0.15)],
            [Math.floor(31 * 0.9), Math.floor(31 * 0.22)],
            [Math.floor(31 * 1.2), Math.floor(31 * 0.3)],
            [Math.floor(31 * 1.6), Math.floor(31 * 0.4)],
            [Math.floor(31 * 2.0), Math.floor(31 * 0.5)],
            [Math.floor(31 * 2.4), Math.floor(31 * 0.6)],
        ];
        expect31.forEach(([xiuwei, lingshi], realm) => {
            const v = offlineView(away(31, realm), NOW);
            expect(v.xiuwei, `境界 ${realm} 修为`).toBe(xiuwei);
            expect(v.lingshi, `境界 ${realm} 灵石`).toBe(lingshi);
        });
        // 满 8 小时产出对照（金丹/化神两档最常被引用）
        expect(offlineView(away(480, 5), NOW).lingshi).toBe(288);
        expect(offlineView(away(480, 5), NOW).xiuwei).toBe(1152);
        expect(offlineView(away(480, 0), NOW).lingshi).toBe(72);
    });

    it('rateOf 越界钳制（手改 realmIndex）不崩也不给空速率', () => {
        expect(rateOf(-3)).toEqual(OFFLINE_RATES[0]);
        expect(rateOf(999)).toEqual(OFFLINE_RATES[OFFLINE_RATES.length - 1]);
        expect(rateOf(2.7)).toEqual(OFFLINE_RATES[2]); // floor → 筑基
    });

    it('脏时间戳一律归零：NaN / Infinity / 负数 / 未来时间（改系统时钟不刷收益）', () => {
        expect(elapsedMinutes(Number.NaN, NOW)).toBe(0);
        expect(elapsedMinutes(Number.POSITIVE_INFINITY, NOW)).toBe(0);
        expect(elapsedMinutes(NOW, Number.NaN)).toBe(0);
        expect(elapsedMinutes(NOW + 10 * MIN, NOW), '未来时间 = 0，不倒扣也不白送').toBe(0);
        expect(elapsedMinutes(NOW, NOW)).toBe(0);
        expect(elapsedMinutes(NOW - 5 * MIN, NOW)).toBe(5);

        const future = away(0);
        future.offline.lastAt = NOW + 30 * 24 * 60 * MIN;
        expect(offlineView(future, NOW).minutes).toBe(0);
        expect(settleOffline(future, NOW)).toBeNull();
    });

    it('心跳把「在线时间」从离线时长里扣掉：玩了 2 小时后再离线 1 小时 → 只结算 1 小时', () => {
        const s = away(180);
        // 模拟在线 120 分钟：tick 每秒推进心跳
        const played = NOW - 60 * MIN;
        heartbeat(s, played);
        const v = offlineView(s, NOW);
        expect(v.minutes, '心跳必须覆盖掉在线时长').toBe(60);
    });

    it('日额度视图自洽：dayMin / dayLeft 随结算推进到 0', () => {
        const s = away(600);
        const v0 = offlineView(s, NOW);
        expect(v0.dayMin).toBe(0);
        expect(v0.dayLeft).toBe(OFFLINE_DAY_CAP);
        settleOffline(s, NOW);
        const v1 = offlineView(s, NOW + MIN);
        expect(v1.dayMin).toBe(OFFLINE_DAY_CAP);
        expect(v1.dayLeft).toBe(0);
        expect(v1.canSettle).toBe(false);
    });

    it('配置一致性：速率表与境界表同长；日上限常量与存档迁移镜像对齐', () => {
        expect(OFFLINE_RATES.length, '新增境界必须同步补吐纳速率').toBe(REALMS.length);
        expect(OFFLINE_ABSENCE_CAP).toBe(480);
        expect(OFFLINE_DAY_CAP).toBe(480);
        // saveModel 为避免循环依赖镜像了一份 480，这里用迁移行为守护两处一致
        const s = migrate({ version: 11, offline: { lastAt: 1, day: '2026-10-17', dayMin: 9999 } });
        expect(s.offline.dayMin).toBe(OFFLINE_DAY_CAP);
    });

    it('效率比护栏：8 小时满档产出远低于在线典型一日（防后来者顺手翻十倍）', () => {
        // #38 典型一日实测量级 7264–9395 灵石；离线必须只是「回来的小惊喜」
        const full = offlineView(away(OFFLINE_ABSENCE_CAP, REALMS.length - 1), NOW);
        expect(full.lingshi, '化神满档灵石必须远低于典型一日').toBeLessThan(600);
        expect(full.xiuwei, '化神满档修为不超过 1152（≈8 个小等级）').toBeLessThanOrEqual(1152);
    });
});

describe('M29 存档 v11 迁移', () => {
    it('defaultSave 是 v11 且带 offline{lastAt=此刻, day=今天, dayMin=0}', () => {
        const s = defaultSave();
        expect(s.version).toBe(13);
        expect(s.offline.dayMin).toBe(0);
        expect(Math.abs(s.offline.lastAt - Date.now()), '新档心跳必须是此刻').toBeLessThan(5000);
        expect(s.offline.day.length).toBe(10);
    });

    it('v10 老档 → v11：保留全部数据，offline 补缺省且不给白条收益', () => {
        const old = { ...defaultSave(), version: 10 as const, lingshi: 12345, realmIndex: 3 };
        const s = migrate(JSON.parse(JSON.stringify(old)));
        expect(s.version).toBe(13);
        expect(s.lingshi).toBe(12345);
        expect(s.realmIndex).toBe(3);
        expect(s.offline.dayMin).toBe(0);
        expect(Math.abs(s.offline.lastAt - Date.now())).toBeLessThan(5000);
        // 关键：v10 老档升级后，第一次进游戏不能凭空拿到 N 天离线收益
        expect(settleOffline(s, Date.now()), '老档升级不该产生离线收益').toBeNull();
    });

    it('非法值钳制：未来 lastAt 拉回此刻、非法 day 回退今天、dayMin 钳 [0,480]', () => {
        const s = migrate({
            version: 11,
            offline: { lastAt: Date.now() + 86_400_000, day: 'garbage', dayMin: -7 },
        });
        expect(s.version).toBe(13);
        expect(s.offline.lastAt, '未来时间戳必须钳到此刻').toBeLessThanOrEqual(Date.now());
        expect(s.offline.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.offline.dayMin).toBe(0);
    });

    it('v1 原始档也能一路迁到 v11', () => {
        const s = migrate({ version: 1, lingshi: 500 });
        expect(s.version).toBe(13);
        expect(s.lingshi).toBe(500);
        expect(s.offline.dayMin).toBe(0);
    });

    it('损坏档（null / 字符串 / 未知版本）→ 重置为 v11 缺省', () => {
        expect(migrate(null).version).toBe(13);
        expect(migrate('oops').version).toBe(13);
        expect(migrate({ version: 99 }).version).toBe(13);
        expect(migrate({ version: 99 }).offline.dayMin).toBe(0);
    });
});

describe('M29 离线吐纳入账（OfflineSystem）', () => {
    it('灵石不吃小等级加成（与签到 #53 / 灵石救济 #19 同口径）', () => {
        const s = away(480, 3);
        s.xiuwei = 6000; // 抬高小等级：若吃加成则入账会被放大
        const eco = new EconomySystem(s);
        const sys = new OfflineSystem(eco);
        const before = s.lingshi;
        const g = sys.settle(s, NOW)!;
        expect(g.lingshi).toBe(192);
        expect(s.lingshi - before, '离线灵石必须按名义值发放').toBe(192);
        expect(s.stats.lingshiEarned).toBe(192);
    });

    it('修为入账同步抬高修为（苍白推进小等级 → 后续灵石收益加成上浮）', () => {
        const s = away(480, 3);
        const eco = new EconomySystem(s);
        const sys = new OfflineSystem(eco);
        expect(s.xiuwei).toBe(0);
        sys.settle(s, NOW);
        expect(s.xiuwei).toBe(768);
        expect(eco.smallLevel(), '768 修为 = 5 个小等级（每 150 一级）').toBe(5);
    });

    it('无依赖注入（纯判定场景）时只推进状态、不入账，也不抛异常', () => {
        const s = away(300, 0);
        const sys = new OfflineSystem();
        const g = sys.settle(s, NOW)!;
        expect(g.minutes).toBe(300);
        expect(s.lingshi).toBe(defaultSave().lingshi);
        expect(s.xiuwei).toBe(0);
        expect(s.offline.dayMin).toBe(300);
    });

    it('touch() 心跳写入 lastAt（Game.tick 每秒调用的那一个）', () => {
        const s = away(60);
        const sys = new OfflineSystem();
        sys.touch(s, NOW);
        expect(s.offline.lastAt).toBe(NOW);
        expect(sys.view(s, NOW).canSettle).toBe(false);
    });
});
