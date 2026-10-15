/**
 * 新手引导层（M27，docs/数值假设.md #54）——全项目**第一个**引导系统。
 *
 * 形态：挂在 `Canvas` 下、`SceneRoot` **之后**添加（同父下后添加者在上）的覆盖层，
 * **不是** `IScene`：不入 `SceneStack`，因此不参与 push/pop/swap，永远不会污染返回栈。
 *
 * 三个关键设计：
 * 1. **四矩形挖洞**：Cocos 的 `Graphics` 没有 even-odd 挖洞，用上下左右四块拼出洞。
 *    每块带一个 `Button`（`Transition.NONE`）**吸收点击** → 洞区无遮罩 → 点击穿透到下层 UI。
 *    不碰目标按钮自身逻辑（遵守项目硬约束：置灰用 `UIOpacity`，禁用 `setEnabled(false)`）。
 * 2. **目标坐标由场景自报**（`GuideHost.guideAnchor()`），不在本层硬编码坐标表 ——
 *    场景改版式时坐标不会漂移，且 `null` 能表达「此刻不宜引导」（如开箱页浮层打开中）。
 * 3. **每帧 sync 但零重建**：`Game.tick()` 调 `sync()`，内部只比一个字符串 key，
 *    key 未变直接 return，变了才销毁重建（含停掉旧 tween，避免离屏 repeatForever 常驻）。
 *
 * 资源：全部 `Graphics` 代码绘制，**不新增任何美术资源**。
 */
import { Button, Graphics, Node, Tween, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { Game } from '../infra/Game';
import { IScene } from '../infra/SceneStack';
import { TEXTS } from '../core/config/texts';
import {
    guideFinished,
    guideStepFor,
    type GuideAnchor,
    type GuideHost,
    type GuideStep,
} from '../core/guide';
import { THEME, faded, label, spriteButton, uinode, visibleHeight, visibleWidth } from './ThemeLib';

/** 遮罩浓度（与 dimLayer 同口径：玄墨紫，不用旧冷蓝灰） */
const MASK_ALPHA = 170;
/** 气泡宽度（横向 [-280, 280] 落在安全区 ±332 内） */
const BUBBLE_W = 560;
/** 气泡高度：标题 + 正文 + 跳过钮 */
const BUBBLE_H = 148;
/** 气泡与洞的间隙（含脉冲指示点占位：指示点在洞下方 18，故间隙要大于它） */
const GAP = 56;
/** 屏幕边缘留白 */
const EDGE = 12;

export class GuideLayer {
    private static layer: Node | null = null;
    private static key = '';

    /**
     * 在 `SceneRoot` **之后**调用：同父节点下后添加者渲染/命中在上，
     * 保证引导层永远盖在当前页面之上。
     */
    static attach(canvas: Node) {
        const layer = uinode('GuideLayer', canvas, visibleWidth(), visibleHeight());
        layer.setPosition(0, 0, 0);
        layer.active = false;
        this.layer = layer;
    }

    /**
     * 每帧同步（由 `Game.tick` 调用）。key 未变则零开销返回。
     *
     * 结束条件在这里收口：① 主动跳过（气泡按钮写 `done`）② 首次渡劫成功
     * （`guideFinished` → 补写 `done` 并落盘一次，之后 `guideStepFor` 恒返回 null）。
     */
    static sync(): void {
        const layer = this.layer;
        if (!layer || !layer.isValid) return;
        const save = Game.save;
        if (!save || !Game.realm) return;

        if (guideFinished(save)) {
            save.tutorial.done = true;
            Game.persist();
        }

        const top = Game.stack?.top as (IScene & Partial<GuideHost>) | undefined;
        const step = guideStepFor(save, {
            scene: top?.node.name ?? '',
            canBreakthrough: Game.realm.canBreakthrough(),
        });
        // 只有真的要显示引导时才查锚点/弹层（老玩家 done 后这一步永远不执行，零开销）
        const anchor = step && top && typeof top.guideAnchor === 'function' && !this.hasModal(top.node)
            ? top.guideAnchor()
            : null;

        const key = step && anchor
            ? `${step.id}@${anchor.x},${anchor.y},${anchor.w},${anchor.h}`
            : '';
        if (key === this.key) return;
        this.key = key;
        this.rebuild(step, anchor);
    }

    /** 整层重建；`step`/`anchor` 任一为空 → 隐藏整层（新页面默认不吃引导） */
    private static rebuild(step: GuideStep | null, anchor: GuideAnchor | null) {
        const layer = this.layer;
        if (!layer) return;
        // 清场：children.slice() 是数组（**不要**用 [...children] —— 降级编译会变
        // [].concat(iterator)，concat 不展开迭代器，产物里会是错的）
        const olds = layer.children.slice();
        olds.forEach((c) => {
            stopTweens(c);
            c.destroy();
        });

        if (!step || !anchor) {
            layer.active = false;
            return;
        }
        layer.active = true;

        const W = visibleWidth();
        const H = visibleHeight();
        const HW = W / 2;
        const HH = H / 2;
        const left = anchor.x - anchor.w / 2;
        const right = anchor.x + anchor.w / 2;
        const top = anchor.y + anchor.h / 2;
        const bottom = anchor.y - anchor.h / 2;

        // ── 1. 四块遮罩（洞外吸点击，洞内穿透） ──
        this.maskBlock(layer, 0, (top + HH) / 2, W, HH - top);
        this.maskBlock(layer, 0, (bottom - HH) / 2, W, bottom + HH);
        this.maskBlock(layer, (left - HW) / 2, anchor.y, left + HW, anchor.h);
        this.maskBlock(layer, (right + HW) / 2, anchor.y, HW - right, anchor.h);

        // ── 2. 高亮框（金色呼吸描边） ──
        const ring = uinode('ring', layer, anchor.w, anchor.h);
        ring.setPosition(anchor.x, anchor.y, 0);
        const rg = ring.addComponent(Graphics);
        rg.lineWidth = 3;
        rg.strokeColor = THEME.goldLight;
        rg.roundRect(-anchor.w / 2, -anchor.h / 2, anchor.w, anchor.h, 14);
        rg.stroke();
        const rop = ring.addComponent(UIOpacity);
        tween(rop)
            .repeatForever(tween().to(0.9, { opacity: 110 }).to(0.9, { opacity: 255 }))
            .start();

        // ── 3. 手势指示：洞下方的脉冲金点（无美术资源，Graphics 画） ──
        const pulse = uinode('pulse', layer, 30, 30);
        pulse.setPosition(anchor.x, bottom - 18, 0);
        const pg = pulse.addComponent(Graphics);
        pg.fillColor = THEME.gold;
        pg.circle(0, 0, 11);
        pg.fill();
        const pop = pulse.addComponent(UIOpacity);
        tween(pop)
            .repeatForever(tween().to(0.9, { opacity: 60 }).to(0.9, { opacity: 235 }))
            .start();
        tween(pulse)
            .repeatForever(
                tween()
                    .to(0.9, { scale: new Vec3(0.7, 0.7, 1) })
                    .to(0.9, { scale: new Vec3(1.3, 1.3, 1) }),
            )
            .start();

        // ── 4. 文案气泡（在遮罩之后添加 → 命中在上，跳过钮点得到） ──
        // **优先放洞的下方**：首日两步的目标（宝盒入口、主 CTA）上方都紧邻其它 CTA/横幅，
        // 放上方必然压住主 CTA 那条金带（实测：气泡压住「冲击境界」下沿）。下方空间不足才上移。
        const roomBelow = bottom + HH;
        const below = roomBelow >= GAP + BUBBLE_H + EDGE;
        let by = below ? bottom - GAP - BUBBLE_H / 2 : top + GAP + BUBBLE_H / 2;
        by = Math.max(-HH + BUBBLE_H / 2 + EDGE, Math.min(HH - BUBBLE_H / 2 - EDGE, by));
        const bubble = uinode('bubble', layer, BUBBLE_W, BUBBLE_H);
        bubble.setPosition(0, by, 0);
        const bg = bubble.addComponent(Graphics);
        bg.fillColor = THEME.paperDark;
        bg.roundRect(-BUBBLE_W / 2, -BUBBLE_H / 2, BUBBLE_W, BUBBLE_H, 16);
        bg.fill();
        bg.lineWidth = 2;
        bg.strokeColor = faded(THEME.gold, 210);
        bg.roundRect(-BUBBLE_W / 2, -BUBBLE_H / 2, BUBBLE_W, BUBBLE_H, 16);
        bg.stroke();

        label(bubble, step.title, 26, { bold: true, color: THEME.goldLight })
            .setPosition(0, BUBBLE_H / 2 - 36, 0);
        label(bubble, step.body, 20, {
            color: THEME.paper,
            width: BUBBLE_W - 72,
            lineHeight: 30,
        }).setPosition(0, BUBBLE_H / 2 - 88, 0);

        // 跳过：任何时刻都能退出引导。写 done 后立刻 sync —— **不要**在这里手动清 `this.key`：
        // 清空后 sync 计算出的新 key（'' ）与它相等，会被「无变化」提前返回，引导层收不起来（实测踩过）。
        const skip = spriteButton(bubble, 172, 56, TEXTS.guideSkip, () => {
            Game.save.tutorial.done = true;
            Game.persist();
            this.sync();
        }, { fontSize: 20, variant: 'secondary', textColor: THEME.paperDim });
        skip.node.setPosition(BUBBLE_W / 2 - 98, -BUBBLE_H / 2 + 38, 0);
    }

    /**
     * 当前页面是否有**全屏弹层**（`showDialog` / `dimLayer` 建的遮罩层，节点名 'dim'）。
     *
     * 引导层挂在 Canvas 下、比场景更靠上 —— 若不管弹层，开箱结算、广告确认这些
     * 对话框会被引导遮罩盖住且点不到。故有弹层时一律让位（`anchor = null`）。
     * 通用做法（查节点名）比让每个场景自己报「有没有弹窗」更抗遗漏。
     */
    private static hasModal(sceneNode: Node | undefined): boolean {
        if (!sceneNode) return false;
        const kids = sceneNode.children.slice();
        for (const k of kids) {
            if (k.active && k.name === 'dim') return true;
        }
        // 场景内的浮层挂在场景子节点下（如 BoxScene 的卡片/舞台），下沉一层足够
        for (const k of kids) {
            const gk = k.children.slice();
            for (const g of gk) {
                if (g.active && g.name === 'dim') return true;
            }
        }
        return false;
    }

    /** 一块遮罩（宽/高 ≤ 0 时不创建）：玄墨底 + Button 吸点击 */
    private static maskBlock(parent: Node, x: number, y: number, w: number, h: number) {
        if (w <= 0 || h <= 0) return;
        const n = uinode('mask', parent, w, h);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        g.fillColor = faded(THEME.void, MASK_ALPHA);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        const b = n.addComponent(Button);
        b.transition = Button.Transition.NONE;
        b.target = n;
        n.getComponent(UITransform)!.setContentSize(w, h);
    }
}

/** 停掉节点及其子树上的 tween（含 UIOpacity 组件上的）：销毁后 tween 仍会调度，必须显式停 */
function stopTweens(n: Node) {
    Tween.stopAllByTarget(n);
    const op = n.getComponent(UIOpacity);
    if (op) Tween.stopAllByTarget(op);
    const kids = n.children.slice();
    kids.forEach((c) => stopTweens(c));
}
