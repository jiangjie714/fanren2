/**
 * M16 妖像拼图战斗页：TrailPuzzleEngine（交换式拼图内核）的渲染层。
 * 妖怪立绘运行时 UV 切 N×N 块（不落盘多图，spec §6 单只三用）；
 * 点选两块交换，归位自动锁定并累积封印进度；限时内 100% 复原 = 封印成功。
 * 凝神一瞥：免费 1 次，追加走 trailHint 广告（每日频控在 Ads 侧）；
 * 超时可 trailRevive +15s（每局 1 次），或力竭而退。
 */
import { Color, EventTouch, Graphics, Input, Layers, Node, Rect, Size, Sprite, SpriteFrame, tween, UITransform, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { TEXTS } from '../core/config/texts';
import { TrailPuzzleEngine } from '../core/systems/TrailPuzzleEngine';
import { chapterConfig, derivePuzzle } from '../core/config/trail';
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
    visibleHeight,
    visibleWidth,
} from '../ui/ThemeLib';
import { TrailResultScene } from './TrailResultScene';

export class TrailPuzzleScene implements IScene {
    node: Node;
    private layer: number;
    private eng!: TrailPuzzleEngine;
    private monsterName = '';
    private monsterId = '';
    private frames: (SpriteFrame | null)[] = [];
    private tileNodes: Node[] = [];
    private selected = -1;
    private hpBar!: ProgressBarHandle;
    private timeBar!: ProgressBarHandle;
    private peekBtn: ButtonHandle | null = null;
    private settled = false;
    private reviveOverlay: Node | null = null;
    private peekNode: Node | null = null;
    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };

    constructor(layer: number) {
        this.layer = layer;
        this.node = new Node('TrailPuzzleScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        const spec = derivePuzzle(this.layer);
        const ch = chapterConfig(spec.chapter);
        this.monsterName = spec.monsterName;
        this.monsterId = spec.monsterId;
        this.eng = new TrailPuzzleEngine(spec, this.layer);
        pageBackground(n, ch.bg);
        this.bar = statusBar(n, 436);
        iconButton(n, 'art/ui/icons/icon_close/spriteFrame', () => this.confirmQuit(), 86, 64);

        // 页头：标题（让位状态栏 y=436）
        label(n, TEXTS.trailPuzzlePage(this.monsterName), 28, { bold: true, color: THEME.goldLight }).setPosition(0, 470, 0);
        // 封印进度 / 倒计时
        this.hpBar = progressBar(n, 580, 30, { text: '封 印', fontSize: 19 });
        this.hpBar.node.setPosition(0, 300, 0);
        this.timeBar = progressBar(n, 580, 30, { text: '时 辰', fontSize: 19 });
        this.timeBar.node.setPosition(0, 258, 0);
        label(n, TEXTS.trailPuzzleHintLine, 20, { color: THEME.paper }).setPosition(0, 222, 0);

        this.buildBoard(spec.size);
        this.buildFooter();
        this.refreshBars();
        toast(n, `${spec.monsterName} 现形！复原立绘将其封印`, 26);
    }

    private buildBoard(size: number) {
        const n = this.node;
        const cell = size === 3 ? 130 : 100;
        const gap = 8;
        const gridW = size * cell + (size - 1) * gap;
        const panel = spritePanel(n, gridW + 44, gridW + 44, undefined, THEME.tintPanel);
        panel.setPosition(0, -30, 0);
        fadeIn(panel, 12);
        const grid = uinode('grid', panel, gridW, gridW);
        grid.setPosition(0, 0, 0);

        for (let pos = 0; pos < size * size; pos++) {
            const row = Math.floor(pos / size);
            const col = pos % size;
            const x = (col - (size - 1) / 2) * (cell + gap);
            const y = ((size - 1) / 2 - row) * (cell + gap);
            const tile = uinode(`tile${pos}`, grid, cell, cell);
            tile.setPosition(x, y, 0);
            const sp = tile.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            sp.trim = false;
            tile.on(Input.EventType.TOUCH_END, (e: EventTouch) => {
                e.propagationStopped = true;
                this.onTileTap(pos);
            });
            this.tileNodes.push(tile);
        }

        // 加载立绘并 UV 切块（运行时切，不落盘多图）
        loadArtFrame(`art/ui/trail/monsters/trail_${this.monsterId}/spriteFrame`, (base) => {
            if (!base || !this.node.isValid) return;
            // 导入器对 PNG 做了 auto-trim（base.rect 是内容 bbox，非整图）。
            // 不用 clone：clone 会带走 base 已算好的 UV 缓存，改 rect 不一定重算，
            // 导致渲染仍是整块内容——new SpriteFrame 让 UV 从新 rect 首算。
            // 禁 packable 防动态图集重打包。rect 与 base.rect 同一坐标系（左上原点）。
            base.packable = false;
            const br = base.rect;
            const cw = br.width / size;
            const chh = br.height / size;
            const tex = base.texture;
            this.frames = [];
            for (let tileId = 0; tileId < size * size; tileId++) {
                const sf = new SpriteFrame();
                sf.packable = false;
                sf.texture = tex;
                const r = Math.floor(tileId / size);
                const c = tileId % size;
                sf.rect = new Rect(br.x + c * cw, br.y + r * chh, cw, chh);
                sf.originalSize = new Size(cw, chh);
                this.frames.push(sf);
            }
            this.refreshBoard();
        });
        this.refreshBoard();
    }

    private buildFooter() {
        const n = this.node;
        const foot = spritePanel(n, 628, 96, undefined, THEME.tintDeep);
        foot.setPosition(0, -440, 0);
        fadeIn(foot, 10);
        this.peekBtn = spriteButton(foot, 260, 64, TEXTS.trailPuzzlePeek, () => this.onPeek(), {
            fontSize: 22,
            variant: 'primary',
            textColor: THEME.void,
        });
        this.peekBtn.node.setPosition(-120, 0, 0);
        const quit = spriteButton(foot, 200, 64, TEXTS.trailGiveUpBtn, () => this.giveUp(), {
            fontSize: 22,
            variant: 'ghost',
            textColor: THEME.inkSoft,
        });
        quit.node.setPosition(140, 0, 0);
    }

    private onTileTap(pos: number) {
        if (this.eng.status !== 'ongoing') return;
        if (this.eng.isLocked(pos)) {
            toast(this.node, TEXTS.trailPuzzleSwapLocked, 22);
            return;
        }
        if (this.selected < 0) {
            this.selected = pos;
            this.tileNodes[pos].setScale(1.06, 1.06, 1);
            return;
        }
        if (this.selected === pos) {
            this.tileNodes[pos].setScale(1, 1, 1);
            this.selected = -1;
            return;
        }
        const a = this.selected;
        this.selected = -1;
        this.tileNodes[a].setScale(1, 1, 1);
        if (!this.eng.swap(a, pos)) {
            toast(this.node, TEXTS.trailPuzzleSwapLocked, 22);
            return;
        }
        AudioMgr.play('click');
        this.refreshBoard();
        this.refreshBars();
        for (const p of [a, pos]) {
            if (this.eng.isLocked(p)) {
                tween(this.tileNodes[p]).to(0.12, { scale: new Vec3(1.1, 1.1, 1) }).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
            }
        }
        if (this.eng.won) this.finishWin();
    }

    /** 按当前棋盘刷新每块贴图 + 锁定态金边 */
    private refreshBoard() {
        const cell = this.eng.size === 3 ? 130 : 100;
        for (let pos = 0; pos < this.tileNodes.length; pos++) {
            const tile = this.tileNodes[pos];
            const sp = tile.getComponent(Sprite);
            const ring = tile.getChildByName('ring');
            if (ring) ring.destroy();
            const tileId = this.eng.board[pos];
            const frame = this.frames[tileId] ?? null;
            if (sp && frame) {
                sp.spriteFrame = frame;
                sp.color = new Color(255, 255, 255, 255);
            } else if (sp) {
                sp.color = faded(THEME.inkSoft, 140);
            }
            if (this.eng.isLocked(pos)) {
                const edge = uinode('ring', tile, cell, cell);
                const rg = edge.addComponent(Graphics);
                rg.strokeColor = THEME.goldLight;
                rg.lineWidth = 4;
                rg.roundRect(-cell / 2 + 3, -cell / 2 + 3, cell - 6, cell - 6, 8);
                rg.stroke();
            }
        }
        this.syncPeekBtn();
    }

    private refreshBars() {
        this.hpBar?.set(this.eng.progress(), `封 印 ${Math.round(this.eng.progress() * 100)}%`);
        const limit = this.eng.spec.timeLimitSec;
        this.timeBar?.set(Math.max(0, this.eng.timeLeft) / limit, `时 辰 ${Math.ceil(Math.max(0, this.eng.timeLeft))}s`);
    }

    private syncPeekBtn() {
        if (!this.peekBtn) return;
        this.peekBtn.setText(this.eng.peeksLeft > 0 ? TEXTS.trailPuzzlePeek : TEXTS.trailPuzzlePeekAd);
    }

    /** 凝神一瞥：免费 1 次 → 之后走 trailHint 广告（每日频控在 Ads 侧） */
    private onPeek() {
        if (this.eng.status !== 'ongoing') return;
        if (this.eng.peek()) {
            this.showPeek();
            this.syncPeekBtn();
            return;
        }
        Ads.show('trailHint', this.node, {
            onSuccess: () => {
                this.eng.grantPeek();
                if (this.eng.peek()) this.showPeek();
                this.syncPeekBtn();
            },
        });
    }

    /** 展示完整原图 1 秒 */
    private showPeek() {
        AudioMgr.play('blue');
        toast(this.node, TEXTS.trailPuzzlePeeked, 24);
        if (this.peekNode) this.peekNode.destroy();
        const overlay = uinode('peek', this.node, visibleWidth(), visibleHeight());
        const scrim = overlay.addComponent(Graphics);
        scrim.fillColor = faded(THEME.void, 200);
        scrim.roundRect(-visibleWidth() / 2, -visibleHeight() / 2, visibleWidth(), visibleHeight(), 0);
        scrim.fill();
        image(overlay, `art/ui/trail/monsters/trail_${this.monsterId}/spriteFrame`, 420, 420);
        overlay.setPosition(0, -30, 0);
        this.peekNode = overlay;
        tween(overlay).delay(1).call(() => {
            overlay.destroy();
            if (this.peekNode === overlay) this.peekNode = null;
        }).start();
    }

    update(dt: number) {
        if (!this.eng || this.settled) return;
        this.eng.tick(dt);
        this.refreshBars();
        if (this.eng.status === 'lost') this.showReviveOffer();
    }

    // ---------- 胜负 ----------

    private finishWin() {
        if (this.settled) return;
        this.settled = true;
        AudioMgr.play('rare');
        floatText(this.node, 0, 240, TEXTS.trailPuzzleWinFx, THEME.success, 44);
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
        const overlay = uinode('reviveOverlay', this.node, visibleWidth(), visibleHeight());
        const scrimG = overlay.addComponent(Graphics);
        scrimG.fillColor = faded(THEME.void, 170);
        scrimG.roundRect(-visibleWidth() / 2, -visibleHeight() / 2, visibleWidth(), visibleHeight(), 0);
        scrimG.fill();
        const panel = spritePanel(overlay, 596, 300);
        panel.setPosition(0, 60, 0);
        fadeIn(panel, 14);
        label(panel, TEXTS.trailPuzzleReviveTitle, 32, { bold: true, color: THEME.cinnabar }).setPosition(0, 100, 0);
        label(panel, TEXTS.trailPuzzleReviveLine, 23, { color: THEME.paper, width: 520 }).setPosition(0, 48, 0);
        // 双按钮按包围盒分栏：面板 596 宽（半宽 298），内留白 24 → 可用 548。
        // 300 + 200 = 500，剩 48 作中间间隙 → 左右钮心 -124 / 174。
        // 旧值 -92 / 140 会让两钮重叠 18px（-92+150=58 > 140-100=40），手机上互相抢点击。
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
                { text: '继续拼图' },
                { text: '离开', cb: () => Game.stack.pop() },
            ],
        });
    }
}
