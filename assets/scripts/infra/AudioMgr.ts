/**
 * 程序化仙府音频引擎：无外部素材，全套基于 WebAudio 合成（Web/抖音双端兼容）。
 * 风格定位：【快乐修仙 · 国风清越 · 仙音逍遥】
 * - 音阶：国风正统正调五声音阶（宫 D · 商 E · 角 F# · 徵 A · 羽 B）
 * - 乐器质感：白玉磬击、灵泉水滴、古筝弹拨、金石脆鸣、祥瑞晨钟
 * - BGM：逍遥游仙府欢歌（流转玉筝琶音 + 温润祥云和弦 + 灵泉叮咚），轻快惬意、陶然忘机
 * - SFX：彻底剔除刺耳方波/锯齿波，全系采用高质感物理包络与谐波共鸣
 */
import { Game } from './Game';

export type SfxName =
    | 'click' | 'open' | 'rare' | 'disaster'
    | 'gold' | 'blue' | 'red'
    | 'success' | 'fail';

interface AudioCtxLike {
    createOscillator(): OscillatorNodeLike;
    createGain(): GainNodeLike;
    get currentTime(): number;
    get destination(): unknown;
    state?: string;
    resume?(): Promise<void>;
}

interface OscillatorNodeLike {
    type: 'sine' | 'square' | 'triangle' | 'sawtooth';
    frequency: {
        value: number;
        setValueAtTime(t: number, at: number): void;
        exponentialRampToValueAtTime(t: number, at: number): void;
        linearRampToValueAtTime?(t: number, at: number): void;
    };
    connect(dest: unknown): void;
    start(at: number): void;
    stop(at: number): void;
    onended?: (() => void) | null;
}

interface GainNodeLike {
    gain: {
        value: number;
        setValueAtTime(t: number, at: number): void;
        exponentialRampToValueAtTime(t: number, at: number): void;
        linearRampToValueAtTime?(t: number, at: number): void;
    };
    connect(dest: unknown): void;
}

/** 快乐五声音阶常用频率对照（D 大调正五声：D, E, F#, A, B） */
const PENTATONIC = {
    D3: 146.83,
    A3: 220.00,
    D4: 293.66,
    E4: 329.63,
    Fs4: 369.99,
    A4: 440.00,
    B4: 493.88,
    D5: 587.33,
    E5: 659.25,
    Fs5: 739.99,
    A5: 880.00,
    B5: 987.77,
    D6: 1174.66,
    E6: 1318.51,
    Fs6: 1479.98,
    A6: 1760.00,
};

export class AudioMgr {
    private static ctx: AudioCtxLike | null = null;
    private static bgmMasterGain: GainNodeLike | null = null;
    private static bgmTimerId: number | null = null;
    private static bgmPadOscs: OscillatorNodeLike[] = [];
    private static bgmPlaying = false;
    private static bgmStep = 0;

    /** 首次用户手势时调用：唤醒 AudioContext 并按设置启动 BGM */
    static ensureStarted() {
        const ctx = this.ensureCtx();
        if (ctx && ctx.state === 'suspended' && ctx.resume) {
            ctx.resume().catch(() => {});
        }
        if (this.ctx && Game.save?.settings.bgm && !this.bgmPlaying) {
            this.startBgm();
        }
    }

    /** 播放仙侠国风音效 */
    static play(name: SfxName) {
        if (!Game.save?.settings.sound) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;
        const t0 = ctx.currentTime;

        switch (name) {
            case 'click':
                // 白玉轻敲：纯净正弦基频 + 泛音谐振，温润无刺耳杂音
                this.strikeBell(ctx, 1174.66, 0.05, 0.12, t0);
                this.strikeBell(ctx, 2960.00, 0.03, 0.04, t0);
                break;

            case 'open':
                // 宝盒现世：五声清越拂弦上行 + 祥瑞晨钟回荡
                [PENTATONIC.D4, PENTATONIC.Fs4, PENTATONIC.A4, PENTATONIC.D5].forEach((f, i) => {
                    this.pluckNote(ctx, f, 0.18, 0.15, t0 + i * 0.045);
                });
                this.strikeBell(ctx, PENTATONIC.Fs5, 0.35, 0.14, t0 + 0.18);
                break;

            case 'rare':
                // 天赐仙缘：欢快雀跃的五声金铃华彩（高山流水、喜庆灵动）
                [PENTATONIC.D5, PENTATONIC.Fs5, PENTATONIC.A5, PENTATONIC.D6, PENTATONIC.Fs6].forEach((f, i) => {
                    this.strikeBell(ctx, f, 0.32, 0.18, t0 + i * 0.065);
                });
                break;

            case 'disaster':
                // 惊雷煞气：沉闷悠远的古刹惊磬（柔和低沉有分量，绝不尖锐）
                this.toneGlide(ctx, 'triangle', 130, 48, 0.32, 0.20, t0);
                this.toneGlide(ctx, 'sine', 75, 36, 0.40, 0.22, t0);
                break;

            case 'gold':
                // 金雨凝晶：清脆悦耳的双音小金币叮当声
                this.strikeBell(ctx, PENTATONIC.A6, 0.07, 0.13, t0);
                this.strikeBell(ctx, 2349.32, 0.05, 0.08, t0 + 0.02);
                break;

            case 'blue':
                // 灵泉清露：晶莹灵动的甘霖水滴滑音
                this.waterDrop(ctx, 580, 1160, 0.07, 0.14, t0);
                break;

            case 'red':
                // 避煞轻叩：中低音柔和沉实木铎示警
                this.toneGlide(ctx, 'triangle', 280, 160, 0.09, 0.14, t0);
                break;

            case 'success':
                // 渡劫登仙：盛大欢庆的仙乐大合鸣（五声凯歌、霞光万道）
                // 琶音启幕
                [PENTATONIC.D4, PENTATONIC.Fs4, PENTATONIC.A4, PENTATONIC.D5].forEach((f, i) => {
                    this.pluckNote(ctx, f, 0.22, 0.16, t0 + i * 0.07);
                });
                // 齐鸣盛典三和音
                [PENTATONIC.D5, PENTATONIC.Fs5, PENTATONIC.A5, PENTATONIC.D6].forEach((f) => {
                    this.strikeBell(ctx, f, 0.75, 0.18, t0 + 0.32);
                });
                break;

            case 'fail':
                // 道心砥砺：宁静抚慰的古琴泛音下行（塞翁失马、鼓励再战）
                [PENTATONIC.A4, PENTATONIC.Fs4, PENTATONIC.D4].forEach((f, i) => {
                    this.pluckNote(ctx, f, 0.28, 0.15, t0 + i * 0.12);
                });
                break;
        }
    }

    /** 设置页开关控制 BGM */
    static setBgm(on: boolean) {
        if (on) this.startBgm();
        else this.stopBgm();
    }

    /** 切后台：暂停 BGM */
    static onBackground() {
        this.stopBgm();
    }

    /** 回前台：恢复 BGM */
    static onForeground() {
        if (Game.save?.settings.bgm) this.startBgm();
    }

    // ==========================================
    // 底层乐音合成基元（物理声学建模）
    // ==========================================

    /** 白玉石磬 / 金铃：快速冲击 + 纯正正弦共振衰减 */
    private static strikeBell(ctx: AudioCtxLike, freq: number, dur: number, vol: number, at: number) {
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, at);

            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(vol, at + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(at);
            osc.stop(at + dur + 0.02);
        } catch { /* 忽略错误 */ }
    }

    /** 弹拨琴韵（古筝 / 琵琶）：微柔和音头 + 丰富基音 */
    private static pluckNote(ctx: AudioCtxLike, freq: number, dur: number, vol: number, at: number) {
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, at);

            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(vol, at + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(at);
            osc.stop(at + dur + 0.02);
        } catch { /* 忽略错误 */ }
    }

    /** 灵露水滴：平滑音高微滑音 */
    private static waterDrop(ctx: AudioCtxLike, f0: number, f1: number, dur: number, vol: number, at: number) {
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f0, at);
            osc.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.7);

            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(vol, at + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(at);
            osc.stop(at + dur + 0.02);
        } catch { /* 忽略错误 */ }
    }

    /** 平滑频率滑动音 */
    private static toneGlide(ctx: AudioCtxLike, type: OscillatorNodeLike['type'], f0: number, f1: number, dur: number, vol: number, at: number) {
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(f0, at);
            osc.frequency.exponentialRampToValueAtTime(f1, at + dur);

            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(at);
            osc.stop(at + dur + 0.02);
        } catch { /* 忽略错误 */ }
    }

    // ==========================================
    // 快乐修仙 BGM：仙府欢歌（流转玉筝 + 祥云和声）
    // ==========================================

    /**
     * 16 拍欢乐五声音阶旋律序列（快乐自在、悠然自得）
     * 拍长 0.38 秒，小快板步伐感，如踏青寻仙
     */
    private static readonly BGM_MELODY: Array<{ f: number; dur: number; vol: number } | null> = [
        { f: PENTATONIC.D5, dur: 0.28, vol: 0.055 },
        { f: PENTATONIC.Fs5, dur: 0.28, vol: 0.060 },
        { f: PENTATONIC.A5, dur: 0.35, vol: 0.065 },
        { f: PENTATONIC.Fs5, dur: 0.25, vol: 0.055 },
        { f: PENTATONIC.E5, dur: 0.28, vol: 0.050 },
        { f: PENTATONIC.D5, dur: 0.28, vol: 0.055 },
        { f: PENTATONIC.B4, dur: 0.32, vol: 0.050 },
        { f: PENTATONIC.D5, dur: 0.38, vol: 0.060 },

        { f: PENTATONIC.Fs5, dur: 0.28, vol: 0.060 },
        { f: PENTATONIC.A5, dur: 0.28, vol: 0.065 },
        { f: PENTATONIC.B5, dur: 0.36, vol: 0.070 },
        { f: PENTATONIC.A5, dur: 0.26, vol: 0.060 },
        { f: PENTATONIC.Fs5, dur: 0.28, vol: 0.055 },
        { f: PENTATONIC.E5, dur: 0.28, vol: 0.050 },
        { f: PENTATONIC.D5, dur: 0.45, vol: 0.065 },
        null, // 气口留白，呼吸感
    ];

    /** 启动快乐修仙 BGM */
    private static startBgm() {
        const ctx = this.ensureCtx();
        if (!ctx || this.bgmPlaying) return;
        this.bgmPlaying = true;
        this.bgmStep = 0;

        try {
            // 主音量总线
            const master = ctx.createGain();
            master.gain.setValueAtTime(0.0001, ctx.currentTime);
            master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 1.2);
            master.connect(ctx.destination);
            this.bgmMasterGain = master;

            // 1. 底层祥云温润和声（柔和正弦五度双音，营造灵山幽谷氛围）
            this.bgmPadOscs = [];
            const padTones = [PENTATONIC.D3, PENTATONIC.A3, PENTATONIC.D4];
            for (const freq of padTones) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                gain.gain.setValueAtTime(0.016, ctx.currentTime);
                osc.connect(gain);
                gain.connect(master);
                osc.start(ctx.currentTime);
                this.bgmPadOscs.push(osc);
            }

            // 2. 调度器：每 360ms 奏响一拍欢快灵动的古筝琵琶乐句
            const BEAT_MS = 360;
            const tick = () => {
                if (!this.bgmPlaying || !this.ctx || !this.bgmMasterGain) return;
                const now = this.ctx.currentTime;
                const note = this.BGM_MELODY[this.bgmStep % this.BGM_MELODY.length];
                this.bgmStep++;

                if (note) {
                    // 主乐音：清越古筝
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(note.f, now);

                    gain.gain.setValueAtTime(0.0001, now);
                    gain.gain.exponentialRampToValueAtTime(note.vol, now + 0.008);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.dur);

                    osc.connect(gain);
                    gain.connect(this.bgmMasterGain);
                    osc.start(now);
                    osc.stop(now + note.dur + 0.02);

                    // 偶数拍点缀微弱八度灵石晶音，增添仙气灵动感
                    if (this.bgmStep % 2 === 0 && note.f < 1000) {
                        const shimmer = this.ctx.createOscillator();
                        const sGain = this.ctx.createGain();
                        shimmer.type = 'sine';
                        shimmer.frequency.setValueAtTime(note.f * 2, now + 0.02);
                        sGain.gain.setValueAtTime(0.0001, now + 0.02);
                        sGain.gain.exponentialRampToValueAtTime(note.vol * 0.25, now + 0.028);
                        sGain.gain.exponentialRampToValueAtTime(0.0001, now + note.dur * 0.6);
                        shimmer.connect(sGain);
                        sGain.connect(this.bgmMasterGain);
                        shimmer.start(now + 0.02);
                        shimmer.stop(now + note.dur * 0.6 + 0.02);
                    }
                }

                if (this.bgmPlaying) {
                    this.bgmTimerId = (globalThis as any).setTimeout(tick, BEAT_MS);
                }
            };

            this.bgmTimerId = (globalThis as any).setTimeout(tick, 100);
        } catch { /* 降级处理 */ }
    }

    /** 停止 BGM */
    private static stopBgm() {
        this.bgmPlaying = false;
        if (this.bgmTimerId !== null) {
            clearTimeout(this.bgmTimerId);
            this.bgmTimerId = null;
        }

        if (this.ctx && this.bgmMasterGain) {
            try {
                const t = this.ctx.currentTime;
                this.bgmMasterGain.gain.setValueAtTime(this.bgmMasterGain.gain.value, t);
                this.bgmMasterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
            } catch {}
        }

        for (const osc of this.bgmPadOscs) {
            try { osc.stop(this.ctx ? this.ctx.currentTime + 0.35 : 0); } catch {}
        }
        this.bgmPadOscs = [];
        this.bgmMasterGain = null;
    }

    // ==========================================
    // 上下文获取与跨端适配
    // ==========================================
    private static ensureCtx(): AudioCtxLike | null {
        if (this.ctx) return this.ctx;
        try {
            const g = globalThis as Record<string, unknown>;
            const tt = g.tt as { createWebAudioContext?: () => AudioCtxLike } | undefined;
            if (tt?.createWebAudioContext) {
                this.ctx = tt.createWebAudioContext();
                return this.ctx;
            }
            const AC = (g.AudioContext ?? g.webkitAudioContext) as (new () => AudioCtxLike) | undefined;
            if (AC) {
                this.ctx = new AC();
                return this.ctx;
            }
        } catch {
            // 双端均不可用 → 静默无声
        }
        return null;
    }
}
