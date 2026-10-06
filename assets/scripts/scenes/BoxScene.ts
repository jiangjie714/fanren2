import { Color, EventTouch, Graphics, Input, Label, Layers, Node, Sprite, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { BoxConfig, BoxId, getBox, BOXES } from '../core/config/boxes';
import { DAILY_LINGSHI_AID_LIMIT } from '../core/config/economy';
import { getLingeng } from '../core/config/lingens';
import { BoxResult, RewardItem } from '../core/systems/BoxSystem';
import { TEXTS } from '../core/config/texts';
import { statusBar } from '../ui/StatusBar';
import { showDialog } from '../ui/dialog';
import {
    ButtonHandle,
    DESIGN_H,
    DESIGN_W,
    THEME,
    faded,
    fadeIn,
    image,
    label,
    pageBackground,
    pageHeader,
    scrim,
    spriteButton,
    spritePanel,
    toast,
    uinode,
    visibleHeight,
    visibleWidth,
} from '../ui/ThemeLib';
import { hitRune } from '../core/runeHit';
import { RainScene } from './RainScene';

const CHEST_ART: Record<BoxId, string> = {
    fansu: 'art/boxes/box_fansu/spriteFrame',
    xiuzhen: 'art/boxes/box_xiuzhen/spriteFrame',
    tiandao: 'art/boxes/box_tiandao/spriteFrame',
};

// 三档递进：宣纸白（凡俗）→ 紫霄（修真，紫气东来）→ 曦金（天道）。
// 旧值修真档用 THEME.rainBlue（青冥 #5AA9E6）——那是「护盾青雨」的语义色，
// 放在修仙品阶上是冷蓝，与玄墨紫面板打架，换到色板内的稀有度色。
const CHEST_COLOR: Record<BoxId, Color> = {
    fansu: THEME.ink,
    xiuzhen: THEME.violet,
    tiandao: THEME.goldLight,
};

/** 蓄力条参数（docs/数值假设.md #20） */
const CHARGE = {
    /** 光标摆动周期（秒） */
    period: 1.1,
    /** 视为直接开启的最短按住时长（秒） */
    minPress: 0.15,
    barHalf: 215,
    /** 金区半宽（条宽 24%：460 × 0.24 / 2） */
    goldHalf: 55,
};

/** 圆满三连时间窗（秒，docs/数值假设.md #21） */
const TRIPLE_WINDOW = 2.5;

/** 宝盒页：选盒信息卡 + 中央开箱动线（蓄力共鸣 → 开启 → 圆满三连）+ 统一结算弹窗。 */
export class BoxScene implements IScene {
    node: Node;
    private session: { boxId: BoxId; seeksUsed: number } | null = null;
    private pendingResult: BoxResult | null;
    private bar = { refresh: () => {} };
    private pityLabel!: Label;
    private openBtns: Partial<Record<BoxId, ButtonHandle>> = {};
    /** 交互阶段：无浮层 / 蓄力中 / 三连中 */
    private phase: 'idle' | 'charge' | 'rune' = 'idle';
    private chargeRoot: Node | null = null;
    private chargeHolding = false;
    private chargePressT = 0;
    private chargeOscT = 0;
    private chargeResolved = false;
    private chargeCursor: Node | null = null;
    private chargeChest: Node | null = null;
    private chestAnimNode: Node | null = null;
    private runeRoot: Node | null = null;
    private runeLit = 0;
    private runeT = 0;
    private runeTimerLabel: Label | null = null;
    private runeNodes: Node[] = [];
    private runeBoxId: BoxId = 'fansu';
    private runeCb: ((layers: number, items: RewardItem[]) => void) | null = null;

    constructor(initialResult: BoxResult | null = null) {
        this.node = new Node('BoxScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.pendingResult = initialResult;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, '仙缘宝盒', () => Game.stack.pop());
        this.bar = statusBar(n, 436);

        // 副标题直接压在极光上，亮色底上不加描边会糊 —— 给所有「压在插画上的文字」配深墨描边
        const subtitle = label(n, '选择宝盒，探寻仙缘', 23, {
            color: THEME.paperDim,
            outline: faded(THEME.void, 225),
            outlineWidth: 3,
        });
        subtitle.setPosition(0, 344, 0);
        fadeIn(subtitle);
        const pity = label(n, '', 22, {
            color: THEME.goldLight,
            bold: true,
            outline: faded(THEME.void, 225),
            outlineWidth: 3,
        });
        pity.setPosition(0, 316, 0);
        this.pityLabel = pity.getComponent(Label)!;

        const cardW = 216;
        const cardH = 372;
        BOXES.forEach((box, i) => {
            const x = (i - 1) * (cardW + 16);
            fadeIn(this.buildCard(n, box, x, 118, cardW, cardH), 16, i * 0.035);
        });

        // 法台下方两行说明压在 bg_home 的暖金光带上，先铺自下而上的渐隐遮挡（见 ThemeLib.scrim）
        scrim(n, DESIGN_W, 260, THEME.void, 228).setPosition(0, -300, 0);
        const anim = uinode('animStage', n, 660, 240);
        anim.setPosition(0, -210, 0);
        anim.addComponent(UIOpacity);
        // 典雅法器灵台基底
        const gPedestal = anim.addComponent(Graphics);
        gPedestal.fillColor = faded(THEME.gold, 24);
        gPedestal.ellipse(0, -20, 160, 36);
        gPedestal.fill();
        gPedestal.fillColor = faded(THEME.slate, 224);
        gPedestal.roundRect(-140, -32, 280, 26, 13);
        gPedestal.fill();
        gPedestal.strokeColor = THEME.border;
        gPedestal.lineWidth = 1.5;
        gPedestal.roundRect(-140, -32, 280, 26, 13);
        gPedestal.stroke();

        const chestAnim = image(anim, CHEST_ART.tiandao, 190, 150);
        chestAnim.name = 'chestAnim';
        chestAnim.setPosition(0, 16, 0);
        this.chestAnimNode = chestAnim;
        tween(chestAnim)
            .repeatForever(
                tween(chestAnim)
                    .to(1.8, { position: new Vec3(0, 22, 0), scale: new Vec3(1.02, 0.98, 1) }, { easing: 'sineInOut' })
                    .to(1.8, { position: new Vec3(0, 10, 0), scale: new Vec3(0.98, 1.02, 1) }, { easing: 'sineInOut' })
            )
            .start();
        label(anim, '凝神入定 · 探寻天地仙缘', 22, {
            color: THEME.goldLight,
            width: 560,
            outline: faded(THEME.void, 210),
            outlineWidth: 3,
        })
            .setPosition(0, -78, 0);
        label(anim, '积攒机缘可引动天劫渡劫，心诚则灵', 18, {
            color: THEME.paperDim,
            width: 560,
            outline: faded(THEME.void, 210),
            outlineWidth: 3,
        })
            .setPosition(0, -108, 0);

        const back = spriteButton(n, 280, 72, '返回仙府', () => Game.stack.pop(), {
            fontSize: 25,
            variant: 'secondary',
            textColor: THEME.ink,
        });
        back.node.setPosition(0, -482, 0);

        this.refresh();
        if (this.pendingResult) {
            const r = this.pendingResult;
            this.pendingResult = null;
            this.session = { boxId: r.boxId, seeksUsed: 0 };
            this.showResult(r, 0, []);
        }
    }

    update(dt: number) {
        if (this.phase === 'charge' && this.chargeHolding) {
            this.chargePressT += dt;
            this.chargeOscT += dt;
            if (this.chargeCursor) {
                const x = CHARGE.barHalf * Math.sin(this.chargeOscT / CHARGE.period * Math.PI * 2 - Math.PI / 2);
                this.chargeCursor.setPosition(x, 0, 0);
            }
        }
        if (this.phase === 'rune' && this.runeRoot) {
            this.runeT += dt;
            const left = Math.max(0, TRIPLE_WINDOW - this.runeT);
            if (this.runeTimerLabel) this.runeTimerLabel.string = `${left.toFixed(1)}s`;
            if (left <= 0) this.finishRunePhase();
        }
    }

    onResume() {
        this.refresh();
    }

    onExit() {
        // P2-3：停掉开箱页所有 repeatForever tween（法台宝箱呼吸 / 蓄力箱摆动 / 符文脉动），
        // 避免离屏后仍在每帧调度，配合场景销毁也不残留动作。
        if (this.chestAnimNode) Tween.stopAllByTarget(this.chestAnimNode);
        if (this.chargeChest) Tween.stopAllByTarget(this.chargeChest);
        for (const n of this.runeNodes) Tween.stopAllByTarget(n);
    }

    private buildCard(parent: Node, box: BoxConfig, x: number, y: number, w: number, h: number): Node {
        const card = uinode(`card_${box.id}`, parent, w, h);
        card.setPosition(x, y, 0);
        // 面板必须挂到具名子节点上：Sprite 在 image() 新建的子节点上，卡节点本身没有
        // Sprite，所以 refresh() 里 `card.getComponent(Sprite)` 恒为 null —— 锁定态的
        // 面板灰置曾经是个静默 no-op（只有宝箱图被灰掉，卡片底纹丝不动）。
        const bg = spritePanel(card, w + 8, h + 8, undefined, THEME.tintPanel);
        bg.name = 'bg';

        // 卡片 372 高（半高 186）：宝箱 74 / 名称 -14 / 价格 -52 / 概率 -84 / 按钮 -136
        // 五段自上而下间距 9.5 / 12 / 11 / 10.5，是这一版能排下的唯一一组均匀值。
        const chest = image(card, CHEST_ART[box.id], 166, 132);
        chest.name = 'chest';
        chest.setPosition(0, 74, 0);

        label(card, box.name, 25, { bold: true, color: CHEST_COLOR[box.id] }).setPosition(0, -14, 0);
        label(card, `${box.cost} 灵石`, 27, { bold: true, color: THEME.goldLight }).setPosition(0, -52, 0);
        label(card, `普通${Math.round(box.normalRate * 100)}% · 稀有${Math.round(box.rareRate * 100)}% · 劫${Math.round(box.disasterRate * 100)}%`, 15, {
            color: THEME.inkSoft,
            // 旧版 width = w - 26 = 190，而 16px 的这行自然宽度约 200 —— 触发 SHRINK
            // 后连同 lineHeight 一起被压到 ~13px，几乎读不出来。放宽到 w - 8 即可原尺寸放下。
            width: w - 8,
            shrink: true,
        }).setPosition(0, -84, 0);

        const openBtn = spriteButton(card, w - 34, 68, '开 启', () => this.tryOpen(box.id), {
            fontSize: 26,
            variant: box.id === 'tiandao' ? 'primary' : 'secondary',
            textColor: box.id === 'tiandao' ? THEME.void : THEME.ink,
        });
        openBtn.node.setPosition(0, -h / 2 + 50, 0);
        this.openBtns[box.id] = openBtn;
        return card;
    }

    private refresh() {
        this.bar.refresh();
        this.pityLabel.string = Game.save.pityCount > 0 ? `天道庇佑 · 保底 ${Game.save.pityCount}/3` : '';
        for (const box of BOXES) {
            const st = Game.box.canOpen(box.id);
            const handle = this.openBtns[box.id]!;
            const card = this.node.getChildByName(`card_${box.id}`);
            // 面板 Sprite 在名为 bg 的子节点上（见 buildCard）
            const cardSprite = card?.getChildByName('bg')?.getComponent(Sprite);
            const chestSprite = card?.getChildByName('chest')?.getComponent(Sprite);

            if (st.reason === 'boxLocked') {
                handle.setEnabled(false);
                handle.setText('未解锁');
                if (cardSprite) cardSprite.color = faded(THEME.tintMuted, 218);
                if (chestSprite) chestSprite.color = faded(THEME.ash, 228);
            } else if (!st.ok) {
                // PRD 边界规则1：灵石不足时按钮保持可点，点击弹出【灵石不足】提示
                handle.setEnabled(true);
                handle.setText(box.id === 'xiuzhen' && Game.save.xiuzhenTickets > 0 ? TEXTS.boxTicketBtn : '开 启');
                if (cardSprite) cardSprite.color = faded(THEME.tintCard, 246);
                if (chestSprite) chestSprite.color = faded(THEME.paper, 246);
            } else {
                handle.setEnabled(true);
                handle.setText(box.id === 'xiuzhen' && Game.save.xiuzhenTickets > 0 ? TEXTS.boxTicketBtn : '开 启');
                if (cardSprite) cardSprite.color = new Color(255, 255, 255, 255);
                if (chestSprite) chestSprite.color = new Color(255, 255, 255, 255);
            }
        }
    }

    private tryOpen(boxId: BoxId) {
        const st = Game.box.canOpen(boxId);
        if (!st.ok) {
            if (st.reason === 'lingshiNotEnough') {
                this.lingshiNotEnoughDialog();
            } else {
                toast(this.node, '境界不足，暂未解锁此宝盒');
            }
            return;
        }
        if (!this.session || this.session.boxId !== boxId) {
            this.session = { boxId, seeksUsed: 0 };
        }
        this.beginCharge(boxId, 'open');
    }

    /** V2 A1：蓄力共鸣阶段——按住蓄力，光标居中松手触发灵气共鸣；快速点击直接开启。 */
    private beginCharge(boxId: BoxId, mode: 'open' | 'seek') {
        if (this.phase !== 'idle') return;
        this.phase = 'charge';
        this.chargeResolved = false;
        this.chargeHolding = false;
        this.chargePressT = 0;
        this.chargeOscT = 0;

        const root = uinode('chargeOverlay', this.node, visibleWidth(), visibleHeight());
        const dim = root.addComponent(Graphics);
        dim.fillColor = faded(THEME.void, 152);
        dim.roundRect(-visibleWidth() / 2, -visibleHeight() / 2, visibleWidth(), visibleHeight(), 0);
        dim.fill();
        fadeIn(root, 0);

        const panelNode = spritePanel(root, 600, 560, undefined, THEME.tintDeep);
        panelNode.setPosition(0, 40, 0);

        label(panelNode, TEXTS.chargeTitle, 32, { bold: true, color: THEME.paper }).setPosition(0, 232, 0);
        const chest = image(panelNode, CHEST_ART[boxId], 206, 164);
        chest.setPosition(0, 96, 0);
        this.chargeChest = chest;
        tween(chest)
            .repeatForever(
                tween(chest)
                    .to(0.5, { position: new Vec3(-8, 96, 0) })
                    .to(0.5, { position: new Vec3(8, 96, 0) }),
            )
            .start();

        // 蓄力条：轨道 + 中央金区 + 摆动光标
        const bar = uinode('bar', panelNode, 460, 44);
        bar.setPosition(0, -40, 0);
        const track = bar.addComponent(Graphics);
        // 轨道用玄墨：旧值 (226,238,248) 是冷蓝近白，金色光标压在上面几乎看不见
        track.fillColor = faded(THEME.void, 235);
        track.roundRect(-CHARGE.barHalf, -12, CHARGE.barHalf * 2, 24, 12);
        track.fill();
        track.strokeColor = THEME.border;
        track.lineWidth = 3;
        track.roundRect(-CHARGE.barHalf, -12, CHARGE.barHalf * 2, 24, 12);
        track.stroke();
        track.fillColor = faded(THEME.goldDeep, 80);
        track.roundRect(-CHARGE.goldHalf, -12, CHARGE.goldHalf * 2, 24, 12);
        track.fill();
        const cursor = uinode('cursor', bar, 10, 40);
        const cg = cursor.addComponent(Graphics);
        cg.fillColor = THEME.rainGold;
        cg.roundRect(-5, -20, 10, 40, 5);
        cg.fill();
        cursor.setPosition(-CHARGE.barHalf, 0, 0);
        this.chargeCursor = cursor;

        label(panelNode, TEXTS.resonateHint, 23, { bold: true, color: THEME.goldLight, width: 500, shrink: true })
            .setPosition(0, -128, 0);
        label(panelNode, TEXTS.resonatePlainHint, 19, { color: THEME.inkSoft, width: 400, shrink: true })
            .setPosition(0, -166, 0);

        spriteButton(panelNode, 216, 66, TEXTS.resonateSkip, () => this.resolveCharge(boxId, mode, false), {
            fontSize: 24,
            variant: 'ghost',
            textColor: THEME.inkSoft,
        }).node.setPosition(0, -230, 0);

        root.on(Input.EventType.TOUCH_START, () => {
            if (this.chargeResolved) return;
            this.chargeHolding = true;
            this.chargePressT = 0;
            this.chargeOscT = 0;
        });
        const release = () => {
            if (this.chargeResolved || !this.chargeHolding) return;
            const x = CHARGE.barHalf * Math.sin(this.chargeOscT / CHARGE.period * Math.PI * 2 - Math.PI / 2);
            const resonated = this.chargePressT >= CHARGE.minPress && Math.abs(x) <= CHARGE.goldHalf;
            this.resolveCharge(boxId, mode, resonated);
        };
        root.on(Input.EventType.TOUCH_END, release);
        root.on(Input.EventType.TOUCH_CANCEL, release);

        this.chargeRoot = root;
    }

    private resolveCharge(boxId: BoxId, mode: 'open' | 'seek', resonated: boolean) {
        if (this.chargeResolved) return;
        this.chargeResolved = true;
        this.phase = 'idle';
        this.chargeHolding = false;
        if (this.chargeChest) Tween.stopAllByTarget(this.chargeChest);
        this.chargeChest = null;
        this.chargeRoot?.destroy();
        this.chargeRoot = null;
        this.chargeCursor = null;
        if (resonated) AudioMgr.play('rare');
        this.playOpenAnim(() => this.afterChargeOpen(boxId, mode, resonated));
    }

    private afterChargeOpen(boxId: BoxId, mode: 'open' | 'seek', resonated: boolean) {
        let r: BoxResult;
        if (mode === 'seek' && this.session) {
            r = Game.box.seek(this.session, { resonate: resonated });
        } else {
            r = Game.box.open(boxId, { resonate: resonated });
        }
        // M8 任务进度：淬体（开箱）；M9a 成就扫描
        Game.quests.progress(Game.save, 'openBoxes');
        Game.checkAchievements(this.node);
        Game.persist();
        this.showRunePhase(boxId, (layers, items) => this.showResult(r, layers, items));
    }

    /** V2 A3：圆满三连——2.5s 内依序点亮符文，点亮数决定追加奖励。 */
    private showRunePhase(boxId: BoxId, cb: (layers: number, items: RewardItem[]) => void) {
        this.phase = 'rune';
        this.runeLit = 0;
        this.runeT = 0;
        this.runeBoxId = boxId;
        this.runeCb = cb;
        this.runeNodes = [];

        // 同 chargeOverlay：铺满可见尺寸，避免长屏上下露白且穿透点击
        const root = uinode('runeOverlay', this.node, visibleWidth(), visibleHeight());
        const dim = root.addComponent(Graphics);
        dim.fillColor = faded(THEME.void, 152);
        dim.roundRect(-visibleWidth() / 2, -visibleHeight() / 2, visibleWidth(), visibleHeight(), 0);
        dim.fill();
        fadeIn(root, 0);

        const panelNode = spritePanel(root, 600, 420, undefined, THEME.tintDeep);
        panelNode.setPosition(0, 60, 0);
        label(panelNode, TEXTS.tripleTitle, 32, { bold: true, color: THEME.paper }).setPosition(0, 150, 0);
        label(panelNode, TEXTS.tripleHint, 22, { color: THEME.inkSoft, width: 500, shrink: true })
            .setPosition(0, 102, 0);

        const RUNE_X = [-170, 0, 170];
        RUNE_X.forEach((x) => {
            const rune = image(panelNode, 'art/ui/icons/icon_rune/spriteFrame', 96, 96);
            rune.setPosition(x, -6, 0);
            const sp = rune.getComponent(Sprite)!;
            sp.color = faded(THEME.tintMuted, 214); // 未点亮：降饱和灰置
            this.runeNodes.push(rune);
        });
        // 当前目标符文呼吸提示
        this.pulseNextRune();

        this.runeTimerLabel = label(panelNode, `${TRIPLE_WINDOW.toFixed(1)}s`, 26, {
            bold: true,
            color: THEME.goldLight,
        }).getComponent(Label)!;
        this.runeTimerLabel.node.setPosition(0, -110, 0);

        spriteButton(panelNode, 180, 60, TEXTS.tripleSkip, () => this.finishRunePhase(), {
            fontSize: 22,
            variant: 'ghost',
            textColor: THEME.inkSoft,
        }).node.setPosition(0, -168, 0);

        root.on(Input.EventType.TOUCH_START, (e: EventTouch) => this.onRuneTap(e));
        this.runeRoot = root;
    }

    private onRuneTap(e: EventTouch) {
        if (this.phase !== 'rune') return;
        const ui = e.getUILocation();
        // 转 runeRoot 本地坐标：横向中心恒为 DESIGN_W/2（FIXED_WIDTH 宽度固定），
        // 纵向中心用可见高度——长屏机型可见区高于 1280，硬编码 DESIGN_H/2 会让
        // 符文命中区整体纵向偏移（#P3 长屏 bug）。
        const x = ui.x - DESIGN_W / 2;
        const y = ui.y - visibleHeight() / 2;
        const tapped = hitRune(x, y, {
            xs: [-170, 0, 170],
            rowY: 60 - 6, // 面板 y + 符文行偏移
            halfW: 62,
            halfH: 72,
        });
        if (tapped < 0) return;
        if (tapped === this.runeLit) {
            AudioMgr.play('gold');
            Tween.stopAllByTarget(this.runeNodes[tapped]);
            const sp = this.runeNodes[tapped].getComponent(Sprite)!;
            sp.color = new Color(255, 255, 255, 255);
            this.runeNodes[tapped].setScale(1.18, 1.18, 1);
            tween(this.runeNodes[tapped]).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
            this.runeLit += 1;
            if (this.runeLit >= 3) {
                this.finishRunePhase();
            } else {
                this.pulseNextRune();
            }
        } else if (tapped > this.runeLit) {
            this.finishRunePhase(); // 点错即结束（无惩罚）
        }
    }

    private pulseNextRune() {
        const next = this.runeNodes[this.runeLit];
        if (!next) return;
        tween(next)
            .repeatForever(
                tween(next)
                    .to(0.4, { scale: new Vec3(1.12, 1.12, 1) })
                    .to(0.4, { scale: new Vec3(0.95, 0.95, 1) }),
            )
            .start();
    }

    private finishRunePhase() {
        if (this.phase !== 'rune') return;
        this.phase = 'idle';
        for (const n of this.runeNodes) Tween.stopAllByTarget(n);
        this.runeRoot?.destroy();
        this.runeRoot = null;
        this.runeTimerLabel = null;
        this.runeNodes = [];
        const layers = this.runeLit;
        const cb = this.runeCb;
        this.runeCb = null;
        const items = layers > 0 ? Game.box.grantTripleBonus(this.runeBoxId, layers) : [];
        if (layers >= 3) AudioMgr.play('rare');
        Game.persist();
        cb?.(layers, items);
    }

    private playOpenAnim(done: () => void) {
        AudioMgr.play('open');
        const stage = this.node.getChildByName('animStage');
        const chest = stage?.getChildByName('chestAnim');
        if (!stage || !chest) {
            done();
            return;
        }
        const originX = chest.position.x;
        const originY = chest.position.y;

        // 独立爆开灵光环，避免将整个灵台置空
        let burst = stage.getChildByName('burstHalo');
        if (!burst) {
            burst = uinode('burstHalo', stage, 220, 220);
            burst.setPosition(0, originY, 0);
            const bg = burst.addComponent(Graphics);
            bg.fillColor = faded(THEME.gold, 170);
            bg.circle(0, 0, 75);
            bg.fill();
        }
        const burstOp = burst.getComponent(UIOpacity) || burst.addComponent(UIOpacity);
        burstOp.opacity = 0;
        burst.setScale(0.8, 0.8, 1);

        // V2 A2 连点加速：动画期间连点 2 次直接完成（约 0.5s → 0.1s）
        let finished = false;
        let taps = 0;
        const finish = () => {
            if (finished) return;
            finished = true;
            stage.off(Input.EventType.TOUCH_START, onTap);
            Tween.stopAllByTarget(chest);
            Tween.stopAllByTarget(burstOp);
            Tween.stopAllByTarget(burst);
            burstOp.opacity = 0;
            chest.setPosition(originX, originY, 0);
            chest.setScale(1, 1, 1);
            done();
        };
        const onTap = () => {
            taps += 1;
            if (taps >= 2) finish();
        };
        stage.on(Input.EventType.TOUCH_START, onTap);

        tween(chest)
            .to(0.07, { position: new Vec3(originX - 13, originY, 0) })
            .to(0.07, { position: new Vec3(originX + 13, originY, 0) })
            .to(0.06, { position: new Vec3(originX - 6, originY, 0) })
            .to(0.05, { position: new Vec3(originX, originY, 0) })
            .call(() => {
                tween(burst)
                    .to(0.24, { scale: new Vec3(1.6, 1.6, 1) })
                    .start();
                tween(burstOp)
                    .to(0.07, { opacity: 255 })
                    .delay(0.05)
                    .to(0.12, { opacity: 0 })
                    .call(finish)
                    .start();
            })
            .start();
    }

    private showResult(r: BoxResult, tripleLayers = 0, tripleItems: RewardItem[] = []) {
        this.refresh();
        if (r.tier === 'rare') AudioMgr.play('rare');
        else if (r.tier === 'disaster') AudioMgr.play('disaster');
        const lines: Array<string | { text: string; color?: number }> = [];
        const tierText = r.tier === 'rare' ? TEXTS.boxRare : r.tier === 'disaster' ? TEXTS.boxDisaster : TEXTS.boxNormal;
        lines.push(tierText);
        for (const item of r.rewards) lines.push(this.rewardLine(item));
        if (r.resonated) lines.push({ text: TEXTS.resonateSuccess, color: 1 });
        if (tripleLayers > 0) {
            lines.push({ text: tripleLayers >= 3 ? TEXTS.tripleFull : TEXTS.tripleLayer(tripleLayers), color: 1 });
            for (const item of tripleItems) lines.push(this.rewardLine(item));
        }
        if (r.pityTriggered) lines.push({ text: TEXTS.pityTriggered, color: 1 });
        if (Game.realm.canBreakthrough()) lines.push({ text: TEXTS.boxBreakthroughChance, color: 1 });

        const canSeek = !!this.session && Game.box.canSeek(this.session) && Game.box.canOpen(r.boxId).ok;
        const seekText = canSeek ? `${TEXTS.seekAgain}（${getBox(r.boxId).cost} 灵石）` : TEXTS.seekLimit;
        showDialog(this.node, {
            title: '仙缘揭晓',
            lines,
            buttons: [
                { text: TEXTS.keepReward, primary: true, cb: () => this.afterSettle() },
                {
                    text: seekText,
                    cb: canSeek ? () => this.doSeek() : () => toast(this.node, TEXTS.seekLimit),
                    close: canSeek,
                },
                { text: `${TEXTS.doubleXiuweiBtn} · 广告`, cb: () => this.doubleXiuwei(r), close: false },
            ],
        });
    }

    private rewardLine(item: RewardItem): string | { text: string; color?: number } {
        switch (item.kind) {
            case 'lingshi': return { text: item.label, color: 1 };
            case 'xiuwei': return item.amount < 0 ? { text: item.label, color: 2 } : item.label;
            case 'jiyuan': return { text: item.label, color: 3 };
            case 'fragment': {
                const cfg = getLingeng(item.lingengId ?? '');
                return `灵根碎片「${cfg.name}」×${item.amount}`;
            }
            case 'gongfa': return { text: item.label, color: 1 };
            default: return item.label;
        }
    }

    private doSeek() {
        if (!this.session) return;
        const st = Game.box.canOpen(this.session.boxId);
        if (!st.ok) {
            this.lingshiNotEnoughDialog();
            return;
        }
        if (!Game.box.canSeek(this.session)) {
            toast(this.node, TEXTS.seekLimit);
            this.refresh();
            return;
        }
        // 求索复用同一交互动线：蓄力共鸣 → 开启 → 圆满三连
        this.beginCharge(this.session.boxId, 'seek');
    }

    private doubleXiuwei(r: BoxResult) {
        const xw = r.rewards.find((x) => x.kind === 'xiuwei' && x.amount > 0);
        if (!xw || (xw as any)._doubled) {
            toast(this.node, '本次开箱没有可加倍的修为');
            return;
        }
        Ads.show('doubleXiuwei', this.node, {
            onSuccess: () => {
                const extra = Game.eco.addXiuwei(xw.amount);
                (xw as any)._doubled = true;
                xw.label = `修为 +${xw.amount}（已加倍 +${extra}）`;
                Game.persist();
                toast(this.node, `修为加倍成功，额外 +${extra}`);
            },
        });
    }

    private afterSettle() {
        if (Game.realm.canBreakthrough()) {
            // swap 只替换栈顶（本页）：下层 Home 保留，渡劫结算 popToRoot 才能回主页。
            // 旧版 replace 清空整栈 → 栈变 [Rain]，popToRoot 停在已结束的渡劫页（P0-2）。
            Game.stack.swap(new RainScene());
        } else {
            Game.stack.pop();
        }
    }

    private lingshiNotEnoughDialog() {
        const remain = Game.eco.aidRemaining();
        const lines: Array<string | { text: string; color?: number }> = [TEXTS.lingshiNotEnough];
        if (remain > 0) {
            lines.push({ text: TEXTS.lingshiAidRemain(remain, DAILY_LINGSHI_AID_LIMIT), color: 1 });
        } else {
            lines.push({ text: TEXTS.lingshiAidExhausted, color: 2 });
        }
        showDialog(this.node, {
            title: '灵石不足',
            lines,
            buttons: remain > 0 ? [
                {
                    text: '去获取',
                    primary: true,
                    cb: () => {
                        Ads.show('dailyGift', this.node, {
                            onSuccess: () => {
                                const got = Game.eco.requestLingshiAid();
                                Game.persist();
                                this.refresh();
                                if (got) toast(this.node, `天道赏赐灵石 ×${got}`);
                            },
                        });
                    },
                },
                { text: '关闭' },
            ] : [{ text: '关闭' }],
        });
    }
}
