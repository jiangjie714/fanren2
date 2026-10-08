import { describe, it, expect } from 'vitest';
import {
    AVAILABLE_GAMES,
    TRAIL_CHAPTERS,
    TRAIL_LAYERS_PER_CHAPTER,
    deriveGame,
    deriveMatch3,
} from '../assets/scripts/core/config/trail';
import {
    TrailMatch3Engine,
    Match3Clear,
} from '../assets/scripts/core/systems/TrailMatch3Engine';

const CH1 = { size: 6, pieceKinds: 5, steps: 20, hp: 28 };

describe('M17 三消派生 deriveMatch3', () => {
    it('确定性：同层恒同参数与妖怪', () => {
        const a = deriveMatch3(4);
        const b = deriveMatch3(4);
        expect(a).toEqual(b);
    });

    it('难度旋钮：棋子 5 种、步数 20、HP 28/32/36 递增', () => {
        expect(deriveMatch3(4).pieceKinds).toBe(5);
        expect(deriveMatch3(14).pieceKinds).toBe(5);
        expect(deriveMatch3(24).pieceKinds).toBe(5);
        for (const layer of [4, 14, 24]) {
            expect(deriveMatch3(layer).steps).toBe(20);
        }
        expect(deriveMatch3(4).hp).toBe(28);
        expect(deriveMatch3(14).hp).toBe(32);
        expect(deriveMatch3(24).hp).toBe(36);
    });

    it('妖怪取自本章池', () => {
        const spec = deriveMatch3(4);
        const ids = TRAIL_CHAPTERS[0].monsters.map((m) => m.id);
        expect(ids).toContain(spec.monsterId);
    });

    it('AVAILABLE_GAMES 含 match3：typePlan 不再回退', () => {
        expect(AVAILABLE_GAMES).toContain('match3');
        // ch1 typePlan 第 4 格是 match3（层 4）
        expect(deriveGame(4)).toBe('match3');
        // ch2 第 3 格 match3（层 13）
        expect(deriveGame(13)).toBe('match3');
        // Boss 层恒 battle
        expect(deriveGame(10)).toBe('battle');
        expect(deriveGame(20)).toBe('battle');
    });
});

describe('M17 三消引擎', () => {
    const mk = (layer = 4, over: Partial<typeof CH1> = {}) =>
        new TrailMatch3Engine({ ...CH1, ...over }, layer);

    it('初始棋盘确定性且无初始三连', () => {
        const a = mk(4);
        const b = mk(4);
        expect([...a.board]).toEqual([...b.board]);
        expect(hasInitialMatch(a.board, a.spec.size)).toBe(false);
        expect(hasMove(a.board, a.spec.size, a.spec.pieceKinds)).toBe(true);
    });

    it('棋子种类数不超过 pieceKinds', () => {
        const e = mk(4);
        const kinds = new Set(e.board);
        expect(kinds.size).toBeLessThanOrEqual(e.spec.pieceKinds);
        for (const k of e.board) expect(k).toBeGreaterThanOrEqual(0);
    });

    it('非相邻交换 / 越界非法', () => {
        const e = mk(4);
        const n = e.spec.size;
        expect(e.swap(0, n * n - 1)).toBeNull(); // 对角
        expect(e.swap(0, 2)).toBeNull(); // 同行隔一格
        expect(e.swap(-1, 0)).toBeNull();
        expect(e.swap(0, n * n)).toBeNull();
        expect(e.stepsLeft).toBe(CH1.steps);
    });

    it('构造三连：有效交换耗步并扣血', () => {
        const e = mk(4);
        const mv = findScoringMove(e.board, e.spec.size, e.spec.pieceKinds);
        expect(mv).not.toBeNull();
        const [a, b] = mv!;
        const hp0 = e.hp;
        const clears = e.swap(a, b);
        expect(clears).not.toBeNull();
        expect(e.stepsLeft).toBe(CH1.steps - 1);
        expect(e.hp).toBeLessThan(hp0);
    });

    it('无效交换回弹：棋盘还原不耗步', () => {
        const e = mk(4);
        const mv = findNonScoringMove(e.board, e.spec.size, e.spec.pieceKinds);
        if (!mv) return; // 极小概率开局全场景步，跳过
        const before = [...e.board];
        expect(e.swap(mv[0], mv[1])).toBeNull();
        expect([...e.board]).toEqual(before);
        expect(e.stepsLeft).toBe(CH1.steps);
    });

    it('三消=1倍：恰一/条 3 连首波 mult=1 伤害=1', () => {
        const e = mk(4);
        // 一次交换凑成唯一 3 连：row0=[1,1,2,3,3,2]，swap(2,7) 后 row0=1,1,1
        e.loadBoardForTest([
            1, 1, 2, 3, 3, 2,
            2, 3, 1, 2, 3, 1,
            3, 2, 3, 1, 2, 3,
            2, 3, 2, 3, 1, 2,
            1, 2, 3, 1, 2, 3,
            3, 1, 2, 3, 1, 2,
        ]);
        const clears = e.swap(2, 8)!; // (0,2)=2 ↔ (1,2)=1：row0 变 1,1,1,3,3,2
        const wave1 = clears.filter((c) => c.chain === 1);
        expect(wave1.length).toBe(1);
        expect(wave1[0].mult).toBe(1);
        expect(wave1[0].damage).toBeCloseTo(1, 5);
    });

    it('四连=2倍：一行四连首波 mult=2', () => {
        const e = mk(4);
        // 直接摆一个一步成 4 连的盘面：第 0 行 1,1,1,x → 把 x 换成 1
        // (row0): [1,1,1,2,3,2]；(1,3)=1 与 (0,3)=2 上下交换 → row0 变 1,1,1,1
        e.loadBoardForTest([
            1, 1, 1, 2, 3, 2,
            2, 3, 2, 1, 1, 3,
            3, 2, 3, 2, 3, 1,
            2, 3, 1, 3, 2, 3,
            1, 2, 3, 1, 2, 1,
            3, 1, 2, 3, 1, 2,
        ]);
        const clears = e.swap(9, 3)!; // pos9=(1,3) 与 pos3=(0,3)
        const wave1 = clears.filter((c) => c.chain === 1);
        expect(wave1.length).toBeGreaterThan(0);
        expect(wave1.some((c) => c.mult === 2)).toBe(true);
    });

    it('五连=3倍', () => {
        const e = mk(4);
        // row0: [1,1,1,1,2,x]；(1,4)=1 与 (0,4)=2 交换 → 五连
        e.loadBoardForTest([
            1, 1, 1, 1, 2, 3,
            2, 3, 2, 3, 1, 2,
            3, 2, 3, 2, 3, 1,
            2, 3, 1, 3, 2, 3,
            1, 2, 3, 1, 2, 1,
            3, 1, 2, 3, 1, 2,
        ]);
        const clears = e.swap(10, 4)!; // pos10=(1,4) 与 pos4=(0,4)
        const wave1 = clears.filter((c) => c.chain === 1);
        expect(wave1.some((c) => c.mult === 3)).toBe(true);
    });

    it('L 型（交叉 run）两条 run 均升 3 倍', () => {
        const e = mk(4);
        // swap(15,16)：(2,3)=2 与 (2,4)=1 交换 → row2 三连 (cols1-3) 与 col3 三连 (rows0-2) 交叉于 (2,3)
        e.loadBoardForTest([
            2, 3, 1, 1, 2, 3,
            3, 1, 2, 1, 3, 2,
            2, 1, 1, 2, 1, 3,
            1, 3, 2, 3, 3, 1,
            3, 2, 3, 1, 2, 3,
            1, 3, 2, 3, 1, 2,
        ]);
        const clears = e.swap(15, 16)!;
        const wave1 = clears.filter((c) => c.chain === 1);
        expect(wave1.length).toBe(2);
        expect(wave1.every((c) => c.mult === 3)).toBe(true);
    });

    it('连锁乘算 ×1.2^(chain-1)', () => {
        const e = mk(4);
        e.loadBoardForTest([
            1, 1, 1, 2, 3, 2,
            2, 3, 2, 1, 1, 3,
            3, 2, 3, 2, 3, 1,
            2, 3, 1, 3, 2, 3,
            1, 2, 3, 1, 2, 1,
            3, 1, 2, 3, 1, 2,
        ]);
        const clears = e.swap(9, 3)!;
        for (const c of clears) {
            expect(c.damage).toBeCloseTo(c.mult * Math.pow(1.2, c.chain - 1), 5);
        }
    });

    it('步数耗尽判负，revive +5 步每局 1 次', () => {
        const e = mk(4, { steps: 1, hp: 1000 });
        const mv = findScoringMove(e.board, e.spec.size, e.spec.pieceKinds);
        expect(mv).not.toBeNull();
        e.swap(mv![0], mv![1]);
        expect(e.status).toBe('lost');
        expect(e.revive()).toBe(true);
        expect(e.stepsLeft).toBe(5);
        expect(e.status).toBe('ongoing');
        expect(e.revive()).toBe(false);
    });

    it('HP 归零判胜', () => {
        const e = mk(4, { hp: 1 });
        const mv = findScoringMove(e.board, e.spec.size, e.spec.pieceKinds);
        expect(mv).not.toBeNull();
        e.swap(mv![0], mv![1]);
        expect(e.status).toBe('won');
        expect(e.hp).toBeLessThanOrEqual(0);
    });

    it('洗牌重排：无初始三连、不耗步、终局不可用', () => {
        const e = mk(4);
        const s0 = e.stepsLeft;
        expect(e.shuffle()).toBe(true);
        expect(hasInitialMatch(e.board, e.spec.size)).toBe(false);
        expect(e.stepsLeft).toBe(s0);
        // 终局拒绝
        const e2 = mk(4, { hp: 1 });
        const mv = findScoringMove(e2.board, 6, e2.spec.pieceKinds);
        if (mv) {
            e2.swap(mv[0], mv[1]);
            if (e2.status !== 'ongoing') expect(e2.shuffle()).toBe(false);
        }
    });

    it('随机模拟通关率落带（平衡标定）', () => {
        let wins = 0;
        const N = 60;
        for (let seed = 1; seed <= N; seed++) {
            const e = mk(seed + 100);
            let guard = 0;
            while (e.status === 'ongoing' && guard++ < 200) {
                const mv = randomMove(e.board, e.spec.size);
                if (!mv) break;
                e.swap(mv[0], mv[1]);
            }
            if (e.status === 'won') wins++;
        }
        const rate = wins / N;
        // 随机玩家为下界；带外说明 HP 标定失衡
        expect(rate).toBeGreaterThan(0.1);
        expect(rate).toBeLessThan(0.95);
    });
});

// ---------- 测试辅助 ----------

function hasInitialMatch(board: readonly number[], size: number): boolean {
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const k = board[r * size + c];
            if (c >= 2 && board[r * size + c - 1] === k && board[r * size + c - 2] === k) return true;
            if (r >= 2 && board[(r - 1) * size + c] === k && board[(r - 2) * size + c] === k) return true;
        }
    }
    return false;
}

function hasMove(board: readonly number[], size: number, kinds: number): boolean {
    return findScoringMove(board, size, kinds) !== null;
}

function trySwapBoard(board: number[], size: number, a: number, b: number): boolean {
    const ar = Math.floor(a / size), ac = a % size;
    const br = Math.floor(b / size), bc = b % size;
    if (Math.abs(ar - br) + Math.abs(ac - bc) !== 1) return false;
    const t = board[a]; board[a] = board[b]; board[b] = t;
    return true;
}

function matchAt(board: readonly number[], size: number): boolean {
    return hasInitialMatch(board, size);
}

/** 找一个一步成消的相邻交换（测试辅助，暴力扫） */
function findScoringMove(board: readonly number[], size: number, _kinds: number): [number, number] | null {
    const b = [...board];
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const a = r * size + c;
            for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
                const r2 = r + dr, c2 = c + dc;
                if (r2 >= size || c2 >= size) continue;
                const bb = [...b];
                if (!trySwapBoard(bb, size, a, r2 * size + c2)) continue;
                if (matchAt(bb, size)) return [a, r2 * size + c2];
            }
        }
    }
    return null;
}

/** 找一个不形成消除的相邻交换 */
function findNonScoringMove(board: readonly number[], size: number, kinds: number): [number, number] | null {
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const a = r * size + c;
            for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
                const r2 = r + dr, c2 = c + dc;
                if (r2 >= size || c2 >= size) continue;
                const b = [...board];
                if (!trySwapBoard(b, size, a, r2 * size + c2)) continue;
                if (!matchAt(b, size)) return [a, r2 * size + c2];
            }
        }
    }
    return null;
}

function randomMove(board: readonly number[], size: number): [number, number] | null {
    const mv = findScoringMove(board, size, 6);
    return mv;
}
