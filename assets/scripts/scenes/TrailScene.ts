/**
 * M15 妖径章节地图页（#47，历练重构）：章节外壳 + 10 层关卡格。
 * 当前层可挑战、已通层可重刷（每日 5 次产出护栏）、未解锁灰置；
 * 层内玩法类型由层号确定性派生（config/trail.deriveGame，M15 仅 battle）。
 */
import { Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { TEXTS } from '../core/config/texts';
import { statusBar, StatusBarHandle } from '../ui/StatusBar';
import {
    THEME,
    faded,
    fadeIn,
    label,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    toast,
} from '../ui/ThemeLib';
import {
    TRAIL_LAYERS_PER_CHAPTER,
    TRAIL_REPEAT_PER_DAY,
    chapterConfig,
    chapterOf,
    deriveGame,
    layerInChapter,
} from '../core/config/trail';
import { TrailBattleScene } from './TrailBattleScene';

/** 妖径页：章节地图 + 关卡格（每格 300×96，两列五行的呼吸布局）。 */
export class TrailScene implements IScene {
    node: Node;
    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };
    private cells: Array<{ layer: number; btn: ReturnType<typeof spriteButton>; title: Label; sub: Label; tag: Label | null }> = [];
    private infoLabel: Label | null = null;
    private repeatLabel: Label | null = null;

    constructor() {
        this.node = new Node('TrailScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        const save = Game.save;
        const chapter = chapterOf(save.trail.curLayer);
        const ch = chapterConfig(chapter);
        pageBackground(n, ch.bg);
        pageHeader(n, TEXTS.trailPageTitle(ch.name), () => Game.stack.pop());
        this.bar = statusBar(n, 436);

        // 章节信息卡（顶部让位状态栏 y=436：卡顶 389 < 436 不重叠）
        const info = spritePanel(n, 628, 118, undefined, THEME.tintPanel);
        info.setPosition(0, 330, 0);
        fadeIn(info, 12);
        label(info, `${chapter} 章 · ${ch.name}`, 30, { bold: true, color: THEME.goldLight }).setPosition(0, 32, 0);
        label(info, ch.blurb, 22, { color: THEME.paper, width: 560, shrink: true }).setPosition(0, -8, 0);
        this.infoLabel = label(info, '', 21, { color: THEME.inkSoft }).getComponent(Label);
        this.infoLabel!.node.setPosition(0, -42, 0);

        // 关卡格：2 列 × 5 行（章内层 1..10，从上到下、从左到右）
        const CELL_W = 300;
        const CELL_H = 96;
        const GAP = 16;
        const top = 236;
        for (let i = 0; i < TRAIL_LAYERS_PER_CHAPTER; i++) {
            const lin = i + 1;
            const layer = (chapter - 1) * TRAIL_LAYERS_PER_CHAPTER + lin;
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = col === 0 ? -(CELL_W + GAP) / 2 : (CELL_W + GAP) / 2;
            const y = top - row * (CELL_H + GAP);
            this.cells.push(this.makeCell(n, layer, lin, x, y, CELL_W, CELL_H));
        }

        // 底部状态卡：重刷护栏 + 提示
        const foot = spritePanel(n, 628, 96, undefined, THEME.tintDeep);
        foot.setPosition(0, -420, 0);
        fadeIn(foot, 10, 0.05);
        this.repeatLabel = label(foot, '', 24, { bold: true, color: THEME.goldLight }).getComponent(Label);
        this.repeatLabel!.node.setPosition(0, 20, 0);
        label(foot, TEXTS.trailHintLine, 20, { color: THEME.paper, width: 560, shrink: true }).setPosition(0, -20, 0);

        this.refresh();
    }

    onResume() {
        this.refresh();
    }

    private makeCell(parent: Node, layer: number, lin: number, x: number, y: number, w: number, h: number) {
        const isBoss = lin === TRAIL_LAYERS_PER_CHAPTER;
        const btn = spriteButton(parent, w, h, '', () => this.enter(layer), {
            variant: 'secondary',
        });
        btn.node.setPosition(x, y, 0);
        const title = label(btn.node, TEXTS.trailLayerNum(lin), 26, { bold: true, color: THEME.paper }).getComponent(Label)!;
        title.node.setPosition(-84, 0, 0);
        const sub = label(btn.node, '', 20, { bold: true, color: THEME.goldLight, align: 'left', width: 150 }).getComponent(Label)!;
        sub.node.setPosition(30, 0, 0);
        // Boss 关右下角朱砂角标（与主标签错位，防重叠）
        let tag: Label | null = null;
        if (isBoss) {
            tag = label(btn.node, TEXTS.trailBossTag, 19, {
                bold: true,
                color: THEME.paper,
                outline: faded(THEME.cinnabarDeep, 240),
                outlineWidth: 3,
            }).getComponent(Label);
            tag!.node.setPosition(108, -30, 0);
        }
        return { layer, btn, title, sub, tag };
    }

    private refresh() {
        this.bar.refresh();
        const save = Game.save;
        const chapter = chapterOf(save.trail.curLayer);
        const chapterBase = (chapter - 1) * TRAIL_LAYERS_PER_CHAPTER;
        const doneInChapter = Math.min(TRAIL_LAYERS_PER_CHAPTER, save.trail.curLayer - chapterBase - 1);
        if (this.infoLabel) this.infoLabel.string = TEXTS.trailChapterDone(doneInChapter);
        if (this.repeatLabel) {
            this.repeatLabel.string = TEXTS.trailRepeatLeft(Game.trail.repeatLeft(save), TRAIL_REPEAT_PER_DAY);
        }
        for (const c of this.cells) {
            const lin = layerInChapter(c.layer);
            const cleared = save.trail.curLayer > c.layer;
            const current = save.trail.curLayer === c.layer;
            const isBoss = lin === TRAIL_LAYERS_PER_CHAPTER;
            const game = deriveGame(c.layer);
            const gameName = game === 'puzzle' ? TEXTS.trailTypePuzzle : game === 'match3' ? TEXTS.trailTypeMatch3 : TEXTS.trailTypeBattle;
            c.title.string = TEXTS.trailLayerNum(lin);
            c.sub.string = isBoss && current ? `${gameName} · ${TEXTS.trailBossTag}`
                : current ? gameName
                    : cleared ? TEXTS.trailCleared
                        : TEXTS.trailLocked;
            // 状态染色：当前层金、已通纸白、锁定褪灰（Label.color，Node 无 color 属性）
            c.title.color = current ? THEME.goldLight : cleared ? THEME.paper : faded(THEME.paper, 90);
            c.sub.color = current ? THEME.goldLight : cleared ? faded(THEME.paper, 200) : faded(THEME.paper, 80);
            if (c.tag) c.tag.node.active = isBoss;
            c.btn.node.setScale(current ? 1.04 : 1, current ? 1.04 : 1, 1);
        }
    }

    private enter(layer: number) {
        if (!Game.trail.canEnter(Game.save, layer)) {
            toast(this.node, TEXTS.trailLockedToast);
            return;
        }
        Game.stack.push(new TrailBattleScene(layer));
    }
}
