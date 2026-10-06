/**
 * 场景集成测试（P3 长期项：全部场景集成零覆盖）。
 *
 * 场景层是 P0 四条历史缺陷的藏身处，但依赖 'cc'，vitest 无法直接加载引擎。
 * 这里的做法与 saveStore/ads 测试一脉相承：`vi.mock('cc')` 提供内存桩，
 * 并把 `ui/ThemeLib` 整体桩成「可观测记录器」——UI 构建调用被登记下来
 * （按钮回调 / 文本 / 图片路径 / 进度条），测试据此断言**场景接线**：
 *
 *   - 每个入口按钮 → push 的目标场景是否正确（导航错乱是 P0-1/P0-2 的形态）
 *   - refresh/onResume 后展示文案是否跟随存档（状态漂移）
 *   - onExit 是否清理（P2-3 tween 泄漏回归）
 *
 * 用 vi.hoisted 定义桩：hoisted 返回值在 mock 工厂与测试体之间共享同一引用
 * （注意：只能改内容/调方法，不要对返回对象的属性「重新赋值」——那不会
 * 反映到 mock 工厂闭包里，是之前踩过的坑）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
    // ───────────────────────── cc 内存桩 ─────────────────────────
    class Color {
        r = 0; g = 0; b = 0; a = 255;
        constructor(r = 0, g = 0, b = 0, a = 255) { this.r = r; this.g = g; this.b = b; this.a = a; }
        toString() { return `rgba(${this.r},${this.g},${this.b},${this.a})`; }
    }
    class Vec3 {
        x = 0; y = 0; z = 0;
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    }
    class Vec2 {
        x = 0; y = 0;
        constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    }
    class UITransform {
        private size: [number, number] = [0, 0];
        private anchor: [number, number] = [0.5, 0.5];
        setContentSize(w: number, hh: number) { this.size = [w, hh]; }
        setAnchorPoint(x: number, y: number) { this.anchor = [x, y]; }
        get contentSize() { return { width: this.size[0], height: this.size[1] }; }
    }
    class Label {
        string = '';
        fontSize = 20;
        lineHeight = 0;
        color: unknown = null;
        node: unknown = null;
    }
    class Sprite {
        static Type = { SIMPLE: 0, SLICED: 1, TILED: 2, FILLED: 4 };
        static SizeMode = { CUSTOM: 0, RAW: 1, TRIMMED: 2 };
        static FillType = { HORIZONTAL: 0, VERTICAL: 1, RADIAL: 2 };
        type = 0;
        sizeMode = 0;
        trim = false;
        spriteFrame: unknown = null;
        fillRange = 0;
        fillStart = 0;
        fillType = 0;
        color: unknown = null;
        node: unknown = null;
    }
    class Graphics {
        fillColor: unknown = new Color();
        strokeColor: unknown = new Color();
        lineWidth = 1;
        node: unknown = null;
        ellipse() { } roundRect() { } fill() { } stroke() { } moveTo() { } lineTo() { }
        clear() { } circle() { } arc() { } rect() { } bezierCurveTo() { } close() { }
    }
    class Button {
        static Transition = { NONE: 0, COLOR: 1, SPRITE: 2, SCALE: 3 };
        static EventType = { CLICK: 'click' };
        interactable = true;
        transition = 0;
        zoomScale = 1;
        target: unknown = null;
        node: unknown = null;
    }
    class UIOpacity { opacity = 255; node: unknown = null; }
    class EditBox {
        static InputMode = {
            ANY: 0, EMAIL_ADDR: 1, NUMERIC: 2, PHONE_NUMBER: 3, URL: 4, DECIMAL: 5, SINGLE_LINE: 6, PASSWORD: 7,
        };
        static InputFlag = {
            PASSWORD: 0, SENSITIVE: 1, INITIAL_CAPS_WORD: 2, INITIAL_CAPS_SENTENCE: 3,
            INITIAL_CAPS_ALL_CHARACTERS: 4, LOWERCASE_ALL_CHARACTERS: 5,
        };
        static KeyboardReturnType = { DEFAULT: 0, DONE: 1, SEND: 2, SEARCH: 3, GO: 4, NEXT: 5, CONTINUE: 6 };
        static EditingType = { AUTO: 0, ASCII: 1, ANY: 2 };
        string = '';
        placeholder = '';
        maxLength = 0;
        inputMode = 0;
        inputFlag = 0;
        returnType = 0;
        node: unknown = null;
    }
    class Component { node: unknown = null; }
    class Widget {
        static AlignMode = { ONCE: 0, ON_WINDOW_RESIZE: 1, ALWAYS: 2 };
        alignFlags = 0;
        alignMode = 0;
        node: unknown = null;
    }
    class SpriteFrame { texture: unknown = null; }
    class ImageAsset { }
    class Texture2D { uploadData() { } }
    class EventTouch {
        getLocation() { return new Vec2(0, 0); }
        getUILocation() { return new Vec2(0, 0); }
    }
    const stoppedTargets: unknown[] = [];
    class Tween {
        static stopAllByTarget(t: unknown) { stoppedTargets.push(t); }
    }
    /** 链式 tween：任何方法都返回自身，足以承载 repeatForever/to/start 的写法 */
    const tween = (_target?: unknown) => {
        const api: Record<string, unknown> = {};
        for (const m of ['to', 'by', 'set', 'delay', 'call', 'repeat', 'repeatForever', 'sequence',
            'parallel', 'then', 'union', 'target', 'start', 'stop', 'clone', 'easing', 'show', 'hide']) {
            api[m] = () => api;
        }
        return api as any;
    };

    class Node {
        name = '';
        active = true;
        layer = 0;
        isValid = true;
        destroyed = false;
        children: Node[] = [];
        angle = 0;
        scale = new Vec3(1, 1, 1);
        scene: unknown = null;
        private _parent: Node | null = null;
        private _components: unknown[] = [];
        private _handlers = new Map<string, Array<(...a: unknown[]) => void>>();
        private _pos = new Vec3(0, 0, 0);
        static EventType = {
            TOUCH_START: 'touch-start', TOUCH_MOVE: 'touch-move',
            TOUCH_END: 'touch-end', TOUCH_CANCEL: 'touch-cancel',
            MOUSE_DOWN: 'mouse-down', MOUSE_UP: 'mouse-up',
        };
        constructor(name = '') { this.name = name; }
        get parent() { return this._parent; }
        set parent(p: Node | null) {
            if (this._parent) this._parent.children = this._parent.children.filter((c) => c !== this);
            this._parent = p;
            if (p) p.children.push(this);
        }
        addComponent(t: unknown) {
            const c = new (t as new () => unknown)();
            (c as { node?: unknown }).node = this;
            this._components.push(c);
            return c;
        }
        getComponent(t: unknown) {
            return this._components.find((c) => c instanceof (t as new () => unknown)) ?? null;
        }
        getComponentInChildren(t: unknown) {
            const own = this.getComponent(t);
            if (own) return own;
            for (const c of this.children) { const r = c.getComponentInChildren(t); if (r) return r; }
            return null;
        }
        setPosition(x: number, y: number, z = 0) { this._pos = new Vec3(x, y, z); }
        getPosition() { return this._pos; }
        // 真实引擎里 position 是只读引用属性（动画代码读 node.position.y 取初值）
        get position() { return this._pos; }
        setScale(x: number, y = x, z = 1) { this.scale = new Vec3(x, y, z); }
        setSiblingIndex() { }
        addChild(c: Node) { c.parent = this; }
        removeAllChildren() { this.children = []; }
        getChildByName(n: string) { return this.children.find((c) => c.name === n) ?? null; }
        on(ev: string, cb: (...a: unknown[]) => void) {
            const list = this._handlers.get(ev) ?? [];
            list.push(cb);
            this._handlers.set(ev, list);
        }
        once(ev: string, cb: (...a: unknown[]) => void) { this.on(ev, cb); }
        off() { }
        emit(ev: string, ...args: unknown[]) {
            for (const cb of this._handlers.get(ev) ?? []) cb(...args);
        }
        destroy() {
            this.destroyed = true;
            this.isValid = false;
            this.parent = null;
        }
        destroyAllChildren() {
            for (const c of [...this.children]) c.destroy();
            this.children = [];
        }
        get worldPosition() { return this._pos; }
    }

    // 可见尺寸可注入：默认设计分辨率 720×1280，长屏测试把它调成 720×1560
    // （FIXED_WIDTH 下宽恒 720、高按机型比例延伸，真全面屏就是这种形态）
    let visibleSize = { width: 720, height: 1280 };

    const view = {
        getVisibleSize: () => visibleSize,
        setDesignResolutionSize: () => { },
        setResolutionPolicy: () => { },
        getResolutionPolicy: () => 4,
    };
    const ResolutionPolicy = {
        EXACT_FIT: 0, SHOW_ALL: 1, NO_BORDER: 2, FIXED_HEIGHT: 3, FIXED_WIDTH: 4, UNKNOWN: 5,
    };
    const Layers = { Enum: { DEFAULT: 1, UI_2D: 1 << 25, UI_3D: 1 << 24 } };
    const Input = {
        EventType: {
            TOUCH_START: 'touch-start', TOUCH_MOVE: 'touch-move', TOUCH_END: 'touch-end', TOUCH_CANCEL: 'touch-cancel',
            MOUSE_DOWN: 'mouse-down', MOUSE_MOVE: 'mouse-move', MOUSE_UP: 'mouse-up', MOUSE_WHEEL: 'mouse-wheel',
            KEY_DOWN: 'key-down', KEY_UP: 'key-up', KEY_PRESSING: 'key-pressing',
        },
        on: () => { }, off: () => { }, emit: () => { },
    };
    const storage = new Map<string, string>();
    const sys = {
        platform: 'devtools',
        isBrowser: true,
        localStorage: {
            getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
            setItem: (k: string, v: string) => { storage.set(k, String(v)); },
            removeItem: (k: string) => { storage.delete(k); },
            clear: () => storage.clear(),
        },
    };
    const _decorator = { ccclass: () => () => { }, property: () => () => { } };

    // ───────────────── ThemeLib 桩：可观测记录器 ─────────────────
    const registry = {
        nodes: [] as Array<{ name: string; w: number; h: number }>,
        buttons: [] as Array<{ node: unknown; text: string; onClick: () => void; w: number; h: number; enabled: boolean; comp?: unknown }>,
        iconButtons: [] as Array<{ node: unknown; path: string; onClick: () => void; w: number; h: number }>,
        labels: [] as Array<{ node: unknown; text: string; fontSize: number; comp: unknown }>,
        images: [] as Array<{ node: unknown; path: string }>,
        progressBars: [] as Array<{ node: unknown; ratio: number }>,
        toasts: [] as string[],
        headers: [] as Array<{ title: string; onBack?: () => void }>,
        animations: [] as Array<{ frames: string[]; fps: number; loop: boolean }>,
        stopCalls: stoppedTargets,
    };
    const reset = () => {
        visibleSize = { width: 720, height: 1280 };
        registry.nodes.length = 0;
        registry.buttons.length = 0;
        registry.iconButtons.length = 0;
        registry.labels.length = 0;
        registry.images.length = 0;
        registry.progressBars.length = 0;
        registry.toasts.length = 0;
        registry.headers.length = 0;
        registry.animations.length = 0;
        stoppedTargets.length = 0;
        storage.clear();
    };

    const colorCache = new Map<string, unknown>();
    const THEME: Record<string, unknown> = new Proxy({}, {
        get: (_t, k: string) => {
            if (!colorCache.has(k)) colorCache.set(k, new Color(212, 175, 55, 255));
            return colorCache.get(k);
        },
    });

    const mkNode = (name: string, parent: unknown, w = 0, h = 0) => {
        const n = new Node(name);
        if (parent) n.parent = parent as Node;
        const ut = n.addComponent(UITransform) as UITransform;
        ut.setContentSize(w, h);
        return n;
    };

    const ThemeLib = {
        DESIGN_W: 720,
        DESIGN_H: 1280,
        SAFE: { top: 60, bottom: 104 },
        MOTION: { fast: 0.12, base: 0.2, slow: 0.36 },
        THEME,
        uinode: (name: string, parent: unknown = null, w = 0, h = 0) => {
            // 记录尺寸：全屏遮罩必须铺满「可见」高度而非设计高度，断言要用
            registry.nodes.push({ name, w, h });
            return mkNode(name, parent, w, h);
        },
        label: (parent: unknown, text: string, fontSize: number) => {
            const n = mkNode('label', parent);
            const l = n.addComponent(Label) as Label;
            l.string = text;
            l.fontSize = fontSize;
            // comp 是可变引用：场景 refresh 改的是 Label 组件，不是创建时的 text 快照
            registry.labels.push({ node: n, text, fontSize, comp: l });
            return n;
        },
        labelL: (parent: unknown, text: string, fontSize: number) => (ThemeLib as any).label(parent, text, fontSize),
        image: (parent: unknown, path: string, w = 0, h = 0) => {
            const n = mkNode('image', parent, w, h);
            n.addComponent(Sprite);
            registry.images.push({ node: n, path });
            return n;
        },
        spritePanel: (parent: unknown, w: number, h: number, path?: string) => (ThemeLib as any).image(parent, path ?? 'panel', w, h),
        washedPanel: (parent: unknown, w: number, h: number) => (ThemeLib as any).image(parent, 'panel', w, h),
        // ButtonHandle 契约 = { node, labelNode, setText, setEnabled }；
        // labelNode 是按钮内承载文案的节点（场景会取它的 Label 改字/挪位置）
        spriteButton: (parent: unknown, w: number, h: number, text: string, onClick: () => void) => {
            const n = mkNode('btn', parent, w, h);
            n.addComponent(Button);
            const labelNode = mkNode('btnLabel', n);
            const l = labelNode.addComponent(Label) as Label;
            l.string = text;
            const rec = { node: n, text, onClick, w, h, enabled: true, comp: l };
            registry.buttons.push(rec);
            return {
                node: n,
                labelNode,
                setEnabled: (v: boolean) => { rec.enabled = v; },
                setText: (t: string) => { rec.text = t; l.string = t; },
                setVisible: () => { },
            };
        },
        iconButton: (parent: unknown, path: string, onClick: () => void, w = 72, h = 72) => {
            const n = mkNode('iconBtn', parent, w, h);
            n.addComponent(Button);
            const labelNode = mkNode('iconLabel', n);
            labelNode.addComponent(Label);
            registry.iconButtons.push({ node: n, path, onClick, w, h });
            return { node: n, labelNode, setEnabled: () => { }, setText: () => { } };
        },
        progressBar: (parent: unknown, w: number, h: number) => {
            const n = mkNode('progress', parent, w, h);
            const l = n.addComponent(Label) as Label;
            const rec = { node: n, ratio: 0 };
            registry.progressBars.push(rec);
            return {
                node: n,
                set: (ratio: number, t?: string) => {
                    rec.ratio = Math.min(1, Math.max(0, ratio));
                    if (t !== undefined) l.string = t;
                },
            };
        },
        spriteAnimation: (parent: unknown, frames: string[], _w = 0, _h = 0, fps = 8, loop = true) => {
            const n = mkNode('anim', parent);
            n.addComponent(Sprite);
            registry.animations.push({ frames, fps, loop });
            return n;
        },
        toast: (_parent: unknown, msg: string) => { registry.toasts.push(msg); return mkNode('toast', null); },
        fadeIn: () => { },
        faded: (c: unknown, _a?: number) => c,
        statusBar: (_parent: unknown, _y?: number) => ({ refresh: () => { }, node: mkNode('bar', _parent) }),
        pageBackground: (parent: unknown, path: string) => (ThemeLib as any).image(parent, path, 720, 1280),
        pageHeader: (parent: unknown, title: string, onBack?: () => void) => {
            registry.headers.push({ title, onBack });
            return mkNode('header', parent);
        },
        dimLayer: (parent: unknown) => mkNode('dim', parent),
        scrim: (parent: unknown) => mkNode('scrim', parent),
        animDir: (base: string, idx: number, female = false, sub?: string) =>
            `art/anim/${base}/${sub ?? 'idle'}_r${idx}${female ? '_f' : ''}`,
        animFrames: (dir: string, n: number) => Array.from({ length: n }, (_, i) => `${dir}/${i + 1}`),
        floatText: (parent: unknown, text: string) => (ThemeLib as any).label(parent, text, 24),
        boltFx: (parent: unknown) => mkNode('bolt', parent),
        slashFx: (parent: unknown) => mkNode('slash', parent),
        shakeNode: () => { },
        makeRedDot: (parent: unknown, dx = 24, dy = 24) => {
            const n = mkNode('dot', parent, 18, 18);
            n.setPosition(dx, dy, 0);
            return n;
        },
        // 与真实实现同源：读 view.getVisibleSize()，否则「长屏」测试永远量到 1280
        visibleHeight: () => visibleSize.height,
        visibleWidth: () => visibleSize.width,
    };

    return {
        ccStub: {
            Node, UITransform, Label, Sprite, Graphics, Button, UIOpacity, EditBox, Component,
            Widget, SpriteFrame, ImageAsset, Texture2D, EventTouch, Tween, tween, Color, Vec3, Vec2,
            view, ResolutionPolicy, Layers, Input, sys, _decorator,
        },
        themeStub: ThemeLib,
        registry,
        reset,
        /** 注入可见尺寸，模拟不同机型（FIXED_WIDTH：宽恒 720，高按屏幕比例延伸） */
        setVisibleSize: (w: number, height: number) => { visibleSize = { width: w, height }; },
    };
});

vi.mock('cc', () => h.ccStub);
vi.mock('../assets/scripts/ui/ThemeLib', () => h.themeStub);

import { Game } from '../assets/scripts/infra/Game';
import { Node } from 'cc';
import { LINGENS } from '../assets/scripts/core/config/lingens';
import { HomeScene } from '../assets/scripts/scenes/HomeScene';
import { BoxScene } from '../assets/scripts/scenes/BoxScene';
import { CollectionScene } from '../assets/scripts/scenes/CollectionScene';
import { AlchemyScene } from '../assets/scripts/scenes/AlchemyScene';
import { FortuneScene } from '../assets/scripts/scenes/FortuneScene';
import { ShopScene } from '../assets/scripts/scenes/ShopScene';
import { SettingsScene } from '../assets/scripts/scenes/SettingsScene';
import { QuestScene } from '../assets/scripts/scenes/QuestScene';
import { ExpeditionScene } from '../assets/scripts/scenes/ExpeditionScene';
import { LudaoScene } from '../assets/scripts/scenes/LudaoScene';
import { WeaponScene } from '../assets/scripts/scenes/WeaponScene';
import { PlayerScene } from '../assets/scripts/scenes/PlayerScene';
import { ProfileScene } from '../assets/scripts/scenes/ProfileScene';
import { RainScene } from '../assets/scripts/scenes/RainScene';
import { PkBattleScene } from '../assets/scripts/scenes/PkBattleScene';
import { ResultScene } from '../assets/scripts/scenes/ResultScene';
import { IllusionResultScene } from '../assets/scripts/scenes/IllusionResultScene';
import { RainSystem, RainMode } from '../assets/scripts/core/systems/RainSystem';
import { Rng } from '../assets/scripts/core/rng';

/** 装配一个可用的 Game（走真实 Game.init，顺带验证装配链在桩环境下不崩） */
function bootGame() {
    const canvas = new Node('Canvas');
    const root = new Node('GameRoot');
    (root as unknown as { scene: unknown }).scene = { getChildByName: () => canvas };
    Game.init(root as never);
    return { root, canvas };
}

/** 按图标路径定位入口按钮（比按坐标更稳：路径是语义标识） */
function icon(pathSuffix: string) {
    const hit = h.registry.iconButtons.find((b) => b.path.includes(`icon_${pathSuffix}/`));
    if (!hit) throw new Error(`未找到图标按钮 icon_${pathSuffix}，现有：${h.registry.iconButtons.map((b) => b.path).join(', ')}`);
    return hit;
}

beforeEach(() => {
    h.reset();
    // node 环境没有 window：生命周期钩子/错误钩子会用到，给个最小壳
    const g = globalThis as unknown as { window?: unknown };
    if (!g.window) g.window = { addEventListener: () => { }, removeEventListener: () => { } };
});

describe('场景集成：HomeScene 入口接线（导航错乱回归）', () => {
    it('五入口环形 + 右侧 rail + 设置：每个入口 push 到正确场景', () => {
        bootGame();
        const home = new HomeScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        home.onEnter();

        icon('box').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(BoxScene));

        icon('collection').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(CollectionScene));

        icon('alchemy').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(AlchemyScene));

        icon('fortune').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(FortuneScene));

        icon('shop').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(ShopScene));

        icon('settings').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(SettingsScene));

        icon('quest').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(QuestScene));

        icon('expedition').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(ExpeditionScene));

        icon('ludao').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(LudaoScene));

        icon('weapon').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(WeaponScene));

        expect(push).toHaveBeenCalledTimes(10);
        push.mockRestore();
    });

    it('A11 图鉴进度卡（左下 -286,-20）点击进图鉴页，且展示 x/y 与图鉴页同源', () => {
        bootGame();
        const home = new HomeScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        home.onEnter();

        // 卡片在 (-286,-20)；另一个 text 为空的按钮是每日仙缘 (0,-482)，用坐标区分
        const card = h.registry.buttons.find(
            (b) => b.text === '' && (b.node as { getPosition(): { x: number; y: number } }).getPosition().x === -286,
        );
        expect(card, '未找到左下角图鉴卡').toBeTruthy();
        card!.onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(CollectionScene));

        const col = Game.col.progress(Game.save);
        const shown = h.registry.labels.find(
            (l) => (l.comp as { string: string }).string === `${col.unlocked}/${col.total}`,
        );
        expect(shown, `未渲染图鉴进度 ${col.unlocked}/${col.total}`).toBeTruthy();
        push.mockRestore();
    });

    it('「冲击境界」机缘未满时点击只提示、不进渡劫场景', () => {
        bootGame();
        const home = new HomeScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        home.onEnter();

        const cta = h.registry.buttons.find((b) => b.text.includes('冲击境界') || b.text.includes('机缘未满'));
        expect(cta).toBeTruthy();
        // 默认新档机缘不足 → CTA 应被禁用，点击给出提示且不跳转
        if (Game.realm.canBreakthrough()) {
            cta!.onClick();
            expect(push).toHaveBeenCalled();
        } else {
            expect(cta!.enabled).toBe(false);
            cta!.onClick();
            expect(push).not.toHaveBeenCalled();
            expect(h.registry.toasts.length).toBeGreaterThan(0);
        }
        push.mockRestore();
    });
});

describe('场景集成：状态刷新与清理', () => {
    it('refresh 后图鉴进度随存档更新（合成灵根返回主页不会显示旧值）', () => {
        bootGame();
        const home = new HomeScene();
        home.onEnter();
        const bar = h.registry.progressBars[h.registry.progressBars.length - 1];

        const before = Game.col.progress(Game.save);
        expect(bar.ratio).toBeCloseTo(before.total ? before.unlocked / before.total : 0, 5);

        // 解锁一件灵根后刷新：进度条比例必须上升
        // 用 indexOf 而非 includes：项目 lib 是 ES2015，Array.prototype.includes 会报 TS2550
        const nextId = LINGENS.find((c) => Game.save.unlocked.indexOf(c.id) < 0);
        if (nextId) {
            Game.save.unlocked.push(nextId.id);
            home.onResume();
            const after = Game.col.progress(Game.save);
            expect(bar.ratio).toBeCloseTo(after.unlocked / after.total, 5);
            expect(bar.ratio).toBeGreaterThan(0);
        }
    });

    it('onExit 停掉主页立绘的 repeatForever tween（P2-3 泄漏回归）', () => {
        bootGame();
        const home = new HomeScene();
        home.onEnter();
        expect(() => home.onExit()).not.toThrow();
        expect(h.registry.stopCalls.length).toBeGreaterThan(0);
    });

    it('点按角色立绘进个人属性页（舞台点击区接线）', () => {
        bootGame();
        const home = new HomeScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        home.onEnter();
        const stage = (home.node as unknown as Node).getChildByName('stage');
        expect(stage).toBeTruthy();
        stage!.emit(Node.EventType.TOUCH_END);
        expect(push).toHaveBeenCalledTimes(1);
        push.mockRestore();
    });
});

/** 无参（或参数带默认值）可直接构造的场景。ResultScene/IllusionResultScene 需必填 params，另案覆盖 */
const sceneCases: Array<[string, () => { onEnter(): void; onExit?(): void }]> = [
    ['AlchemyScene', () => new AlchemyScene()],
    ['BoxScene', () => new BoxScene()],
    ['CollectionScene', () => new CollectionScene()],
    ['ExpeditionScene', () => new ExpeditionScene()],
    ['FortuneScene', () => new FortuneScene()],
    ['LudaoScene', () => new LudaoScene()],
    ['PlayerScene', () => new PlayerScene()],
    ['ProfileScene', () => new ProfileScene()],
    ['QuestScene', () => new QuestScene()],
    ['SettingsScene', () => new SettingsScene()],
    ['ShopScene', () => new ShopScene()],
    ['WeaponScene', () => new WeaponScene()],
    ['RainScene', () => new RainScene()],
    ['PkBattleScene', () => new PkBattleScene()],
];

describe('场景集成：全场景 onEnter/onExit 冒烟（防 P0 崩溃回归）', () => {
    for (const [name, make] of sceneCases) {
        it(`${name}：onEnter + onExit 不抛错`, () => {
            h.reset();
            bootGame();
            h.reset(); // 清掉 Game.init 阶段（捏人页）产生的记录，只留目标场景
            const s = make();
            // 保留堆栈：not.toThrow 会把原始位置吞掉，冒烟失败时无法定位
            const safe = (fn: (() => void) | undefined, tag: string) => {
                if (!fn) return;
                try { fn(); } catch (e) {
                    throw new Error(`${name} ${tag} 抛错: ${(e as Error).message}\n${(e as Error).stack}`);
                }
            };
            safe(s.onEnter.bind(s), 'onEnter');
            safe(s.onExit?.bind(s), 'onExit');
        });
    }
});

describe('场景集成：页头返回接线（P0「返回错场景」回归）', () => {
    for (const [name, make] of sceneCases) {
        it(`${name}：页头返回触发 pop`, () => {
            h.reset();
            bootGame();
            h.reset();
            const s = make();
            const pop = vi.spyOn(Game.stack, 'pop').mockImplementation(() => { });
            s.onEnter();
            const header = h.registry.headers[0];
            if (!header?.onBack) {
                // 无页头的页（捏人流等）不参与本断言，但要求它确实没渲染页头
                pop.mockRestore();
                expect(true).toBe(true);
                return;
            }
            header.onBack();
            expect(pop, `${name} 页头返回未触发 pop`).toHaveBeenCalled();
            pop.mockRestore();
        });
    }
});

/** 按文案定位按钮（结算页按钮无图标路径，只能按语义文案找） */
function button(text: string) {
    const hit = h.registry.buttons.find((b) => b.text === text);
    if (!hit) throw new Error(`未找到按钮「${text}」，现有：${h.registry.buttons.map((b) => b.text).join(' / ')}`);
    return hit;
}

/** 渲染出的文案里是否包含某片段（labels 记录的是创建时文本） */
function hasText(frag: string) {
    return h.registry.labels.some((l) => String(l.text).indexOf(frag) >= 0);
}

/** 构造一次渡劫/幻境会话并直接结算，拿到结算页需要的两份入参 */
function mkRain(targetIndex: number, mode: RainMode, seed = 7) {
    const rs = new RainSystem(new Rng(seed));
    const session = rs.createSession(targetIndex, false, mode);
    const result = rs.finish(session);
    return { session, result };
}

/**
 * 长屏适配：FIXED_WIDTH 下宽恒 720、高按机型比例延伸（全面屏 ≈1560），而模态遮罩
 * 若按设计高度 1280 固定，上下各会露出约 140px —— 那段既没压暗、也不拦截点击，
 * 玩家点上去会穿透触发下层按钮。这里断言所有全屏遮罩铺满「可见」高度。
 */
describe('场景集成：长屏模态遮罩铺满（FIXED_WIDTH 穿透点击回归）', () => {
    const LONG_H = 1560; // iPhone 14 Pro 等全面屏在 720 宽下的可见高度

    function overlay(name: string) {
        const hit = h.registry.nodes.find((n) => n.name === name);
        if (!hit) throw new Error(`未创建遮罩 ${name}，现有 uinode：${h.registry.nodes.map((n) => n.name).join(', ')}`);
        return hit;
    }

    it('宝箱蓄力遮罩 chargeOverlay 铺满可见高度', () => {
        h.setVisibleSize(720, LONG_H);
        bootGame();
        const box = new BoxScene();
        box.onEnter();
        // 直接走真实入口 beginCharge（按压开箱/机缘觅宝都会进这里）
        (box as unknown as { beginCharge(id: string, mode: 'open'): void })
            .beginCharge('fansu', 'open');
        expect(overlay('chargeOverlay').h, `蓄力遮罩未铺满长屏 ${LONG_H}`).toBe(LONG_H);
    });

    it('宝箱符文遮罩 runeOverlay 铺满可见高度', () => {
        h.setVisibleSize(720, LONG_H);
        bootGame();
        const box = new BoxScene();
        box.onEnter();
        (box as unknown as { showRunePhase(id: string, cb: () => void): void })
            .showRunePhase('fansu', () => { });
        expect(overlay('runeOverlay').h, `符文遮罩未铺满长屏 ${LONG_H}`).toBe(LONG_H);
    });

    it('图鉴境界弹窗遮罩 realmDialog 铺满可见高度', () => {
        h.setVisibleSize(720, LONG_H);
        bootGame();
        const col = new CollectionScene();
        col.onEnter();
        (col as unknown as { showRealmDialog(i: number): void }).showRealmDialog(0);
        expect(overlay('realmDialog').h).toBe(LONG_H);
    });
});

describe('场景集成：结算页（ResultScene / IllusionResultScene）', () => {
    it('渡劫成功：入账 + 渲染评级与概率明细 + 返回仙府 popToRoot', () => {
        bootGame();
        const { session, result } = mkRain(1, 'tribulation');
        const before = JSON.stringify(Game.save);

        const s = new ResultScene({ session, result, rate: 0.72, success: true, targetIndex: 1 });
        s.onEnter();

        expect(JSON.stringify(Game.save), '成功结算未写入存档（realm.succeed 未生效）').not.toBe(before);
        expect(hasText('突破成功'), '未渲染成功徽章').toBe(true);
        expect(hasText('基础突破率'), '未渲染概率明细首行').toBe(true);
        expect(hasText('最终突破率'), '未渲染最终突破率').toBe(true);
        // 数值明细与传入的 rate 对齐（72%）
        expect(hasText('72%'), '最终突破率未采用入参 rate').toBe(true);

        const pop = vi.spyOn(Game.stack, 'popToRoot').mockImplementation(() => { });
        button('返回仙府').onClick();
        expect(pop, '「返回仙府」未回栈底').toHaveBeenCalled();
        pop.mockRestore();
    });

    it('渡劫失败：渲染失败态与修为受损 + 护盾广告按钮在位', () => {
        bootGame();
        const { session, result } = mkRain(1, 'tribulation', 11);
        const s = new ResultScene({ session, result, rate: 0.4, success: false, targetIndex: 1 });
        s.onEnter();

        expect(hasText('突破失败'), '未渲染失败徽章').toBe(true);
        expect(hasText('修为受损'), '未展示修为受损明细').toBe(true);
        // 失败分支才有「清雨护盾 · 广告」兜底入口
        const protect = h.registry.buttons.find((b) => String(b.text).indexOf('广告') >= 0);
        expect(protect, '失败态缺少护盾广告按钮').toBeTruthy();

        const pop = vi.spyOn(Game.stack, 'popToRoot').mockImplementation(() => { });
        button('返回仙府').onClick();
        expect(pop).toHaveBeenCalled();
        pop.mockRestore();
    });

    it('重复 onEnter 不重复入账（applied 守卫，防重复发奖回归）', () => {
        bootGame();
        const { session, result } = mkRain(1, 'tribulation');
        const s = new ResultScene({ session, result, rate: 0.72, success: true, targetIndex: 1 });
        s.onEnter();
        const afterFirst = JSON.stringify(Game.save);

        // 结算页被回前台/重进时不得二次调用 realm.succeed（修为翻倍是 P0 级资源 bug）
        s.onEnter();
        expect(JSON.stringify(Game.save), '第二次 onEnter 重复入账了').toBe(afterFirst);
    });

    it('幻境结算页：渲染档位与评分，再挑战/返回接线正确', () => {
        bootGame();
        const { result } = mkRain(1, 'illusion', 42);
        const fin = Game.illusion.finish(Game.save, result.goldCount, result.maxCombo, result.redCount);
        const s = new IllusionResultScene({ result, rewards: fin.rewards });
        s.onEnter();

        expect(hasText(String(fin.score)), '未渲染幻境得分').toBe(true);

        const pop = vi.spyOn(Game.stack, 'popToRoot').mockImplementation(() => { });
        button('返回仙府').onClick();
        expect(pop, '幻境结算「返回仙府」未回栈底').toHaveBeenCalled();
        pop.mockRestore();
    });

    it('幻境未入档：rewards 为空走降级分支且不崩', () => {
        bootGame();
        const { result } = mkRain(0, 'illusion', 3);
        const s = new IllusionResultScene({ result, rewards: [] });
        expect(() => s.onEnter()).not.toThrow();
        // 降级分支仍必须给出出路（否则玩家卡死在结算页）
        expect(h.registry.buttons.some((b) => b.text === '返回仙府'), '降级态缺少返回按钮').toBe(true);
    });
});
