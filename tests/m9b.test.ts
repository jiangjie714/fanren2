import { describe, expect, it } from 'vitest';
import {
    computeCompare,
    decodeIllusionWeek,
    decodeRealmValue,
    formatRankValue,
    parseSubMessage,
    sortEntries,
    FriendEntry,
} from '../assets/scripts/core/systems/SocialRank';
import { encodeIllusionWeek, encodeRealmValue } from '../assets/scripts/infra/DouyinSocial';

describe('M9b 排行值编码/解码闭环（#30）', () => {
    it('realm_value 编码↔解码 roundtrip', () => {
        for (const [realm, xw] of [[0, 0], [2, 1234], [5, 999999]] as const) {
            const v = encodeRealmValue(realm, xw);
            expect(decodeRealmValue(v)).toEqual({ realmIndex: realm, xiuwei: xw });
        }
    });

    it('illusion_week 编码↔解码 roundtrip；跨周值单调递增', () => {
        const w1 = encodeIllusionWeek('W-2026-10-05', 128);
        const w2 = encodeIllusionWeek('W-2026-10-12', 10);
        expect(decodeIllusionWeek(w1).score).toBe(128);
        expect(decodeIllusionWeek(w2).score).toBe(10);
        expect(w2).toBeGreaterThan(w1); // 新一周的榜值天然高于上周
    });
});

describe('M9b 好友对比（与子域 game.js 语义同步）', () => {
    it('beat 只数严格小于我（平局不算超越）；total 只含有数据的好友', () => {
        expect(computeCompare(100, [50, 80, 100, 120, 0, -5])).toEqual({
            beat: 2,   // 50、80；100 平局不算；120 大于我；0/负值无数据
            total: 4,  // 50/80/100/120
            top: 120,
        });
    });

    it('无好友数据：beat/total/top 全 0 → 页面隐藏对比行', () => {
        expect(computeCompare(99, [])).toEqual({ beat: 0, total: 0, top: 0 });
        expect(computeCompare(0, [0, 0])).toEqual({ beat: 0, total: 0, top: 0 });
    });
});

describe('M9b 榜单排序与格式化', () => {
    it('sortEntries：值降序、同值昵称字典序', () => {
        const entries: FriendEntry[] = [
            { nickname: '张三', value: 10 },
            { nickname: '阿一', value: 20 },
            { nickname: '乙', value: 10 },
        ];
        expect(sortEntries(entries).map((e) => e.nickname)).toEqual(['阿一', '乙', '张三']);
        expect(entries[0].nickname).toBe('张三'); // 不改原数组
    });

    it('formatRankValue 三键格式', () => {
        expect(formatRankValue('realm_value', encodeRealmValue(2, 300))).toBe('境界2 · 修为300');
        expect(formatRankValue('illusion_week', encodeIllusionWeek('W-2026-10-05', 88))).toBe('88 分');
        expect(formatRankValue('tribulation_best', 75)).toBe('75 分');
    });
});

describe('M9b 子域消息校验（主域入口）', () => {
    it('rankReady / compareResult 合法消息通过', () => {
        expect(parseSubMessage({ type: 'rankReady' })).toEqual({ type: 'rankReady' });
        expect(parseSubMessage({ type: 'compareResult', beat: 3, total: 7, top: 88 }))
            .toEqual({ type: 'compareResult', beat: 3, total: 7, top: 88 });
    });

    it('非法输入一律 null（超时兜底由 DouyinSocial.compare 处理）', () => {
        expect(parseSubMessage(null)).toBeNull();
        expect(parseSubMessage('rankReady')).toBeNull();
        expect(parseSubMessage({ type: 'unknown' })).toBeNull();
        expect(parseSubMessage({ type: 'compareResult', beat: 'x', total: 1, top: 1 })).toBeNull();
        // 越界数值夹取
        expect(parseSubMessage({ type: 'compareResult', beat: -5, total: 2.9, top: 10 }))
            .toEqual({ type: 'compareResult', beat: 0, total: 2, top: 10 });
    });
});
