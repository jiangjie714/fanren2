/**
 * M16 妖像拼图引擎（交换式，spec D1-D5）。
 * 纯逻辑无渲染：board[pos] = tileId，tileId === pos 即归位并自动锁定。
 * - 打乱：mulberry32(层号种子) 驱动 Fisher-Yates，同层恒同谜面（防退出重进刷局）；
 *   打乱结果保证非完成态；开局已归位块直接锁定且不计伤害（白送）。
 * - 封印：妖怪 HP 100，每新归位一块扣 100/N²；全归位（progress=1）→ won。
 * - 交换式 + 归位锁定永不死局：剩余块在剩余位置上的任意置换可由交换生成。
 * - 超时 → lost，可 revive（+15s，每局 1 次）；凝神一瞥 peeksLeft（免费 1 次 + 广告 grantPeek）。
 */

export interface TrailPuzzleSpecLike {
    size: number;
    timeLimitSec: number;
    shuffleSteps: number;
}

export type PuzzleStatus = 'ongoing' | 'won' | 'lost';

const PUZZLE_HP = 100;
const REVIVE_TIME = 15;

export class TrailPuzzleEngine {
    readonly spec: TrailPuzzleSpecLike;
    readonly size: number;
    private seed: number;
    private _board: number[] = [];
    private _locked: boolean[] = [];
    private _hp = PUZZLE_HP;
    private _timeLeft = 0;
    private _status: PuzzleStatus = 'ongoing';
    private _peeksLeft = 1;
    private _usedRevive = false;

    constructor(spec: TrailPuzzleSpecLike, seedLayer: number) {
        this.spec = spec;
        this.size = spec.size;
        this.seed = (seedLayer * 2654435761) >>> 0;
        this._timeLeft = spec.timeLimitSec;
        this.shuffle();
    }

    /** 棋盘快照（pos → tileId） */
    get board(): readonly number[] {
        return this._board;
    }

    get hp(): number {
        return this._hp;
    }

    get timeLeft(): number {
        return this._timeLeft;
    }

    get status(): PuzzleStatus {
        return this._status;
    }

    /** 胜利判定（供场景层窄化友好的重读口） */
    get won(): boolean {
        return this._status === 'won';
    }

    get peeksLeft(): number {
        return this._peeksLeft;
    }

    get usedRevive(): boolean {
        return this._usedRevive;
    }

    /** 归位比例 0..1 */
    progress(): number {
        let fixed = 0;
        for (let i = 0; i < this._board.length; i++) if (this._board[i] === i) fixed++;
        return fixed / this._board.length;
    }

    isLocked(pos: number): boolean {
        return this._locked[pos] === true;
    }

    /** 交换两块：任一方锁定 / 同位 / 非法下标 → false */
    swap(a: number, b: number): boolean {
        if (this._status !== 'ongoing') return false;
        const n = this._board.length;
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n) return false;
        if (a === b || this._locked[a] || this._locked[b]) return false;
        const tmp = this._board[a];
        this._board[a] = this._board[b];
        this._board[b] = tmp;
        this.refreshLocks();
        if (this.progress() >= 1) this._status = 'won';
        return true;
    }

    /** 推进时间；仅 ongoing 生效 */
    tick(dt: number): void {
        if (this._status !== 'ongoing') return;
        this._timeLeft -= dt;
        if (this._timeLeft <= 0) {
            this._timeLeft = 0;
            this._status = 'lost';
        }
    }

    /** 消耗一次凝神（免费或广告授予） */
    peek(): boolean {
        if (this._peeksLeft <= 0 || this._status !== 'ongoing') return false;
        this._peeksLeft--;
        return true;
    }

    /** 广告授予凝神（trailHint，每日频控由 Ads 侧管理） */
    grantPeek(): void {
        this._peeksLeft++;
    }

    /** 回魂（trailRevive）：lost 后 +15s，每局 1 次 */
    revive(): boolean {
        if (this._status !== 'lost' || this._usedRevive) return false;
        this._usedRevive = true;
        this._timeLeft += REVIVE_TIME;
        this._status = 'ongoing';
        return true;
    }

    /** 测试钩子：直接复原棋盘（按当前局面把每块换到目标位，锁定块已在位不受影响） */
    solveForTest(): void {
        for (let i = 0; i < this._board.length; i++) {
            if (this._board[i] === i) continue;
            const j = this._board.indexOf(i);
            this.swap(i, j);
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

    private shuffle(): void {
        const n = this.size * this.size;
        this._board = new Array(n);
        for (let i = 0; i < n; i++) this._board[i] = i;
        // Fisher-Yates：交换式打乱，任意排列均可解（与完成态差异由交换历史保证非零）
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(this.rand() * (i + 1));
            const tmp = this._board[i];
            this._board[i] = this._board[j];
            this._board[j] = tmp;
        }
        // 兜底：打乱恰好等于完成态（概率 ≈ 1/n!）时交换前两块
        if (this._board.every((t, i) => t === i)) {
            const tmp = this._board[0];
            this._board[0] = this._board[1];
            this._board[1] = tmp;
        }
        this._locked = new Array(n).fill(false);
        // 开局已归位块：白送锁定，不计伤害（HP 保持满血）
        this.refreshLocks();
        this.shuffledStarted = true;
    }

    /** 归位 → 锁定 + 扣封印伤害（只对本次新归位块结算；开局归位在扣血前先行锁定） */
    private refreshLocks(): void {
        const damage = PUZZLE_HP / (this.size * this.size);
        for (let i = 0; i < this._board.length; i++) {
            if (this._board[i] === i && !this._locked[i]) {
                this._locked[i] = true;
                if (this.shuffledStarted) this._hp -= damage;
            }
        }
    }

    /** shuffle 完成标志：开局归位不扣血，此后每次新归位扣血 */
    private shuffledStarted = false;
}
