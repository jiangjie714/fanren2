/**
 * M17 妖影三消战斗页：TrailMatch3Engine 的渲染层（spec §4.C）。
 * 6×6 棋盘，棋子 = 本章妖怪池头像（章内前 5 只立绘复用，spec §6 单只三用）；
 * 点选相邻两子交换凑三连，消除对目标妖怪造成伤害（3=×1/4=×2/5·L=×3，连锁 ×1.2）。
 * 妖风洗牌走 trailHint 广告；步数耗尽可 trailRevive +5 步（每局 1 次）。
 */
import { Color, EventTouch, Graphics, Input, Label, Layers, Node, Sprite, SpriteFrame, tween, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { TEXTS } from '../core/config/texts';
import { TrailMatch3Engine, Match3Clear } from '../core/systems/TrailMatch3Engine';
import { chapterConfig, deriveMatch3 } from '../core/config/trail';
import { showDialog } from '../ui/dialog';
import { statusBar, StatusBarHandle } from '../ui/StatusBar';
import {
    THEME,
    ButtonHandle,
    faded,
    fadeIn,
    floatText,
    iconButton,
    image,
    label,
    loadArtFrame,
    pageBackground,
    progressBar,
    ProgressBarHandle,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';
import { TrailResultScene } from './TrailResultScene';

const CELL = 88;
const GAP = 6;

export class TrailMatch3Scene implements IScene {
    node: Node;
    private layer: number;
    private eng!: TrailMatch3Engine;
    private monsterName = '';
    private monsterId = '';
    private frames: (SpriteFrame | null)[] = [];
    private cells: Node[] = [];
    private selected = -1;
    private hpBar!: ProgressBarHandle;
    private stepsLabel: Node | null = null;
    private shuffleBtn: ButtonHandle | null = null;
    private settled = false;
    private reviveOverlay: Node | null = null;
    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };

    constructor(layer: number) {
        this.layer = layer;
        this.node = new Node('TrailMatch3Scene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        const spec = deriveMatch3(this.layer);
        const ch = chapterConfig(spec.chapter);
        this.monsterName = spec.monsterName;
        this.monsterId = spec.monsterId;
        this.eng = new TrailMatch3Engine(spec, this.layer);
        pageBackground(n, ch.bg);
        this.bar = statusBar(n, 436);
        iconButton(n, 'art/ui/icons/icon_close/spriteFrame', () => this.confirmQuit(), 86, 64);

        label(n, TEXTS.trailMatch3Page(this.monsterName), 28, { bold: true, color: THEME.goldLight }).setPosition(0, 470, 0);

        // 目标妖怪立绘 + 妖血条 + 步数
        image(n, `art/ui/trail/monsters/trail_${this.monsterId}/spriteFrame`, 128, 128).setPosition(-206, 300, 0);
        this.hpBar = progressBar(n, 460, 30, { text: TEXTS.trailMatch3Hp, fontSize: 19 });
        this.hpBar.node.setPosition(80, 306, 0);
        this.stepsLabel = label(n, TEXTS.trailMatch3Steps(this.eng.stepsLeft), 22, { bold: true, color: THEME.paper });
        this.stepsLabel.setPosition(80, 264, 0);
        label(n, TEXTS.trailMatch3HintLine, 20, { color: THEME.paper }).setPosition(0, 228, 0);

        this.buildBoard(spec);
        this.buildFooter();
        this.refreshBars();
        toast(n, `${spec.monsterName} 现形！三连妖影将其击破`, 26);
    }

    private buildBoard(spec: ReturnType<typeof deriveMatch3>) {
        const n = this.node;
        const size = spec.size;
        const gridW = size * CELL + (size - 1) * GAP;
        const panel = spritePanel(n, gridW + 40, gridW + 40, undefined, THEME.tintPanel);
        panel.setPosition(0, -80, 0);
        fadeIn(panel, 12);
        const grid = uinode('grid', panel, gridW, gridW);
        grid.setPosition(0, 0, 0);

        for (let pos = 0; pos < size * size; pos++) {
            const row = Math.floor(pos / size);
            const col = pos % size;
            const x = (col - (size - 1) / 2) * (CELL + GAP);
            const y = ((size - 1) / 2 - row) * (CELL + GAP);
            const cell = uinode(`cell${pos}`, grid, CELL, CELL);
            cell.setPosition(x, y, 0);
            const sp = cell.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            cell.on(Input.EventType.TOUCH_END, (e: EventTouch) => {
                e.propagationStopped = true;
                this.onCellTap(pos);
            });
            this.cells.push(cell);
        }

        // 棋子贴图 = 本章前 pieceKinds 只妖怪立绘（spec §6 单只三用之棋子头像）
        const pool = chapterConfig(spec.chapter).monsters;
        for (let k = 0; k < spec.pieceKinds; k++) {
            const id = pool[k].id;
            loadArtFrame(`art/ui/trail/monsters/trail_${id}/spriteFrame`, (sf) => {
                if (!sf || !this.node.isValid) return;
                sf.packable = false;
                this.frames[k] = sf;
                this.refreshBoard();
            });
        }
        this.refreshBoard();
    }

    private buildFooter() {
        const n = this.node;
        const foot = spritePanel(n, 628, 96, undefined, THEME.tintDeep);
        foot.setPosition(0, -440, 0);
        fadeIn(foot, 10);
        this.shuffleBtn = spriteButton(foot, 280, 64, TEXTS.trailMatch3Shuffle, () => this.onShuffle(), {
            fontSize: 22,
            variant: 'primary',
            textColor: THEME.void,
        });
        this.shuffleBtn.node.setPosition(-116, 0, 0);
        const quit = spriteButton(foot, 200, 64, TEXTS.trailGiveUpBtn, () => this.giveUp(), {
            fontSize: 22,
            variant: 'ghost',
            textColor: THEME.inkSoft,
        });
        quit.node.setPosition(140, 0, 0);
    }

    private onCellTap(pos: number) {
        if (this.eng.status !== 'ongoing') return;
        if (this.selected < 0) {
            this.select(pos);
            return;
        }
        if (this.selected === pos) {
            this.clearSelection();
            return;
        }
        const size = this.eng.spec.size;
        const ar = Math.floor(this.selected / size), ac = this.selected % size;
        const br = Math.floor(pos / size), bc = pos % size;
        const adjacent = Math.abs(ar - br) + Math.abs(ac - bc) === 1;
        if (!adjacent) {
            // 不相邻：改选新子
            this.clearSelection();
            this.select(pos);
            return;
        }
        const a = this.selected;
        const clears = this.eng.swap(a, pos);
        if (!clears) {
            // 无效交换：轻震提示，保持选中
            AudioMgr.play('click');
            toast(this.node, '凑不成三连，妖影弹回', 20);
            this.clearSelection();
            return;
        }
        this.clearSelection();
        AudioMgr.play('red');
        this.refreshBoard();
        this.refreshBars();
        this.showDamage(clears);
        if (this.eng.won) this.finishWin();
        else if (this.eng.lost) this.showReviveOffer();
    }

    private select(pos: number) {
        this.selected = pos;
        this.cells[pos].setScale(1.12, 1.12, 1);
        const ring = uinode('ring', this.cells[pos], CELL, CELL);
        const g = ring.addComponent(Graphics);
        g.strokeColor = THEME.goldLight;
        g.lineWidth = 4;
        g.roundRect(-CELL / 2 + 3, -CELL / 2 + 3, CELL - 6, CELL - 6, 10);
        g.stroke();
    }

    private clearSelection() {
        if (this.selected >= 0) {
            this.cells[this.selected].setScale(1, 1, 1);
            const ring = this.cells[this.selected].getChildByName('ring');
            if (ring) ring.destroy();
        }
        this.selected = -1;
    }

    /** 消除表现：被清格闪白 + 总伤害飘字（引擎已同步结算到稳态） */
    private showDamage(clears: readonly Match3Clear[]) {
        const size = this.eng.spec.size;
        const seen = new Set<number>();
        for (const c of clears) {
            for (const p of c.cells) {
                if (seen.has(p)) continue;
                seen.add(p);
                const node = this.cells[p];
                tween(node)
                    .to(0.08, { scale: new Vec3(0.82, 0.82, 1) })
                    .to(0.12, { scale: new Vec3(1, 1, 1) })
                    .start();
            }
        }
        const total = clears.reduce((s, c) => s + c.damage, 0);
        const maxChain = clears.reduce((m, c) => Math.max(m, c.chain), 1);
        const text = maxChain > 1 ? `-${total.toFixed(1)} 连锁×${maxChain}` : `-${Math.round(total * 10) / 10}`;
        floatText(this.node, 0, 380, text, THEME.cinnabar, 34);
    }

    private refreshBoard() {
        const size = this.eng.spec.size;
        for (let pos = 0; pos < this.cells.length; pos++) {
            const sp = this.cells[pos].getComponent(Sprite);
            if (!sp) continue;
            const frame = this.frames[this.eng.board[pos]] ?? null;
            if (frame) {
                sp.spriteFrame = frame;
                sp.color = new Color(255, 255, 255, 255);
            } else {
                sp.color = faded(THEME.inkSoft, 120);
            }
        }
    }

    private refreshBars() {
        const spec = this.eng.spec;
        this.hpBar?.set(Math.max(0, this.eng.hp) / spec.hp, `${TEXTS.trailMatch3Hp} ${Math.max(0, Math.ceil(this.eng.hp))}/${spec.hp}`);
        if (this.stepsLabel) {
            const lb = this.stepsLabel.getComponent(Label);
            if (lb) lb.string = TEXTS.trailMatch3Steps(this.eng.stepsLeft);
        }
    }

    /** 妖风洗牌：trailHint 广告（每日频控在 Ads 侧） */
    private onShuffle() {
        if (this.eng.status !== 'ongoing') return;
        Ads.show('trailHint', this.node, {
            onSuccess: () => {
                if (this.eng.shuffle()) {
                    AudioMgr.play('blue');
                    this.clearSelection();
                    this.refreshBoard();
                    toast(this.node, TEXTS.trailMatch3Shuffled, 24);
                }
            },
        });
    }

    // ---------- 胜负 ----------

    private finishWin() {
        if (this.settled) return;
        this.settled = true;
        AudioMgr.play('rare');
        floatText(this.node, 0, 240, TEXTS.trailMatch3WinFx, THEME.success, 44);
        const result = Game.trail.settleWin(Game.save, this.layer, { morale: false, now: new Date() })!;
        Game.quests.progress(Game.save, 'expedition');
        Game.checkAchievements(this.node);
        Game.persist();
        tween(this.node).delay(0.5).call(() => {
            Game.stack.push(new TrailResultScene({
                layer: this.layer,
                win: true,
                winResult: result,
                monsterName: this.monsterName,
                isBoss: false,
                morale: false,
            }));
        }).start();
    }

    private showReviveOffer() {
        if (this.reviveOverlay || this.eng.usedRevive) return;
        this.reviveOverlay = this.buildReviveOverlay();
    }

    private buildReviveOverlay(): Node {
        const overlay = uinode('reviveOverlay', this.node, 720, 1280);
        const scrimG = overlay.addComponent(Graphics);
        scrimG.fillColor = faded(THEME.void, 170);
        scrimG.roundRect(-360, -640, 720, 1280, 0);
        scrimG.fill();
        const panel = spritePanel(overlay, 596, 300);
        panel.setPosition(0, 60, 0);
        fadeIn(panel, 14);
        label(panel, TEXTS.trailMatch3ReviveTitle, 32, { bold: true, color: THEME.cinnabar }).setPosition(0, 100, 0);
        label(panel, TEXTS.trailMatch3ReviveLine, 23, { color: THEME.paper, width: 520 }).setPosition(0, 48, 0);
        // 与拼图页弹窗同规：双按钮按包围盒分栏，间隙 48px、两侧留白 24px。
        // 旧值 -92 / 140 会让两钮重叠 18px，手机上互相抢点击。
        const go = spriteButton(panel, 300, 76, TEXTS.trailReviveBtn, () => this.revive(overlay), {
            fontSize: 24,
            variant: 'primary',
            textColor: THEME.void,
        });
        go.node.setPosition(-124, -100, 0);
        const quit = spriteButton(panel, 200, 76, TEXTS.trailGiveUpBtn, () => this.giveUp(), {
            fontSize: 23,
            variant: 'ghost',
            textColor: THEME.inkSoft,
        });
        quit.node.setPosition(174, -100, 0);
        return overlay;
    }

    private revive(overlay: Node) {
        if (this.eng.status !== 'lost') return;
        Ads.show('trailRevive', this.node, {
            onSuccess: () => {
                if (this.eng.status !== 'lost') return;
                if (this.eng.revive()) {
                    overlay.destroy();
                    this.reviveOverlay = null;
                    toast(this.node, TEXTS.trailRevived, 26);
                    this.refreshBars();
                }
            },
            onSkip: () => this.giveUp(),
        });
    }

    private giveUp() {
        if (this.settled) return;
        this.settled = true;
        Game.persist();
        Game.stack.push(new TrailResultScene({
            layer: this.layer,
            win: false,
            monsterName: this.monsterName,
            isBoss: false,
            morale: false,
        }));
    }

    private confirmQuit() {
        if (this.settled) return;
        showDialog(this.node, {
            title: TEXTS.trailQuitTitle,
            lines: [TEXTS.trailQuitLine],
            buttons: [
                { text: TEXTS.trailMatch3Quit },
                { text: '离开', cb: () => Game.stack.pop() },
            ],
        });
    }
}
