import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ANALYTICS_EVENTS,
    buildLaunchParams,
    dayIndexBetween,
    dayKeyOf,
    isAnalyticsEvent,
    sanitizeAnalyticsParams,
} from '../assets/scripts/core/analytics';
import {
    createAnalyticsClient,
    type AnalyticsProvider,
    type AnalyticsStorage,
} from '../assets/scripts/infra/Analytics';

class MemStorage implements AnalyticsStorage {
    private map = new Map<string, string>();

    get(key: string): string | null {
        return this.map.has(key) ? this.map.get(key)! : null;
    }

    set(key: string, value: string): void {
        this.map.set(key, value);
    }
}

class Recorder implements AnalyticsProvider {
    events: Array<{ name: string; params: Record<string, string | number> }> = [];

    track(name: string, params: Record<string, string | number>): void {
        this.events.push({ name, params });
    }
}

const SAVE = {
    realmIndex: 0,
    stats: { opens: 0, breakthroughWins: 0, breakthroughFails: 0 },
};

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('core/analytics 事件表与参数清洗', () => {
    it('关键漏斗事件都登记在案，参数名合法', () => {
        const required = [
            'app_launch',
            'first_home',
            'box_open',
            'first_box',
            'breakthrough_start',
            'breakthrough_result',
            'first_breakthrough_success',
            'ad_request',
            'ad_result',
            'first_ad_success',
        ];
        required.forEach((name) => expect(isAnalyticsEvent(name), name).toBe(true));
        Object.values(ANALYTICS_EVENTS).forEach((meta) => {
            meta.params.forEach((key) => expect(key).toMatch(/^[a-z][a-z0-9_]*$/));
        });
    });

    it('未知事件名不通过白名单', () => {
        expect(isAnalyticsEvent('box_opne')).toBe(false);
        expect(isAnalyticsEvent('')).toBe(false);
    });

    it('清洗：非法键/NaN/空串丢弃，布尔转 1/0，字符串截断 64', () => {
        const out = sanitizeAnalyticsParams({
            tier: 'rare',
            flag: true,
            n: 3,
            nan: NaN,
            empty: '   ',
            'bad-key': 1,
            long: 'x'.repeat(100),
        });
        expect(out.tier).toBe('rare');
        expect(out.flag).toBe(1);
        expect(out.n).toBe(3);
        expect(out.nan).toBeUndefined();
        expect(out.empty).toBeUndefined();
        expect(out['bad-key']).toBeUndefined();
        expect(String(out.long)).toHaveLength(64);
    });

    it('清洗：最多保留 20 个参数', () => {
        const input: Record<string, number> = {};
        for (let i = 0; i < 30; i += 1) input[`k${i}`] = i;
        expect(Object.keys(sanitizeAnalyticsParams(input))).toHaveLength(20);
    });

    it('dayIndexBetween 按本地自然日计算（跨月/跨年/逆序）', () => {
        const a = new Date(2026, 11, 31, 23, 59).getTime();
        const b = new Date(2027, 0, 1, 0, 1).getTime();
        expect(dayKeyOf(a)).toBe('2026-12-31');
        expect(dayIndexBetween(a, b)).toBe(1);
        expect(dayIndexBetween(a, a)).toBe(0);
        expect(dayIndexBetween(b, a)).toBe(0);
    });

    it('buildLaunchParams 输出新老用户与进度快照', () => {
        const p = buildLaunchParams(
            { realmIndex: 2, stats: { opens: 7, breakthroughWins: 2, breakthroughFails: 1 } },
            3,
            false,
        );
        expect(p).toMatchObject({
            day_index: 3,
            is_new_user: 0,
            realm_index: 2,
            total_opens: 7,
            total_wins: 2,
            total_fails: 1,
        });
    });
});

describe('AnalyticsClient 启动/一次性事件/公共参数', () => {
    it('首启发 app_launch（day_index=0, is_new_user=1）；次日同 storage 发 day_index=1', () => {
        const storage = new MemStorage();
        const first = new Recorder();
        let now = new Date(2026, 9, 21, 10, 0).getTime();
        const c1 = createAnalyticsClient({ provider: first, storage, now: () => now });
        c1.init(SAVE);
        expect(first.events).toHaveLength(1);
        expect(first.events[0].name).toBe('app_launch');
        expect(first.events[0].params).toMatchObject({
            day_index: 0,
            is_new_user: 1,
            realm_index: 0,
            total_opens: 0,
        });

        now += 86400000;
        const second = new Recorder();
        const c2 = createAnalyticsClient({ provider: second, storage, now: () => now });
        c2.init(SAVE);
        expect(second.events[0].name).toBe('app_launch');
        expect(second.events[0].params).toMatchObject({ day_index: 1, is_new_user: 0 });
    });

    it('重复 init 不重复发 app_launch；trackOnce 跨实例幂等', () => {
        const storage = new MemStorage();
        const rec = new Recorder();
        const now = () => new Date(2026, 9, 21, 10, 0).getTime();
        const c = createAnalyticsClient({ provider: rec, storage, now });
        c.init(SAVE);
        c.init(SAVE);
        expect(rec.events.filter((e) => e.name === 'app_launch')).toHaveLength(1);

        c.trackOnce('first_box', 'first_box', { box_id: 'fansu', tier: 'rare' });
        c.trackOnce('first_box', 'first_box', { box_id: 'fansu', tier: 'rare' });
        expect(rec.events.filter((e) => e.name === 'first_box')).toHaveLength(1);

        // 新实例共用同一 storage：一次性事件仍只发一次
        const c2 = createAnalyticsClient({ provider: rec, storage, now });
        c2.init(SAVE);
        c2.trackOnce('first_box', 'first_box', { box_id: 'fansu', tier: 'rare' });
        expect(rec.events.filter((e) => e.name === 'first_box')).toHaveLength(1);
    });

    it('未登记事件被丢弃；已登记事件自动附加 realm_index/day_index', () => {
        const storage = new MemStorage();
        const rec = new Recorder();
        const c = createAnalyticsClient({ provider: rec, storage, now: () => new Date(2026, 9, 21, 10, 0).getTime() });
        const save = { ...SAVE, realmIndex: 3, stats: { ...SAVE.stats, opens: 5 } };
        c.init(save);
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        rec.events.length = 0;
        c.track('not_registered', { a: 1 });
        expect(rec.events).toHaveLength(0);

        c.track('box_open', { box_id: 'fansu', tier: 'normal' });
        expect(rec.events).toHaveLength(1);
        expect(rec.events[0].params).toMatchObject({
            box_id: 'fansu',
            tier: 'normal',
            realm_index: 3,
            day_index: 0,
        });
    });
});
