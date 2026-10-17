/**
 * M30 剧情文本（#56）的演出层 —— 全项目第一个对话演出系统。
 *
 * 形态同 M27 引导层（ui/GuideLayer.ts）：挂在 `Canvas` 下、`SceneRoot` **之后**添加
 * （同父下后添加者在上）的覆盖层，**不是** `IScene`：不入 `SceneStack`，
 * 不参与 push/pop/swap，永远不会污染返回栈。
 *
 * 三个关键设计：
 * 1. **点击推进**：全屏 dim 的 TOUCH_START = 推进；面板上再压一块透明 tapArea
 *    （加在 labels 之后、跳过钮之前 → 命中在上）。dim/tapArea/跳过钮三者互不重叠，
 *    单目标与多目标两种命中模型下都不会双触发（跳过钮在最上，独占自己的角落）。
 * 2. **打字机 dt 驱动**（不是 tween）：测试环境的 tween 是链式 no-op，且 dt 驱动
 *    可在测试里按帧断言推进；CPS ≈30 字/秒，单行 ≤22 字 → 一行 ≤0.75s。
 * 3. **两条让位**：播放中引导层让位（GuideLayer.sync 查 isPlaying）；场景内已有全屏
 *    弹层（'dim' 节点，如 M29 归来弹窗）时本层让位——migrate 老玩家（realmIndex=0
 *    且有离线收益）会同时命中两者，弹层先消费、故事后播。
 *
 * 资源：全部 `Graphics`/主题库代码绘制，**不新增任何美术资源**（同引导层先例）。
 */
import { Button, Graphics, Input, Label, Node, Tween, tween, UIOpacity } from 'cc';
import { Game } from '../infra/Game';
import { IScene } from '../infra/SceneStack';
import { TEXTS } from '../core/config/texts';
import {
    markStorySeen,
    storyBeatById,
    storyBeatFor,
    type StoryBeat,
    type StoryHost,
    type StorySceneCtx,
} from '../core/story';
import { THEME, dimLayer, faded, label, labelL, spriteButton, spritePanel, uinode, visibleHeight, visibleWidth } from './ThemeLib';

/** 打字机速度（字/秒）：单行 22 字 → ≤0.75s，长行不劝退 */
const TYPE_CPS = 30;
/** 对话面板尺寸与位置（设计系；长屏向下钳，见 show） */
const PANEL_W = 660;
const PANEL_H = 300;
const PANEL_Y = -462;
/** 长屏时面板贴可见区下缘：panelY = -(H/2) + 178（H=1280 时恰为 -462） */
const PANEL_BOTTOM_MARGIN = 178;
const DIM_ALPHA = 200;

export class StoryLayer {
    private static layer: Node | null = null;
    /** 当前演出 key（节拍 id 或 `replay:id`）；未变则零开销 */
    private static key = '';
    /** 正在演出的节拍（null = 未演出；isPlaying 的判据） */
    private static current: StoryBeat | null = null;
    /** 仙闻录回看（forced）：播完不标记 seen */
    private static forced = false;
    private static lineIndex = 0;
    private static typeChars = 0;
    private static typeAcc = 0;
    private static bodyLabel: Label | null = null;
    private static hint: Node | null = null;
    private static speakerLabel: Label | null = null;

    /**
     * 在 `SceneRoot` **之后**调用：同父节点下后添加者渲染/命中在上，
     * 保证演出层永远盖在当前页面之上。
     */
    static attach(canvas: Node) {
        const layer = uinode('StoryLayer', canvas, visibleWidth(), visibleHeight());
        layer.setPosition(0, 0, 0);
        layer.active = false;
        this.layer = layer;
    }

    /** 是否正在演出（引导层据此让位；回看也算） */
    static isPlaying(): boolean {
        return !!(this.layer && this.layer.active && this.current);
    }

    /**
     * 每帧同步（由 `Game.tick` 调用）。key 未变则零开销返回。
     *
     * 演出中不重新推导（模态自洽：玩家点完这场再说）；只在**开场**时判定，
     * 且场景内有全屏弹层时让位（弹层消费掉之后再播）。
     */
    static sync(): void {
        const layer = this.layer;
        if (!layer || !layer.isValid || !Game.save) return;
        if (this.current) return; // 演出中：忽略场景/存档变化，播完这场

        const top = Game.stack?.top as (IScene & Partial<StoryHost>) | undefined;
        if (top && this.hasSceneModal(top.node)) {
            // 场景有弹层（归来弹窗/广告确认）→ 让位；清 key 以便弹层消失后能开场
            if (this.key !== '') {
                this.key = '';
                this.hide();
            }
            return;
        }
        const sceneCtx: StorySceneCtx | null =
            top && typeof top.storyCtx === 'function' ? top.storyCtx() : null;
        const beat = storyBeatFor(Game.save, {
            scene: top?.node.name ?? '',
            ...(sceneCtx ?? {}),
        });
        const key = beat ? beat.id : '';
        if (key === this.key) return;
        this.key = key;
        if (beat) this.show(beat);
        else this.hide();
    }

    /** 打字机推进（由 `Game.tick` 每帧调用；dt 驱动，测试可按帧断言） */
    static tick(dt: number): void {
        if (!this.current || !this.bodyLabel) return;
        const text = this.current.lines[this.lineIndex].text;
        if (this.typeChars >= text.length) return;
        this.typeAcc += dt;
        const target = Math.min(text.length, Math.floor(this.typeAcc * TYPE_CPS));
        if (target !== this.typeChars) {
            this.typeChars = target;
            this.bodyLabel.string = text.slice(0, this.typeChars);
        }
        if (this.typeChars >= text.length && this.hint) this.hint.active = true;
    }

    /**
     * 仙闻录回看：强制播放指定节拍（不标记 seen）。
     * 与 sync 的推导互斥（current 非空时 sync 直接返回）。
     */
    static replay(id: string): void {
        const beat = storyBeatById(id);
        if (!beat) return;
        this.key = `replay:${id}`;
        this.forced = true;
        this.show(beat);
    }

    /** 点击推进：打字中→显示全行；否则下一行；末行→收场 */
    private static advance(): void {
        if (!this.current) return;
        const text = this.current.lines[this.lineIndex].text;
        if (this.typeChars < text.length) {
            // 补完当前行（急击跳过打字）
            this.typeChars = text.length;
            this.typeAcc = text.length / TYPE_CPS;
            if (this.bodyLabel) this.bodyLabel.string = text;
            if (this.hint) this.hint.active = true;
            return;
        }
        if (this.lineIndex < this.current.lines.length - 1) {
            this.lineIndex++;
            this.showLine();
            return;
        }
        this.finish();
    }

    /** 跳过：直接收场并标记听过（永久） */
    private static skip(): void {
        this.finish();
    }

    /** 收场：非回看则标记 seen 并落盘；隐藏整层 */
    private static finish(): void {
        if (this.current && !this.forced && Game.save) {
            markStorySeen(Game.save, this.current.id);
            Game.persist();
        }
        this.current = null;
        this.forced = false;
        this.key = '';
        this.hide();
    }

    // ---------- 渲染 ----------

    /** 整层重建并开演 */
    private static show(beat: StoryBeat) {
        const layer = this.layer;
        if (!layer) return;
        // current 必须先落：isPlaying()/sync() 的「演出中」判定全押在这个字段上
        //（曾漏掉赋值 → isPlaying 恒 false、key 比对把后续 sync 全部挡掉，场景测试抓到的）
        this.current = beat;
        // 清场（children.slice() 是数组：**不要**用 [...children] —— 降级编译会变
        // [].concat(iterator)，concat 不展开迭代器，产物里会是错的）
        const olds = layer.children.slice();
        olds.forEach((c) => {
            stopTweens(c);
            c.destroy();
        });
        layer.active = true;

        // ── 1. 全屏 dim：吸点击 + 推进（在最底层） ──
        const dim = dimLayer(layer, DIM_ALPHA);
        dim.on(Input.EventType.TOUCH_START, () => this.advance());

        // ── 2. 对话面板（dim 的兄弟，加在其后 → 命中在上） ──
        const H = visibleHeight();
        const py = Math.min(PANEL_Y, -(H / 2) + PANEL_BOTTOM_MARGIN);
        const panel = spritePanel(layer, PANEL_W, PANEL_H, undefined, THEME.tintDeep);
        panel.setPosition(0, py, 0);
        const pop = panel.addComponent(UIOpacity);
        pop.opacity = 0;
        tween(pop).delay(0.05).to(0.18, { opacity: 255 }).start();

        // 节拍标题（左上）
        labelL(panel, beat.title, 24, { bold: true, color: THEME.goldLight, width: 360 })
            .setPosition(-250, 106, 0);
        // 说话者 chip（左上，标题下方）
        this.buildSpeakerChip(panel, beat.lines[0].speaker);
        // 正文（居中偏上；最多 4 行 × 38 行高，块心 -24 → 跨 33..-81，面板 ±150 内）
        const bodyNode = label(panel, '', 26, {
            color: THEME.paper,
            width: 560,
            lineHeight: 38,
        });
        bodyNode.setPosition(0, -24, 0);
        this.bodyLabel = bodyNode.getComponent(Label)!;
        // 末行继续提示（右下，仅当前行完整显示后出现）
        this.hint = label(panel, TEXTS.storyContinue, 20, {
            color: faded(THEME.goldLight, 200),
            align: 'right',
            width: 160,
        });
        this.hint.setPosition(250, -118, 0);
        this.hint.active = false;

        // ── 3. 透明 tapArea：盖在 labels 之上、跳过钮之下 ──
        // 命中模型无关：单目标下它是最上层输入节点；多目标下 Button 吸点击，
        // 都不会让 dim 双触发（GuideLayer 遮罩同款原理）。
        const tap = uinode('tapArea', panel, PANEL_W, PANEL_H);
        tap.setPosition(0, 0, 0);
        const tb = tap.addComponent(Button);
        tb.transition = Button.Transition.NONE;
        tb.target = tap;
        tap.on(Input.EventType.TOUCH_START, () => this.advance());

        // ── 4. 跳过钮（最上，独占右上角） ──
        spriteButton(panel, 120, 48, TEXTS.storySkip, () => this.skip(), {
            fontSize: 20,
            variant: 'secondary',
            textColor: THEME.paperDim,
        }).node.setPosition(250, 106, 0);

        this.lineIndex = 0;
        this.showLine();
    }

    /** 说话者 chip：金描边小牌 + 名 */
    private static buildSpeakerChip(panel: Node, speaker: string) {
        const chip = uinode('speaker', panel, 140, 34);
        chip.setPosition(-180, 58, 0);
        const g = chip.addComponent(Graphics);
        g.fillColor = faded(THEME.void, 120);
        g.roundRect(-70, -17, 140, 34, 8);
        g.fill();
        g.lineWidth = 1.5;
        g.strokeColor = faded(THEME.gold, 220);
        g.roundRect(-70, -17, 140, 34, 8);
        g.stroke();
        this.speakerLabel = label(chip, speaker, 20, { bold: true, color: THEME.goldLight })
            .getComponent(Label)!;
    }

    /** 切到当前行：重置打字机 + 换说话者 */
    private static showLine() {
        if (!this.current) return;
        const line = this.current.lines[this.lineIndex];
        if (this.speakerLabel) this.speakerLabel.string = line.speaker;
        if (this.bodyLabel) this.bodyLabel.string = '';
        if (this.hint) this.hint.active = false;
        this.typeChars = 0;
        this.typeAcc = 0;
    }

    private static hide() {
        const layer = this.layer;
        if (!layer) return;
        const olds = layer.children.slice();
        olds.forEach((c) => {
            stopTweens(c);
            c.destroy();
        });
        layer.active = false;
        this.bodyLabel = null;
        this.hint = null;
        this.speakerLabel = null;
    }

    /**
     * 当前页面是否有**全屏弹层**（`showDialog`/`dimLayer` 建的遮罩，节点名 'dim'）。
     * 与 GuideLayer.hasModal 同款判定（各层私有一份，避免相互 import 成环）。
     */
    private static hasSceneModal(sceneNode: Node | undefined): boolean {
        if (!sceneNode) return false;
        const kids = sceneNode.children.slice();
        for (const k of kids) {
            if (k.active && k.name === 'dim') return true;
        }
        for (const k of kids) {
            const gk = k.children.slice();
            for (const g of gk) {
                if (g.active && g.name === 'dim') return true;
            }
        }
        return false;
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
