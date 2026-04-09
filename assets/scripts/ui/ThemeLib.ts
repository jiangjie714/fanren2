import {
    assetManager,
    AssetManager,
    Button,
    Color,
    Graphics,
    Label,
    Layers,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    UIOpacity,
    Widget,
    tween,
    view,
    Vec2,
    Vec3,
} from 'cc';
import { ALIGN } from '../infra/Align';
import { AudioMgr } from '../infra/AudioMgr';
import { FrameAnimator } from './FrameAnimator';

/**
 * Production UI kit for the ink-and-gold style.
 * Design space: 720x1280 centered; safe margins are reserved for notches.
 */

export const DESIGN_W = 720;
export const DESIGN_H = 1280;

export const SAFE = {
    x: 28,
    top: 92,
    bottom: 104,
};

export const MOTION = {
    fast: 0.18,
    normal: 0.24,
    press: 0.15,
};

const UI_LAYER = Layers.Enum.UI_2D;
const DEFAULT_FONT = '"Noto Serif SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

export const THEME = {
    // ── 太清金阙 · 修仙主题色板 ──
    // 唯一定义源：tools/art-rebuild/palette.py（改色先改那里，再 --emit-ts 同步过来）。
    // 逻辑：玄墨为地（**紫相，不是蓝相**）、宣纸为字、灵金为尊、朱砂示警、翡翠显灵。
    // 对齐美术风格的高饱和国漫厚涂取色，29 组对比度 + 4 项结构不变量已量化验证通过。

    // 地 · 玄墨（旧色板是 navy #0D1535 冷蓝，与暖色国漫背景打架，这里全部换成紫相）
    void: new Color(11, 8, 23, 255),            // 归墟 — 最深底：弹窗背板 / 全屏遮罩
    paperDark: new Color(26, 20, 48, 255),      // 玄墨紫 #1A1430 — 标准面板底
    panelBg: new Color(36, 28, 66, 224),        // 玄青 #241C42 — 半透明面板 / 卡片
    slate: new Color(36, 28, 66, 255),          // 玄青（不透明版）— 用于 Graphics 直涂
    mist: new Color(51, 40, 82, 255),           // 冥雾 #332852 — 分隔线 / 输入框底
    voidEnd: new Color(26, 21, 46, 255),        // 沉墨 #1A152E — 禁用态按钮底（比玄墨更沉）

    // 字 · 宣纸（暖白，不用冷白 —— 冷白压在暖底上会显脏）
    paper: new Color(247, 240, 228, 255),       // 宣纸白 #F7F0E4 — 一级文字 / 数值
    ink: new Color(247, 240, 228, 255),         // 一级文字（同宣纸白）
    paperDim: new Color(220, 209, 187, 255),    // 陈宣 #DCD1BB — 二级正文
    inkSoft: new Color(179, 165, 204, 255),     // 石青灰 #B3A5CC — 辅助说明 / 单位后缀
    disabled: new Color(110, 102, 144, 255),    // 灰青 #6E6690 — 禁用态文字
    ash: new Color(168, 158, 146, 255),         // 烟灰 #A89E92 — 灰置/锁定态（暖中性、去饱和）
    shadow: new Color(11, 8, 23, 190),          // 文字投影用归墟

    // 灵金 · 唯一强调金属色
    gold: new Color(255, 210, 74, 255),         // 荧光明黄 #FFD24A — CTA / 进度填充
    goldLight: new Color(255, 233, 168, 255),   // 曦金 #FFE9A8 — 标题 / 境界名 / 稀有度
    goldDeep: new Color(198, 138, 33, 255),     // 赤金 #C68A21 — 包边金线 / 弱化金
    bronze: new Color(142, 100, 32, 255),       // 古铜 #8E6420 — 分隔描边
    border: new Color(198, 138, 33, 205),       // 边框 = 赤金（半透明）

    // 朱砂 · 危险与代价
    danger: new Color(232, 69, 60, 255),        // 朱砂红 #E8453C — 危险 / 失败 / 雷劫
    cinnabar: new Color(232, 69, 60, 255),      // 同上，语义更明确的别名
    cinnabarDeep: new Color(142, 32, 41, 255),  // 深朱 #8E2029 — 危险面板底 / 失败描边

    // 翡翠 · 灵气与增益
    jade: new Color(43, 196, 168, 255),         // 翡翠青 #2BC4A8 — 灵气 / 机缘 / 成功
    jadeDeep: new Color(18, 119, 106, 255),     // 深翡翠 #12776A — 灵气描边 / 进度底
    success: new Color(43, 196, 168, 255),      // 成功 = 翡翠青（语义一致：增益即灵气）

    // 青冥 · 信息
    azurite: new Color(90, 169, 230, 255),      // 青冥 #5AA9E6 — 信息 / 护盾类灵雨
    violet: new Color(183, 155, 234, 255),      // 紫霄 #B79BEA — 稀有度第三档 / 变异类

    // 玩法 / 灵雨
    rainGold: new Color(255, 210, 74, 255),     // 金雨
    rainBlue: new Color(90, 169, 230, 255),     // 护盾青雨
    rainRed: new Color(232, 69, 60, 255),       // 雷劫朱砂

    white: new Color(255, 255, 255, 255),
    transparent: new Color(0, 0, 0, 0),

    // ── 面板叠加层（tint 是**乘算**，所以这里只能调明度与不透明度，不能改色相）──
    // 旧代码到处写 new Color(14, 20, 52, 230) 这种 navy 硬编码，直接 tint 到新面板上
    // 会把玄墨紫乘成脏蓝黑。层级差异改由这三个令牌表达。
    tintPanel: new Color(255, 255, 255, 238),   // 标准面板：资产原色，仅调不透明度
    tintDeep: new Color(190, 180, 205, 228),    // 后退层：略压暗，用于弹窗背板
    tintCard: new Color(255, 250, 240, 244),    // 卡片：略提亮，用于面板内卡片
    tintSeat: new Color(255, 248, 236, 232),    // 角色底座
    // 灰置 = 烟灰（暖中性 R>B、饱和度 0.13）。旧值 (170,160,190) 是冷薰衣草，
    // 乘到玄墨紫面板上会「冷调发白」，锁定的卡片看着像高亮而不是禁用。
    tintMuted: new Color(168, 158, 146, 214),   // 不可用面板 / 锁定态 / 未点亮符文
};

/** 取出某令牌的同色不同透明度版本（乘算 tint 需要精确控制 alpha）。 */
export function faded(c: Color, alpha: number): Color {
    return new Color(c.r, c.g, c.b, alpha);
}

export interface PanelOpts {
    fill?: Color | null;
    border?: Color | null;
    borderWidth?: number;
    radius?: number;
}

export interface ImageOpts {
    sliced?: boolean;
    tint?: Color;
    /** 主路径加载失败（资源缺失）时兜底的次选路径，避免「图不显示也不报错」的空白 */
    fallbackPath?: string;
}

export interface LabelOpts {
    color?: Color;
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
    width?: number;
    lineHeight?: number;
    outline?: Color;
    outlineWidth?: number;
    shadow?: boolean;
    shadowColor?: Color;
    shrink?: boolean;
    /**
     * 把节点锚点从居中改成左中，(x, y) 即**文本左边缘**。
     *
     * 为什么需要：`align:'left'` + `width` 的语义是「在一段定宽盒子内左对齐」，
     * 盒子本身仍是居中锚点，所以文本左边缘落在 `x - width / 2`。调用方几乎
     * 都会把 x 当成左边缘传，结果是首字贴到（甚至超出）容器边缘被裁掉。
     * 需要「x 就是左边缘」时请用 labelL()。
     */
    anchorLeft?: boolean;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonOpts {
    fontSize?: number;
    textColor?: Color;
    fill?: Color;
    border?: Color;
    radius?: number;
    borderWidth?: number;
    variant?: ButtonVariant;
}

export interface ButtonHandle {
    node: Node;
    labelNode: Node;
    setText(t: string): void;
    setEnabled(on: boolean): void;
}

export function uinode(name: string, parent: Node | null = null, w = 0, h = 0): Node {
    const n = new Node(name);
    n.layer = UI_LAYER;
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    ut.setAnchorPoint(0.5, 0.5);
    if (parent) n.parent = parent;
    return n;
}

export function drawPanel(g: Graphics, w: number, h: number, opts: PanelOpts = {}): void {
    const { fill = THEME.panelBg, border = THEME.border, borderWidth = 2, radius = 12 } = opts;
    g.clear();
    const x = -w / 2;
    const y = -h / 2;
    if (fill) {
        g.fillColor = fill;
        g.roundRect(x, y, w, h, radius);
        g.fill();
    }
    if (border) {
        g.strokeColor = border;
        g.lineWidth = borderWidth;
        g.roundRect(x, y, w, h, radius);
        g.stroke();
    }
}

// 美术资源统一放 subres bundle（assets/subres）：抖音端由 bundle meta 的
// compressionType=subpackage 构建为小游戏分包，主包只留引擎与代码；
// 分包按需下载，首次 image()/spritePanel() 时触发，失败不缓存、下次调用自动重试。
const ART_BUNDLE = 'subres';
let artBundlePromise: Promise<AssetManager.Bundle> | null = null;

function loadArtBundle(): Promise<AssetManager.Bundle> {
    if (!artBundlePromise) {
        artBundlePromise = new Promise((resolve, reject) => {
            assetManager.loadBundle(ART_BUNDLE, (err, bundle) => (err ? reject(err) : resolve(bundle)));
        });
        artBundlePromise.catch(() => {
            artBundlePromise = null;
        });
    }
    return artBundlePromise;
}

function loadSpriteFrame(path: string, cb: (frame: SpriteFrame | null) => void): void {
    loadArtBundle()
        .then((bundle) => {
            bundle.load(path, SpriteFrame, (err, frame) => {
                cb(err || !frame ? null : frame);
            });
        })
        .catch((err) => {
            console.warn(`[ThemeLib] 资源分包 ${ART_BUNDLE} 加载失败: ${err?.message ?? err}`);
            cb(null);
        });
}

function setSprite(node: Node, path: string, sliced = false, tint?: Color, fallbackPath?: string): Sprite {
    const sp = node.addComponent(Sprite);
    sp.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.trim = false;
    if (tint) sp.color = tint;
    loadSpriteFrame(path, (frame) => {
        if (frame && node.isValid) {
            sp.spriteFrame = frame;
            return;
        }
        if (fallbackPath && node.isValid) {
            loadSpriteFrame(fallbackPath, (fb) => {
                if (fb && node.isValid) sp.spriteFrame = fb;
            });
        }
    });
    return sp;
}

export function image(parent: Node, path: string, w: number, h: number, opts: ImageOpts = {}): Node {
    const name = path.split('/').slice(-2, -1)[0] || 'image';
    const n = uinode(name, parent, w, h);
    setSprite(n, path, opts.sliced, opts.tint, opts.fallbackPath);
    return n;
}

export function pageBackground(parent: Node, path = 'art/ui/bg_home/spriteFrame'): Node {
    const size = typeof view !== 'undefined' ? view.getVisibleSize() : null;
    const w = size ? Math.max(DESIGN_W, Math.ceil(size.width)) : DESIGN_W;
    const h = size ? Math.max(DESIGN_H, Math.ceil(size.height)) : DESIGN_H;
    const bg = image(parent, path, w, h);
    bg.setPosition(0, 0, 0);
    return bg;
}

/**
 * 帧动画节点：异步加载整组帧后由 FrameAnimator 循环播放。
 *
 * 帧路径统一约定为 `art/anims/<name>/<frame>` 形式，调用方传完整数组以便
 * 帧数与命名自由（idle 6 帧、cast 6 帧、break 9 帧互不影响）。
 * 任一顿帧加载失败都不致命：过滤掉缺失帧后继续播放，最差退化为静态图，
 * 不会像 Sprite.FILLED 那样在资源缺失时直接把引擎打崩。
 */
export function spriteAnimation(
    parent: Node,
    paths: string[],
    w: number,
    h: number,
    fps = 8,
    loop = true,
): Node {
    const n = uinode('anim', parent, w, h);
    const sp = n.addComponent(Sprite);
    sp.type = Sprite.Type.SIMPLE;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.trim = false;
    const animator = n.addComponent(FrameAnimator);
    Promise.all(
        paths.map((p) => new Promise<SpriteFrame | null>((resolve) => loadSpriteFrame(p, resolve))),
    ).then((loaded) => {
        if (!n.isValid) return;
        const frames = loaded.filter((f): f is SpriteFrame => f !== null);
        if (frames.length > 0) animator.play(frames, fps, loop);
    });
    return n;
}

/** 依名称批量拼出帧路径，例：animFrames('char_idle', 6) → art/anims/char_idle/idle_1..6 */
export function animFrames(dir: string, count: number, prefix = 'idle'): string[] {
    return Array.from({ length: count }, (_, i) => `art/anims/${dir}/${prefix}_${i + 1}/spriteFrame`);
}

export function spritePanel(
    parent: Node,
    w: number,
    h: number,
    path = 'art/ui/panel_dark_9s/spriteFrame',
    tint?: Color,
): Node {
    return image(parent, path, w, h, { sliced: true, tint });
}

/**
 * 带语义色晕的面板 —— 用于「成功 / 失败」这类必须一眼读出结果的容器。
 *
 * 为什么不能直接 tint：tint 是**乘算**，玄墨紫底乘任何颜色都只会更暗，乘不出翡翠绿
 * 与朱砂红。所以语义色只能**叠**上去，不能染上去。这里底层保持标准玄墨 9-slice
 * （墨边金线完整保留），上层叠一块内缩的语义色晕，读起来是「金框里的彩色内胆」。
 *
 * 注意：色相不能作为唯一信息载体。调用方必须同时用文案（突破成功 / 突破失败）
 * 做冗余编码 —— 红绿色盲玩家占比不低。
 */
export function washedPanel(
    parent: Node,
    w: number,
    h: number,
    wash: Color,
    washAlpha = 116,
): Node {
    const n = spritePanel(parent, w, h, undefined, THEME.tintCard);
    const g = uinode('wash', n, w, h).addComponent(Graphics);
    const iw = w - 14;
    const ih = h - 14;
    g.fillColor = faded(wash, washAlpha);
    g.roundRect(-iw / 2, -ih / 2, iw, ih, 13);
    g.fill();
    return n;
}

/**
 * 渐隐遮挡层（scrim）—— 解决「文字直接压在亮背景上」的可读性问题。
 *
 * 全屏厚涂插画的中亮度不可控（`bg_result` 的金色光柱就落在山腰），文字压上去
 * 时对时不对。与其反复重生成背景，不如在文字区铺一层「透明→归墟」的渐隐，
 * 这是标准做法，也让背景本身保持完整观感。
 *
 * 两个易错点：
 * 1. **profile 不能用 t²** —— t² 在带的前 30% 几乎全透明，而文字往往就落在那里，
 *    结果是「铺了遮挡但没变暗」。改成前 40% 完成软过渡、其余满强度。
 * 2. **色带要够密** —— 24 条在 500px 高度上是 20px 一档，低 alpha 段能看出条纹。
 *
 * @param fromTop true = 上透明下实（底部文字区）；false = 上实下透明（顶部标题区）
 */
export function scrim(
    parent: Node,
    w: number,
    h: number,
    color: Color = THEME.void,
    maxAlpha = 228,
    fromTop = true,
    bands = 64,
): Node {
    const n = uinode('scrim', parent, w, h);
    const g = n.addComponent(Graphics);
    const bh = h / bands;
    for (let i = 0; i < bands; i++) {
        const t = i / (bands - 1);
        const ramp = Math.min(1, t / 0.4); // 前 40% 完成过渡，之后满强度
        g.fillColor = faded(color, Math.round(maxAlpha * ramp * ramp));
        const y = h / 2 - (i + 1) * bh;
        g.rect(-w / 2, fromTop ? y : -y - bh, w, bh + 1);
        g.fill();
    }
    return n;
}

export function panel(parent: Node, w: number, h: number, opts: PanelOpts = {}): Node {
    const n = uinode('panel', parent, w, h);
    const g = n.addComponent(Graphics);
    drawPanel(g, w, h, opts);
    return n;
}

export function label(parent: Node, text: string, fontSize: number, opts: LabelOpts = {}): Node {
    const {
        color = THEME.ink,
        bold = false,
        align = 'center',
        width = 0,
        lineHeight,
        outline,
        outlineWidth,
        shadow = true,
        shadowColor = THEME.shadow,
        shrink = false,
        anchorLeft = false,
    } = opts;
    const n = uinode('label', parent, width || 200, fontSize);
    if (anchorLeft) n.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    // 左锚点时不显式给 align 就默认左对齐（否则会出现「锚点在左、文字居中」的错位）
    const ha: NonNullable<LabelOpts['align']> = opts.align ?? (anchorLeft ? 'left' : 'center');
    const l = n.addComponent(Label);
    l.string = text;
    l.fontSize = fontSize;
    l.lineHeight = lineHeight ?? Math.round(fontSize * 1.25);
    l.color = color;
    l.isBold = bold;
    l.useSystemFont = true;
    l.fontFamily = DEFAULT_FONT;
    if (outline) {
        l.enableOutline = true;
        l.outlineColor = outline;
        l.outlineWidth = outlineWidth ?? Math.max(2, Math.round(fontSize * 0.06));
    }
    if (shadow) {
        l.enableShadow = true;
        l.shadowColor = shadowColor;
        l.shadowOffset = new Vec2(0, -2);
    }
    if (ha === 'left') l.horizontalAlign = Label.HorizontalAlign.LEFT;
    else if (ha === 'right') l.horizontalAlign = Label.HorizontalAlign.RIGHT;
    else l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    if (width > 0) l.overflow = shrink ? Label.Overflow.SHRINK : Label.Overflow.RESIZE_HEIGHT;
    return n;
}

/**
 * 左锚点文本：(x, y) 就是**文本左边缘**，左内边距不用再手动减 `width / 2`。
 *
 * 用作列表行 / 卡片内的常规左对齐文本。行内排版请把 `x` 直接写成
 * 「容器左缘 + 内边距」，可读性和可维护性都远好于手算盒子中心。
 */
export function labelL(parent: Node, text: string, fontSize: number, opts: LabelOpts = {}): Node {
    return label(parent, text, fontSize, { ...opts, align: 'left', anchorLeft: true });
}

const BUTTON_VARIANTS: Record<ButtonVariant, { frame: string; disabled: Color }> = {
    // 禁用态统一压到「沉墨」——比玄墨面板更沉、比背景略亮，形状仍可辨但明显不可用。
    primary: { frame: 'art/ui/btn_primary_gold_9s/spriteFrame', disabled: new Color(26, 21, 46, 235) },
    secondary: { frame: 'art/ui/btn_secondary_dark_9s/spriteFrame', disabled: new Color(26, 21, 46, 225) },
    ghost: { frame: 'art/ui/btn_ghost_dark_9s/spriteFrame', disabled: new Color(26, 21, 46, 190) },
};

export function spriteButton(
    parent: Node,
    w: number,
    h: number,
    text: string,
    onClick: () => void,
    opts: ButtonOpts = {},
): ButtonHandle {
    const resolvedVariant: ButtonVariant = opts.variant ?? 'secondary';
    // 主按钮是明金底，文字必须用最深的归墟色（#0B0817，对比 13.7:1）；
    // 用白色反而只有 1.4:1，整行字会糊在金色里。
    const defaultTextColor = resolvedVariant === 'primary' ? THEME.void : THEME.paper;
    const fontSize = opts.fontSize ?? 30;
    const textColor = opts.textColor ?? defaultTextColor;
    const n = uinode('button', parent, w, h);
    const sp = n.addComponent(Sprite);
    sp.type = Sprite.Type.SLICED;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.trim = false;
    const normalColor = new Color(255, 255, 255, 255);
    sp.color = normalColor;
    loadSpriteFrame(BUTTON_VARIANTS[resolvedVariant].frame, (frame) => {
        if (frame && n.isValid) sp.spriteFrame = frame;
    });

    const lNode = label(n, text, fontSize, {
        color: textColor,
        bold: true,
        width: Math.max(0, w - 16),
        lineHeight: h,
        outline: resolvedVariant === 'primary' ? new Color(255, 240, 190, 80) : undefined,
        outlineWidth: 1,
        shadow: resolvedVariant !== 'primary',
    });
    lNode.getComponent(UITransform)?.setContentSize(Math.max(0, w - 16), h);
    lNode.setPosition(0, 0, 0);
    const btn = n.addComponent(Button);
    btn.transition = Button.Transition.SCALE;
    btn.zoomScale = 0.95;
    btn.target = n;
    const handle: ButtonHandle = {
        node: n,
        labelNode: lNode,
        setText(t: string) {
            lNode.getComponent(Label)!.string = t;
        },
        setEnabled(on: boolean) {
            btn.interactable = on;
            sp.color = on ? normalColor : BUTTON_VARIANTS[resolvedVariant].disabled;
            lNode.getComponent(Label)!.color = on ? textColor : THEME.disabled;
        },
    };
    n.on(Button.EventType.CLICK, () => {
        if (btn.interactable) {
            AudioMgr.ensureStarted();
            AudioMgr.play('click');
            onClick();
        }
    });
    return handle;
}

export function iconButton(
    parent: Node,
    iconPath: string,
    onClick: () => void,
    w = 88,
    h = 88,
): ButtonHandle {
    const handle = spriteButton(parent, w, h, '', onClick, { variant: 'ghost', textColor: THEME.paper });
    // 图标按按钮尺寸的 0.68 摆放：玉牌圆盘自带深墨外圈 + 赤金内环，本身就是「按钮面」，
    // 缩到 0.45 时字形只剩 ~19px，小屏上认不出画的是什么。
    image(handle.node, iconPath, Math.round(w * 0.68), Math.round(h * 0.68));
    return handle;
}

export interface ProgressBarHandle {
    node: Node;
    set(ratio: number, text?: string): void;
}

export function progressBar(
    parent: Node,
    w: number,
    h: number,
    opts: { fill?: Color; text?: string; fontSize?: number } = {},
): ProgressBarHandle {
    const { text = '', fontSize = 22 } = opts;
    const n = uinode('progress', parent, w, h);
    image(n, 'art/ui/progress_bg_9s/spriteFrame', w, h, { sliced: true });
    const fillNode = uinode('fill', n, w - 6, h - 6);
    // FILLED 类型在 spriteFrame 缺失时引擎会崩（updateUVs 读 null 贴图），
    // 因此 type= FILLED 必须等资源加载回调后再设置。
    const sp = fillNode.addComponent(Sprite);
    sp.type = Sprite.Type.SLICED;
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.trim = false;
    let fillRange = 0;
    loadSpriteFrame('art/ui/progress_fill_gold_9s/spriteFrame', (frame) => {
        if (frame && fillNode.isValid) {
            sp.spriteFrame = frame;
            sp.type = Sprite.Type.FILLED;
            sp.fillType = Sprite.FillType.HORIZONTAL;
            sp.fillStart = 0;
            sp.fillRange = fillRange;
        }
    });
    // 进度条文字横跨「已填充的亮金」与「未填充的暗底」两种背景，纯白或纯深色都会
    // 在其中一侧糊掉。用「白字 + 深墨描边」同时镇住两侧（HUD 文字的标准做法）。
    const textNode = label(n, text, fontSize, {
        color: THEME.paper,
        bold: true,
        outline: faded(THEME.void, 235),
        outlineWidth: 3,
    });

    return {
        node: n,
        set(ratio: number, t?: string) {
            fillRange = Math.min(1, Math.max(0, ratio));
            sp.fillRange = fillRange;
            if (t !== undefined) textNode.getComponent(Label)!.string = t;
        },
    };
}

export function dimLayer(parent: Node, alpha = 140): Node {
    const size = typeof view !== 'undefined' ? view.getVisibleSize() : null;
    const w = size ? Math.max(DESIGN_W, Math.ceil(size.width)) * 2 : DESIGN_W * 2;
    const h = size ? Math.max(DESIGN_H, Math.ceil(size.height)) * 2 : DESIGN_H * 2;
    const n = uinode('dim', parent, w, h);
    n.setPosition(0, 0, 0);
    const g = n.addComponent(Graphics);
    // 遮罩必须用玄墨（紫相）。旧值 (22,36,50) 是冷蓝灰，压在暖色国漫插画上是一层脏雾。
    g.fillColor = faded(THEME.void, alpha);
    g.roundRect(-w / 2, -h / 2, w, h, 0);
    g.fill();
    const blocker = n.addComponent(Button);
    blocker.transition = Button.Transition.NONE;
    blocker.target = n;
    return n;
}

export function fadeIn(node: Node, dy = 18, delay = 0): void {
    const op = node.addComponent(UIOpacity);
    op.opacity = 0;
    const y = node.position.y;
    node.setPosition(node.position.x, y + dy, node.position.z);
    tween(op)
        .delay(delay)
        .to(MOTION.fast, { opacity: 255 })
        .start();
    tween(node)
        .delay(delay)
        .to(MOTION.normal, { position: new Vec3(node.position.x, y, node.position.z) }, { easing: 'sineOut' })
        .start();
}

export function toast(parent: Node, text: string, fontSize = 26): void {
    const n = spritePanel(parent, 540, 94, undefined, THEME.paperDark);
    n.setPosition(0, 196, 0);
    label(n, text, fontSize, { color: THEME.paper, bold: true, shrink: true, width: 480 });
    const op = n.addComponent(UIOpacity);
    op.opacity = 0;
    tween(op)
        .to(MOTION.fast, { opacity: 255 })
        .delay(1.1)
        .to(0.3, { opacity: 0 })
        .call(() => n.destroy())
        .start();
}

export function pageHeader(parent: Node, title: string, onBack: () => void): Node {
    const header = uinode('header', parent, DESIGN_W, 110);
    header.setPosition(0, DESIGN_H / 2 - SAFE.top, 0);
    spritePanel(header, DESIGN_W - SAFE.x * 2, 92, undefined, THEME.panelBg);
    iconButton(header, 'art/ui/icons/icon_back/spriteFrame', onBack, 88, 68)
        .node.setPosition(-((DESIGN_W - SAFE.x * 2) / 2) + 52, 0, 0);
    label(header, title, 36, {
        bold: true,
        color: THEME.goldLight,
    });
    return header;
}
