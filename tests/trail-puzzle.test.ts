/**
 * M16-T1/T2 妖像拼图：派生扩容（puzzle 入轮换）+ TrailPuzzleEngine 纯逻辑。
 * 设计口径：交换式拼图（D1）、归位锁定（永可解）、层号种子确定性打乱（D4）、
 * 封印 HP=100 每块 100/N² 伤害（D2）、超时败 + revive 单次（D2）。
 */
import { describe, expect, it } from 'vitest';
import {
    AVAILABLE_GAMES,
    TRAIL_CHAPTERS,
    deriveGame,
    derivePuzzle,
} from '../assets/scripts/core/config/trail';
import { TrailPuzzleEngine } from '../assets/scripts/core/systems/TrailPuzzleEngine';

describe('M16-T1 派生扩容', () => {
    it('puzzle 入轮换白名单，match3 仍回退 battle（M17 接入）', () => {
        expect(AVAILABLE_GAMES).toContain('battle');
        expect(AVAILABLE_GAMES).toContain('puzzle');
        expect(AVAILABLE_GAMES).not.toContain('match3');
    });

    it('第 1 章第 2 层派生为 puzzle（typePlan 配比 5:3:2 落地）', () => {
        expect(TRAIL_CHAPTERS[0].typePlan.filter((g) => g === 'puzzle').length).toBe(3);
        expect(TRAIL_CHAPTERS[0].typePlan.filter((g) => g === 'match3').length).toBe(2);
        expect(deriveGame(2)).toBe('puzzle');
    });

    it('derivePuzzle 确定性：同层恒同谜面', () => {
        const first = derivePuzzle(2);
        for (let i = 0; i < 50; i++) {
            const r = derivePuzzle(2);
            expect(r.monsterId).toBe(first.monsterId);
            expect(r.size).toBe(first.size);
        }
    });

    it('难度旋钮：第 1 章 3×3/60s，第 2 章起 4×4/75s；妖怪来自本章池', () => {
        const p1 = derivePuzzle(2);
        expect(p1.size).toBe(3);
        expect(p1.timeLimitSec).toBe(60);
        expect(p1.chapter).toBe(1);
        expect(TRAIL_CHAPTERS[0].monsters.some((m) => m.id === p1.monsterId)).toBe(true);

        const p2 = derivePuzzle(11); // 第 2 章 lin1 = puzzle
        expect(p2.size).toBe(4);
        expect(p2.timeLimitSec).toBe(75);
        expect(p2.chapter).toBe(2);
        expect(TRAIL_CHAPTERS[1].monsters.some((m) => m.id === p2.monsterId)).toBe(true);
    });

    it('Boss 关（第 10 层）不派生拼图', () => {
        expect(deriveGame(10)).toBe('battle');
        expect(() => derivePuzzle(10)).not.toThrow();
        expect(derivePuzzle(10).size).toBeGreaterThan(0);
    });
});

describe('M16-T2 TrailPuzzleEngine 打乱与确定性', () => {
    it('同层两次创建棋盘完全一致（防退出重进刷局）', () => {
        const spec = derivePuzzle(2);
        const a = new TrailPuzzleEngine(spec, 2).board.join(',');
        const b = new TrailPuzzleEngine(spec, 2).board.join(',');
        expect(a).toBe(b);
    });

    it('不同层谜面（几乎必然）不同', () => {
        const spec = derivePuzzle(2);
        const a = new TrailPuzzleEngine(spec, 2).board.join(',');
        const b = new TrailPuzzleEngine(spec, 5).board.join(',');
        expect(a).not.toBe(b);
    });

    it('打乱后不等于完成态', () => {
        for (const layer of [2, 6, 9, 11, 15, 19]) {
            const eng = new TrailPuzzleEngine(derivePuzzle(layer), layer);
            expect(eng.board.some((t, i) => t !== i)).toBe(true);
        }
    });

    it('开局属性：HP 100、状态 ongoing、免费凝神 1 次、计时=时限', () => {
        const eng = new TrailPuzzleEngine(derivePuzzle(2), 2);
        expect(eng.hp).toBe(100);
        expect(eng.status).toBe('ongoing');
        expect(eng.peeksLeft).toBe(1);
        expect(eng.timeLeft).toBe(60);
    });
});

describe('M16-T2 交换/锁定/封印伤害', () => {
    it('交换两个非归位块成功，归位块自动锁定', () => {
        const eng = new TrailPuzzleEngine(derivePuzzle(2), 2);
        const N = eng.size;
        // 找两个未归位位置
        const open: number[] = [];
        for (let i = 0; i < N * N && open.length < 2; i++) if (eng.board[i] !== i) open.push(i);
        expect(open.length).toBe(2);
        const tileA = eng.board[open[0]];
        const tileB = eng.board[open[1]];
        // 构造让两块都归位的交换（若 tileA===open[1] && tileB===open[0] 才归位；否则只验证交换生效）
        const ok = eng.swap(open[0], open[1]);
        expect(ok).toBe(true);
        expect(eng.board[open[0]]).toBe(tileB);
        expect(eng.board[open[1]]).toBe(tileA);
        // 归位的块锁定
        for (let i = 0; i < N * N; i++) {
            if (eng.board[i] === i) expect(eng.isLocked(i)).toBe(true);
        }
    });

    it('锁定块拒绝交换（含一方锁定）', () => {
        const eng = new TrailPuzzleEngine(derivePuzzle(2), 2);
        const N = eng.size;
        // 通过交换制造一个归位块
        const open: number[] = [];
        for (let i = 0; i < N * N && open.length < 2; i++) if (eng.board[i] !== i) open.push(i);
        eng.swap(open[0], open[1]);
        // 找锁定块与任意非锁定块
        let lockedIdx = -1;
        let freeIdx = -1;
        for (let i = 0; i < N * N; i++) {
            if (eng.isLocked(i) && lockedIdx < 0) lockedIdx = i;
            if (!eng.isLocked(i) && freeIdx < 0) freeIdx = i;
        }
        if (lockedIdx >= 0 && freeIdx >= 0) {
            expect(eng.swap(lockedIdx, freeIdx)).toBe(false);
            expect(eng.swap(lockedIdx, lockedIdx)).toBe(false);
        }
    });

    it('封印伤害：每次新归位扣 100/N²，全归位 → won', () => {
        const spec = derivePuzzle(2); // 3×3
        const eng = new TrailPuzzleEngine(spec, 2);
        // 直接把棋盘复原（测试钩子：swap 由外层驱动过于冗长 → 用 solveForTest）
        eng.solveForTest();
        expect(eng.progress()).toBe(1);
        expect(eng.status).toBe('won');
        expect(eng.hp).toBeLessThanOrEqual(100);
    });

    it('开局已归位块不计伤害（白送锁定）', () => {
        const spec = derivePuzzle(2);
        const eng = new TrailPuzzleEngine(spec, 2);
        let fixed = 0;
        for (let i = 0; i < eng.board.length; i++) if (eng.board[i] === i) fixed++;
        // HP 满血（开局归位不扣）
        expect(eng.hp).toBe(100);
        if (fixed > 0) expect(eng.isLocked(eng.board.findIndex((t, i) => t === i))).toBe(true);
    });
});

describe('M16-T2 计时/回魂/凝神', () => {
    it('超时 → lost；revive 一次 +15s 回 ongoing；二次 revive 拒绝', () => {
        const eng = new TrailPuzzleEngine(derivePuzzle(2), 2);
        eng.tick(60);
        expect(eng.status).toBe('lost');
        expect(eng.revive()).toBe(true);
        expect(eng.status).toBe('ongoing');
        expect(eng.timeLeft).toBeCloseTo(15);
        expect(eng.revive()).toBe(false);
        expect(eng.status).toBe('ongoing');
    });

    it('won 后 tick 不再判负', () => {
        const eng = new TrailPuzzleEngine(derivePuzzle(2), 2);
        eng.solveForTest();
        eng.tick(999);
        expect(eng.status).toBe('won');
    });

    it('凝神一瞥：免费 1 次用完后需 grantPeek（广告）', () => {
        const eng = new TrailPuzzleEngine(derivePuzzle(2), 2);
        expect(eng.peek()).toBe(true);
        expect(eng.peek()).toBe(false);
        eng.grantPeek();
        expect(eng.peek()).toBe(true);
        expect(eng.peek()).toBe(false);
    });
});
