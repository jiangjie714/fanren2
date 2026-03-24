/**
 * 可注入种子的伪随机数（mulberry32），保证核心数值逻辑可单测、可复现。
 */
export class Rng {
    private state: number;

    constructor(seed: number = (Math.random() * 0xffffffff) >>> 0) {
        this.state = seed >>> 0;
    }

    /** [0, 1) */
    float(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** [min, max) 浮点 */
    range(min: number, max: number): number {
        return min + this.float() * (max - min);
    }

    /** [min, max] 整数 */
    int(min: number, max: number): number {
        return Math.floor(this.range(min, max + 1));
    }

    /** 按权重挑选：weights 依次对应返回下标 */
    pickWeighted(weights: number[]): number {
        const total = weights.reduce((a, b) => a + b, 0);
        let r = this.float() * total;
        for (let i = 0; i < weights.length; i++) {
            r -= weights[i];
            if (r < 0) return i;
        }
        return weights.length - 1;
    }

    /** 以 chance 概率返回 true */
    chance(p: number): boolean {
        return this.float() < p;
    }
}
