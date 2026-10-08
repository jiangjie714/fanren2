/**
 * M22 剑冢战斗页（#48，方案 B）：左我右妖对峙 + 单一时机打断。
 *
 * 沿用 PkBattleScene / TrailBattleScene 的舞台语言，不新建视觉语法：
 * - 玩家立绘复用境界立绘（零新增美术）
 * - 妖物立绘按层号 hash 复用妖径立绘池（零新增美术）
 *
 * 整局（run）由本场景实例持有：层间不停（1.2s 过场直接进下一层），
 * 失败弹 overlay 回魂/收兵，收兵才落结算页 —— 与 spec §4.3 一致。
 */
import { Graphics, Label, Layers, Node, UIOpacity, Vec3, tween } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { TEXTS } from '../core/config/texts';
import { formatCompact } from '../core/bignum';
import { GANG_MAX, REVIVE_MAX, TowerBattleSession, reviveMult } from '../core/config/tower';
import { TRAIL_CHAPTERS } from '../core/config/trail';
import { TowerRun } from '../core/systems/TowerSystem';
import { statusBar, StatusBarHandle } from '../ui/StatusBar';
import {
    ButtonHandle,
    ProgressBarHandle,
    THEME,
    faded,
    fadeIn,
    floatText,
    image,
    label,
    pageBackground,
    progressBar,
    shakeNode,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';
import { TowerRunResult, TowerResultScene } from './TowerResultScene';

/** 妖径立绘池（按层号 hash 复用；零新增美术） */
const MONSTER_POOL: string[] = (() => {
    const ids: string[] = [];
    for (const ch of TRAIL_CHAPTERS) {
        for (const m of ch.monsters) ids.push(m.id);
        ids.push(ch.boss.id);
    }
    return ids;
})();

/** 确定性妖怪选择（同层恒同妖，防退出重进换妖） */
function monsterOf(floor: number): { id: string; name: string } {
    let h = 2166136261 ^ floor;
    h = Math.imul(h, 16777619) >>> 0;
    const idx = MONSTER_POOL.length ? h % MONSTER_POOL.length : 0;
    const id = MONSTER_POOL[idx] ?? 'wulang';
    for (const ch of TRAIL_CHAPTERS) {
        const m = ch.monsters.find((x) => x.id === id) ?? (ch.boss.id === id ? ch.boss : undefined);
        if (m) return { id: m.id, name: m.name };
    }
    return { id: 'wulang', name: '妖物' };
}

const OVER_PAUSE = 1.2;

export class TowerBattleScene implements IScene {
    node: Node;
    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };
    private run!: TowerRun;
    private sess!: TowerBattleSession;
    /** 层间过场中：暂停推进、屏蔽输入 */
    private interlude = false;
    private over = false;

    private floorLabel: Label | null = null;
    private timeRing: Graphics | null = null;
    private gangBar!: ProgressBarHandle;
    private hpBar!: ProgressBarHandle;
    private atkLabel: Label | null = null;
    private crystalLabel: Label | null = null;
    private chargeNode: Node | null = null;
    private chargeG: Graphics | null = null;
    private chargeBtn: ButtonHandle | null = null;
    private monsterNode: Node | null = null;
    private overlay: Node | null = null;
    private forgeBtns: ButtonHandle[] = [];

    constructor() {
        this.node = new Node('TowerBattleScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        this.run = Game.tower.startRun(Game.save);
        pageBackground(n, 'art/ui/bg_tower/spriteFrame');
        this.bar = statusBar(n, 436);

        // 顶部 HUD：层号 + 倒计时环 + 收兵
        const hud = spritePanel(n, 648, 84, undefined, THEME.tintDeep);
        hud.setPosition(0, 470, 0);
        fadeIn(hud, -12);
        this.floorLabel = label(hud, '', 26, { bold: true, color: THEME.paper }).getComponent(Label);
        this.floorLabel!.node.setPosition(-150, 0, 0);
        const ringNode = uinode('timeRing', hud, 72, 72);
        ringNode.setPosition(196, 0, 0);
        this.timeRing = ringNode.addComponent(Graphics);
        spriteButton(hud, 120, 60, TEXTS.towerQuit, () => this.confirmQuit(), {
            fontSize: 22,
            variant: 'secondary',
            textColor: THEME.paper,
        }).node.setPosition(-276, 0, 0);

        // 妖物舞台（复用妖径立绘）
        const stage = uinode('stage', n, 720, 380);
        stage.setPosition(0, 190, 0);
        this.monsterNode = uinode('monster', stage, 220, 220);
        this.monsterNode.setPosition(0, 30, 0);
        const mon = monsterOf(this.run.floor);
        image(this.monsterNode, `art/ui/trail/monsters/trail_${mon.id}/spriteFrame`, 200, 200, {
            fallbackPath: 'art/ui/icons/icon_expedition/spriteFrame',
        });
        tween(this.monsterNode)
            .repeatForever(tween().to(0.9, { y: 22 }, { easing: 'sineInOut' }).to(0.9, { y: 30 }, { easing: 'sineInOut' }))
            .start();
        label(stage, `${mon.name}`, 22, {
            bold: true,
            color: THEME.paper,
            outline: faded(THEME.void, 220),
            outlineWidth: 3,
        }).setPosition(0, -104, 0);

        // 血条面板：妖血 + 我方剑罡
        const bars = spritePanel(n, 628, 122, undefined, THEME.tintPanel);
        bars.setPosition(0, -40, 0);
        fadeIn(bars, 12, 0.04);
        this.hpBar = progressBar(bars, 580, 32, { text: TEXTS.towerMonsterHp, fontSize: 19 });
        this.hpBar.node.setPosition(0, 30, 0);
        this.gangBar = progressBar(bars, 580, 28, { text: TEXTS.towerGang, fontSize: 18 });
        this.gangBar.node.setPosition(0, -26, 0);

        // 我方立绘（复用境界立绘）
        const save = Game.save;
        const charIdx = Math.min(5, Math.max(0, save.realmIndex));
        const female = save.profile.gender === 'f';
        const playerNode = uinode('player', n, 190, 190);
        playerNode.setPosition(-150, -270, 0);
        image(playerNode, `art/characters/char_realm_0${charIdx}${female ? '_f' : ''}/spriteFrame`, 170, 170,
            female ? { fallbackPath: `art/characters/char_realm_0${charIdx}/spriteFrame` } : {});

        // 蓄力红环 + 凝神一击按钮（窗口外的点击无效 + 短 CD）
        this.chargeNode = uinode('charge', n, 170, 170);
        this.chargeNode.setPosition(0, -300, 0);
        this.chargeG = this.chargeNode.addComponent(Graphics);
        this.chargeBtn = spriteButton(this.chargeNode, 200, 68, TEXTS.towerChargeBtn, () => this.onChargeTap(), {
            fontSize: 24,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        this.chargeBtn.node.setPosition(0, -78, 0);
        this.chargeBtn.setEnabled(false);

        label(n, TEXTS.towerChargeHint, 19, {
            color: THEME.paper,
            width: 640,
            shrink: true,
            outline: faded(THEME.void, 215),
            outlineWidth: 3,
        }).setPosition(0, -470, 0);

        // 底部淬剑条（常驻：边打边淬剑是本作核心快感，不可打断）
        const forge = spritePanel(n, 628, 92, undefined, THEME.tintDeep);
        forge.setPosition(0, -556, 0);
        this.crystalLabel = label(forge, '', 22, { bold: true, color: THEME.success, align: 'left', width: 300 }).getComponent(Label);
        this.crystalLabel!.node.setPosition(-150, 18, 0);
        this.atkLabel = label(forge, '', 22, { bold: true, color: THEME.goldLight, align: 'left', width: 300 }).getComponent(Label);
        this.atkLabel!.node.setPosition(-150, -18, 0);
        const f1 = spriteButton(forge, 150, 62, TEXTS.towerForge1, () => this.forge(1), { fontSize: 22, variant: 'primary', textColor: THEME.void });
        f1.node.setPosition(60, 0, 0);
        const f10 = spriteButton(forge, 150, 62, TEXTS.towerForge10, () => this.forge(10), { fontSize: 22, variant: 'secondary', textColor: THEME.goldLight });
        f10.node.setPosition(226, 0, 0);
        this.forgeBtns = [f1, f10];

        this.beginFloor();
    }

    update(dt: number) {
        if (!this.sess || this.over) return;
        if (!this.interlude) {
            // 淬剑会实时抬高剑气 —— 这是「边打边淬剑」的直接收益
            this.sess.atk = this.currentAtk();
            this.sess.advance(dt);
            this.sync();
            if (this.sess.status === 'win') this.passFloor();
            else if (this.sess.status === 'lose') this.showRevive();
        }
    }

    onExit() {
        if (this.monsterNode) tween(this.monsterNode).stop();
    }

    // ---------- 层流程 ----------

    private currentAtk(): number {
        return Game.tower.atk(Game.save) * reviveMult(this.run.revives);
    }

    /** 开始/重开当前层 */
    private beginFloor() {
        const floor = this.run.floor;
        const atk = this.currentAtk();
        this.sess = new TowerBattleSession(atk, floor);
        this.interlude = false;
        if (this.floorLabel) this.floorLabel.string = TEXTS.towerFloorTitle(floor);
        this.sync();
    }

    /** 通关：结算煞晶 → 1.2s 过场 → 下一层 */
    private passFloor() {
        if (this.interlude) return;
        this.interlude = true;
        const f = this.run.floor;
        this.run.win();
        Game.persist();
        floatText(this.node, 0, 320, TEXTS.trailWinFx, THEME.success, 40);
        AudioMgr.play('rare');
        this.sync();
        tween(this.node).delay(OVER_PAUSE).call(() => {
            if (!this.node.isValid || this.over) return;
            this.beginFloor();
        }).start();
    }

    // ---------- 交互 ----------

    private onChargeTap() {
        if (this.over || this.interlude || !this.sess) return;
        if (this.sess.interrupt()) {
            if (this.monsterNode) shakeNode(this.monsterNode, 5);
            floatText(this.node, 0, 250, TEXTS.towerChargeHit, THEME.rainGold, 32);
            AudioMgr.play('rare');
        } else {
            floatText(this.node, 0, 250, TEXTS.towerChargeMiss, THEME.cinnabar, 24);
        }
        this.sync();
    }

    private forge(times: number | 'max') {
        const n = Game.tower.forge(Game.save, times);
        if (n > 0) Game.persist();
        if (n <= 0) {
            floatText(this.node, 0, -470, TEXTS.towerForgeNone, THEME.cinnabar, 22);
        }
        this.sync();
    }

    private confirmQuit() {
        if (this.over) return;
        this.finishRun();
    }

    // ---------- 失败清算（回魂 / 收兵） ----------

    private showRevive() {
        if (this.over || this.overlay) return;
        if (!this.run.canRevive()) {
            this.showOverlay(false);
            return;
        }
        this.showOverlay(true);
    }

    /** 失败弹窗：回魂再战（广告，每局 3 次）/ 收兵返回；次数用尽则按钮置灰 */
    private showOverlay(canRevive: boolean) {
        const n = this.node;
        const o = uinode('overlay', n, 720, 1280);
        o.addComponent(UIOpacity).opacity = 0;
        this.overlay = o;
        const scrim = uinode('scrim', o, 720, 1280);
        const g = scrim.addComponent(Graphics);
        g.fillColor = faded(THEME.void, 196);
        g.rect(-360, -640, 720, 1280);
        g.fill();

        const panel = spritePanel(o, 600, 340);
        panel.setPosition(0, 0, 0);
        label(panel, TEXTS.towerReviveTitle, 32, { bold: true, color: THEME.cinnabar }).setPosition(0, 108, 0);
        label(panel, TEXTS.towerReviveLine, 22, { color: THEME.paper, width: 540, shrink: true }).setPosition(0, 46, 0);
        label(panel, TEXTS.towerReviveLeft(REVIVE_MAX - this.run.revives), 20, { color: THEME.inkSoft }).setPosition(0, 4, 0);

        const reviveBtn = spriteButton(panel, 480, 78, TEXTS.towerReviveBtn, () => this.revive(), {
            fontSize: 26,
            variant: 'primary',
            textColor: THEME.void,
        });
        reviveBtn.node.setPosition(0, -62, 0);
        reviveBtn.setEnabled(canRevive);
        const giveUp = spriteButton(panel, 480, 66, TEXTS.towerGiveUpBtn, () => this.finishRun(), {
            fontSize: 24,
            variant: 'secondary',
            textColor: THEME.paper,
        });
        giveUp.node.setPosition(0, -140, 0);

        tween(o.getComponent(UIOpacity)!).to(0.18, { opacity: 255 }).start();
    }

    private revive() {
        Ads.show('towerRevive', this.node, {
            onSuccess: () => {
                if (this.over || !this.run.revive()) return;
                if (this.overlay) {
                    this.overlay.destroy();
                    this.overlay = null;
                }
                toast(this.node, TEXTS.towerRevived, 26);
                this.beginFloor(); // 本层重开，剑气 ×1.25 已由 reviveMult 生效
            },
        });
    }

    /** 收兵：结算煞晶 + 主线回灌（日封顶），落结算页 */
    private finishRun() {
        if (this.over) return;
        this.over = true;
        const levelFrom = this.run.startLevel;
        const grant = Game.tower.settle(Game.save, this.run);
        Game.persist();
        const p: TowerRunResult = {
            deepest: this.run.deepest,
            best: Game.save.tower.best,
            newBest: grant.newBest,
            crystalEarned: this.run.crystal,
            levelFrom,
            levelTo: Game.save.tower.swordLevel,
            lingshi: grant.lingshi,
            mats: grant.mats,
            xiuwei: grant.xiuwei,
            capped: grant.capped,
            revives: this.run.revives,
        };
        Game.stack.swap(new TowerResultScene(p));
    }

    // ---------- 表现同步 ----------

    private sync() {
        if (!this.sess) return;
        this.bar.refresh();
        const s = this.sess;
        this.hpBar.set(Math.min(1, Math.max(0, s.hp / s.maxHp)), `${TEXTS.towerMonsterHp} ${formatCompact(Math.max(0, s.hp))}`);
        this.gangBar.set(Math.min(1, Math.max(0, s.gang / GANG_MAX)), `${TEXTS.towerGang} ${Math.round(Math.max(0, s.gang))}`);
        if (this.atkLabel) this.atkLabel.string = `${TEXTS.towerSwordAtk} ${formatCompact(this.currentAtk())}`;
        if (this.crystalLabel) this.crystalLabel.string = `${TEXTS.towerCrystal} ${formatCompact(Game.save.tower.crystal)}`;
        if (this.floorLabel) this.floorLabel.string = TEXTS.towerFloorTitle(this.run.floor);

        // 倒计时环：从满到空
        if (this.timeRing) {
            const g = this.timeRing;
            g.clear();
            const ratio = 1 - s.t / 15;
            g.strokeColor = faded(THEME.paper, 60);
            g.lineWidth = 6;
            g.circle(0, 0, 26);
            g.stroke();
            g.strokeColor = ratio > 0.3 ? THEME.rainGold : THEME.cinnabar;
            g.lineWidth = 6;
            const a0 = Math.PI / 2;
            const a1 = a0 + Math.PI * 2 * Math.max(0, ratio);
            g.arc(0, 0, 26, a1, a0, true);
            g.stroke();
        }

        // 蓄力红环：窗口内由细到满
        if (this.chargeG) {
            const g = this.chargeG;
            g.clear();
            if (s.chargeOpen) {
                g.strokeColor = faded(THEME.cinnabar, 200);
                g.lineWidth = 8;
                g.circle(0, 0, 40);
                g.stroke();
                g.strokeColor = THEME.goldLight;
                g.lineWidth = 10;
                g.arc(0, 0, 40, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * s.chargeProgress, false);
                g.stroke();
            }
        }
        this.chargeBtn?.setEnabled(s.chargeOpen);
        const canForge = Game.tower.affordableLevels(Game.save) >= 1;
        this.forgeBtns.forEach((b) => b.setEnabled(canForge));
    }
}
