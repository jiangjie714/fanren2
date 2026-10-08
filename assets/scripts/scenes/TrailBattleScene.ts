/**
 * M15 妖径闯关战斗页（#47）：TrailBattleSession（SLAY 内核 + 破绽 QTE +
 * 妖怪性格 + Boss 二阶段）的渲染层。全屏点按 = 斩击；破绽窗口点符文 = 命中
 * （伤害 ×2 + 打断反扑），点空 = 反扑提前；失败可看广告回魂一次（trailRevive）。
 * 战斗时间轴由本地累加 dt 驱动（session.advance(ms)），切后台不跳帧。
 */
import { Color, EventTouch, Graphics, Input, Label, Layers, Node, Sprite, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { TEXTS } from '../core/config/texts';
import { TrailBattleSession } from '../core/systems/TrailBattleSystem';
import { TrailWinResult } from '../core/systems/TrailSystem';
import { chapterConfig, chapterScale, deriveBattle } from '../core/config/trail';
import { showDialog } from '../ui/dialog';
import {
    ProgressBarHandle,
    THEME,
    faded,
    fadeIn,
    floatText,
    iconButton,
    image,
    label,
    pageBackground,
    progressBar,
    shakeNode,
    slashFx,
    spriteButton,
    spritePanel,
    toast,
    uinode,
    visibleHeight,
    visibleWidth,
} from '../ui/ThemeLib';
import { statusBar, StatusBarHandle } from '../ui/StatusBar';
import { TrailResultScene } from './TrailResultScene';

const PERSONALITY_NAMES: Record<string, string> = { swift: '疾风型', iron: '铁壁型', blood: '噬血型' };
/** 章节妖怪立绘兜底：尚未配专属立绘的妖怪按章复用三张旧妖兽图 */
const CHAPTER_MONSTER_ART = [
    'art/monsters/monster_qianshan/spriteFrame',
    'art/monsters/monster_migu/spriteFrame',
    'art/monsters/monster_gudong/spriteFrame',
];
/** 妖怪专属立绘（M15-T9 两批共 18 只全覆盖；wulang2 复用雾狼、shimo_boss 复用石魔） */
const MONSTER_ART: Record<string, string> = {
    yaoshu: 'art/ui/trail/monsters/trail_yaoshu/spriteFrame',
    shanyan: 'art/ui/trail/monsters/trail_shanyan/spriteFrame',
    duyao: 'art/ui/trail/monsters/trail_duyao/spriteFrame',
    yeyuan: 'art/ui/trail/monsters/trail_yeyuan/spriteFrame',
    wulang: 'art/ui/trail/monsters/trail_wulang/spriteFrame',
    wulang2: 'art/ui/trail/monsters/trail_wulang/spriteFrame',
    wuying: 'art/ui/trail/monsters/trail_wuying/spriteFrame',
    shimo: 'art/ui/trail/monsters/trail_shimo/spriteFrame',
    shimo_boss: 'art/ui/trail/monsters/trail_shimo/spriteFrame',
    yanluo: 'art/ui/trail/monsters/trail_yanluo/spriteFrame',
    shigan: 'art/ui/trail/monsters/trail_shigan/spriteFrame',
    huwan: 'art/ui/trail/monsters/trail_huwan/spriteFrame',
    xuehou: 'art/ui/trail/monsters/trail_xuehou/spriteFrame',
    guwan: 'art/ui/trail/monsters/trail_guwan/spriteFrame',
    xiagu: 'art/ui/trail/monsters/trail_xiagu/spriteFrame',
    shiling: 'art/ui/trail/monsters/trail_shiling/spriteFrame',
    moxi: 'art/ui/trail/monsters/trail_moxi/spriteFrame',
    leiying: 'art/ui/trail/monsters/trail_leiying/spriteFrame',
    guhuo: 'art/ui/trail/monsters/trail_guhuo/spriteFrame',
    tiekui: 'art/ui/trail/monsters/trail_tiekui/spriteFrame',
    mozun: 'art/ui/trail/monsters/trail_mozun/spriteFrame',
    xueying: 'art/ui/trail/monsters/trail_xueying/spriteFrame',
    huangou: 'art/ui/trail/monsters/trail_huangou/spriteFrame',
    xiuluo: 'art/ui/trail/monsters/trail_xiuluo/spriteFrame',
    guijiao: 'art/ui/trail/monsters/trail_guijiao/spriteFrame',
    shizhu: 'art/ui/trail/monsters/trail_shizhu/spriteFrame',
    xuetan: 'art/ui/trail/monsters/trail_xuetan/spriteFrame',
    xuezu: 'art/ui/trail/monsters/trail_xuezu/spriteFrame',
    bingcan: 'art/ui/trail/monsters/trail_bingcan/spriteFrame',
    binggui: 'art/ui/trail/monsters/trail_binggui/spriteFrame',
    hanyi: 'art/ui/trail/monsters/trail_hanyi/spriteFrame',
    bingyuan: 'art/ui/trail/monsters/trail_bingyuan/spriteFrame',
    bingling: 'art/ui/trail/monsters/trail_bingling/spriteFrame',
    xuepo: 'art/ui/trail/monsters/trail_xuepo/spriteFrame',
    bingzu: 'art/ui/trail/monsters/trail_bingzu/spriteFrame',
};

export class TrailBattleScene implements IScene {
    node: Node;
    private layer: number;
    private sess!: TrailBattleSession;
    private monsterName = '';
    private isBoss = false;

    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };
    private battleArea!: Node;
    private monsterNode!: Node;
    private playerNode!: Node;
    private monsterBar!: ProgressBarHandle;
    private playerBar!: ProgressBarHandle;
    private qteNode: Node | null = null;
    private phaseNode: Label | null = null;
    /** 战斗时间轴（ms，update 累加 dt） */
    private t = 0;
    /** 结算/回魂面板守卫：胜负后 update 不再重复触发 */
    private settled = false;
    private reviveOverlay: Node | null = null;
    private revived = false;

    constructor(layer: number) {
        this.node = new Node('TrailBattleScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.layer = layer;
    }

    onEnter() {
        const n = this.node;
        n.addComponent(UITransform).setContentSize(visibleWidth(), visibleHeight());
        const save = Game.save;
        const spec = deriveBattle(this.layer);
        const stats = Game.combat.deriveStats(save);
        this.monsterName = spec.monsterName;
        this.isBoss = spec.isBoss;
        this.sess = new TrailBattleSession(
            { atk: stats.atk, def: stats.def, scale: chapterScale(spec.chapter), personality: spec.personality, isBoss: spec.isBoss },
            Game.rng,
        );
        const ch = chapterConfig(spec.chapter);
        pageBackground(n, ch.bg);
        this.bar = statusBar(n, 436);

        // 顶部标题 + 退出
        const hud = spritePanel(n, 648, 84, undefined, THEME.tintDeep);
        hud.setPosition(0, 540, 0);
        fadeIn(hud, -12);
        iconButton(hud, 'art/ui/icons/icon_close/spriteFrame', () => this.confirmQuit(), 86, 64)
            .node.setPosition(-266, 0, 0);
        const lin = ((this.layer - 1) % 10) + 1;
        label(hud, `${TEXTS.trailLayerNum(lin)} · ${spec.monsterName}${spec.isBoss ? ` · ${TEXTS.trailBossTag}` : ''}`, 26, {
            bold: true,
            color: THEME.paper,
            width: 470,
            shrink: true,
        }).setPosition(24, 0, 0);

        // 妖怪舞台（立绘 + 性格标 + 影子 + Boss 阶段提示）
        const stage = uinode('stage', n, 720, 420);
        stage.setPosition(0, 190, 0);
        this.monsterNode = uinode('monster', stage, 230, 230);
        this.monsterNode.setPosition(0, 40, 0);
        const artIdx = Math.min(CHAPTER_MONSTER_ART.length - 1, spec.chapter - 1);
        image(this.monsterNode, MONSTER_ART[spec.monsterId] ?? CHAPTER_MONSTER_ART[artIdx], 210, 210, {
            fallbackPath: 'art/ui/icons/icon_expedition/spriteFrame',
        });
        tween(this.monsterNode).repeatForever(
            tween().to(0.9, { y: 31 }, { easing: 'sineInOut' }).to(0.9, { y: 40 }, { easing: 'sineInOut' }),
        ).start();
        this.drawShadow(stage, 0, -66, 120);
        label(stage, `${PERSONALITY_NAMES[spec.personality] ?? ''} · 妖`, 22, {
            bold: true,
            color: THEME.paper,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).setPosition(0, -104, 0);
        this.phaseNode = label(stage, '', 24, {
            bold: true,
            color: THEME.rainGold,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).getComponent(Label);
        this.phaseNode!.node.setPosition(0, 168, 0);

        // 血条面板
        const bars = spritePanel(n, 628, 118, undefined, THEME.tintPanel);
        bars.setPosition(0, -60, 0);
        fadeIn(bars, 12, 0.04);
        this.monsterBar = progressBar(bars, 580, 32, { text: '妖 气血', fontSize: 19 });
        this.monsterBar.node.setPosition(0, 30, 0);
        this.playerBar = progressBar(bars, 580, 28, { text: '我方 气血', fontSize: 18 });
        this.playerBar.node.setPosition(0, -26, 0);

        // 我方角色（与主页/雨境同源立绘）
        this.playerNode = uinode('player', n, 200, 200);
        this.playerNode.setPosition(-150, -300, 0);
        const charIdx = Math.min(5, Math.max(0, save.realmIndex));
        const female = save.profile.gender === 'f';
        image(this.playerNode, `art/characters/char_realm_0${charIdx}${female ? '_f' : ''}/spriteFrame`, 180, 180,
            female ? { fallbackPath: `art/characters/char_realm_0${charIdx}/spriteFrame` } : {});
        this.drawShadow(n, -150, -396, 104);

        // 底部提示（点按即斩 + 破绽说明）
        label(n, '点按任意处斩妖 · 血量破 25% 出现破绽符文，点中伤害加倍并打断反扑', 20, {
            color: THEME.paper,
            width: 640,
            shrink: true,
            outline: faded(THEME.void, 215),
            outlineWidth: 3,
        }).setPosition(0, -520, 0);

        // 战斗触控区：全屏兄弟节点（按钮/符文在其上层，命中时不会穿透到本区）
        this.battleArea = uinode('battleArea', n, visibleWidth(), visibleHeight());
        this.battleArea.on(Input.EventType.TOUCH_START, (e: EventTouch) => {
            e.propagationStopped = true;
            this.onBattleTap();
        });

        toast(n, TEXTS.trailEnterToast(spec.monsterName), 28);
        this.syncBars();
    }

    update(dt: number) {
        if (this.settled) return;
        this.t += dt * 1000;
        this.sess.advance(this.t);
        this.syncBars();
        this.syncQte();
        if (this.sess.status === 'win') this.finishWin();
        else if (this.sess.status === 'lose') this.showReviveOffer();
    }

    // ---------- 战斗交互 ----------

    private onBattleTap() {
        if (this.sess.status !== 'ongoing') return;
        if (this.sess.qteOpen) {
            // 点空：反扑提前
            this.sess.qteResolve(false, this.t);
            if (this.qteNode) this.qteNode.active = false;
            floatText(this.node, 0, 380, '破绽错失！', THEME.cinnabar, 26);
            AudioMgr.play('disaster');
            return;
        }
        const dmg = this.sess.tap(this.t);
        this.lunge(this.playerNode, 96);
        tween(this.node).delay(0.07).call(() => {
            if (!this.node.isValid || this.sess.status === 'lose') return;
            slashFx(this.node, 0, 240);
            this.hitFlash(this.monsterNode);
            floatText(this.node, 0, 350, `-${dmg}`, THEME.goldLight, 30);
            AudioMgr.play('click');
            if (this.isBoss && this.phaseNode && this.sess.phase === 2 && this.sess.monsterHp > 0) {
                this.phaseNode.string = '真身觉醒！';
            }
        }).start();
    }

    /** 破绽符文：点中 → ×2 伤害 + 打断反扑 */
    private onQteTap(e: EventTouch) {
        e.propagationStopped = true;
        if (!this.sess.qteOpen || this.sess.status !== 'ongoing') return;
        this.sess.qteResolve(true, this.t);
        if (this.qteNode) this.qteNode.active = false;
        floatText(this.node, 0, 380, '破绽！', THEME.success, 34);
        shakeNode(this.monsterNode, 5);
        AudioMgr.play('rare');
    }

    /** 每帧同步破绽符文显隐与血条 */
    private syncQte() {
        if (this.sess.qteOpen && !this.qteNode) this.makeQte();
        if (this.qteNode) this.qteNode.active = this.sess.qteOpen;
    }

    private makeQte() {
        const rune = uinode('qteRune', this.node, 150, 150);
        rune.setPosition(0, 400, 0);
        const g = rune.addComponent(Graphics);
        g.fillColor = faded(THEME.rainGold, 235);
        g.circle(0, 0, 58);
        g.fill();
        g.strokeColor = THEME.goldLight;
        g.lineWidth = 6;
        g.circle(0, 0, 66);
        g.stroke();
        label(rune, '破绽', 30, { bold: true, color: THEME.void });
        tween(rune).repeatForever(
            tween().to(0.35, { scale: new Vec3(1.12, 1.12, 1) }).to(0.35, { scale: new Vec3(1, 1, 1) }),
        ).start();
        rune.on(Input.EventType.TOUCH_START, (e: EventTouch) => this.onQteTap(e));
        rune.active = false;
        this.qteNode = rune;
    }

    private syncBars() {
        const s = this.sess;
        this.monsterBar?.set(Math.max(0, s.monsterHp / s.monsterHpMax), `妖 气血 ${Math.max(0, Math.ceil(s.monsterHp))}/${s.monsterHpMax}`);
        this.playerBar?.set(Math.max(0, s.playerHp / s.playerHpMax), `我方 气血 ${Math.max(0, Math.ceil(s.playerHp))}/${s.playerHpMax}`);
    }

    // ---------- 胜负 ----------

    private finishWin() {
        if (this.settled) return;
        this.settled = true;
        AudioMgr.play('rare');
        // 妖影消散演出
        const op = this.monsterNode.addComponent(UIOpacity);
        tween(this.monsterNode).by(0.35, { position: new Vec3(0, -26, 0) }).start();
        tween(op).to(0.35, { opacity: 0 }).start();
        floatText(this.node, 0, 240, TEXTS.trailWinFx, THEME.success, 44);
        const result = Game.trail.settleWin(Game.save, this.layer, { morale: this.sess.morale, now: new Date() })!;
        Game.quests.progress(Game.save, 'expedition'); // 语义改为「妖径通关 1 层」（任务 id 不变）
        Game.checkAchievements(this.node);
        Game.persist();
        tween(this.node).delay(0.5).call(() => {
            Game.stack.push(new TrailResultScene({
                layer: this.layer,
                win: true,
                winResult: result,
                monsterName: this.monsterName,
                isBoss: this.isBoss,
                morale: this.sess.morale,
            }));
        }).start();
    }

    private showReviveOffer() {
        if (this.reviveOverlay) return; // 面板已挂起，等玩家选择
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
        label(panel, TEXTS.trailReviveTitle, 32, { bold: true, color: THEME.cinnabar }).setPosition(0, 100, 0);
        label(panel, this.revived ? '回魂机会已用尽。' : TEXTS.trailReviveLine, 23, {
            color: THEME.paper, width: 520, shrink: true,
        }).setPosition(0, 48, 0);
        const go = spriteButton(panel, 300, 76, this.revived ? '已用尽' : TEXTS.trailReviveBtn, () => this.revive(overlay), {
            fontSize: 24,
            variant: 'primary',
            textColor: THEME.void,
        });
        go.node.setPosition(-92, -100, 0);
        if (this.revived) go.setEnabled(false);
        const quit = spriteButton(panel, 200, 76, TEXTS.trailGiveUpBtn, () => this.giveUp(), {
            fontSize: 23,
            variant: 'ghost',
            textColor: THEME.inkSoft,
        });
        quit.node.setPosition(140, -100, 0);
        return overlay;
    }

    private revive(overlay: Node) {
        if (this.revived || this.sess.status !== 'lose') return;
        Ads.show('trailRevive', this.node, {
            onSuccess: () => {
                if (this.revived || this.sess.status !== 'lose') return;
                this.revived = true;
                this.sess.revive(0.5);
                this.sess.nextStrikeAt = this.t + this.sess.effectiveStrikeInterval;
                overlay.destroy();
                this.reviveOverlay = null;
                toast(this.node, TEXTS.trailRevived, 26);
                this.syncBars();
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
            isBoss: this.isBoss,
            morale: false,
        }));
    }

    private confirmQuit() {
        if (this.settled) return;
        showDialog(this.node, {
            title: TEXTS.trailQuitTitle,
            lines: [TEXTS.trailQuitLine],
            buttons: [
                { text: '继续战斗' },
                { text: '离开', cb: () => Game.stack.pop() },
            ],
        });
    }

    // ---------- 特效小件 ----------

    private drawShadow(parent: Node, x: number, y: number, w: number) {
        const n = uinode('shadow', parent, w, 22);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        g.fillColor = faded(THEME.void, 120);
        g.ellipse(0, 0, w / 2, 10);
        g.fill();
    }

    private lunge(node: Node, dx: number) {
        const ox = node.position.x;
        tween(node)
            .to(0.07, { position: new Vec3(ox + dx, node.position.y, 0) }, { easing: 'sineOut' })
            .delay(0.06)
            .to(0.1, { position: new Vec3(ox, node.position.y, 0) }, { easing: 'sineIn' })
            .start();
    }

    private hitFlash(charNode: Node | null) {
        if (!charNode) return;
        const img = charNode.children[0]?.children[0] ?? charNode.children[0];
        const sp = img?.getComponent(Sprite);
        if (!sp) return;
        sp.color = faded(THEME.danger, 255);
        tween(sp).delay(0.1).to(0.12, { color: Color.WHITE }).start();
    }
}

// TrailWinResult 重导出给结果页类型引用（避免结果页直接依赖 systems 内部路径拼写漂移）
export type { TrailWinResult };
