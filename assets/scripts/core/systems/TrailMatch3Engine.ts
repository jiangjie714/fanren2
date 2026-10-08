/**
 * M17 妖影三消引擎（spec §4.C）。
 * 纯逻辑无渲染：6×6 棋盘，board[pos] = 棋子种类 0..pieceKinds-1（章内妖怪头像）。
 * - 确定性：mulberry32(层号种子) 驱动棋盘生成与掉落补充，同层恒同谜面（防退出重进刷局）；
 *   棋盘生成保证无初始三连且存在可行步。
 * - 交换：仅相邻；无效交换回弹不耗步；有效交换耗 1 步并触发消解。
 * - 消解：行/列 run≥3；倍率 3 消=×1 / 4 消=×2 / 5 消或与他向 run 交叉（L/T 型）=×3；
 *   连锁波次 damage = mult × 1.2^(chain-1)（chain 从 1）；清除 → 重力 → 顶部补充 → 再扫。
 * - 胜负：HP≤0 → won；步数尽且 HP>0 → lost；revive（trailRevive）lost 后 +5 步每局 1 次。
 * - 洗牌重排（trailHint）：全盘重掷（无初始三连、有可行步），不耗步；终局不可用。
 * - 消解后无可行步自动洗牌（防软锁）。
 */

export interface TrailMatch3SpecLike {
    /** 棋盘边长（6） */
    size: number;
    /** 棋子种类数（4–6，章内妖怪池前 K 只） */
    pieceKinds: number;
    /** 步数上限（20） */
    steps: number;
    /** 妖怪 HP（伤害点数口径：3 消=1 点） */
    hp: number;
}

export type Match3Status = 'ongoing' | 'won' | 'lost';

/** 一条 run 的消除记录（供场景端表现） */
export interface Match3Clear {
    /** 消除格子（pos = row*size+col） */
    cells: number[];
    /** 倍率 1|2|3 */
    mult: number;
    /** 波次（1 起） */
    chain: number;
    /** 本 run 伤害 = mult × 1.2^(chain-1) */
    damage: number;
}

const CHAIN_FACTOR = 1.2;
const REVIVE_STEPS = 5;

interface Run {
    cells: number[];
    horizontal: boolean;
}

export class TrailMatch3Engine {
    readonly spec: TrailMatch3SpecLike;
    private seed: number;
    private _board: number[] = [];
    private _hp: number;
    private _stepsLeft: number;
    private _status: Match3Status = 'ongoing';
    private _usedRevive = false;

    constructor(spec: TrailMatch3SpecLike, seedLayer: number) {
        this.spec = spec;
        this.seed = (seedLayer * 2654435761) >>> 0;
        this._hp = spec.hp;
        this._stepsLeft = spec.steps;
        this.genBoard();
    }

    /** 棋盘快照（pos → 棋子种类） */
    get board(): readonly number[] {
        return this._board;
    }

    get hp(): number {
        return this._hp;
    }

    get stepsLeft(): number {
        return this._stepsLeft;
    }

    get status(): Match3Status {
        return this._status;
    }

    /** 胜利判定（供场景层窄化友好的重读口，与拼图引擎同款） */
    get won(): boolean {
        return this._status === 'won';
    }

    get lost(): boolean {
        return this._status === 'lost';
    }

    get usedRevive(): boolean {
        return this._usedRevive;
    }

    /**
     * 交换相邻两子：非相邻/越界/终局 → null；无消除 → 回弹返回 null（不耗步）；
     * 有效 → 耗 1 步、消解至稳态，返回全部波次的 run 记录。
     */
    swap(a: number, b: number): Match3Clear[] | null {
        if (this._status !== 'ongoing') return null;
        const n = this.spec.size;
        const total = n * n;
        if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
        if (a < 0 || b < 0 || a >= total || b >= total || a === b) return null;
        const ar = Math.floor(a / n), ac = a % n;
        const br = Math.floor(b / n), bc = b % n;
        if (Math.abs(ar - br) + Math.abs(ac - bc) !== 1) return null;

        const board = [...this._board];
        const t = board[a]; board[a] = board[b]; board[b] = t;
        if (this.findRuns(board).length === 0) return null; // 无效交换：回弹

        this._board = board;
        this._stepsLeft--;
        const clears = this.resolve();
        if (this._hp <= 0) {
            this._status = 'won';
        } else if (this._stepsLeft <= 0) {
            this._status = 'lost';
        }
        return clears;
    }

    /** 洗牌重排（trailHint）：全盘重掷，不耗步；终局不可用 */
    shuffle(): boolean {
        if (this._status !== 'ongoing') return false;
        this.genBoard();
        return true;
    }

    /** 回魂（trailRevive）：lost 后 +5 步，每局 1 次 */
    revive(): boolean {
        if (this._status !== 'lost' || this._usedRevive) return false;
        this._usedRevive = true;
        this._stepsLeft += REVIVE_STEPS;
        this._status = 'ongoing';
        return true;
    }

    /** 测试钩子：直接摆盘（不校验状态） */
    loadBoardForTest(board: number[]): void {
        this._board = [...board];
    }

    // ---------- 内核 ----------

    /** 消解至稳态：扫描 → 扣血 → 清除 → 重力 → 补充 → 再扫（连锁 ×1.2） */
    private resolve(): Match3Clear[] {
        const out: Match3Clear[] = [];
        let chain = 1;
        for (;;) {
            const runs = this.findRuns(this._board);
            if (runs.length === 0) break;
            const crossed = this.crossedCells(runs);
            let waveDamage = 0;
            for (const run of runs) {
                const mult = this.runMult(run, crossed);
                const damage = mult * Math.pow(CHAIN_FACTOR, chain - 1);
                waveDamage += damage;
                out.push({ cells: [...run.cells], mult, chain, damage });
            }
            this._hp -= waveDamage;
            this.clearCells(runs);
            this.gravity();
            this.refill();
            chain++;
        }
        // 防软锁：稳态后无可行步 → 洗牌（不耗步）
        if (this._status === 'ongoing' && !this.hasAnyMove()) this.genBoard();
        return out;
    }

    /** 扫描全部横/竖 run（≥3 连） */
    private findRuns(board: readonly number[]): Run[] {
        const n = this.spec.size;
        const runs: Run[] = [];
        // 横向
        for (let r = 0; r < n; r++) {
            let c = 0;
            while (c < n) {
                const k = board[r * n + c];
                let len = 1;
                while (c + len < n && board[r * n + c + len] === k) len++;
                if (len >= 3 && k >= 0) {
                    const cells: number[] = [];
                    for (let i = 0; i < len; i++) cells.push(r * n + c + i);
                    runs.push({ cells, horizontal: true });
                }
                c += len;
            }
        }
        // 纵向
        for (let c = 0; c < n; c++) {
            let r = 0;
            while (r < n) {
                const k = board[r * n + c];
                let len = 1;
                while (r + len < n && board[(r + len) * n + c] === k) len++;
                if (len >= 3 && k >= 0) {
                    const cells: number[] = [];
                    for (let i = 0; i < len; i++) cells.push((r + i) * n + c);
                    runs.push({ cells, horizontal: false });
                }
                r += len;
            }
        }
        return runs;
    }

    /** 同时属于横竖 run 的格子集合（L/T 型判定） */
    private crossedCells(runs: readonly Run[]): Set<number> {
        const h = new Set<number>();
        const v = new Set<number>();
        for (const run of runs) {
            for (const p of run.cells) (run.horizontal ? h : v).add(p);
        }
        const both = new Set<number>();
        for (const p of h) if (v.has(p)) both.add(p);
        return both;
    }

    /** run 倍率：5+ 消=3 / 4 消=2 / 3 消=1；涉 L/T 交叉格 → 3 */
    private runMult(run: Run, crossed: ReadonlySet<number>): number {
        if (run.cells.length >= 5) return 3;
        for (const p of run.cells) if (crossed.has(p)) return 3;
        return run.cells.length >= 4 ? 2 : 1;
    }

    /** 清除（各 run 取并集置 -1） */
    private clearCells(runs: readonly Run[]): void {
        for (const run of runs) {
            for (const p of run.cells) this._board[p] = -1;
        }
    }

    /** 重力：每列非空格下沉 */
    private gravity(): void {
        const n = this.spec.size;
        for (let c = 0; c < n; c++) {
            let write = n - 1;
            for (let r = n - 1; r >= 0; r--) {
                const v = this._board[r * n + c];
                if (v >= 0) {
                    this._board[write * n + c] = v;
                    if (write !== r) this._board[r * n + c] = -1;
                    write--;
                }
            }
            // 顶部剩余位保持 -1，由 refill 补
        }
    }

    /** 顶部补充（种子续流，同层同操作序列恒同结果） */
    private refill(): void {
        const n = this.spec.size;
        for (let c = 0; c < n; c++) {
            for (let r = 0; r < n; r++) {
                if (this._board[r * n + c] < 0) {
                    this._board[r * n + c] = Math.floor(this.rand() * this.spec.pieceKinds);
                }
            }
        }
    }

    /** 全盘是否存在一步成消的交换 */
    private hasAnyMove(): boolean {
        const n = this.spec.size;
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const a = r * n + c;
                if (c + 1 < n && this.swappable(a, a + 1)) return true;
                if (r + 1 < n && this.swappable(a, a + n)) return true;
            }
        }
        return false;
    }

    private swappable(a: number, b: number): boolean {
        const board = [...this._board];
        const t = board[a]; board[a] = board[b]; board[b] = t;
        return this.findRuns(board).length > 0;
    }

    /** 生成棋盘：无初始三连且存在可行步（否则重掷） */
    private genBoard(): void {
        const n = this.spec.size;
        for (;;) {
            const board: number[] = new Array(n * n);
            for (let r = 0; r < n; r++) {
                for (let c = 0; c < n; c++) {
                    let k = Math.floor(this.rand() * this.spec.pieceKinds);
                    // 重掷避免与左二/上二成三连
                    while (
                        (c >= 2 && board[r * n + c - 1] === k && board[r * n + c - 2] === k) ||
                        (r >= 2 && board[(r - 1) * n + c] === k && board[(r - 2) * n + c] === k)
                    ) {
                        k = (k + 1) % this.spec.pieceKinds;
                    }
                    board[r * n + c] = k;
                }
            }
            this._board = board;
            if (this.hasAnyMove()) return;
        }
    }

    /** mulberry32 确定性伪随机（层号种子，无外部随机源） */
    private rand(): number {
        this.seed = (this.seed + 0x6d2b79f5) >>> 0;
        let t = this.seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}
