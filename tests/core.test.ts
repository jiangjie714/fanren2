import { describe, expect, it } from 'vitest';
import { Rng } from '../assets/scripts/core/rng';
import { defaultSave, migrate, SaveData, todayString } from '../assets/scripts/core/saveModel';
import { EconomySystem } from '../assets/scripts/core/systems/EconomySystem';
import { BoxSystem } from '../assets/scripts/core/systems/BoxSystem';
import { RealmSystem } from '../assets/scripts/core/systems/RealmSystem';
import { RainSystem, RainSession, RAIN_FIELD } from '../assets/scripts/core/systems/RainSystem';
import { CollectionSystem } from '../assets/scripts/core/systems/CollectionSystem';
import { PITY_THRESHOLD, SEEK_LIMIT } from '../assets/scripts/core/config/boxes';
import { RATE_MAX, RATE_MIN, RAIN_WAVES, judgeRating, judgeScore } from '../assets/scripts/core/config/drops';

/**
 * 固定随机源：仅替换 float()（其余方法由 float 派生，与真实行为一致）。
 * 队列按 open() 内的调用顺序消费：首位 = 开箱档位判定；队列耗尽后恒为 0.99（→普通档/不触发概率事件）。
 */
function stubRng(values: number[]): Rng {
    const q = [...values];
    const rng = new Rng(1);
    (rng as unknown as { float: () => number }).float = () => (q.length ? q.shift()! : 0.99);
    return rng;
}

function makeSave(): SaveData {
    return defaultSave();
}

function makeBox(save: SaveData, rng: Rng) {
    const eco = new EconomySystem(save);
    return { box: new BoxSystem(save, eco, rng), eco };
}

describe('PRD 用例 1：开箱保底', () => {
    it('连续 3 次低收益，第 4 次强制产出稀有奖励', () => {
        const save = makeSave();
        save.lingshi = 100000;
        const { box } = makeBox(save, stubRng([]));
        for (let i = 0; i < PITY_THRESHOLD; i++) {
            const r = box.open('fansu');
            expect(r.tier).not.toBe('rare'); // 预设随机 0.99 → normal
        }
        expect(save.pityCount).toBe(PITY_THRESHOLD);
        const fourth = box.open('fansu');
        expect(fourth.tier).toBe('rare');
        expect(fourth.pityTriggered).toBe(true);
        expect(save.pityCount).toBe(0);
    });

    it('开出稀有奖励重置计数；劫难不重置计数', () => {
        const save = makeSave();
        save.lingshi = 100000;
        // 队列按 float 调用顺序消费：open1 档位 0.01→劫难（其扣修为 range 消耗 0.5）；open2 档位 0.05→稀有
        const { box } = makeBox(save, stubRng([0.01, 0.5, 0.05]));
        const disaster = box.open('fansu');
        expect(disaster.tier).toBe('disaster');
        expect(save.pityCount).toBe(1); // 劫难计入连续低收益，不重置
        const rare = box.open('fansu');
        expect(rare.tier).toBe('rare');
        expect(save.pityCount).toBe(0); // 稀有清零
    });

    it('灵石不足无法开箱', () => {
        const save = makeSave();
        save.lingshi = 10;
        const { box } = makeBox(save, stubRng([]));
        expect(box.canOpen('fansu').ok).toBe(false);
        expect(box.canOpen('fansu').reason).toBe('lingshiNotEnough');
        expect(() => box.open('fansu')).toThrow();
    });

    it('宝箱按境界解锁：凡人不能开修真宝盒', () => {
        const save = makeSave();
        save.lingshi = 10000;
        const { box } = makeBox(save, stubRng([]));
        expect(box.canOpen('xiuzhen').reason).toBe('boxLocked');
        save.realmIndex = 1;
        expect(box.canOpen('xiuzhen').ok).toBe(true);
    });
});

describe('PRD 用例 5：继续求索上限', () => {
    it('最多连续求索 2 次，第三次禁止', () => {
        const save = makeSave();
        save.lingshi = 100000;
        const { box } = makeBox(save, stubRng([]));
        const first = box.open('fansu');
        const session = box.startSession('fansu', first);
        expect(box.canSeek(session)).toBe(true);
        box.seek(session);
        expect(box.canSeek(session)).toBe(true);
        box.seek(session);
        expect(session.seeksUsed).toBe(SEEK_LIMIT);
        expect(box.canSeek(session)).toBe(false);
        expect(() => box.seek(session)).toThrow();
    });
});

describe('PRD 用例 2：灵气雨数值', () => {
    function session(): RainSession {
        const rs = new RainSystem(new Rng(7));
        const s = rs.createSession(1, false); // 目标练气，基础 60%
        return s;
    }
    it('金雨/劫雨拾取后概率计算正确', () => {
        const rs = new RainSystem(new Rng(7));
        const s = session();
        s.goldBonus = 0.03 + 0.08; // 两片金雨
        s.penalty = 0.04;
        const realm = new RealmSystem(makeSave(), new EconomySystem(makeSave()), new Rng(1));
        const rate = realm.computeFinalRate(s.targetIndex, s.goldBonus, s.penalty, s.mindDemon);
        expect(rate).toBeCloseTo(0.6 + 0.11 - 0.04, 10);
    });

    it('概率不超出 [10%, 95%] 边界', () => {
        const realm = new RealmSystem(makeSave(), new EconomySystem(makeSave()), new Rng(1));
        expect(realm.computeFinalRate(1, 99, 0, false)).toBe(RATE_MAX);
        expect(realm.computeFinalRate(5, 0, 99, false)).toBe(RATE_MIN);
        expect(realm.computeFinalRate(5, 0, 99, true)).toBe(RATE_MIN); // 心魔扣减也被夹住
    });

    it('蓝色清雨护盾：抵消下一片劫雨 50% 惩罚', () => {
        const rs = new RainSystem(new Rng(7));
        const s = session();
        rs['applyCatch'](s, 'blue');   // 1 层护盾
        rs['applyCatch'](s, 'red');    // raw 0.04~0.09 → 折半
        expect(s.shields).toBe(0);
        expect(s.penalty).toBeGreaterThan(0);
        expect(s.penalty).toBeLessThanOrEqual(0.09 * 0.5 + 1e-9);
        rs['applyCatch'](s, 'red');    // 无护盾，全额
        expect(s.penalty).toBeGreaterThan(0.04 * 0.5);
    });

    it('心魔干扰：劫雨 ≥6 触发，额外扣 5%', () => {
        const rs = new RainSystem(new Rng(7));
        const s = session();
        for (let i = 0; i < 6; i++) rs['applyCatch'](s, 'red');
        expect(s.mindDemon).toBe(true);
        const realm = new RealmSystem(makeSave(), new EconomySystem(makeSave()), new Rng(1));
        const withMd = realm.computeFinalRate(s.targetIndex, s.goldBonus, s.penalty, true);
        const withoutMd = realm.computeFinalRate(s.targetIndex, s.goldBonus, s.penalty, false);
        expect(withMd).toBeCloseTo(withoutMd - 0.05, 10);
    });

    it('雨滴下落与拾取：tick 驱动下落，玩家位置命中即拾取', () => {
        const rs = new RainSystem(new Rng(7));
        const s = rs.createSession(1, false);
        // 手动注入一枚正对玩家头顶的雨滴
        s.drops.push({ id: 1, type: 'gold', x: 0, y: RAIN_FIELD.playerY + 100, vy: 100, radius: 22, dead: false });
        rs.tick(s, 0.5, 0);       // 0.5s：下落 50 → 距玩家 50 < catchY(70) → 拾取
        expect(s.goldCount).toBe(1);
        expect(s.goldBonus).toBeGreaterThanOrEqual(0.03);
        expect(s.drops.every(d => !d.dead)).toBe(true); // 拾取的雨滴已移除（同帧可能新生成）
    });

    it('倒计时结束强制结算，雨滴清空（PRD 边界规则3）', () => {
        const rs = new RainSystem(new Rng(7));
        const s = rs.createSession(1, false);
        s.drops.push({ id: 1, type: 'gold', x: 0, y: 0, vy: 100, radius: 22, dead: false });
        rs.tick(s, 8.1, 0);       // 超过 8 秒
        expect(s.finished).toBe(true);
        expect(s.drops.length).toBe(0);
        expect(s.timeLeft).toBe(0);
    });

    it('净化劫雨：单局 1 次，期间不生成劫雨（PRD 测试用例3）', () => {
        const rs = new RainSystem(new Rng(7));
        const s = rs.createSession(1, false);
        expect(rs.usePurify(s)).toBe(true);
        expect(rs.usePurify(s)).toBe(false); // 单局仅一次
        expect(s.purifyTimeLeft).toBe(3);
        // 净化期间持续生成，全部应为金/蓝
        for (let i = 0; i < 30; i++) rs.tick(s, 0.1, 0);
        expect(s.drops.every(d => d.type !== 'red')).toBe(true);
    });

    it('月卡特权：劫雨生成权重 15→12（-20%），单月卡不改其他类型', () => {
        const rs = new RainSystem(new Rng(2026));
        const s1 = rs.createSession(1, false);
        const s2 = rs.createSession(1, true);
        let red1 = 0, red2 = 0;
        const N = 4000;
        for (let i = 0; i < N; i++) {
            rs['spawn'](s1, RAIN_WAVES[0]); rs['spawn'](s2, RAIN_WAVES[0]);
        }
        red1 = s1.drops.filter((d) => d.type === 'red').length;
        red2 = s2.drops.filter((d) => d.type === 'red').length;
        // 固定种子 → 确定性；权重 15/100 vs 12/97
        const p1 = red1 / N, p2 = red2 / N;
        expect(p2).toBeLessThan(p1);                     // 月卡降低劫雨占比
        expect(p1).toBeGreaterThan(0.10);                // 无卡 ≈15%
        expect(p1).toBeLessThan(0.20);
        expect(p2).toBeGreaterThan(0.07);                // 有卡 ≈12%
        expect(p2).toBeLessThan(0.17);
    });

    it('评级（V2 渡劫评分制）：仙阶 ≥75，灵阶 ≥40，其余凡阶', () => {
        expect(judgeRating(judgeScore(15, 15, 4, 0))).toBe('仙阶完美接引'); // 45+30+4 = 79
        expect(judgeRating(75)).toBe('仙阶完美接引');
        expect(judgeRating(74)).toBe('灵阶接引');
        expect(judgeRating(40)).toBe('灵阶接引');
        expect(judgeRating(39)).toBe('凡阶接引');
    });
});

describe('PRD 用例 4：突破边界', () => {
    it('概率 95% 仍可能失败（确定性随机验证判定式）', () => {
        const realm = new RealmSystem(makeSave(), new EconomySystem(makeSave()), stubRng([0.95]));
        expect(realm.roll(RATE_MAX)).toBe(false); // 0.95 ≥ 0.95 → 失败
        const realm2 = new RealmSystem(makeSave(), new EconomySystem(makeSave()), stubRng([0.9499]));
        expect(realm2.roll(RATE_MAX)).toBe(true);
    });

    it('概率 10% 仍可能成功', () => {
        const realm = new RealmSystem(makeSave(), new EconomySystem(makeSave()), stubRng([0.05]));
        expect(realm.roll(RATE_MIN)).toBe(true);
        const realm2 = new RealmSystem(makeSave(), new EconomySystem(makeSave()), stubRng([0.1]));
        expect(realm2.roll(RATE_MIN)).toBe(false);
    });

    it('突破成功：机缘清零、境界晋升、发晋升修为', () => {
        const save = makeSave();
        const eco = new EconomySystem(save);
        eco.addJiyuan(100);
        eco.addXiuwei(300);
        const realm = new RealmSystem(save, eco, new Rng(1));
        expect(realm.canBreakthrough()).toBe(true);
        realm.succeed(30);
        expect(save.realmIndex).toBe(1);
        expect(save.jiyuan).toBe(0);
        expect(save.xiuwei).toBe(300 + 50 + 30);
    });

    it('突破失败：机缘保留 50%，修为清零；护道广告保留 50% 修为', () => {
        const save = makeSave();
        const eco = new EconomySystem(save);
        eco.addJiyuan(100);
        eco.addXiuwei(300);
        const realm = new RealmSystem(save, eco, new Rng(1));
        const r1 = realm.fail(false);
        expect(save.jiyuan).toBe(50);
        expect(save.xiuwei).toBe(0);
        expect(r1.lostXiuwei).toBe(300);
    });

    it('中途退出：机缘扣 30%，修为清零', () => {
        const save = makeSave();
        const eco = new EconomySystem(save);
        eco.addJiyuan(100);
        eco.addXiuwei(300);
        const realm = new RealmSystem(save, eco, new Rng(1));
        realm.quitRain();
        expect(save.jiyuan).toBe(70);
        expect(save.xiuwei).toBe(0);
    });
});

describe('每日重置与月卡', () => {
    it('跨天重置每日状态', () => {
        const save = makeSave();
        save.daily.date = '2000-01-01';
        save.daily.dailyGiftUsed = true;
        const eco = new EconomySystem(save);
        const now = new Date();
        expect(eco.dailyReset(now)).toBe(true);
        expect(save.daily.dailyGiftUsed).toBe(false);
        expect(eco.dailyReset(now)).toBe(false);
    });

    it('月卡激活与到期', () => {
        const save = makeSave();
        const eco = new EconomySystem(save);
        expect(eco.monthCardActive).toBe(false);
        eco.activateMonthlyCard(30, 30 * 24 * 3600 * 1000);
        expect(eco.monthCardActive).toBe(true);
    });
});

describe('灵根收集', () => {
    it('碎片合成解锁并点亮图鉴，提供修为加成', () => {
        const save = makeSave();
        const col = new CollectionSystem();
        col.addFragment(save, 'jinmu', 4);
        expect(col.canCompose(save, 'jinmu')).toBe(false);
        col.addFragment(save, 'jinmu', 1);
        expect(col.canCompose(save, 'jinmu')).toBe(true);
        expect(col.compose(save, 'jinmu')).toBe(true);
        expect(save.unlocked).toContain('jinmu');
        expect(save.fragments['jinmu']).toBe(0);
        expect(col.totalBonus(save)).toBeCloseTo(1.01, 10);
        expect(col.progress(save).unlocked).toBe(1);
    });

    it('已解锁的灵根不可重复合成；多余碎片保留', () => {
        const save = makeSave();
        const col = new CollectionSystem();
        col.addFragment(save, 'fenglei', 12); // 需要 10
        expect(col.compose(save, 'fenglei')).toBe(true);
        expect(save.fragments['fenglei']).toBe(2); // 多余碎片保留
        expect(col.canCompose(save, 'fenglei')).toBe(false); // 已解锁
        expect(col.compose(save, 'fenglei')).toBe(false);
        expect(col.totalBonus(save)).toBeCloseTo(1.02, 10);
    });

    it('多件灵根加成叠加（乘算基数）', () => {
        const save = makeSave();
        const col = new CollectionSystem();
        col.addFragment(save, 'jinmu', 5);
        col.addFragment(save, 'fenglei', 10);
        col.addFragment(save, 'xiandao', 50);
        col.compose(save, 'jinmu');
        col.compose(save, 'fenglei');
        col.compose(save, 'xiandao');
        expect(col.totalBonus(save)).toBeCloseTo(1 + 0.01 + 0.02 + 0.05, 10);
        expect(col.progress(save)).toEqual({ unlocked: 3, total: 8 });
    });
});

describe('经济与灵根加成联动', () => {
    it('修为入账乘以灵根加成；灵石入账乘以小等级加成', () => {
        const save = makeSave();
        const eco = new EconomySystem(save);
        eco.xiuweiBonusProvider = () => 1.05;
        expect(eco.addXiuwei(100)).toBe(105);
        save.xiuwei = 600; // 4 小级（150/级）→ 灵石加成 1.06
        expect(eco.addLingshi(100)).toBe(106);
        expect(eco.lingshiBonus()).toBeCloseTo(1.06, 10);
    });
});

describe('灵石救济（每日限次，docs/数值假设.md #19）', () => {
    it('每日 3 次后拒绝发放；跨天重置', () => {
        const save = makeSave();
        const eco = new EconomySystem(save);
        expect(eco.aidRemaining()).toBe(3);
        expect(eco.requestLingshiAid()).toBe(300);
        expect(eco.requestLingshiAid()).toBe(300);
        expect(eco.requestLingshiAid()).toBe(300);
        expect(eco.requestLingshiAid()).toBeNull(); // 次数用尽
        expect(eco.aidRemaining()).toBe(0);
        expect(save.lingshi).toBe(200 + 900); // 初始 200 + 3×300

        // 跨天重置
        save.daily.date = '2000-01-01';
        eco.dailyReset(new Date('2026-10-03T08:00:00'));
        expect(eco.aidRemaining()).toBe(3);
        expect(eco.requestLingshiAid()).toBe(300);
    });
});

describe('存档迁移', () => {
    it('缺失字段回退默认值，版本不符重置', () => {
        const partial = migrate({ version: 1, lingshi: 999 });
        expect(partial.lingshi).toBe(999);
        expect(partial.settings.sound).toBe(true);
        expect(migrate({ version: 99 }).lingshi).toBe(200);
    });
});
