import { _decorator, Component, Sprite, SpriteFrame } from 'cc';

const { ccclass } = _decorator;

/**
 * 极简帧动画播放器。
 *
 * 挂在已经带 Sprite 组件的节点上，按固定 fps 轮换 spriteFrame。
 * 设计取舍：
 * - **不持有资源所有权** —— frames 由调用方（ThemeLib.spriteAnimation）加载后传入，
 *   本组件不负责 release。美术统一走 subres bundle 缓存，重复进入页面直接命中缓存。
 * - **用 update 累加而非 tween** —— 帧间隔需要精确等分，tween 的序列在帧数变化时难以复用；
 *   累加器实现能容忍 fps 调整且无额外闭包分配。
 * - 通过 `_decorator.ccclass` 注册，Cocos 才能把它序列化进场景/正常调度 update。
 */
@ccclass('FrameAnimator')
export class FrameAnimator extends Component {
    private frames: SpriteFrame[] = [];
    private sprite: Sprite | null = null;
    private index = 0;
    private accum = 0;
    private interval = 1 / 8;
    private looping = true;
    private playing = false;

    play(frames: SpriteFrame[], fps = 8, loop = true): void {
        if (frames.length === 0) return;
        this.frames = frames;
        this.interval = 1 / Math.max(1, fps);
        this.looping = loop;
        this.index = 0;
        this.accum = 0;
        this.playing = true;
        if (!this.sprite || !this.sprite.isValid) this.sprite = this.getComponent(Sprite);
        if (this.sprite) this.sprite.spriteFrame = frames[0];
    }

    stop(): void {
        this.playing = false;
    }

    get isPlaying(): boolean {
        return this.playing;
    }

    update(dt: number): void {
        if (!this.playing || this.frames.length < 2) return;
        if (!this.sprite || !this.sprite.isValid) {
            this.playing = false;
            return;
        }
        this.accum += dt;
        // while 而非 if：低帧率设备上一次 update 可能跨过多帧，需一次补齐避免动画变慢
        while (this.accum >= this.interval) {
            this.accum -= this.interval;
            this.index += 1;
            if (this.index >= this.frames.length) {
                if (this.looping) {
                    this.index = 0;
                } else {
                    this.index = this.frames.length - 1;
                    this.playing = false;
                }
            }
            this.sprite.spriteFrame = this.frames[this.index];
        }
    }
}
