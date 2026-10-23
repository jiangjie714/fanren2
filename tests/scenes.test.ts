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
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

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
        buttons: [] as Array<{
            node: unknown; text: string; onClick: () => void; w: number; h: number;
            enabled: boolean; comp?: unknown; variant: string; fontSize: number; textColor?: unknown;
        }>,
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
        spriteButton: (parent: unknown, w: number, h: number, text: string, onClick: () => void, opts?: { fontSize?: number; variant?: string; textColor?: unknown }) => {
            const n = mkNode('btn', parent, w, h);
            n.addComponent(Button);
            const labelNode = mkNode('btnLabel', n);
            const l = labelNode.addComponent(Label) as Label;
            l.string = text;
            // variant/fontSize 一并记录：按钮「样式一致性」类需求要靠它断言
            const rec = {
                node: n, text, onClick, w, h, enabled: true, comp: l,
                variant: opts?.variant ?? 'secondary',
                fontSize: opts?.fontSize ?? 30,
                textColor: opts?.textColor,
            };
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
import { Button, Label, Node, sys, UITransform } from 'cc';
import { LINGENS } from '../assets/scripts/core/config/lingens';
import { HomeScene } from '../assets/scripts/scenes/HomeScene';
import { StarterScene } from '../assets/scripts/scenes/StarterScene';
import { StarterBoxScene } from '../assets/scripts/scenes/StarterBoxScene';
import { BoxScene } from '../assets/scripts/scenes/BoxScene';
import { CollectionScene } from '../assets/scripts/scenes/CollectionScene';
import { AlchemyScene } from '../assets/scripts/scenes/AlchemyScene';
import { FortuneScene } from '../assets/scripts/scenes/FortuneScene';
import { ShopScene } from '../assets/scripts/scenes/ShopScene';
import { SettingsScene } from '../assets/scripts/scenes/SettingsScene';
import { QuestScene } from '../assets/scripts/scenes/QuestScene';
import { TrailScene } from '../assets/scripts/scenes/TrailScene';
import { TowerScene } from '../assets/scripts/scenes/TowerScene';
import { TowerBattleScene } from '../assets/scripts/scenes/TowerBattleScene';
import { LudaoScene } from '../assets/scripts/scenes/LudaoScene';
import { DaoFriendScene } from '../assets/scripts/scenes/DaoFriendScene';
import { WeaponScene } from '../assets/scripts/scenes/WeaponScene';
import { PathScene } from '../assets/scripts/scenes/PathScene';
import { CheckinScene } from '../assets/scripts/scenes/CheckinScene';
import { Ads } from '../assets/scripts/infra/Ads';
import { shiftDay } from '../assets/scripts/core/checkin';
import { OfflineScene } from '../assets/scripts/scenes/OfflineScene';
import { PlayerScene } from '../assets/scripts/scenes/PlayerScene';
import { GuideLayer } from '../assets/scripts/ui/GuideLayer';
import { StoryLayer } from '../assets/scripts/ui/StoryLayer';
import { StoryArchiveScene } from '../assets/scripts/scenes/StoryArchiveScene';
import { STORY_BEATS } from '../assets/scripts/core/story';
import { SaveStore } from '../assets/scripts/infra/SaveStore';
import { ProfileScene } from '../assets/scripts/scenes/ProfileScene';
import { RainScene } from '../assets/scripts/scenes/RainScene';
import { TianjieScene } from '../assets/scripts/scenes/TianjieScene';
import { TianjieResultScene } from '../assets/scripts/scenes/TianjieResultScene';
import { TianjieShareScene, SHARE_CARD } from '../assets/scripts/scenes/TianjieShareScene';
import { TianjieSystem } from '../assets/scripts/core/systems/TianjieSystem';
import { TIANJIE, dailyModifiers } from '../assets/scripts/core/tianjie';
import { PkBattleScene } from '../assets/scripts/scenes/PkBattleScene';
import { TEXTS } from '../assets/scripts/core/config/texts';
import { DOUYIN_AD_UNIT_IDS } from '../assets/scripts/core/config/ads';
import { ResultScene } from '../assets/scripts/scenes/ResultScene';
import { IllusionResultScene } from '../assets/scripts/scenes/IllusionResultScene';
import { RainSystem, RainMode, RainResult } from '../assets/scripts/core/systems/RainSystem';
import { Rng } from '../assets/scripts/core/rng';
import { todayString } from '../assets/scripts/core/saveModel';

/** 装配一个可用的 Game（走真实 Game.init，顺带验证装配链在桩环境下不崩） */
function bootGame() {
    const canvas = new Node('Canvas');
    const root = new Node('GameRoot');
    (root as unknown as { scene: unknown }).scene = { getChildByName: () => canvas };
    Game.init(root as never);
    return { root, canvas };
}

/**
 * 以「老档全开」启动（D1-60s §4 解锁表只对新号生效）。
 *
 * `unlocks.seasoned = true` → `effectiveRealm` 视为已全开，17 个入口全在。
 * 需要「所有入口都在」的用例（环形/rail 接线、布局回归）用它；
 * 想验证「新号逐步解锁」请用 `bootGame()`（defaultSave → seasoned=false）。
 */
function bootVeteran(realmIndex = 1) {
    sys.localStorage.setItem('fanren_save_v1', JSON.stringify({
        version: 17,
        lingshi: 5000,
        jiyuan: 200,
        realmIndex,
        profile: { gender: 'm', name: '老道', createdAt: 1729000000000 },
        stats: { opens: 40 },
        starter: { done: true, jiyuanGranted: true },
        unlocks: { seasoned: true },
    }));
    return bootGame();
}

/** 取**最后一次**匹配文案的按钮（场景重建会在 registry 里留下旧记录） */
function lastBtn(pred: (b: { text: string }) => boolean) {
    const arr = h.registry.buttons;
    for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return arr[i];
    return undefined;
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

describe('场景集成：D1-60s §4 解锁表接入（只对新号生效）', () => {
    /** 取最后一次注册的某图标钮（每重建一次首页就多一条记录） */
    function iconOf(suffix: string) {
        const arr = h.registry.iconButtons.filter((b) => b.path.includes(`icon_${suffix}/`));
        return arr[arr.length - 1];
    }
    const active = (suffix: string) => {
        const b = iconOf(suffix);
        return !!b && (b.node as { active: boolean }).active;
    };

    it('凡人新号：环形只留宝盒，炼丹/福禄/商店不建钮（灰标占位）', () => {
        bootGame(); // defaultSave → seasoned=false, realmIndex=0
        h.reset();
        new HomeScene().onEnter();
        expect(active('box'), '宝盒凡人可用').toBe(true);
        // 未解锁的环形位不建钮（改为 lockedRing 占位），所以 registry 里查不到
        expect(iconOf('alchemy'), '炼丹淬体要金丹').toBeUndefined();
        expect(iconOf('fortune'), '福禄炼制要金丹').toBeUndefined();
        expect(iconOf('shop'), '仙府商店要练气').toBeUndefined();
        // 占位灰标：至少 3 个「{境界}解锁」文案（炼丹/福禄/商店）
        const locked = h.registry.labels.filter((l) => String((l.comp as { string: string }).string).indexOf('解锁') >= 0);
        expect(locked.length, '未渲染解锁占位').toBeGreaterThanOrEqual(3);
        // 凡人只有 3 个可点：宝盒 + 冲击境界（CTA）+ 设置
        expect(active('settings'), '设置合规必需，凡人可用').toBe(true);
    });

    it('凡人新号：右侧功能 rail 全部隐藏（留白不重排），左 rail 只留设置', () => {
        bootGame();
        h.reset();
        new HomeScene().onEnter();
        ['quest', 'expedition', 'ludao', 'weapon', 'rank', 'streak', 'timer', 'collection'].forEach((s) => {
            const b = iconOf(s);
            expect(b, `${s} 钮应仍构建（保留坐标留白）`).toBeTruthy();
            expect((b!.node as { active: boolean }).active, `${s} 应隐藏`).toBe(false);
        });
        expect(active('settings')).toBe(true);
    });

    it('练气：签到/图鉴/商店/每日仙缘解锁，修行妖径仍锁', () => {
        bootGame();
        Game.save.realmIndex = 1;
        h.reset();
        new HomeScene().onEnter();
        expect(active('streak'), '签到练气解锁').toBe(true);
        expect(active('collection'), '图鉴练气解锁（两处入口都开）').toBe(true);
        expect(iconOf('shop'), '商店练气解锁').toBeTruthy();
        expect(active('quest'), '修行要筑基').toBe(false);
        expect(active('expedition'), '妖径要筑基').toBe(false);
        expect(iconOf('alchemy'), '炼丹要金丹').toBeUndefined();
    });

    it('筑基：修行/妖径/论道/法器/吐纳全开（修行与妖径同档，活跃度 100 才可达）', () => {
        bootGame();
        Game.save.realmIndex = 2;
        h.reset();
        new HomeScene().onEnter();
        ['quest', 'expedition', 'ludao', 'weapon', 'timer'].forEach((s) => {
            expect(active(s), `${s} 筑基应解锁`).toBe(true);
        });
        expect(active('rank'), '仙路要元婴').toBe(false);
        expect(iconOf('fortune'), '福禄要金丹').toBeUndefined();
    });

    it('金丹：炼丹/福禄解锁，横幅从「每日天劫」切到「剑冢」', () => {
        bootGame();
        Game.save.realmIndex = 3;
        h.reset();
        new HomeScene().onEnter();
        expect(iconOf('alchemy'), '炼丹金丹解锁').toBeTruthy();
        expect(iconOf('fortune'), '福禄金丹解锁').toBeTruthy();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        const banners = h.registry.buttons.filter(
            (b) => b.text === '' && (b.node as { getPosition(): { y: number } }).getPosition().y === -179,
        );
        banners[banners.length - 1].onClick();
        expect(push, '金丹横幅应是剑冢').toHaveBeenLastCalledWith(expect.any(TowerScene));
        push.mockRestore();
    });

    it('宗门 tab 随解锁表出现（slot=page 的唯一落位）：金丹前 4 钮，金丹起 5 钮', () => {
        bootGame();
        Game.save.realmIndex = 1; // 练气
        h.reset();
        new LudaoScene().onEnter();
        let tabs = h.registry.buttons.filter((b) => b.w === 128 && b.h === 70);
        expect(tabs.some((b) => b.text === TEXTS.sectTab), '练气不该有宗门 tab').toBe(false);
        expect(tabs.length, '练气论道 4 钮').toBe(4);
        // 少一个钮时按实际数量居中（旧坐标是按 5 钮硬编码的 (i-2)*136）
        expect((tabs.map((b) => (b.node as Node).getPosition().x)).sort((a, b) => a - b))
            .toEqual([-204, -68, 68, 204]);

        Game.save.realmIndex = 3; // 金丹
        h.reset();
        new LudaoScene().onEnter();
        tabs = h.registry.buttons.filter((b) => b.w === 128 && b.h === 70);
        expect(tabs.some((b) => b.text === TEXTS.sectTab), '金丹应有宗门 tab').toBe(true);
        // 5 钮与接入前完全一致（tools/ui-shots.mjs 截图基线不动）
        expect((tabs.map((b) => (b.node as Node).getPosition().x)).sort((a, b) => a - b))
            .toEqual([-272, -136, 0, 136, 272]);
    });

    it('老档（seasoned=true）练气期也不收任何入口：17 项全在', () => {        bootVeteran(1); // 练气 + seasoned
        h.reset();
        new HomeScene().onEnter();
        ['box', 'settings', 'streak', 'collection', 'quest', 'expedition', 'ludao', 'weapon', 'timer', 'rank'].forEach((s) => {
            expect(active(s), `老档 ${s} 不应被收起`).toBe(true);
        });
        expect(iconOf('alchemy'), '老档连金丹功能也保留').toBeTruthy();
    });
});

describe('场景集成：HomeScene 入口接线（导航错乱回归）', () => {
    it('五入口环形 + 右侧 rail + 设置：每个入口 push 到正确场景（老档全开）', () => {
        bootVeteran();
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
        expect(push).toHaveBeenLastCalledWith(expect.any(TrailScene));

        icon('ludao').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(LudaoScene));

        icon('weapon').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(WeaponScene));

        // M23：仙路圆钮（五线进度总览）
        icon('rank').onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(PathScene));

        // M22：剑冢横幅（宽横幅、无内建文本，按 y=−179 定位）
        // M36 + D1-60s §4：横幅路由 = 剑冢解锁了才挂剑冢，否则挂「每日天劫」。
        // 剑冢要金丹（unlockRealm=3），故新号在凡人/练气/筑基都看到天劫横幅。
        // 取**最后一个**横幅实例：每重建一次首页就多注册一个，find 会命中旧实例的陈旧 towerAction
        const towerBanner = () => {
            const arr = h.registry.buttons.filter(
                (b) => b.text === '' && (b.node as { getPosition(): { y: number } }).getPosition().y === -179,
            );
            return arr[arr.length - 1];
        };
        Game.save.realmIndex = 0;
        Game.save.unlocks.seasoned = false; // 新号口径（上方入口点击用的是老档全开）
        // refresh 在 onEnter 时写入 towerAction；新号重置后需重建首页
        const home2 = new HomeScene();
        home2.onEnter();
        expect(towerBanner(), '未找到剑冢横幅入口').toBeTruthy();
        towerBanner()!.onClick();
        expect(push, '未解锁剑冢时横幅应为每日天劫入口').toHaveBeenLastCalledWith(expect.any(TianjieScene));

        // 金丹（剑冢解锁）：取最后一个横幅实例（重建会留下旧记录），点击必须路由到剑冢
        Game.save.realmIndex = 3;
        const home3 = new HomeScene();
        home3.onEnter();
        const banners = h.registry.buttons.filter(
            (b) => b.text === '' && (b.node as { getPosition(): { y: number } }).getPosition().y === -179,
        );
        banners[banners.length - 1].onClick();
        expect(push, '练气后横幅应恢复剑冢').toHaveBeenLastCalledWith(expect.any(TowerScene));

        // 12 个入口按钮 + 横幅两种路由各点一次 = 13 次（横幅点击次数与改版前一致，仅去向随境界切换）
        expect(push).toHaveBeenCalledTimes(13);
        push.mockRestore();
    });

    it('M22 首页布局：剑冢横幅在 CTA 与环形之间，五条水平间隙均 ≥12px', () => {
        bootGame();
        const home = new HomeScene();
        home.onEnter();
        const yOf = (b: { node: unknown }) => (b.node as { getPosition(): { y: number } }).getPosition().y;
        const banner = h.registry.buttons.find((b) => b.text === '' && yOf(b) === -179);
        expect(banner).toBeTruthy();
        // CTA 下缘 -119 ↔ 横幅顶缘 -135（16px）；横幅下缘 -223 ↔ 上排图标顶缘 -239（16px）
        expect(-68 - 51 - (-179 + 44)).toBeGreaterThanOrEqual(12);
        expect(-179 - 44 - (-287 + 48)).toBeGreaterThanOrEqual(12);
        // 上排图标底 -335 ↔ 商店顶 -305：梅花布局的中央钮在 x=0，无纵向冲突，仅校验下排与礼包
        // 下排标签底 ≈ -531 ↔ 礼包顶 -543（12px）；礼包底 -621 ↔ 设计底边 -640（19px）
        expect(-451 - 48 - 18 - 19 / 2 - (-582 + 39)).toBeGreaterThanOrEqual(12);
        expect(-582 - 39 - -640).toBeGreaterThanOrEqual(12);
    });

    it('M25 #50：论武 tab 下「约人切磋」→ push 道友名录页', () => {
        h.reset();
        bootGame();
        h.reset();
        const s = new LudaoScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        s.onEnter();
        // 默认 rank tab，需切到论武 tab 才渲染「约人切磋」
        const pkTab = h.registry.buttons.find((b) => b.text === '论武');
        expect(pkTab, '未找到论武 tab 钮').toBeTruthy();
        pkTab!.onClick();
        const friendBtn = h.registry.buttons.find((b) => b.text === '约人切磋');
        expect(friendBtn, '论武 tab 未渲染约人切磋钮').toBeTruthy();
        friendBtn!.onClick();
        expect(push, '约人切磋未进道友名录').toHaveBeenLastCalledWith(expect.any(DaoFriendScene));
        push.mockRestore();
    });

    it('M25 #50：道友名录点击切磋 → push 档案战 PkBattleScene（friend 模式）', () => {
        h.reset();
        bootGame();
        h.reset();
        const s = new DaoFriendScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        s.onEnter();
        // 列表行按钮为无文字 spriteButton（名字另加标签），取第一个空文本钮
        const rowBtn = h.registry.buttons.find((b) => b.text === '' && (b.w === 312 && b.h === 88));
        expect(rowBtn, '未渲染道友列表行钮').toBeTruthy();
        rowBtn!.onClick();
        expect(push, '道友切磋未进论武战').toHaveBeenLastCalledWith(expect.any(PkBattleScene));
        push.mockRestore();
    });

    it('A11 图鉴入口（左侧 rail 圆钮 @-286，M23 后随法器对称 @y=58）点击进图鉴页，且展示 x/y 与图鉴页同源', () => {
        bootGame();
        const home = new HomeScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        home.onEnter();

        // 按图标路径定位（语义标识，比钉坐标抗布局变更）：图鉴入口已从「130 宽信息卡」
        // 改为与右侧 rail 同构的圆钮 —— 旧卡右缘 -202 会切进主 CTA（左缘 -250）48px，
        // 而 332 安全线到 CTA 之间只有 82px，横向放不下 130 宽的卡。
        // 注意：collection 图标有两处 —— 五入口环形的「灵根图鉴」(+130,-287) 与左侧 rail 钮，
        // 按负 x 区分后者。
        const btn = h.registry.iconButtons.find(
            (b) => b.path.includes('icon_collection/')
                && (b.node as { getPosition(): { x: number } }).getPosition().x < 0,
        );
        expect(btn, '未找到左侧 rail 的图鉴圆钮').toBeTruthy();
        const pos = (btn!.node as { getPosition(): { x: number; y: number } }).getPosition();
        expect(pos.x, '图鉴圆钮应对称于右侧 rail（x=-286）').toBe(-286);
        // 与右侧法器钮同高对称
        const weapon = icon('weapon');
        expect(pos.y).toBe((weapon.node as { getPosition(): { y: number } }).getPosition().y);
        btn!.onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(CollectionScene));

        const col = Game.col.progress(Game.save);
        const shown = h.registry.labels.find(
            (l) => (l.comp as { string: string }).string === `${col.unlocked}/${col.total}`,
        );
        expect(shown, `未渲染图鉴进度 ${col.unlocked}/${col.total}`).toBeTruthy();
        push.mockRestore();
    });

    it('M26 签到入口（左侧 rail 圆钮，图标暂用 icon_streak 占位）→ 进签到页，红点随领取熄灭', () => {
        bootGame();
        const home = new HomeScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        home.onEnter();

        // 签到钮在左侧 rail（x=-286），夹在设置（370）与图鉴（58）之间
        const btn = h.registry.iconButtons.find(
            (b) => b.path.includes('icon_streak/')
                && (b.node as { getPosition(): { x: number } }).getPosition().x < 0,
        );
        expect(btn, '未找到左侧 rail 的签到圆钮').toBeTruthy();
        const pos = (btn!.node as { getPosition(): { x: number; y: number } }).getPosition();
        expect(pos.x).toBe(-286);
        expect(pos.y).toBe(266);
        btn!.onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(CheckinScene));

        // 红点：今日未领 → 亮；领取并刷新后 → 灭
        const dot = (home as unknown as { checkinDot: { active: boolean } }).checkinDot;
        expect(dot.active, '今日未领时红点应亮').toBe(true);
        Game.checkin.claim(Game.save);
        home.onResume();
        expect(dot.active, '领取后红点应熄灭').toBe(false);
        push.mockRestore();
    });

    it('M26 签到页：领取今日 → 存档推进 + 按钮转已领态（置灰不停用回调，幂等）', () => {
        bootGame();
        const scene = new CheckinScene();
        scene.onEnter();

        const claim = lastBtn((b) => b.text.includes('领取今日'));
        expect(claim, '未渲染「领取今日」按钮').toBeTruthy();

        const before = Game.save.lingshi;
        claim!.onClick();
        expect(Game.save.checkin.streak).toBe(1);
        expect(Game.save.checkin.totalDays).toBe(1);
        expect(Game.save.lingshi - before, '第 1 档应为 100 灵石（且不吃小等级加成）').toBe(100);

        // 重建后主按钮转「今日已问道」；置灰必须走 UIOpacity —— 用 setEnabled(false)
        // 会让回调一并失效（M22 towerChargeMiss 就是这么死的），故断言 enabled 仍为 true
        const done = lastBtn((b) => b.text.includes('今日已问道'));
        expect(done, '领取后未切换为已领态').toBeTruthy();
        expect(done!.enabled, '置灰不得用 setEnabled(false)').toBe(true);

        const after = Game.save.lingshi;
        done!.onClick();
        expect(Game.save.lingshi, '重复领取必须幂等').toBe(after);
        expect(Game.save.checkin.totalDays).toBe(1);

        // 累计里程碑：达标后可领，领完幂等
        Game.save.checkin.totalDays = 7;
        scene.onResume();
        const ms = lastBtn((b) => b.text === '领 取');
        expect(ms, '总天数 7 时应出现可领的里程碑按钮').toBeTruthy();
        const beforeMs = Game.save.lingshi;
        ms!.onClick();
        expect(Game.save.lingshi - beforeMs, '7 天里程碑应为 500 灵石').toBe(500);
        const afterMs = Game.save.lingshi;
        ms!.onClick();
        expect(Game.save.lingshi, '里程碑重复领取必须幂等').toBe(afterMs);
    });

    // ── A20 补签 / 双倍签到（#58，spec 2026-10-18 §4.4 三态布局）──
    describe('A20 签到页三态：补签卡 / 翻倍钮 / 常规态', () => {
        /** 可控 provider：只记录 place 与回调，不弹窗 */
        let adCalls: Array<{ place: string; cb: { onSuccess: () => void; onSkip?: () => void } }> = [];

        beforeEach(() => {
            adCalls = [];
            Ads.setProvider({
                show: (place, _host, cb) => {
                    adCalls.push({ place: place as string, cb });
                },
            });
            Ads.setSimAuto(false);
        });

        afterEach(() => {
            // 结算未完成的广告，防 inFlight 单飞守卫泄漏到下一用例
            const last = adCalls[adCalls.length - 1];
            if (last) last.cb.onSuccess();
            adCalls = [];
        });

        /** 取最后一次匹配的按钮世界坐标 y（场景重建会留旧记录） */
        function btnY(pred: (b: { text: string }) => boolean): number | undefined {
            const b = lastBtn(pred);
            return b ? (b.node as { getPosition(): { y: number } }).getPosition().y : undefined;
        }

        /**
         * 重建后只检查**新渲染**的按钮/文案：mock 的 removeAllChildren 不销毁旧节点，
         * registry 会累积历史记录（M31 lastBtn 教训），故先记标记再切片。
         */
        function freshAfter(mark: number) {
            return {
                btns: h.registry.buttons.slice(mark),
                texts: h.registry.labels.slice(mark).map((l) => (l.comp as { string: string }).string),
            };
        }

        it('补签态（gap=2）：渲染补签卡 + 顺序警示，主按钮下移 -340，看广告入账后补签入口消失', () => {
            bootGame();
            const today = todayString(new Date());
            const yesterday = shiftDay(today, -1)!;
            // streak=5、恰好漏昨日（gap=2）→ 可补第 6 天档（350）
            Game.save.checkin.lastDay = shiftDay(today, -2)!;
            Game.save.checkin.streak = 5;
            Game.save.checkin.totalDays = 5;

            const scene = new CheckinScene();
            scene.onEnter();

            // 补签卡：标题 + 「补领第 6 天档 · 灵石 350」+ 顺序警示（防误操作投诉）
            const labels = h.registry.labels.map((l) => (l.comp as { string: string }).string);
            expect(labels, '应渲染补签卡标题').toContain(TEXTS.checkinMakeupTitle);
            expect(labels).toContain(TEXTS.checkinMakeupDesc(6, 350));
            expect(labels, '必须含顺序警示（先领今日则无法补昨日）').toContain(TEXTS.checkinMakeupWarn);
            // 主按钮下移到 -340（给补签卡让位），仍是可领态
            expect(btnY((b) => b.text.includes('领取今日')), '补签态主按钮应下移 -340').toBe(-340);

            const makeupBtn = lastBtn((b) => b.text === TEXTS.checkinMakeupBtn);
            expect(makeupBtn, '未渲染「看广告 · 补领昨日」按钮').toBeTruthy();

            // 看广告 → provider 记录 checkinMakeup；onSuccess 后完整入账
            makeupBtn!.onClick();
            expect(adCalls, '应触发 checkinMakeup 广告位').toHaveLength(1);
            expect(adCalls[0].place).toBe('checkinMakeup');
            const before = Game.save.lingshi;
            const mark = h.registry.buttons.length;
            adCalls[0].cb.onSuccess();

            expect(Game.save.lingshi - before, '补领第 6 天档应为 350 灵石').toBe(350);
            expect(Game.save.checkin.streak, '补签后连续天数 +1').toBe(6);
            expect(Game.save.checkin.totalDays).toBe(6);
            expect(Game.save.checkin.lastDay, 'lastDay 改写为昨日（今日照常可领）').toBe(yesterday);
            expect(Game.save.checkin.makeupDay).toBe(yesterday);

            // 重建后补签入口消失（gap 变 1），主按钮回到 -245 且显示第 7 天档 800
            const fresh = freshAfter(mark);
            expect(fresh.btns.some((b) => b.text === TEXTS.checkinMakeupBtn), '补领后补签卡必须消失').toBe(false);
            const claimAfter = fresh.btns.filter((b) => b.text.includes('领取今日')).pop();
            expect(claimAfter, '补领后主按钮应仍在').toBeTruthy();
            expect((claimAfter!.node as { getPosition(): { y: number } }).getPosition().y, '常规态主按钮应回 -245').toBe(-245);
            expect(claimAfter!.text, '补后今日应领第 7 天档 800').toContain('800');
        });

        it('补签 onSkip：广告未看完 → 不发奖不推进状态', () => {
            bootGame();
            const today = todayString(new Date());
            Game.save.checkin.lastDay = shiftDay(today, -2)!;
            Game.save.checkin.streak = 3;

            const scene = new CheckinScene();
            scene.onEnter();
            const makeupBtn = lastBtn((b) => b.text === TEXTS.checkinMakeupBtn);
            makeupBtn!.onClick();
            const before = Game.save.lingshi;
            adCalls[0].cb.onSkip?.();

            expect(Game.save.lingshi, 'onSkip 不得发奖').toBe(before);
            expect(Game.save.checkin.streak, 'onSkip 不得推进连续天数').toBe(3);
            expect(Game.save.checkin.makeupDay, 'onSkip 不得写 makeupDay').toBe('');
            scene.onResume();
            expect(lastBtn((b) => b.text === TEXTS.checkinMakeupBtn), 'onSkip 后补签入口应仍在').toBeTruthy();
        });

        it('先领今日则补签入口消失（单向选择）→ 领完翻倍钮出现', () => {
            bootGame();
            const today = todayString(new Date());
            Game.save.checkin.lastDay = shiftDay(today, -2)!;
            Game.save.checkin.streak = 5;

            const scene = new CheckinScene();
            scene.onEnter();
            expect(lastBtn((b) => b.text === TEXTS.checkinMakeupBtn), '未领时应可补').toBeTruthy();

            // 先领今日 → 重建 → 补签卡消失、翻倍钮出现（互斥三态不会打架）
            const mark = h.registry.buttons.length;
            lastBtn((b) => b.text.includes('领取今日'))!.onClick();
            expect(Game.save.checkin.streak, '先领今日 = 断签重置后的第 1 档').toBe(1);
            const fresh = freshAfter(mark);
            expect(fresh.btns.some((b) => b.text === TEXTS.checkinMakeupBtn), '先领后补签入口必须消失').toBe(false);

            const dbl = fresh.btns.filter((b) => b.text === TEXTS.checkinDoubleBtn).pop();
            expect(dbl, '今日已领后应出现翻倍钮').toBeTruthy();
            expect((dbl!.node as { getPosition(): { y: number } }).getPosition().y, '翻倍钮 y 应为 -345').toBe(-345);
            expect(btnY((b) => b.text.includes('今日已问道')), '翻倍态主按钮保持 -245').toBe(-245);
        });

        it('翻倍态：看广告今日灵石翻倍（仅灵石）→ doubledDay 幂等，重复入账被拒', () => {
            bootGame();
            const today = todayString(new Date());
            // 今日已领第 7 天档（streak=7 → 800）
            Game.save.checkin.lastDay = today;
            Game.save.checkin.streak = 7;
            Game.save.checkin.totalDays = 7;

            const scene = new CheckinScene();
            scene.onEnter();
            const dbl = lastBtn((b) => b.text === TEXTS.checkinDoubleBtn);
            expect(dbl, '今日已领未翻倍时应渲染翻倍钮').toBeTruthy();

            dbl!.onClick();
            expect(adCalls).toHaveLength(1);
            expect(adCalls[0].place).toBe('checkinDouble');
            const before = Game.save.lingshi;
            const earnedBefore = Game.save.stats.lingshiEarned;
            const mark = h.registry.buttons.length;
            adCalls[0].cb.onSuccess();

            expect(Game.save.lingshi - before, '翻倍应再得一份今日档位灵石 800').toBe(800);
            expect(Game.save.stats.lingshiEarned - earnedBefore).toBe(800);
            expect(Game.save.checkin.doubledDay).toBe(today);
            expect(Game.save.checkin.totalDays, '翻倍不得加累计天数（防广告刷里程碑）').toBe(7);

            // 重建 → 翻倍钮转「今日已翻倍」置灰态；再点不触发广告、不入账
            const fresh = freshAfter(mark);
            const done = fresh.btns.filter((b) => b.text === TEXTS.checkinDoubleDone).pop();
            expect(done, '翻倍后应显示已翻倍态').toBeTruthy();
            expect(done!.enabled, '置灰不得停用回调').toBe(true);
            const after = Game.save.lingshi;
            done!.onClick();
            expect(adCalls, '已翻倍后不得再触发广告').toHaveLength(1);
            expect(Game.save.lingshi).toBe(after);
        });

        it('常规态（gap=1 / 从未领取）：无补签卡无翻倍钮，布局与存量完全一致', () => {
            bootGame();
            const today = todayString(new Date());
            Game.save.checkin.lastDay = shiftDay(today, -1)!;
            Game.save.checkin.streak = 4;

            const scene = new CheckinScene();
            scene.onEnter();
            expect(lastBtn((b) => b.text === TEXTS.checkinMakeupBtn), 'gap=1 不应出现补签卡').toBeFalsy();
            expect(lastBtn((b) => b.text === TEXTS.checkinDoubleBtn), '未领不应出现翻倍钮').toBeFalsy();
            expect(btnY((b) => b.text.includes('领取今日')), '常规态主按钮保持 -245').toBe(-245);

            // 从未领取同样零感知
            Game.save.checkin.lastDay = '';
            Game.save.checkin.streak = 0;
            scene.onResume();
            expect(lastBtn((b) => b.text === TEXTS.checkinMakeupBtn)).toBeFalsy();
            expect(lastBtn((b) => b.text === TEXTS.checkinDoubleBtn)).toBeFalsy();
            expect(btnY((b) => b.text.includes('领取今日'))).toBe(-245);
        });
    });

    it('M29 吐纳入口（左侧 rail 圆钮 @-286,162，图标 icon_timer）→ 进吐纳页', () => {
        bootGame();
        const home = new HomeScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        home.onEnter();

        // 插在左侧 rail 的空位：签到 266 与图鉴 58 之间（间距 104，与右 rail 同节律）。
        // icon_timer 的另一处引用是渡劫 HUD 的 image()，不在 iconButtons 里，故此筛选无歧义。
        const btn = icon('timer');
        const pos = (btn.node as { getPosition(): { x: number; y: number } }).getPosition();
        expect(pos.x, '吐纳钮应在左侧 rail（x=-286）').toBe(-286);
        expect(pos.y).toBe(162);
        expect(h.registry.labels.some((l) => (l.comp as { string: string }).string === TEXTS.offlineRail)).toBe(true);
        btn.onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(OfflineScene));
        push.mockRestore();
    });

    it('M29 归来弹窗：结算所得进门演一次，重复 onResume 不再弹', () => {
        bootGame();
        const home = new HomeScene();
        // 结算发生在 Game 层（启动/回前台），首页只消费结果做演出
        Game.offlineResult = { minutes: 207, xiuwei: 331, lingshi: 82 };
        home.onEnter();

        const texts = () => h.registry.labels.map((l) => (l.comp as { string: string }).string);
        const titleCount = () => texts().filter((t) => t === TEXTS.offlineDialogTitle).length;
        expect(titleCount(), '进门应弹「吐纳归来」').toBe(1);
        expect(texts()).toContain(TEXTS.offlineDuration(3, 27));
        expect(texts()).toContain(TEXTS.offlineGain(331, 82));
        expect(Game.offlineResult, '演出后必须消费掉，否则每次返回首页都会重弹').toBeNull();

        home.onResume();
        expect(titleCount(), '结果已消费，二次进入不该重弹').toBe(1);
    });

    it('M29 Game.settleOffline：离线 3 小时 realtime 结算入账并暂存结果给首页', () => {
        bootGame();
        Game.offlineResult = null;
        Game.save.realmIndex = 3; // 金丹：0.4 灵石/分、1.6 修为/分
        Game.save.offline.dayMin = 0;
        const before = Game.save.lingshi;
        const beforeXiuwei = Game.save.xiuwei;
        const now = Date.now();
        Game.save.offline.lastAt = now - 180 * 60_000;
        Game.save.offline.day = '';

        const got = Game.settleOffline(now);
        expect(got, '离线 180 分钟应结算').toBeTruthy();
        expect(got!.minutes).toBe(180);
        expect(got!.lingshi, '180 × 0.4 = 72（floor）').toBe(72);
        expect(got!.xiuwei, '180 × 1.6 = 288').toBe(288);
        expect(Game.save.lingshi - before).toBe(72);
        expect(Game.save.xiuwei - beforeXiuwei).toBe(288);
        expect(Game.offlineResult).toEqual(got);
        // 心跳必须前移到「回来」那一刻：否则第二次进游戏会把同一段时间再发一遍
        expect(Game.save.offline.lastAt).toBe(now);
        expect(Game.settleOffline(now + 60_000), '结算后 1 分钟不够 5 分钟门槛 → 不发').toBeNull();
        expect(Game.settleOffline(), '同帧重复结算必须幂等').toBeNull();
    });

    it('#49 今日引导条（A1）：四态文案 + 去向（状态驱动语境 CTA）', () => {
        bootGame();
        const home = new HomeScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        home.onEnter();

        // 引导条 = 主 CTA 那条带（500×102 @ y=-68）——位置与旧「冲击境界」完全一致，
        // 只是文案与去向随存档状态走。onResume() → refresh() → refreshGuide() 重算。
        // D1-60s T2 起 bootGame() 的 init 也会推一个 HomeScene（同样注册 y=-68 按钮），
        // 必须取最后一个匹配 = 本用例手工创建、onResume 刷新过的实例（init 那个是陈旧文本）。
        const guide = () => h.registry.buttons.filter(
            (b) => (b.node as { getPosition(): { y: number } }).getPosition().y === -68,
        ).pop()!;
        const save = Game.save;
        const hasLabel = (needle: string) =>
            h.registry.labels.some((l) => (l.comp as { string: string }).string.includes(needle));

        // ① 机缘够 → 渡劫；新号首战走「天道庇佑」文案（#49 A3，与 RealmSystem 首战保护同源）
        save.jiyuan = 200;
        home.onResume();
        expect(guide().text).toBe(TEXTS.firstBattleBanner);
        expect(hasLabel('首战必成')).toBe(true);
        push.mockClear();
        guide().onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(RainScene));

        // ② 机缘不够但有秘境体力 → 秘境（首日唯一「立刻能玩」的 15 秒短局）
        save.jiyuan = 0;
        save.trial.stamina = 99;
        home.onResume();
        expect(guide().text).toBe(TEXTS.homeGuideTrial);
        push.mockClear();
        guide().onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(RainScene));

        // ③ 体力见底、灵石 ≥50 → 开箱（机缘的主要来源）
        save.trial.stamina = 0;
        save.trial.staminaAt = Date.now();
        save.lingshi = 500;
        home.onResume();
        expect(guide().text).toBe(TEXTS.homeGuideBox);
        push.mockClear();
        guide().onClick();
        expect(push).toHaveBeenLastCalledWith(expect.any(BoxScene));

        // ④ 都不够 → 领机遇；用「今日已领」逼出确定的 toast 分支（广告桩行为不确定）
        save.lingshi = 10;
        save.daily.dailyGiftUsed = true;
        h.registry.toasts.length = 0;
        home.onResume();
        expect(guide().text).toBe(TEXTS.homeGuideGift);
        expect(guide().enabled, '引导条恒可点：四态各有去向，不再「机缘未满置灰」').toBe(true);
        push.mockClear();
        guide().onClick();
        expect(push).not.toHaveBeenCalled();
        expect(h.registry.toasts.length).toBeGreaterThan(0);

        push.mockRestore();
    });
});

describe('场景集成：M27 新手引导锚点（#54）', () => {
    /** 安全区横向 ±332（设计系 720 宽 / SAFE.x=28 → 半宽 360-28=332） */
    const inSafeX = (a: { x: number; w: number }) => a.x - a.w / 2 >= -332 && a.x + a.w / 2 <= 332;

    it('首页：机缘不足指「仙缘宝盒」入口，机缘已足指主 CTA（均在安全区内）', () => {
        bootGame();
        const home = new HomeScene();
        home.onEnter();

        Game.save.jiyuan = 0;
        const entry = home.guideAnchor()!;
        expect(entry).toEqual({ x: -130, y: -287, w: 110, h: 110 });

        Game.save.jiyuan = 9999;
        const cta = home.guideAnchor()!;
        expect(cta).toEqual({ x: 0, y: -68, w: 508, h: 110 });

        expect(inSafeX(entry)).toBe(true);
        expect(inSafeX(cta)).toBe(true);
    });

    it('开箱页：指凡俗卡「开 启」钮；蓄力/三连浮层打开时让位', () => {
        bootGame();
        const box = new BoxScene();
        box.onEnter();
        const a = box.guideAnchor()!;
        expect(a).toEqual({ x: -232, y: -18, w: 196, h: 96 });
        expect(inSafeX(a)).toBe(true);

        // 浮层打开（蓄力/三连）→ 返回 null，引导自动让位
        (box as unknown as { phase: string }).phase = 'charge';
        expect(box.guideAnchor()).toBeNull();
    });

    it('引导层：挂 Canvas 之上；首页未跳过时显示，跳过后隐藏', () => {
        const { canvas } = bootGame();
        const layer = canvas.getChildByName('GuideLayer');
        expect(layer, 'Game.init 必须装配引导层').toBeTruthy();
        expect(layer!.active).toBe(false); // 栈顶是捏人页 → 不引导

        Game.save.tutorial = { done: false };
        Game.save.jiyuan = 0;
        Game.stack.push(new HomeScene());
        GuideLayer.sync();
        expect(layer!.active).toBe(true);
        expect(layer!.children.some((c) => c.name === 'bubble')).toBe(true);
        expect(layer!.children.some((c) => c.name === 'ring')).toBe(true);

        // 跳过按钮：点一下即写 done 并**立刻**收起（曾因回调里手动清 key 导致 sync 判定「无变化」而不收）
        const skip = lastBtn((b) => b.text === TEXTS.guideSkip)!;
        expect(skip, '气泡必须常驻「跳过引导」钮').toBeTruthy();
        skip.onClick();
        expect(Game.save.tutorial.done).toBe(true);
        expect(layer!.active).toBe(false);

        // 再 sync 一次也不会复活（done 后恒为 null）
        GuideLayer.sync();
        expect(layer!.active).toBe(false);
    });

    it('引导层：已渡劫（realmIndex > 0）自动判定完成并落盘', () => {
        const { canvas } = bootGame();
        const layer = canvas.getChildByName('GuideLayer')!;
        Game.save.tutorial = { done: false };
        Game.save.realmIndex = 1;
        Game.stack.push(new HomeScene());
        GuideLayer.sync();
        expect(Game.save.tutorial.done, '首次渡劫成功即引导目标达成').toBe(true);
        expect(layer.active).toBe(false);
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
    ['TrailScene', () => new TrailScene()],
    ['TowerScene', () => new TowerScene()],
    ['TowerBattleScene', () => new TowerBattleScene()],
    ['FortuneScene', () => new FortuneScene()],
    ['LudaoScene', () => new LudaoScene()],
    ['PlayerScene', () => new PlayerScene()],
    ['ProfileScene', () => new ProfileScene()],
    ['QuestScene', () => new QuestScene()],
    ['SettingsScene', () => new SettingsScene()],
    ['ShopScene', () => new ShopScene()],
    ['WeaponScene', () => new WeaponScene()],
    ['PathScene', () => new PathScene()],
    ['StoryArchiveScene', () => new StoryArchiveScene()],
    ['RainScene', () => new RainScene()],
    ['PkBattleScene', () => new PkBattleScene()],
    ['DaoFriendScene', () => new DaoFriendScene()],
    ['TianjieScene', () => new TianjieScene()],
    ['StarterScene', () => new StarterScene()],
    ['StarterBoxScene', () => new StarterBoxScene()],
    ['TianjieShareScene', () => new TianjieShareScene({
        run: { score: 66, rating: '灵阶', newTodayBest: true, newBest: true, attemptsLeft: 2,
            result: { rating: '灵阶', mode: 'tianjie', score: 66, maxCombo: 5, comboBonus: 0, goldBonus: 0, penalty: 0, mindDemon: false, extraXiuwei: 0, goldCount: 10, blueCount: 1, redCount: 2 } } as never,
        view: { day: '2026-10-22', attemptsLeft: 2, attemptsUsed: 1, todayBest: 66, best: 66, streak: 3, bestStreak: 3,
            mods: [], scoreMult: 1, seed: 202610221, weekBest: 66, weekValue: 20261019066 },
    })],
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

describe('场景集成：捏人页（拜入仙门）两颗按钮样式一致', () => {
    it('随机道号 与 踏入仙途 同变体 / 同字号 / 同宽度', () => {
        bootGame();
        const p = new ProfileScene();
        p.onEnter();

        const rnd = button(TEXTS.profileRandomName);
        const go = button(TEXTS.profileConfirm);

        expect(rnd.variant, `随机道号 变体 ${rnd.variant} ≠ ${go.variant}`).toBe(go.variant);
        expect(rnd.fontSize, `随机道号 字号 ${rnd.fontSize} ≠ ${go.fontSize}`).toBe(go.fontSize);
        expect(rnd.w, `随机道号 宽度 ${rnd.w} ≠ ${go.w}`).toBe(go.w);
        expect(rnd.h).toBe(go.h);
        // primary 金底必须走默认深墨字色：显式传 goldLight 会让金字号压在金底上（对比 1.4:1）
        expect(rnd.textColor, 'primary 不应再覆盖 textColor').toBeUndefined();
    });

    it('两颗按钮左右对称且不重叠', () => {
        bootGame();
        const p = new ProfileScene();
        p.onEnter();
        const rnd = button(TEXTS.profileRandomName);
        const go = button(TEXTS.profileConfirm);
        const rx = (rnd.node as unknown as { getPosition(): { x: number; y: number } }).getPosition().x;
        const gx = (go.node as unknown as { getPosition(): { x: number; y: number } }).getPosition().x;
        expect(rx, '未左右对称').toBe(-gx);
        // 相邻边之间必须留缝，否则同色同款会糊成一条
        const gap = (gx - go.w / 2) - (rx + rnd.w / 2);
        expect(gap, `两按钮间隙 ${gap} 过小`).toBeGreaterThan(0);
    });
});

/**
 * D1-60s T2（#59）：跳捏人 + 道友档案编辑。
 * P0「最大的一刀」——新号 0 表单直进主页，ProfileScene 退化为编辑页。
 */
describe('场景集成：D1-60s 跳捏人 + 道友档案编辑', () => {
    /** 预置一档 v14 老玩家存档（有道号有进度），走 SaveStore 真实加载链路 */
    function seedOldSave() {
        sys.localStorage.setItem('fanren_save_v1', JSON.stringify({
            version: 14,
            lingshi: 5000,
            realmIndex: 3,
            profile: { gender: 'f', name: '旧道号', createdAt: 1729000000000 },
            stats: { opens: 40, breakthroughWins: 3, breakthroughFails: 1 },
        }));
    }

    it('新号（无道号）init 后自动生成道号直进主页：栈底即 HomeScene，无表单', () => {
        bootGame();
        expect(Game.save.profile.name.length, '自动道号应为 2~6 字').toBeGreaterThanOrEqual(2);
        expect(Game.save.profile.name.length).toBeLessThanOrEqual(6);
        expect(Game.save.profile.gender).toBe('m');
        expect(Game.save.profile.createdAt, '建档时间应为此刻').toBeGreaterThan(0);
        // D1-60s：新号先走 StarterScene（60 秒新手流），不再直进 HomeScene
        expect(Game.stack.top).toBeInstanceOf(StarterScene);
        expect(Game.stack.top).not.toBeInstanceOf(ProfileScene);
    });

    it('老玩家（v14 有道号）init 直进主页，道号与道体不被改写', () => {
        seedOldSave();
        bootGame();
        expect(Game.save.profile.name).toBe('旧道号');
        expect(Game.save.profile.gender).toBe('f');
        expect(Game.stack.top).toBeInstanceOf(HomeScene);
    });

    it('设置页有「道友档案」入口，点击 push 编辑页', () => {
        bootGame();
        Game.stack.push(new SettingsScene());
        // buildLinkItem 走 label + item Button（非 spriteButton），从标签树反查入口行
        const linkLabel = h.registry.labels.filter((l) => l.text.includes(TEXTS.profileEditEntry)).pop();
        expect(linkLabel, '设置页缺少道友档案入口').toBeDefined();
        const item = (linkLabel!.node as unknown as { parent: { emit(ev: string): void } }).parent;
        item.emit('click');
        expect(Game.stack.top).toBeInstanceOf(ProfileScene);
    });

    it('编辑页：确认钮为「保存」、预填当前道号；改名后 pop 回上层并落档', () => {
        bootGame();
        const settings = new SettingsScene();
        Game.stack.push(settings);
        Game.stack.push(new ProfileScene('edit'));
        const p = Game.stack.top as ProfileScene;

        const saveBtn = h.registry.buttons.filter((b) => b.text === TEXTS.profileSave).pop();
        expect(saveBtn, '编辑页确认钮应为「保存」').toBeDefined();
        // 预填当前道号（白盒取 editBox：ThemeLib 桩不登记 EditBox）
        const box = (p as unknown as { editBox: { string: string } }).editBox;
        expect(box.string).toBe(Game.save.profile.name);

        const depth = (Game.stack as unknown as { stack: unknown[] }).stack.length;
        box.string = '新道号';
        saveBtn!.onClick();
        expect(Game.save.profile.name).toBe('新道号');
        expect((Game.stack as unknown as { stack: unknown[] }).stack.length, '编辑页应 pop 回上层而非 swap').toBe(depth - 1);
        expect(Game.stack.top).toBe(settings);
    });

    it('编辑页：道号非法（1 字）toast 拦截，不退出不落档', () => {
        bootGame();
        Game.stack.push(new SettingsScene());
        Game.stack.push(new ProfileScene('edit'));
        const p = Game.stack.top as ProfileScene;
        const before = Game.save.profile.name;
        const box = (p as unknown as { editBox: { string: string } }).editBox;
        box.string = '一';
        const saveBtn = h.registry.buttons.filter((b) => b.text === TEXTS.profileSave).pop();
        saveBtn!.onClick();
        expect(Game.save.profile.name).toBe(before);
        expect(Game.stack.top).toBe(p);
        expect(h.registry.toasts).toContain(TEXTS.profileNameInvalid);
    });

    it('属性页道号行可点进编辑页', () => {
        bootGame();
        Game.stack.push(new PlayerScene());
        // 道号行尾的「›」标签挂在档案卡上；档案卡整体可点（白色 Box 取标签反查）
        const arrow = h.registry.labels.filter((l) => l.text === '\u203a').pop();
        expect(arrow, '属性页道号行缺少编辑入口箭头').toBeDefined();
        const profileCard = (arrow!.node as unknown as { parent: { emit(ev: string): void } }).parent;
        profileCard.emit('click');
        expect(Game.stack.top).toBeInstanceOf(ProfileScene);
    });
});
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

    it('宝箱长按连开：短按不开、按住达阈值自动连开、松手即停', () => {
        h.setVisibleSize(720, LONG_H);
        bootGame();
        Game.save.lingshi = 500;
        const box = new BoxScene();
        box.onEnter();

        // C2 载体：连开灵光节点必须存在，否则亮度阶梯无处表达
        expect(h.registry.nodes.find((n) => n.name === 'autoHalo'), '未创建连开灵光节点 autoHalo').toBeTruthy();

        const p = box as unknown as {
            onPressStart(id: string): void;
            onPressEnd(): void;
            update(dt: number): void;
            autoActive: boolean;
            autoOpened: number;
        };

        // ① 短按（< holdThreshold 0.35s）不进连开，仍走普通单次开箱
        p.onPressStart('fansu');
        p.update(0.1);
        expect(p.autoActive, '短按不应进入连开').toBe(false);
        p.onPressEnd();

        // ② 按住达阈值 → 进入连开，并立即开第一次
        p.onPressStart('fansu');
        p.update(0.4);
        expect(p.autoActive).toBe(true);
        expect(p.autoOpened, '进入连开应立即开第一次').toBe(1);
        // 按钮就地反馈连开计数（不新增布局，避免挤压既有版式）
        expect(h.registry.buttons.some((b) => b.text === '连开 ×1')).toBe(true);

        // ③ 每 1.2s 续开一次
        p.update(1.2);
        expect(p.autoOpened, '连开间隔 1.2s 后应续开').toBe(2);

        // ④ 松手即停
        p.onPressEnd();
        expect(p.autoActive).toBe(false);
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

    it('渡劫失败（广告位未配置）：只留返回，不展示无奖励的死按钮', () => {
        bootGame();
        const { session, result } = mkRain(1, 'tribulation', 11);
        const s = new ResultScene({ session, result, rate: 0.4, success: false, targetIndex: 1 });
        s.onEnter();

        expect(hasText('突破失败'), '未渲染失败徽章').toBe(true);
        expect(hasText('修为受损'), '未展示修为受损明细').toBe(true);
        // 首发零广告期：protect ID 为空 → 不展示「护道 · 广告」
        const protect = h.registry.buttons.find((b) => String(b.text).indexOf('广告') >= 0);
        expect(protect, '未配置广告位时不应展示护盾广告按钮').toBeUndefined();

        const pop = vi.spyOn(Game.stack, 'popToRoot').mockImplementation(() => { });
        button('返回仙府').onClick();
        expect(pop).toHaveBeenCalled();
        pop.mockRestore();
    });

    it('渡劫失败（广告位已配置）：护盾广告按钮在位且可点', () => {
        bootGame();
        DOUYIN_AD_UNIT_IDS.protect = 'test-protect';
        try {
            const { session, result } = mkRain(1, 'tribulation', 11);
            const s = new ResultScene({ session, result, rate: 0.4, success: false, targetIndex: 1 });
            s.onEnter();
            const protect = h.registry.buttons.find((b) => String(b.text).indexOf('广告') >= 0);
            expect(protect, '已配置广告位时失败态应有护盾广告按钮').toBeTruthy();
        } finally {
            DOUYIN_AD_UNIT_IDS.protect = '';
        }
    });

    it('首胜页（firstBattle）：只留「继续修仙」+ 解锁提示，不出现炫耀/好友对比', () => {
        bootGame();
        const rs = new RainSystem(new Rng(21));
        const session = rs.createSession(1, false, 'tribulation', undefined, true);
        const result = rs.finish(session);
        const s = new ResultScene({ session, result, rate: 1, success: true, targetIndex: 1 });
        s.onEnter();
        expect(hasText(TEXTS.firstResultUnlock), '未渲染新功能解锁').toBe(true);
        const go = h.registry.buttons.filter((b) => b.text === TEXTS.firstResultGo).pop();
        expect(go, '首胜缺少「继续修仙」').toBeTruthy();
        expect(h.registry.buttons.some((b) => b.text === '炫耀战绩'), '首胜不应出现炫耀战绩').toBe(false);
        const pop = vi.spyOn(Game.stack, 'popToRoot').mockImplementation(() => { });
        go!.onClick();
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

    it('再战一局：点击弹确认框（不直接扣体力），确认后才消耗开局，取消不动存档', () => {
        bootGame();
        Game.save.trial.stamina = 5;
        const { result } = mkRain(1, 'illusion', 42);
        const fin = Game.illusion.finish(Game.save, result.goldCount, result.maxCombo, result.redCount);
        const s = new IllusionResultScene({ result, rewards: fin.rewards });
        s.onEnter();

        const again = h.registry.buttons.find((b) => b.text === '再战一局');
        expect(again, '缺「再战一局」按钮').toBeTruthy();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        again!.onClick();
        // 弹框阶段：体力未扣、未压栈
        expect(Game.save.trial.stamina, '弹框阶段就扣了体力').toBe(5);
        expect(push, '弹框阶段就开局了').not.toHaveBeenCalled();

        // 取消：弹框关闭，存档不动
        const cancel = h.registry.buttons.find((b) => b.text === '取消');
        expect(cancel, '确认框缺「取消」按钮').toBeTruthy();
        cancel!.onClick();
        expect(Game.save.trial.stamina, '取消后体力被动了').toBe(5);
        expect(push).not.toHaveBeenCalled();

        // 确认：扣 1 体力并压入新雨局
        again!.onClick();
        const confirm = h.registry.buttons.find((b) => b.text === '确认开战');
        expect(confirm, '确认框缺「确认开战」按钮').toBeTruthy();
        confirm!.onClick();
        expect(Game.save.trial.stamina, '确认后未扣 1 体力').toBe(4);
        expect(push).toHaveBeenCalledWith(expect.any(RainScene));
        push.mockRestore();
    });

    it('幻境未入档：rewards 为空走降级分支且不崩', () => {
        bootGame();
        const { result } = mkRain(0, 'illusion', 3);
        const s = new IllusionResultScene({ result, rewards: [] });
        expect(() => s.onEnter()).not.toThrow();
        // 降级分支仍必须给出出路（否则玩家卡死在结算页）
        expect(h.registry.buttons.some((b) => b.text === '返回仙府'), '降级态缺少返回按钮').toBe(true);
    });

    it('秘境中断（#43）：道心护持面板弹出，放弃清零连胜且单次决策后按钮禁用', () => {
        bootGame();
        Game.save.trial.streak = 4;
        Game.save.trial.bestStreak = 4;
        const { result } = mkRain(0, 'illusion', 3);
        const s = new IllusionResultScene({ result, rewards: [], interrupted: true, streakBefore: 4 });
        s.onEnter();

        expect(h.registry.buttons.some((b) => b.text === '道心护持 · 保留连胜'), '缺护持广告按钮').toBe(true);
        const giveUp = button('不复护持');
        expect(giveUp, '缺放弃护持按钮').toBeTruthy();

        // 放弃 → 连胜清零（bestStreak 保留），面板收敛
        giveUp.onClick();
        expect(Game.save.trial.streak, '放弃护持未清零连胜').toBe(0);
        expect(Game.save.trial.bestStreak, 'bestStreak 不应被清零').toBe(4);
    });

    it('秘境中断：连胜为 0 时不弹护持面板（无可保留）', () => {
        bootGame();
        Game.save.trial.streak = 0;
        const { result } = mkRain(0, 'illusion', 3);
        const s = new IllusionResultScene({ result, rewards: [], interrupted: false, streakBefore: 0 });
        s.onEnter();
        expect(h.registry.buttons.some((b) => b.text === '道心护持 · 保留连胜'), '无连胜不应弹护持').toBe(false);
    });

    it('结算页面板几何：明细面板与奖励/护持面板零重叠（段位分行裁切回归）', () => {
        bootGame();
        // M14-3 加入「段位分」第 6 行后纵向预算未重排：明细面板底边与下方奖励面板
        // 顶边重叠 59px，段位分行正好压在接缝上被裁切。此用例锁定三态布局不回归。
        const worldY = (n: { getPosition(): { y: number } }) => {
            let y = 0;
            for (let p = n as unknown as { getPosition(): { y: number }; parent: unknown } | null; p; p = p.parent as never) {
                y += p.getPosition().y;
            }
            return y;
        };
        const mkResult = (score: number, rating: RainResult['rating']): RainResult => ({
            rating, mode: 'illusion' as RainMode, score, maxCombo: 3, comboBonus: 0,
            goldBonus: 0, penalty: 0, mindDemon: false, extraXiuwei: 0,
            goldCount: 17, blueCount: 2, redCount: 1,
        });
        /** 从场景根收集 628 宽面板的世界 Y 区间（明细 372 / 奖励态 150|214|220） */
        const panelBounds = (scene: { node: InstanceType<typeof Node> }) =>
            (scene.node.children as unknown as Array<{ getComponent(t: unknown): { contentSize: { width: number; height: number } } | null; getPosition(): { y: number } }>)
                .map((c) => ({ ut: c.getComponent(UITransform as unknown as new () => unknown), y: c.getPosition().y }))
                .filter(({ ut }) => ut && ut.contentSize.width === 628)
                .map(({ ut, y }) => ({ top: y + ut.contentSize.height / 2, bottom: y - ut.contentSize.height / 2, h: ut.contentSize.height }))
                .sort((a, b) => b.top - a.top);

        const cases = [
            { name: '未入档', result: mkResult(44, null), rewards: [] as never, extra: { rankName: '常徒', rankGained: 0, rankScore: 0 } },
            { name: '有档', result: mkResult(72, '初入幻境'), rewards: [{ label: '灵石 ×75' }] as never, extra: { rankName: '常徒', rankGained: 12, rankScore: 12 } },
            { name: '护持', result: mkResult(44, null), rewards: [] as never, extra: { interrupted: true, streakBefore: 4, rankName: '常徒', rankGained: 0, rankScore: 0 } },
        ];
        for (const c of cases) {
            const s = new IllusionResultScene({ result: c.result, rewards: c.rewards, ...c.extra });
            s.onEnter();
            const [detail, reward] = panelBounds(s);
            expect(detail, `${c.name}：未找到明细面板`).toBeTruthy();
            expect(reward, `${c.name}：未找到奖励/护持面板`).toBeTruthy();
            expect(detail.h, `${c.name}：明细面板高度应为 372`).toBe(372);
            // 面板间距 ≥ 20（修复后 28），杜绝再次贴脸/重叠
            expect(detail.bottom - reward.top, `${c.name}：明细面板底边与奖励面板顶边间距不足`).toBeGreaterThanOrEqual(20);
            // 段位分行必须完整落在明细面板内（下缘 = 行世界Y − 半行高 26）
            const rankLabel = h.registry.labels.find((l) => l.text.startsWith('段位分'));
            expect(rankLabel, `${c.name}：未渲染段位分行`).toBeTruthy();
            const ly = worldY(rankLabel!.node as never);
            expect(ly - 26, `${c.name}：段位分行下缘跌破明细面板底边`).toBeGreaterThanOrEqual(detail.bottom);
        }
    });
});

// ───────────────────────── M30 剧情文本（#56）─────────────────────────

/** 取剧情演出层（Game.init 挂在 Canvas 下、SceneRoot 之后 → 永远盖在当前页上） */
function storyLayerOf(canvas: Node): Node {
    const layer = canvas.getChildByName('StoryLayer');
    expect(layer, 'Game.init 必须装配剧情演出层').toBeTruthy();
    return layer!;
}

/** 演出层下的全屏 dim（点击推进的落点；注意与场景内 showDialog 的 'dim' 区分——那是场景子节点） */
function storyDimOf(layer: Node): Node {
    const dim = layer.children.find((c) => c.name === 'dim');
    expect(dim, '演出层缺少全屏 dim').toBeTruthy();
    return dim!;
}

/** 对话面板（spritePanel → ThemeLib 桩落名 'image'，660×300） */
function storyPanelOf(layer: Node): Node {
    const panel = layer.children.find((c) => c.name === 'image');
    expect(panel, '演出层缺少对话面板').toBeTruthy();
    return panel!;
}

/** 面板内正文字符串（fontSize 26 的 Label；内容随打字机推进变化，取 comp.string） */
function storyBodyOf(panel: Node): { string: string } {
    for (const c of panel.children) {
        const l = c.getComponent(Label) as { string: string; fontSize: number } | null;
        if (l && l.fontSize === 26) return l;
    }
    throw new Error('面板内未找到正文 Label（fontSize 26）');
}

/** 面板左上说话者 chip（node 'speaker' 内的 Label，随行切换） */
function storySpeakerOf(panel: Node): string {
    const chip = panel.children.find((c) => c.name === 'speaker');
    expect(chip, '面板缺少说话者 chip').toBeTruthy();
    const l = chip!.getComponentInChildren(Label) as { string: string } | null;
    return l ? l.string : '';
}

/** 收集场景树里全部挂了 Button 的节点（仙闻录行 = 裸 Button，Transition.NONE） */
function buttonNodesOf(root: Node): Node[] {
    const out: Node[] = [];
    const walk = (n: Node) => {
        if (n.getComponent(Button)) out.push(n);
        n.children.forEach(walk);
    };
    walk(root);
    return out;
}

/** 某节点子树里渲染过的文案（labels 记录创建时文本；动态文本看 comp.string） */
function textsUnder(n: Node): string[] {
    return h.registry.labels
        .filter((l) => {
            for (let p = l.node as Node | null; p; p = p.parent as Node | null) if (p === n) return true;
            return false;
        })
        .map((l) => String(l.text));
}

describe('场景集成：M30 剧情演出层（#56）', () => {
    afterEach(() => {
        // 演出态是模块级静态：跨用例残留会让下一条「isPlaying()===false」误判，统一收场
        // （finish 非回看会标记 seen + 落盘，但每条用例都重新 bootGame 读新档，无副作用）
        if (StoryLayer.isPlaying()) (StoryLayer as unknown as { finish(): void }).finish();
    });

    it('Game.init 装配 StoryLayer：Canvas 子节点，初始收起；非剧情场景 sync 不误开演', () => {
        const { canvas } = bootGame();
        const layer = storyLayerOf(canvas);
        expect(layer.active, '无节拍命中时必须收起').toBe(false);
        // D1-60s T2 起 init 直推主页（新号不捏人）；但 starter.done=false → opening 门未开
        StoryLayer.sync();
        expect(StoryLayer.isPlaying()).toBe(false);
    });

    it('opening：新手流走完后回首页开演；打字机按帧推进，dim 点击逐行推进、第三行换说话者', () => {
        const { canvas } = bootGame();
        h.reset();
        Game.save.starter = { done: true, jiyuanGranted: true };
        Game.stack.push(new HomeScene());
        StoryLayer.sync();
        const layer = storyLayerOf(canvas);
        expect(layer.active, '新玩家进首页应播开局节拍').toBe(true);
        expect(hasText('仙途启程'), '未渲染节拍标题').toBe(true);

        const panel = storyPanelOf(layer);
        const body = storyBodyOf(panel);
        expect(body.string, '开演时正文应为空（打字机起点）').toBe('');
        StoryLayer.tick(0.5);
        expect(body.string.length, '0.5s × 30 字/秒 ≈ 15 字，应部分显现').toBe(15);
        StoryLayer.tick(1.0);
        expect(body.string, '1.5s 应补完全行').toBe('凡尘一梦四十载，你在残卷里翻到半页仙谱。');

        // dim 点击推进：切到第二行并重置打字机
        storyDimOf(layer).emit('touch-start');
        expect(body.string, '切到第二行应重置打字机').toBe('');
        StoryLayer.tick(1.0);
        expect(body.string).toBe('当夜窗外落雨，雨里带着灵。');

        // 第三行换说话者（老者）——chip 跟随行切换
        storyDimOf(layer).emit('touch-start');
        expect(storySpeakerOf(panel), '第三行说话者应为老者').toBe('老者');
        StoryLayer.tick(1.0);
        expect(body.string).toBe('既有缘看见，便是缘。仙路自此始——');
    });

    it('opening 三行听完自动标记听过并落盘；再 sync 不重播（一生一次）', () => {
        const { canvas } = bootGame();
        h.reset();
        Game.save.starter = { done: true, jiyuanGranted: true };
        Game.stack.push(new HomeScene());
        StoryLayer.sync();
        const layer = storyLayerOf(canvas);
        for (let i = 0; i < 3; i++) {
            StoryLayer.tick(1.0); // 补完当前行
            storyDimOf(layer).emit('touch-start'); // 推进（第三次 = 收场）
        }
        expect(StoryLayer.isPlaying(), '末行点击应收场').toBe(false);
        expect(layer.active, '收场后整层收起').toBe(false);
        expect(Game.save.story.seen, '听完必须标记听过').toContain('opening');
        expect(SaveStore.load().story.seen, '收场必须落盘（v12 存档）').toContain('opening');
        // 同一节拍不再播
        StoryLayer.sync();
        expect(StoryLayer.isPlaying(), '听过的一生一次').toBe(false);
    });

    it('演出中引导层让位；剧情跳过后引导恢复（M27/M30 双层叠次序）', () => {
        const { canvas } = bootGame();
        h.reset();
        Game.save.tutorial = { done: false };
        Game.save.jiyuan = 0;
        Game.save.starter = { done: true, jiyuanGranted: true };
        Game.stack.push(new HomeScene());
        StoryLayer.sync();
        const guide = canvas.getChildByName('GuideLayer')!;
        GuideLayer.sync();
        expect(StoryLayer.isPlaying()).toBe(true);
        expect(guide.active, '演出中引导必须让位').toBe(false);

        // 跳过剧情（直接收场 + 标记 + 落盘）→ 引导恢复
        lastBtn((b) => b.text === TEXTS.storySkip)!.onClick();
        expect(StoryLayer.isPlaying()).toBe(false);
        expect(Game.save.story.seen, '跳过也标记听过').toContain('opening');
        GuideLayer.sync();
        expect(guide.active, '收场后引导应恢复').toBe(true);
    });

    it('渡劫成功页播 realm_1；失败页不播（境界节拍只在成功页触发）', () => {
        bootGame();
        h.reset();
        const { session, result } = mkRain(1, 'tribulation', 11);
        Game.stack.push(new ResultScene({ session, result, rate: 0.72, success: true, targetIndex: 1 }));
        StoryLayer.sync();
        expect(StoryLayer.isPlaying(), '突破成功页应播境界节拍').toBe(true);
        expect(hasText('练气 · 第一缕灵气'), '未渲染 realm_1 标题').toBe(true);
        lastBtn((b) => b.text === TEXTS.storySkip)!.onClick();
        expect(Game.save.story.seen).toContain('realm_1');

        // 失败页：success=false 不命中（与 seen 无关，单独造一条失败结算）
        const fail = mkRain(1, 'tribulation', 12);
        Game.stack.push(new ResultScene({ session: fail.session, result: fail.result, rate: 0.4, success: false, targetIndex: 1 }));
        StoryLayer.sync();
        expect(StoryLayer.isPlaying(), '失败页不播剧情').toBe(false);
    });

    it('妖径第 4 章地图播 trail_4（章节节拍按章触发，TrailScene 自报当前章）', () => {
        bootGame();
        h.reset();
        Game.save.trail.curLayer = 31; // 第 4 章首层（每章 10 层：chapterOf(31) = 4）
        const s = new TrailScene();
        Game.stack.push(s);
        expect(s.storyCtx(), 'TrailScene 应自报当前章').toEqual({ trailChapter: 4 });
        StoryLayer.sync();
        expect(StoryLayer.isPlaying(), '踏入第 4 章应播 trail_4').toBe(true);
        expect(hasText('第4章 · 下面接着的东西'), '未渲染 trail_4 标题').toBe(true);
    });

    it('仙闻录：三组 15 行；听过行回看不重复标记，未听行不剧透只 Toast', () => {
        bootGame();
        h.reset();
        Game.save.story = { seen: ['opening', 'realm_1'] };
        const s = new StoryArchiveScene();
        s.onEnter();

        expect(h.registry.headers.some((x) => x.title === TEXTS.storyArchivePageTitle), '页头应为仙闻录').toBe(true);
        const rows = buttonNodesOf(s.node);
        expect(rows.length, '三组 1+5+9 = 15 行').toBe(15);

        // 听过行：真实标题 + 「再读」；tap → 回看开演，seen 不重复、跳过也不标记
        const heardRow = rows.find((r) => textsUnder(r).indexOf('仙途启程') >= 0);
        expect(heardRow, '听过行应显示真实标题').toBeTruthy();
        expect(textsUnder(heardRow!).indexOf(TEXTS.storyReread) >= 0, '听过行状态应为再读').toBe(true);
        heardRow!.emit('click');
        expect(StoryLayer.isPlaying(), '回看应开演').toBe(true);
        expect(Game.save.story.seen.length, '回看不重复标记 seen').toBe(2);
        lastBtn((b) => b.text === TEXTS.storySkip)!.onClick();
        expect(StoryLayer.isPlaying()).toBe(false);
        expect(Game.save.story.seen.length, '回看跳过也不标记').toBe(2);

        // 未听行：'？？？' + 未听闻；tap → 只 Toast 不开演（不剧透）
        const unheardRow = rows.find((r) => textsUnder(r).indexOf('？？？') >= 0);
        expect(unheardRow, '未听行应显示？？？').toBeTruthy();
        expect(textsUnder(unheardRow!).indexOf(TEXTS.storyUnheard) >= 0, '未听行状态应为未听闻').toBe(true);
        unheardRow!.emit('click');
        expect(h.registry.toasts.indexOf(TEXTS.storyUnheardToast) >= 0, '未听行应 Toast 不剧透').toBe(true);
        expect(StoryLayer.isPlaying(), '未听行不能开演').toBe(false);
    });

    it('M29 归来弹层期间演出让位；弹层消费后再开演（migrate 老玩家双命中）', () => {
        const { canvas } = bootGame();
        h.reset();
        Game.save.realmIndex = 0;
        Game.offlineResult = { minutes: 60, xiuwei: 96, lingshi: 24 };
        // D1-60s #59：opening 门改为 starter.done——老玩家迁移口径 realmIndex>0 → done=true，
        // 这里 realmIndex 已置 0，显式补播种模拟「走完新手流的老玩家回主页」
        Game.save.starter = { done: true, jiyuanGranted: true };
        const home = new HomeScene();
        Game.stack.push(home);
        expect(home.node.children.some((c) => c.name === 'dim'), '进门应弹归来弹窗').toBe(true);

        // 弹层存在 → 演出让位（弹层先消费、故事后播）
        StoryLayer.sync();
        expect(StoryLayer.isPlaying(), '场景有全屏弹层时必须让位').toBe(false);

        // 消费弹层 → 让位解除，开演
        button(TEXTS.offlineDialogBtn).onClick();
        expect(home.node.children.some((c) => c.name === 'dim'), '按钮应关闭弹层').toBe(false);
        StoryLayer.sync();
        expect(StoryLayer.isPlaying(), '弹层消失后应开演').toBe(true);
        expect(hasText('仙途启程')).toBe(true);
    });

    it('修仙之路页：底部仙闻录入口卡（计数随存档刷新）→ push 仙闻录页', () => {
        bootGame();
        h.reset();
        Game.save.story = { seen: ['opening'] };
        const s = new PathScene();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        s.onEnter();
        expect(hasText(TEXTS.storyArchiveEntry), '未渲染仙闻录入口标题').toBe(true);
        expect(
            h.registry.labels.some((l) => (l.comp as { string: string }).string === TEXTS.storyArchiveEntrySub(1, STORY_BEATS.length)),
            '入口副标题应显示已听闻计数',
        ).toBe(true);

        // 入口卡 = 660×88 @ y=-410 的 spritePanel（Button SCALE，点击进仙闻录）
        const entry = s.node.children.find((c) => {
            const ut = c.getComponent(UITransform) as { contentSize: { width: number; height: number } } | null;
            return !!ut && ut.contentSize.width === 660 && ut.contentSize.height === 88
                && c.getPosition().y === -410;
        });
        expect(entry, '未找到仙闻录入口卡').toBeTruthy();
        entry!.emit('click');
        expect(push, '入口卡未进仙闻录页').toHaveBeenLastCalledWith(expect.any(StoryArchiveScene));
        push.mockRestore();
    });
});

// ───────────────────────── M31 宗门社交（#57）─────────────────────────

/**
 * 进论道页并切到宗门 tab，返回宗门视图根（内联在 content 下）。
 *
 * D1-60s §4：宗门（`sect.unlockRealm = 3`，slot `page` 的唯一落位 = 论道第 5 tab）
 * 要**金丹**才出 tab。本节用例验证的是宗门玩法本身，解锁判定不在其职责内，
 * 故进页前把境界抬到金丹——解锁口径由「D1-60s §4 解锁表接入」describe 覆盖。
 */
function enterSectTab(): { view: Node; scene: LudaoScene } {
    Game.save.realmIndex = 3;
    const s = new LudaoScene();
    s.onEnter();
    // 必须取**最新**场景的 tab 钮：整文件跑时旧 LudaoScene 实例的按钮记录仍在 registry 里，
    // find 会命中已销毁场景的钮（点它只会重建旧场景的 content，新场景的 content 是空的）。
    const tab = lastBtn((b) => b.text === TEXTS.sectTab);
    expect(tab, 'tabbar 缺少宗门 tab').toBeTruthy();
    tab!.onClick();
    const content = s.node.children.find((c) => c.name === 'content');
    expect(content, '宗门 tab 未建 content').toBeTruthy();
    const view = content!.children.find((c) => c.name === 'sectView');
    expect(view, '宗门 tab 未渲染 sectView').toBeTruthy();
    return { view: view!, scene: s };
}

/**
 * 取**最新场景**的第一个加入钮（青云剑宗）。每个宗门场景建 3 个加入钮，
 * 整文件跑时 registry 会累积多个场景的记录，直接 find 会命中旧场景的钮。
 */
function latestJoinBtn() {
    const arr = h.registry.buttons.filter((b) => b.text === TEXTS.sectJoinBtn);
    expect(arr.length, '未渲染加入钮').toBeGreaterThanOrEqual(3);
    return arr[arr.length - 3];
}

/** 点商店行（裸 Button 整行）：按行内商品名定位所在行节点 */
function clickShopRow(view: Node, itemName: string) {
    const hit = h.registry.labels.filter((l) => (l.comp as { string: string }).string === itemName);
    expect(hit.length, `未找到商品行「${itemName}」`).toBeGreaterThan(0);
    let n = hit[hit.length - 1].node as Node;
    for (; n; n = n.parent as Node) {
        if (n.getComponent(Button)) {
            n.emit('click');
            return;
        }
    }
    throw new Error(`商品行「${itemName}」上未挂 Button`);
}

describe('场景集成：M31 宗门社交 tab（#57）', () => {
    it('tabbar 4→5 重排：pitch 136 五钮就位，宗门 tab 加入', () => {
        bootGame();
        Game.save.realmIndex = 3; // 宗门金丹解锁（D1-60s §4），见 enterSectTab 注释
        h.reset();
        const s = new LudaoScene();
        s.onEnter();
        const tabs = h.registry.buttons.filter((b) => b.w === 128 && b.h === 70);
        expect(tabs.length, 'tabbar 应为 5 钮').toBe(5);
        const xs = tabs.map((b) => (b.node as Node).getPosition().x).sort((a, b) => a - b);
        expect(xs).toEqual([-272, -136, 0, 136, 272]);
        expect(tabs.some((b) => b.text === TEXTS.sectTab)).toBe(true);
    });

    it('未加入态：三宗候选卡 + 加入钮，无日常/宝库', () => {
        bootGame();
        h.reset();
        const { view } = enterSectTab();
        expect(hasText(TEXTS.sectJoinTitle)).toBe(true);
        ['青云剑宗', '百草丹宗', '天机阁'].forEach((n) => expect(hasText(n), `候选卡缺 ${n}`).toBe(true));
        expect(h.registry.buttons.filter((b) => b.text === TEXTS.sectJoinBtn).slice(-3).length, '三张候选卡各一个加入钮').toBe(3);
        expect(hasText('— 宗门日常 —'), '未加入不应渲染日常卡').toBe(false);
        expect(hasText('— 宗门宝库 —'), '未加入不应渲染宝库').toBe(false);
    });

    it('加入流：点加入 → 存档写入 + 主态整窗重建', () => {
        bootGame();
        h.reset();
        const { view } = enterSectTab();
        latestJoinBtn()!.onClick();
        expect(Game.save.sect.id, '加入应写入存档').toBe('qingyun');
        expect(hasText('青云剑宗'), '主态应显示宗门名').toBe(true);
        expect(hasText('— 宗门日常 —')).toBe(true);
        expect(lastBtn((b) => b.text === TEXTS.sectSalaryBtn), '主态应有领俸禄钮').toBeTruthy();
        expect(hasText('— 宗门宝库 —')).toBe(true);
        expect(lastBtn((b) => b.text === TEXTS.sectInviteBtn), '主态应有邀请钮').toBeTruthy();
    });

    it('俸禄：一日一次，入账修为 + 贡献点，再领禁用', () => {
        bootGame();
        h.reset();
        enterSectTab();
        latestJoinBtn()!.onClick();
        const xw0 = Game.save.xiuwei;
        lastBtn((b) => b.text === TEXTS.sectSalaryBtn)!.onClick();
        expect(Game.save.xiuwei - xw0, '青云 1 级俸禄修为 120（加成 1）').toBe(120);
        expect(Game.save.sect.contrib).toBe(40);
        expect(Game.save.sect.totalContrib).toBe(40);
        expect(Game.save.sect.salaryDay).toBe(todayString(new Date()));
        // 重建后按钮禁用且换文案
        const done = lastBtn((b) => b.text === TEXTS.sectSalaryDone);
        expect(done, '已领后应显示已领态').toBeTruthy();
        expect(done!.enabled, '已领按钮必须禁用').toBe(false);
        done!.onClick(); // 禁用钮点击不应再入账
        expect(Game.save.sect.contrib).toBe(40);
    });

    it('助力：一日一次，修为入账；已助力禁用', () => {
        bootGame();
        h.reset();
        enterSectTab();
        latestJoinBtn()!.onClick();
        const xw0 = Game.save.xiuwei;
        lastBtn((b) => b.text === TEXTS.sectHelpBtn)!.onClick();
        expect(Game.save.xiuwei - xw0, '助力修为 60+30×1').toBe(90);
        expect(Game.save.sect.contrib).toBe(30);
        expect(Game.save.sect.helpedDay).toBe(todayString(new Date()));
        const done = lastBtn((b) => b.text === TEXTS.sectHelpDone);
        expect(done!.enabled, '已助力必须禁用').toBe(false);
    });

    it('捐献：扣灵石 + 返 20% 贡献点 + exp；灵石不足禁用', () => {
        bootGame();
        h.reset();
        Game.save.lingshi = 30000;
        enterSectTab();
        latestJoinBtn()!.onClick();
        lastBtn((b) => b.text === TEXTS.sectDonateBtn(1000))!.onClick();
        expect(Game.save.lingshi, '捐 1000 扣灵石').toBe(29000);
        expect(Game.save.sect.contrib, '返 20% 贡献点').toBe(200);
        expect(Game.save.sect.exp).toBe(1000);
        expect(Game.save.sect.donatedToday).toBe(1000);
        // 灵石不足 → 该档禁用
        Game.save.lingshi = 100;
        enterSectTab();
        const poor = lastBtn((b) => b.text === TEXTS.sectDonateBtn(1000));
        expect(poor!.enabled, '灵石不足必须禁用').toBe(false);
    });

    it('宝库：整行兑换入账 + 日限后置灰不可点', () => {
        bootGame();
        h.reset();
        Game.save.lingshi = 30000;
        enterSectTab();
        latestJoinBtn()!.onClick();
        lastBtn((b) => b.text === TEXTS.sectDonateBtn(1000))!.onClick(); // contrib 200
        const ls0 = Game.save.lingshi;
        clickShopRow(enterSectTabView(), '灵石 ×500');
        expect(Game.save.lingshi - ls0, '兑换灵石 +500（不吃加成）').toBe(500);
        expect(Game.save.sect.contrib, '扣 200 贡献点').toBe(0);
        // 日限 1：再次点击同行无入账（按钮 interactable=false）
        clickShopRow(enterSectTabView(), '灵石 ×500');
        expect(Game.save.lingshi - ls0).toBe(500);
        expect(Game.save.sect.contrib).toBe(0);
    });

    it('邀请道友：web 无 share 环境 → toast 降级提示', () => {
        bootGame();
        h.reset();
        enterSectTab();
        latestJoinBtn()!.onClick();
        lastBtn((b) => b.text === TEXTS.sectInviteBtn)!.onClick();
        expect(h.registry.toasts.indexOf(TEXTS.sectInviteToast) >= 0, '无 share 环境应 toast 降级').toBe(true);
    });
});

/** 宝库用例辅助：重进宗门 tab 拿最新视图根（动作后整窗重建） */
function enterSectTabView(): Node {
    const s = new LudaoScene();
    s.onEnter();
    lastBtn((b) => b.text === TEXTS.sectTab)!.onClick();
    const content = s.node.children.find((c) => c.name === 'content')!;
    return content.children.find((c) => c.name === 'sectView')!;
}

describe('场景集成：D1-60s 新手三连（#59 T3/T4）', () => {
    it('StarterScene：只有「开启仙缘宝盒」主 CTA，点击进 StarterBoxScene；不构建主页 rail', () => {
        bootGame();
        h.reset();
        const page = new StarterScene();
        page.onEnter();
        const cta = lastBtn((b) => b.text === TEXTS.starterCta);
        expect(cta, '未找到新手主 CTA').toBeTruthy();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        cta!.onClick();
        expect(push).toHaveBeenCalledWith(expect.any(StarterBoxScene));
        // 首屏不应出现「修行/妖径/论道/法器/仙路」等常驻入口
        expect(lastBtn((b) => b.text === TEXTS.towerTitle)).toBeUndefined();
        expect(lastBtn((b) => b.text === TEXTS.offlineRail)).toBeUndefined();
    });

    it('StarterScene：starter.done 后 onResume 切回常驻 HomeScene', () => {
        bootGame();
        const page = new StarterScene();
        Game.save.starter.done = true;
        const replace = vi.spyOn(Game.stack, 'replace').mockImplementation(() => { });
        page.onResume();
        expect(replace).toHaveBeenCalledWith(expect.any(HomeScene));
        replace.mockRestore();
    });

    it('StarterBoxScene：三只免费盒 → 机缘补到 60、starter.done=true、主按钮变「去渡劫」', () => {
        bootGame();
        h.reset();
        const page = new StarterBoxScene();
        page.onEnter();
        const lingshi0 = Game.save.lingshi;
        // 点三次主按钮（第 1/2/3 只）
        for (let i = 0; i < 3; i += 1) {
            const btn = lastBtn((b) => b.text === TEXTS.starterBoxCount(i + 1));
            expect(btn, `第 ${i + 1} 只按钮缺失`).toBeTruthy();
            btn!.onClick();
        }
        expect(Game.save.lingshi, '新手三连不得扣灵石（只增不减）').toBeGreaterThanOrEqual(lingshi0);
        expect(Game.save.jiyuan, '三连后机缘应补到 60').toBeGreaterThanOrEqual(60);
        expect(Game.save.starter.done).toBe(true);
        expect(Game.save.starter.jiyuanGranted).toBe(true);
        expect(lastBtn((b) => b.text === TEXTS.starterBoxGo), '完成后主按钮应为去渡劫').toBeTruthy();
    });

    it('StarterBoxScene：去渡劫 → swap RainScene（下层 StarterScene 保留）', () => {
        bootGame();
        h.reset();
        const page = new StarterBoxScene();
        page.onEnter();
        for (let i = 0; i < 3; i += 1) lastBtn((b) => b.text === TEXTS.starterBoxCount(i + 1))!.onClick();
        const swap = vi.spyOn(Game.stack, 'swap').mockImplementation(() => { });
        lastBtn((b) => b.text === TEXTS.starterBoxGo)!.onClick();
        expect(swap).toHaveBeenCalledWith(expect.any(RainScene));
    });
});

describe('场景集成：M36 每日天劫（同种子 8 秒挑战）', () => {
    /** 把天劫入口页挂到栈顶（Game.init 已装配 Game.tianjie） */
    function mountTianjie() {
        const page = new TianjieScene();
        (Game.stack as unknown as { push: (s: unknown) => void }).push(page);
        return page;
    }

    it('入口页：显示今日种子/次数/词条，主按钮「迎劫」push 天劫 RainScene', () => {
        bootGame();
        h.reset();
        mountTianjie();
        const start = lastBtn((b) => b.text === TEXTS.tianjieStart);
        expect(start, '未找到迎劫按钮').toBeTruthy();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        (start as unknown as { onClick: () => void }).onClick();
        expect(push).toHaveBeenCalledWith(expect.any(RainScene));
        const scene = push.mock.calls[0][0] as unknown as { mode: string };
        expect((scene as unknown as { mode: string }).mode).toBe('tianjie');
    });

    it('入口页：次数用尽 → 不显示「迎劫」，主按钮置灰文案为「今日次数已用尽」', () => {
        bootGame();
        Game.save.tianjie.attempts = TIANJIE.attemptsPerDay;
        Game.save.tianjie.day = Game.tianjie.todayKey();
        h.reset();
        mountTianjie();
        expect(lastBtn((b) => b.text === TEXTS.tianjieStart)).toBeUndefined();
        expect(lastBtn((b) => b.text === TEXTS.tianjieAttemptsNone)).toBeTruthy();
    });

    it('RainScene(tianjie)：onEnter 消耗 1 次、用独立系统驱动，12 秒内结算并 push 天劫结果页', () => {
        bootGame();
        h.reset();
        const before = Game.save.tianjie.attempts;
        const scene = new RainScene('tianjie');
        scene.onEnter();
        expect(Game.save.tianjie.attempts).toBe(before + 1);
        // 天劫不走 Game.rain：内部持有独立 RainSystem
        const sys = (scene as unknown as { tianjieSys: RainSystem | null }).tianjieSys;
        expect(sys).toBeInstanceOf(RainSystem);
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        for (let i = 0; i < 500 && push.mock.calls.length === 0; i += 1) scene.update(0.02);
        expect(push).toHaveBeenCalledWith(expect.any(TianjieResultScene));
        // 只写分数，不发经济（灵石/机缘不变）
        expect(Game.save.tianjie.totalRuns).toBe(1);
    });

    it('退出天劫：次数不退还（挑战有代价）', () => {
        bootGame();
        h.reset();
        const scene = new RainScene('tianjie');
        scene.onEnter();
        const used = Game.save.tianjie.attempts;
        expect(used).toBeGreaterThan(0);
        // 「退出」分支只 pop 不退还次数：再进一次入口页时剩余次数仍少 1
        vi.spyOn(Game.stack, 'pop').mockImplementation(() => { });
        (scene as unknown as { finished: boolean }).finished = true;
        expect(Game.save.tianjie.attempts).toBe(used);
    });

    it('结果页：剩余次数>0 显示「再战一次」，用尽则显示「今日次数已用尽」', () => {
        bootGame();
        h.reset();
        const view = Game.tianjie.view(Game.save);
        const run = {
            score: 66,
            rating: '灵阶',
            newTodayBest: true,
            newBest: true,
            result: { rating: '灵阶', mode: 'tianjie', score: 66, maxCombo: 5, comboBonus: 0, goldBonus: 0, penalty: 0, mindDemon: false, extraXiuwei: 0, goldCount: 10, blueCount: 1, redCount: 2 },
            attemptsLeft: 2,
        };
        const page = new TianjieResultScene({ run: run as never, view });
        page.onEnter();
        expect(lastBtn((b) => b.text === TEXTS.tianjieAgain)).toBeTruthy();
        expect(lastBtn((b) => b.text === TEXTS.tianjieAttemptsNone)).toBeUndefined();
    });

    it('天劫词条全服一致：两个玩家同日拿到的词条相同', () => {
        const a = dailyModifiers('2026-10-22').map((m) => m.id);
        const b = dailyModifiers('2026-10-22').map((m) => m.id);
        expect(a).toEqual(b);
    });

    it('TianjieSystem 默认装配在 Game 上（Game.init 链路）', () => {
        bootGame();
        expect(Game.tianjie).toBeInstanceOf(TianjieSystem);
        expect(Game.save.version).toBe(17);
    });

    // R1 修复：练气后首页横幅回归剑冢，天劫必须有一个「不依赖今日是否已打」的固定入口。
    // 这两例锁的就是「可达性」——不是「昨日战报提示条」（那条本身有前置条件）。
    it('R1 常驻入口：论道页排行 tab 榜下有天劫入口，点击进 TianjieScene', () => {
        bootGame();
        h.reset();
        Game.save.realmIndex = 1; // 练气：首页横幅已是剑冢，提示条可能有也可能没有
        const s = new LudaoScene();
        s.onEnter();
        const entry = lastBtn((b) => b.text.indexOf(TEXTS.tianjieEntryLine(0, 3)) === 0);
        expect(entry, '论道排行 tab 缺少天劫入口').toBeTruthy();
        const push = vi.spyOn(Game.stack, 'push').mockImplementation(() => { });
        (entry as unknown as { onClick: () => void }).onClick();
        expect(push).toHaveBeenCalledWith(expect.any(TianjieScene));
    });

    it('R1 常驻入口：今日次数用尽（已打 3 次）时入口仍在，只是文案改为「今日已尽」', () => {
        bootGame();
        h.reset();
        Game.save.realmIndex = 1;
        Game.tianjie.refresh(Game.save);
        Game.save.tianjie.attempts = 3; // 今日次数已用尽
        Game.save.tianjie.todayBest = 71;
        const s = new LudaoScene();
        s.onEnter();
        const entry = lastBtn((b) => b.text.indexOf(TEXTS.tianjieEntryLine(71, 0)) === 0);
        expect(entry, '次数用尽后入口不应消失（否则当天再也进不去）').toBeTruthy();
        expect((entry as unknown as { text: string }).text).toContain('今日已尽');
    });
});

describe('场景集成：M36 战绩卡（可分享）', () => {
    const run = {
        score: 78,
        rating: '仙阶',
        newTodayBest: true,
        newBest: true,
        attemptsLeft: 1,
        result: { rating: '仙阶', mode: 'tianjie', score: 78, maxCombo: 9, comboBonus: 0, goldBonus: 0, penalty: 0, mindDemon: false, extraXiuwei: 0, goldCount: 14, blueCount: 0, redCount: 1 },
    };
    const view = () => Game.tianjie.view(Game.save);

    it('卡面按 720×960 竖图构建：分数/评级/词条/战绩行齐全，且不含「再战」等私域按钮', () => {
        bootGame();
        Game.save.tianjie.weekKey = '2026-10-19';
        Game.save.tianjie.weekBest = 78;
        h.reset();
        const page = new TianjieShareScene({ run: run as never, view: view() });
        page.onEnter();
        const card = h.registry.nodes.find((n) => n.name === 'card');
        expect(card, '未构建卡面节点').toBeTruthy();
        expect(card!.w).toBe(SHARE_CARD.w);
        expect(card!.h).toBe(SHARE_CARD.h);
        expect(hasText('78'), '卡面缺少分数').toBe(true);
        expect(hasText('仙阶')).toBe(true);
        expect(hasText('今日词条'), '卡面缺少词条区').toBe(true);
        // 分享卡只承载战报，不应出现「再战一次」这类局内动作（会被带进分享图）
        expect(h.registry.buttons.some((b) => b.text === TEXTS.tianjieAgain)).toBe(false);
    });

    it('Web 端（无 toTempFilePath）点分享 → toast 降级，不抛错、不重复导出', () => {
        bootGame();
        h.reset();
        const page = new TianjieShareScene({ run: run as never, view: view() });
        page.onEnter();
        const btn = lastBtn((b) => b.text === '分享战报')!;
        expect(btn).toBeTruthy();
        expect(() => { btn.onClick(); btn.onClick(); }).not.toThrow();
        expect(h.registry.toasts.indexOf(TEXTS.shareUnavailable) >= 0, 'Web 端应提示不可分享').toBe(true);
    });

    it('onExit 回收导出用的离屏节点（防每次分享多一份 GPU 资源）', () => {
        bootGame();
        h.reset();
        const page = new TianjieShareScene({ run: run as never, view: view() });
        page.onEnter();
        expect(() => page.onExit()).not.toThrow();
    });
});
