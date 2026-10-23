import { describe, expect, it } from 'vitest';
import { SaveData, defaultSave, migrate } from '../assets/scripts/core/saveModel';
import {
    SECTS,
    SECT_IDS,
    SECT_LEVELS,
    SECT_DONATE_TIERS,
    SECT_DONATE_CAP,
    SECT_SHOP_ITEMS,
    SECT_MEMBER_NAMES,
    SECT_CONTRIB_RATE,
} from '../assets/scripts/core/config/sect';
import {
    sectOf,
    isSectId,
    sectLevelOf,
    sectLevelProgress,
    sectPositionOf,
    sectCandidates,
    joinSect,
    sectMembers,
    sectMyRank,
    todayHelper,
    sectSalary,
    claimSalary,
    sectDonateView,
    donate,
    sectHelp,
    claimHelp,
    sectShopView,
    buyShopItem,
} from '../assets/scripts/core/sect';

/** 已加入指定宗门的存档（其余默认） */
function joined(id: string = 'qingyun'): SaveData {
    const s = defaultSave();
    s.sect.id = id;
    return s;
}

describe('M31 宗门配置自洽（#57）', () => {
    it('三宗门 id 唯一且与 SECTS 一一对应', () => {
        expect(SECT_IDS.length).toBe(3);
        expect(new Set(SECT_IDS).size).toBe(3);
        SECT_IDS.forEach((id) => expect(sectOf(id)?.id).toBe(id));
        expect(SECTS.length).toBe(SECT_IDS.length);
    });

    it('等级阈值严格递增且从 0 起；捐献档递增且不超日上限', () => {
        for (let i = 1; i < SECT_LEVELS.length; i++) expect(SECT_LEVELS[i]).toBeGreaterThan(SECT_LEVELS[i - 1]);
        expect(SECT_LEVELS[0]).toBe(0);
        for (let i = 1; i < SECT_DONATE_TIERS.length; i++) {
            expect(SECT_DONATE_TIERS[i]).toBeGreaterThan(SECT_DONATE_TIERS[i - 1]);
        }
        SECT_DONATE_TIERS.forEach((t) => expect(t).toBeLessThanOrEqual(SECT_DONATE_CAP));
        // 日上限必须等于某档或大于最大档（否则最大档永远捐不进去）
        expect(SECT_DONATE_CAP).toBeGreaterThanOrEqual(SECT_DONATE_TIERS[SECT_DONATE_TIERS.length - 1]);
    });

    it('商店：id 唯一、日限 ≥1、give 非空、名池 24 个非空无重复', () => {
        const ids = SECT_SHOP_ITEMS.map((x) => x.id);
        expect(new Set(ids).size).toBe(ids.length);
        SECT_SHOP_ITEMS.forEach((x) => {
            expect(x.daily).toBeGreaterThanOrEqual(1);
            expect(x.cost).toBeGreaterThan(0);
            expect(Object.keys(x.give).length).toBeGreaterThan(0);
        });
        expect(SECT_MEMBER_NAMES.length).toBe(24);
        expect(new Set(SECT_MEMBER_NAMES).size).toBe(24);
        SECT_MEMBER_NAMES.forEach((n) => expect(n.length).toBeGreaterThan(0));
    });

    it('俸禄三宗门倾向可辨：青云偏修为、丹宗偏贡献、天机带碎片', () => {
        const [qy, bc, tj] = SECTS;
        expect(qy.salary.xiuweiPerLevel).toBeGreaterThan(bc.salary.xiuweiPerLevel);
        expect(bc.salary.contribPerLevel).toBeGreaterThan(qy.salary.contribPerLevel);
        expect(tj.salary.fragPerLevel).toBeGreaterThan(0);
        expect(qy.salary.fragPerLevel + bc.salary.fragPerLevel).toBe(0);
    });
});

describe('加入与派生（#57）', () => {
    it('joinSect：合法加入成功，同门幂等，非法 id 拒绝', () => {
        const s = defaultSave();
        expect(s.sect.id).toBeNull();
        expect(joinSect(s, 'bencao')).toBe(true);
        expect(s.sect.id).toBe('bencao');
        expect(joinSect(s, 'bencao')).toBe(false);
        expect(joinSect(s, 'nonexistent')).toBe(false);
        expect(joinSect(s, 42 as unknown as string)).toBe(false);
        expect(isSectId('tianji')).toBe(true);
        expect(isSectId('evil')).toBe(false);
        expect(isSectId(null)).toBe(false);
    });

    it('等级按 exp 阈值爬升（1..5），未加入为 0', () => {
        const s = joined();
        const cases: Array<[number, number]> = [
            [0, 1], [499, 1], [500, 2], [1499, 2], [1500, 3],
            [3999, 3], [4000, 4], [9999, 4], [10000, 5], [99999, 5],
        ];
        cases.forEach(([exp, lv]) => {
            s.sect.exp = exp;
            expect(sectLevelOf(s)).toBe(lv);
        });
        const none = defaultSave();
        none.sect.exp = 99999;
        expect(sectLevelOf(none), '未加入不应有等级').toBe(0);
    });

    it('等级进度条：中段 ratio 正确，满级 next=null ratio=1', () => {
        const s = joined();
        s.sect.exp = 1000; // 2 级：base 500, next 1500 → 0.5
        const p = sectLevelProgress(s);
        expect(p.level).toBe(2);
        expect(p.next).toBe(1500);
        expect(p.ratio).toBeCloseTo(0.5);
        s.sect.exp = 10000;
        const max = sectLevelProgress(s);
        expect(max.level).toBe(5);
        expect(max.next).toBeNull();
        expect(max.ratio).toBe(1);
    });

    it('职位按累计贡献推导（只增不减语义由 totalContrib 承担）', () => {
        const s = joined();
        const cases: Array<[number, string]> = [[0, '弟子'], [299, '弟子'], [300, '执事'], [1199, '执事'], [1200, '长老'], [99999, '长老']];
        cases.forEach(([c, name]) => {
            s.sect.totalContrib = c;
            expect(sectPositionOf(s)).toBe(name);
        });
    });

    it('成员派生确定性：同存档恒同；不同宗门盐值不同；总含「我」', () => {
        const a = joined('qingyun');
        const b = joined('bencao');
        const ra = sectMembers(a).map((m) => `${m.name}:${m.contrib}`);
        const rb = sectMembers(a).map((m) => `${m.name}:${m.contrib}`);
        expect(ra).toEqual(rb);
        const rc = sectMembers(b).map((m) => `${m.name}:${m.contrib}`);
        expect(ra.join(), '两宗门的派生序列不应完全相同').not.toBe(rc.join());
        expect(sectMembers(a).some((m) => m.isMe)).toBe(true);
        expect(sectMembers(defaultSave()).length, '未加入无成员榜').toBe(0);
    });

    it('成员榜：top5 + 我未进前五时补排名行', () => {
        const s = joined();
        s.sect.totalContrib = 0; // 必然垫底
        const rows = sectMembers(s);
        expect(rows.length).toBe(6);
        expect(rows[5].isMe).toBe(true);
        expect(rows[5].name).toContain('第');
        // 贡献降序
        for (let i = 1; i < rows.length; i++) expect(rows[i - 1].contrib).toBeGreaterThanOrEqual(rows[i].contrib);
        // 极高贡献 → 我进 top5，不补行
        s.sect.totalContrib = 1e9;
        const top = sectMembers(s);
        expect(top.length).toBe(5);
        expect(top[0].isMe).toBe(true);
        expect(sectMyRank(s)).toBe(1);
    });

    it('助力每日一位且确定性；未加入为 null', () => {
        const s = joined();
        expect(todayHelper(s, '2026-10-17')).toBe(todayHelper(s, '2026-10-17'));
        const week = new Set(['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'].map((d) => todayHelper(s, d)));
        expect(week.size, '一周助力不应全是同一人').toBeGreaterThan(1);
        expect(todayHelper(defaultSave(), '2026-10-17')).toBeNull();
    });

    it('候选视图：三宗全员 + 成员数在派生区间内', () => {
        const cands = sectCandidates();
        expect(cands.length).toBe(3);
        cands.forEach((c) => {
            expect(c.memberCount).toBeGreaterThanOrEqual(12);
            expect(c.memberCount).toBeLessThanOrEqual(20);
            expect(c.name.length).toBeGreaterThan(0);
        });
    });
});

describe('日常三件事（#57）', () => {
    it('俸禄：一日一次，跨日可再领；三宗门数值倾向正确', () => {
        const today = '2026-10-17';
        const qy = joined('qingyun');
        const first = claimSalary(qy, today);
        expect(first).toEqual({ xiuwei: 120, contrib: 40, frag: 0 }); // 1 级
        expect(claimSalary(qy, today), '同日二次领取必须 null').toBeNull();
        expect(qy.sect.salaryDay).toBe(today);
        expect(qy.sect.contrib).toBe(40);
        expect(qy.sect.totalContrib).toBe(40);
        const next = claimSalary(qy, '2026-10-18');
        expect(next).not.toBeNull();

        const bc = joined('bencao');
        expect(claimSalary(bc, today)).toEqual({ xiuwei: 80, contrib: 60, frag: 0 });
        const tj = joined('tianji');
        expect(claimSalary(tj, today)).toEqual({ xiuwei: 100, contrib: 50, frag: 1 });

        // 等级缩放：青云 3 级 → 修为 360
        qy.sect.exp = 1500;
        qy.sect.salaryDay = '';
        expect(claimSalary(qy, '2026-10-19')).toEqual({ xiuwei: 360, contrib: 120, frag: 0 });
    });

    it('俸禄视图与已领态一致；未加入为 null', () => {
        const s = joined();
        expect(sectSalary(s, '2026-10-17')).not.toBeNull();
        claimSalary(s, '2026-10-17');
        expect(sectSalary(s, '2026-10-17'), '已领日视图应为 null').toBeNull();
        expect(sectSalary(s, '2026-10-18')).not.toBeNull();
        expect(sectSalary(defaultSave(), '2026-10-17')).toBeNull();
    });

    it('捐献：三档扣日计数、返 20% 贡献点、exp 累加、惰性翻新', () => {
        const today = '2026-10-17';
        const s = joined();
        s.lingshi = 30000;
        const v0 = sectDonateView(s, today);
        expect(v0.remaining).toBe(SECT_DONATE_CAP);
        expect(v0.canTiers).toEqual([true, true, true]);

        const r1 = donate(s, 1000, today)!;
        expect(r1).toEqual({ tier: 1000, contrib: 200, exp: 1000 });
        expect(s.sect.donatedToday).toBe(1000);
        expect(s.sect.contrib).toBe(200);
        expect(sectDonateView(s, today).remaining).toBe(19000);

        donate(s, 5000, today);
        donate(s, 20000, today); // 累计 26000 > 20000 → 拒绝
        expect(s.sect.donatedToday).toBe(6000);
        expect(s.sect.exp).toBe(6000);

        // 余额不足拒绝
        s.lingshi = 100;
        expect(donate(s, 1000, today)).toBeNull();
        // 非法档位拒绝
        expect(donate(s, 999, today)).toBeNull();
        // 跨日翻新：日计数归零可再捐
        s.lingshi = 30000;
        expect(donate(s, 20000, '2026-10-18')).not.toBeNull();
        expect(s.sect.donatedToday).toBe(20000);
    });

    it('助力：一日一次，helper 与视图一致，数值按等级加成', () => {
        const today = '2026-10-17';
        const s = joined();
        const view = sectHelp(s, today)!;
        expect(view.helper).toBe(todayHelper(s, today));
        expect(view.gain).toEqual({ xiuwei: 90, contrib: 30, frag: 0 }); // 1 级：60+30
        const got = claimHelp(s, today)!;
        expect(got.helper).toBe(view.helper);
        expect(s.sect.helpedDay).toBe(today);
        expect(s.sect.contrib).toBe(30);
        expect(claimHelp(s, today), '同日二次助力必须 null').toBeNull();
        expect(sectHelp(s, today), '已助力视图应为 null').toBeNull();
        // 3 级：60+90=150
        s.sect.exp = 1500;
        s.sect.helpedDay = '';
        expect(claimHelp(s, '2026-10-18')!.gain.xiuwei).toBe(150);
        expect(sectHelp(defaultSave(), today)).toBeNull();
    });
});

describe('宗门商店（#57）', () => {
    it('视图：日限与余额判定；日键过期按未购计', () => {
        const today = '2026-10-17';
        const s = joined();
        s.sect.contrib = 1000;
        const rows = sectShopView(s, today);
        expect(rows.length).toBe(SECT_SHOP_ITEMS.length);
        rows.forEach((r) => expect(r.canBuy).toBe(true));
        s.sect.contrib = 10;
        expect(sectShopView(s, today).every((r) => !r.canBuy)).toBe(true);
        // 日键过期：bought 有值但 shopDay 是昨天 → 仍可购
        s.sect.contrib = 1000;
        s.sect.shopDay = '2026-10-16';
        s.sect.bought = { lingshi: 1 };
        expect(sectShopView(s, today).find((r) => r.item.id === 'lingshi')!.canBuy).toBe(true);
    });

    it('购买：扣贡献点 + 日限 + 惰性翻新；越界拒绝', () => {
        const today = '2026-10-17';
        const s = joined();
        s.sect.contrib = 500;
        // 灵石 500（cost 200，日 1）
        expect(buyShopItem(s, 'lingshi', today)).toEqual({ lingshi: 500 });
        expect(s.sect.contrib).toBe(300);
        expect(buyShopItem(s, 'lingshi', today), '日限 1 → 二次拒绝').toBeNull();
        // 碎片 150 日 2：可购两次
        expect(buyShopItem(s, 'jinmu', today)).toEqual({ fragments: { jinmu: 5 } });
        expect(buyShopItem(s, 'jinmu', today)).toEqual({ fragments: { jinmu: 5 } });
        expect(s.sect.contrib).toBe(0);
        expect(buyShopItem(s, 'jinmu', today), '余额不足 → 拒绝').toBeNull();
        // 跨日翻新：日限重置
        s.sect.contrib = 500;
        expect(buyShopItem(s, 'lingshi', '2026-10-18')).toEqual({ lingshi: 500 });
        // 非法 id
        expect(buyShopItem(s, 'nope', today)).toBeNull();
    });

    it('give 内容与 spec 一致（灵石/碎片/机缘/体力/论武次数）', () => {
        const byId: Record<string, unknown> = {};
        SECT_SHOP_ITEMS.forEach((x) => { byId[x.id] = x.give; });
        expect(byId.lingshi).toEqual({ lingshi: 500 });
        expect(byId.jinmu).toEqual({ fragments: { jinmu: 5 } });
        expect(byId.jiyuan).toEqual({ jiyuan: 3 });
        expect(byId.stamina).toEqual({ stamina: 3 });
        expect(byId.pk).toEqual({ pkCharge: 1 });
    });

    it('机缘日投放 ≤3（#38 直接投放口径余量内）', () => {
        const jiyuan = SECT_SHOP_ITEMS.filter((x) => x.give.jiyuan).reduce((sum, x) => sum + (x.give.jiyuan ?? 0) * x.daily, 0);
        expect(jiyuan).toBeLessThanOrEqual(3);
    });

    it('返利比例是刻意口径 20%（防后人顺手改高）', () => {
        expect(SECT_CONTRIB_RATE).toBe(0.2);
    });
});

describe('v13 宗门字段迁移（#57）', () => {
    it('v12 老档无 sect 字段 → 未加入态（不补课）', () => {
        const raw = { version: 12, lingshi: 5000, xiuwei: 100 };
        const s = migrate(raw);
        expect(s.version).toBe(16);
        expect(s.sect.id).toBeNull();
        expect(s.sect.exp).toBe(0);
        expect(s.sect.contrib).toBe(0);
        expect(s.sect.bought).toEqual({});
    });

    it('脏档六形态全部钳制到合法值', () => {
        const base = { version: 12, lingshi: 1 };
        // ① 非对象
        expect(migrate({ ...base, sect: 'nope' }).sect.id).toBeNull();
        // ② 未注册 id
        expect(migrate({ ...base, sect: { id: 'evil-cult' } }).sect.id).toBeNull();
        // ③ 数值字段负数 / NaN / 字符串
        const m3 = migrate({ ...base, sect: { id: 'qingyun', exp: -5, totalContrib: NaN, contrib: 'x', donatedToday: -1 } });
        expect(m3.sect.id).toBe('qingyun');
        expect(m3.sect.exp).toBe(0);
        expect(m3.sect.totalContrib).toBe(0);
        expect(m3.sect.contrib).toBe(0);
        expect(m3.sect.donatedToday).toBe(0);
        // ④ 日键非字符串
        const m4 = migrate({ ...base, sect: { id: 'bencao', salaryDay: 20261017, donateDay: null, helpedDay: {}, shopDay: 5 } });
        expect(m4.sect.salaryDay).toBe('');
        expect(m4.sect.donateDay).toBe('');
        expect(m4.sect.helpedDay).toBe('');
        expect(m4.sect.shopDay).toBe('');
        // ⑤ bought 非对象 / 负值 / 非数字
        const m5 = migrate({ ...base, sect: { id: 'tianji', bought: 'nope' } });
        expect(m5.sect.bought).toEqual({});
        const m5b = migrate({ ...base, sect: { id: 'tianji', bought: { lingshi: -3, jinmu: 'x', jiyuan: 2.7 } } });
        expect(m5b.sect.bought).toEqual({ jiyuan: 2 });
        // ⑥ 合法老档原样保留
        const m6 = migrate({ ...base, sect: { id: 'qingyun', exp: 1500, totalContrib: 400, contrib: 120, salaryDay: '2026-10-16', bought: { lingshi: 1 } } });
        expect(m6.sect.exp).toBe(1500);
        expect(m6.sect.totalContrib).toBe(400);
        expect(m6.sect.contrib).toBe(120);
        expect(m6.sect.salaryDay).toBe('2026-10-16');
        expect(m6.sect.bought).toEqual({ lingshi: 1 });
    });

    it('迁移后判定层自洽：合法档可直接参与日常循环', () => {
        const s = migrate({ version: 12, sect: { id: 'tianji', exp: 1500, contrib: 600, totalContrib: 400 } });
        expect(sectLevelOf(s)).toBe(3);
        expect(sectPositionOf(s)).toBe('执事');
        expect(claimSalary(s, '2026-10-17')).toEqual({ xiuwei: 300, contrib: 150, frag: 3 });
        expect(buyShopItem(s, 'lingshi', '2026-10-17')).toEqual({ lingshi: 500 });
        expect(s.sect.contrib).toBe(550); // 600（迁移来） + 150（俸禄） − 200（购物）
    });

    it('defaultSave 带合法 sect 且版本 13', () => {
        const d = defaultSave();
        expect(d.version).toBe(16);
        expect(d.sect.id).toBeNull();
        expect(d.sect.exp).toBe(0);
        expect(isSectId(d.sect.id) || d.sect.id === null).toBe(true);
    });
});
