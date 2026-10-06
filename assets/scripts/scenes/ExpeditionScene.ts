import { Color, Graphics, Label, Layers, Node, Sprite, tween, UIOpacity, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { DESTINATIONS, DestId, EXPEDITION_DAILY_LIMIT } from '../core/config/expeditions';
import { SLAY_MORALE_BONUS, SLAY_STRIKE_EVERY_TAPS, SLAY_STRIKE_INTERVAL_S } from '../core/config/combat';
import { TEXTS } from '../core/config/texts';
import { statusBar, StatusBarHandle } from '../ui/StatusBar';
import { showDialog } from '../ui/dialog';
import {
    ButtonHandle,
    ProgressBarHandle,
    THEME,
    faded,
    fadeIn,
    floatText,
    image,
    label,
    labelL,
    pageBackground,
    pageHeader,
    progressBar,
    shakeNode,
    slashFx,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';
import { ExpeditionResolution } from '../core/systems/ExpeditionSystem';

/** 云游历练页：出发 → 挂机 → 归来斩妖 → 事件三选一 → 结算（M8 D 节 + M11 #35）。 */
export class ExpeditionScene implements IScene {
    node: Node;
    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };
    private stateNode: Node | null = null;
    private timerLabel!: Label;
    private recallBtn: ButtonHandle | null = null;
    private lastState = '';
    /** 倒计时文案缓存：分钟数不变就不重写 label（P2-4 每帧堆分配节流） */
    private lastLeftMin = -1;

    // ---------- 斩妖战斗态（complete 期间有效，#35） ----------
    private slayDone = false;
    /** 斩妖胜利 → 事件灵石带战意加成 */
    private morale = false;
    private monsterHp = 0;
    private monsterHpMax = 0;
    private myHp = 0;
    private myHpMax = 0;
    private taps = 0;
    private strikeAcc = 0;
    private monsterBar: ProgressBarHandle | null = null;
    private myBar: ProgressBarHandle | null = null;
    private monsterNode: Node | null = null;
    private playerNode: Node | null = null;
    private stageNode: Node | null = null;

    constructor() {
        this.node = new Node('ExpeditionScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.expeditionPageTitle, () => Game.stack.pop());
        this.bar = statusBar(n, 436);
        this.render();
    }

    onResume() {
        this.render();
    }

    update(dt: number) {
        // 进行中：每秒刷新倒计时与召回按钮状态
        const state = Game.expedition.stateOf(Game.save, Date.now());
        if (state !== this.lastState) {
            this.render();
            return;
        }
        if (state === 'running') {
            const now = Date.now();
            const left = Game.expedition.remainingMs(Game.save, now);
            const m = Math.ceil(left / 60_000);
            // 倒计时单位是分钟，分钟数不变就跳过字符串重写与 recallable 重查（P2-4）
            if (m !== this.lastLeftMin) {
                this.lastLeftMin = m;
                this.timerLabel.string = `${TEXTS.expeditionRunning} 约 ${m} 分钟`;
                if (this.recallBtn) this.recallBtn.node.active = Game.expedition.recallable(Game.save, now);
            }
        }
        // 斩妖：妖兽周期反扑（真实时间，点得慢就要硬吃伤害）
        if (state === 'complete' && !this.slayDone && this.monsterHp > 0) {
            this.strikeAcc += dt;
            if (this.strikeAcc >= SLAY_STRIKE_INTERVAL_S) {
                this.strikeAcc = 0;
                this.monsterStrike();
            }
        }
    }

    private render() {
        this.stateNode?.destroy();
        this.stateNode = null;
        this.bar.refresh();
        this.lastLeftMin = -1;
        const now = Date.now();
        const state = Game.expedition.stateOf(Game.save, now);
        this.lastState = state;
        const n = this.node;
        const panel = spritePanel(n, 668, 620, undefined, THEME.tintPanel);
        panel.setPosition(0, -60, 0);
        fadeIn(panel, 14);
        this.stateNode = panel;

        if (state === 'idle' || state === 'exhausted') {
            this.resetSlay();
            this.renderIdle(panel, state === 'exhausted');
        } else if (state === 'complete' && !this.slayDone) {
            this.renderSlay(panel);
        } else if (state === 'complete') {
            this.renderEventChoice(panel);
        } else {
            this.renderActive(panel);
        }
    }

    /** 空闲：三张目的地卡 + 次数说明 */
    private renderIdle(panel: Node, exhausted: boolean) {
        const used = Game.save.daily.expeditionUsed;
        label(panel, exhausted ? TEXTS.expeditionExhausted : TEXTS.expeditionIdle(used, EXPEDITION_DAILY_LIMIT), 24, {
            bold: true,
            color: exhausted ? THEME.danger : THEME.goldLight,
        }).setPosition(0, 262, 0);

        if (exhausted) return;
        DESTINATIONS.forEach((d, i) => {
            const y = 128 - i * 200;
            const card = spritePanel(panel, 600, 178, undefined, THEME.tintCard);
            card.setPosition(0, y, 0);
            // 卡片半宽 300，左内边距 32 -> 三行共用同一条文本左边缘 -268。
            // 旧版三行分别是 -276 / -278 / -298（各行手算盒子中心），末行直接压过卡片
            // 左缘把「产」字裁掉，且 width 480 的右端 182 越过「出发」钮左缘 148。
            labelL(card, d.name, 30, { bold: true, color: THEME.goldLight }).setPosition(-268, 52, 0);
            labelL(card, d.blurb, 21, { color: THEME.inkSoft, width: 400, shrink: true }).setPosition(-268, 14, 0);
            labelL(card, `产出 ${d.reward} ｜ ${d.risk}`, 19, { color: THEME.inkSoft, width: 400, shrink: true })
                .setPosition(-268, -24, 0);
            const btn = spriteButton(card, 128, 64, TEXTS.expeditionGo, () => this.depart(d.id), {
                fontSize: 24,
                variant: 'primary',
                textColor: THEME.void,
            });
            btn.node.setPosition(212, -40, 0);
        });
    }

    /** 进行中：倒计时 + 召回 */
    private renderActive(panel: Node) {
        const dest = Game.expedition.destConfig(Game.save.expedition.dest!);
        label(panel, `${dest.name}`, 30, { bold: true, color: THEME.goldLight }).setPosition(0, 258, 0);

        this.timerLabel = label(panel, TEXTS.expeditionRunning, 26, { bold: true, color: THEME.paper })
            .getComponent(Label);
        this.timerLabel.node.setPosition(0, 150, 0);
        label(panel, '历练期间可离开游戏，归来有妖兽拦路与事件等你抉择', 21, {
            color: THEME.inkSoft, width: 560, shrink: true,
        }).setPosition(0, 96, 0);
        this.recallBtn = spriteButton(panel, 320, 76, TEXTS.expeditionRecall, () => this.useRecall(), {
            fontSize: 24,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        this.recallBtn.node.setPosition(0, -10, 0);
        const hint = label(panel, '', 21, { color: THEME.inkSoft });
        hint.setPosition(0, -66, 0);
        const remainMs = Game.expedition.remainingMs(Game.save, Date.now());
        if (!Game.expedition.recallable(Game.save, Date.now())) {
            hint.getComponent(Label)!.string = TEXTS.expeditionRecallHint(Math.ceil(remainMs / 60_000));
        } else {
            this.recallBtn.node.active = true;
        }
    }

    // ---------- #35 斩妖（舞台化互砍演出） ----------

    private resetSlay() {
        this.slayDone = false;
        this.morale = false;
        this.monsterHp = 0;
        this.monsterHpMax = 0;
        this.myHp = 0;
        this.myHpMax = 0;
        this.taps = 0;
        this.strikeAcc = 0;
        this.monsterBar = null;
        this.myBar = null;
        this.monsterNode = null;
        this.playerNode = null;
        this.stageNode = null;
    }

    /** 归来先打拦路妖兽：人物与妖兽分立舞台两侧，点按斩击互砍 */
    private renderSlay(panel: Node) {
        const dest = Game.save.expedition.dest!;
        const monster = Game.combat.monsterOf(dest);
        if (this.monsterHpMax === 0) {
            this.monsterHpMax = Game.combat.slayMonsterMaxHp(Game.save);
            this.monsterHp = this.monsterHpMax;
            this.myHpMax = Game.combat.slayPlayerMaxHp(Game.save);
            this.myHp = this.myHpMax;
            this.taps = 0;
            this.strikeAcc = 0;
        }

        label(panel, TEXTS.slayTitle, 22, { bold: true, color: THEME.danger }).setPosition(0, 268, 0);
        label(panel, `${monster.name}`, 30, { bold: true, color: THEME.paper }).setPosition(0, 224, 0);
        label(panel, monster.intro, 18, { color: THEME.inkSoft, width: 560, shrink: true }).setPosition(0, 186, 0);

        // 战斗舞台：我方左、妖兽右（受击震屏抖舞台，不抖整页）
        const stage = uinode('slayStage', panel, 600, 280);
        stage.setPosition(0, 26, 0);
        this.stageNode = stage;

        const gender = Game.save.profile.gender;
        const pAtk = uinode('playerAtk', stage, 180, 180);
        pAtk.setPosition(-138, 10, 0);
        const pBob = uinode('pBob', pAtk, 180, 180);
        const pPath = gender === 'f' ? 'art/characters/char_realm_00_f/spriteFrame' : 'art/characters/char_realm_00/spriteFrame';
        image(pBob, pPath, 180, 180, { fallbackPath: 'art/characters/char_realm_00/spriteFrame' });
        tween(pBob).repeatForever(
            tween().to(1.1, { y: 8 }, { easing: 'sineInOut' }).to(1.1, { y: 0 }, { easing: 'sineInOut' })
        ).start();
        this.playerNode = pAtk;
        // 脚下影子
        this.drawShadow(stage, -138, -76, 92);

        const mAtk = uinode('monsterAtk', stage, 210, 210);
        mAtk.setPosition(142, 0, 0);
        const mBob = uinode('mBob', mAtk, 210, 210);
        image(mBob, `art/monsters/monster_${dest}/spriteFrame`, 210, 210, {
            fallbackPath: 'art/ui/icons/icon_expedition/spriteFrame',
        });
        tween(mBob).repeatForever(
            tween().to(0.9, { y: -9 }, { easing: 'sineInOut' }).to(0.9, { y: 0 }, { easing: 'sineInOut' })
        ).start();
        this.monsterNode = mAtk;
        this.drawShadow(stage, 142, -80, 104);

        this.monsterBar = progressBar(panel, 480, 30, { text: '妖兽 气血', fontSize: 19 });
        this.monsterBar.node.setPosition(0, -122, 0);
        this.myBar = progressBar(panel, 480, 26, { text: '我方 气血', fontSize: 18 });
        this.myBar.node.setPosition(0, -158, 0);
        this.refreshSlayBars();

        label(panel, TEXTS.slayTip, 18, { color: THEME.inkSoft, width: 560, shrink: true })
            .setPosition(0, -200, 0);

        const slash = spriteButton(panel, 480, 78, '斩 ！', () => this.slashTap(), {
            fontSize: 30,
            variant: 'primary',
        });
        slash.node.setPosition(0, -256, 0);
    }

    /** 立绘脚下椭圆墨影（Graphics 直涂实色） */
    private drawShadow(parent: Node, x: number, y: number, w: number) {
        const n = uinode('shadow', parent, w, 22);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        g.fillColor = faded(THEME.void, 120);
        g.ellipse(0, 0, w / 2, 10);
        g.fill();
    }

    /** 攻击突进：冲出 dx 再归位（外层节点，内层呼吸动画互不干扰） */
    private lunge(node: Node, dx: number) {
        const ox = node.position.x;
        const oy = node.position.y;
        tween(node)
            .to(0.07, { position: new Vec3(ox + dx, oy, 0) }, { easing: 'sineOut' })
            .delay(0.06)
            .to(0.1, { position: new Vec3(ox, oy, 0) }, { easing: 'sineIn' })
            .start();
    }

    /** 受击红闪（直接改 Sprite 颜色，短 tween 归白） */
    private hitFlash(charNode: Node | null) {
        if (!charNode) return;
        const img = charNode.children[0]?.children[0] ?? charNode.children[0];
        const sp = img?.getComponent(Sprite);
        if (!sp) return;
        sp.color = faded(THEME.danger, 255);
        tween(sp).delay(0.1).to(0.12, { color: Color.WHITE }).start();
    }

    private refreshSlayBars() {
        this.monsterBar?.set(Math.max(0, this.monsterHp / this.monsterHpMax), `妖兽 气血 ${Math.max(0, Math.ceil(this.monsterHp))}/${this.monsterHpMax}`);
        this.myBar?.set(Math.max(0, this.myHp / this.myHpMax), `我方 气血 ${Math.max(0, Math.ceil(this.myHp))}/${this.myHpMax}`);
    }

    /** 每次点按：我方突进斩击 → 弧光落点结算伤害；每 8 下妖兽额外反扑 */
    private slashTap() {
        if (this.slayDone || this.monsterHp <= 0) return;
        this.strikeAcc = 0;
        this.lunge(this.playerNode, 96);
        const dmg = Game.combat.slayTapDamage(Game.save);
        const mx = this.monsterNode?.position.x ?? 142;
        tween(this.node).delay(0.08).call(() => {
            if (this.slayDone || !this.stageNode) return;
            slashFx(this.stageNode, mx, 26);
            this.hitFlash(this.monsterNode);
            floatText(this.stageNode, mx - 10, 108, `-${dmg}`, THEME.goldLight, 30);
            this.monsterHp -= dmg;
            this.refreshSlayBars();
            AudioMgr.play('click');
            if (this.monsterHp <= 0) {
                this.slayWin();
                return;
            }
            if (this.taps % SLAY_STRIKE_EVERY_TAPS === 0) this.monsterStrike();
        }).start();
        this.taps += 1;
    }

    /** 妖兽反扑：扑向人物 → 朱砂爪光落点结算（防御减伤已在公式内） */
    private monsterStrike() {
        if (this.slayDone || this.monsterHp <= 0) return;
        this.lunge(this.monsterNode, -96);
        const dmg = Game.combat.slayStrikeDamage(Game.save);
        const px = this.playerNode?.position.x ?? -138;
        tween(this.node).delay(0.09).call(() => {
            if (this.slayDone || !this.stageNode) return;
            slashFx(this.stageNode, px, 10, 0.9, THEME.cinnabar);
            this.hitFlash(this.playerNode);
            shakeNode(this.stageNode, 6);
            floatText(this.stageNode, px - 10, 96, `-${dmg}`, THEME.cinnabar, 26);
            this.myHp -= dmg;
            this.refreshSlayBars();
            AudioMgr.play('disaster');
            if (this.myHp <= 0) this.slayLose();
        }).start();
    }

    private slayWin() {
        this.slayDone = true;
        this.morale = true;
        AudioMgr.play('rare');
        const dest = Game.save.expedition.dest!;
        // 妖兽诛灭演出：淡出下沉
        if (this.monsterNode) {
            const m = this.monsterNode;
            const op = m.addComponent(UIOpacity);
            tween(m).by(0.35, { position: new Vec3(0, -26, 0) }).start();
            tween(op).to(0.35, { opacity: 0 }).start();
        }
        if (this.stageNode) floatText(this.stageNode, 0, 30, '斩！', THEME.success, 40);
        const items = Game.combat.slayRewards(Game.save, dest);
        Game.persist();
        Game.checkAchievements(this.node);
        tween(this.node).delay(0.55).call(() => {
            showDialog(this.node, {
                title: TEXTS.slayWin,
                lines: [
                    { text: TEXTS.slayMorale, color: 3 as const },
                    ...items.map((i) => ({ text: i.label, color: 1 as const })),
                ],
                buttons: [{ text: '继 续', primary: true, cb: () => this.render() }],
            });
        }).start();
    }

    private slayLose() {
        this.slayDone = true;
        this.morale = false;
        AudioMgr.play('disaster');
        // 我方力竭演出：灰置下沉，妖兽遁走
        if (this.playerNode) {
            const p = this.playerNode;
            const op = p.addComponent(UIOpacity);
            p.children.forEach((c) => c.children.forEach((img) => { const s = img.getComponent(Sprite); if (s) s.color = THEME.tintMuted; }));
            tween(p).by(0.35, { position: new Vec3(0, -18, 0) }).start();
            tween(op).to(0.35, { opacity: 150 }).start();
        }
        toast(this.node, TEXTS.slayLose);
        tween(this.node).delay(0.7).call(() => this.render()).start();
    }

    /** 已归来：事件三选一（斩妖胜利带战意加成） */
    private renderEventChoice(panel: Node) {
        const dest = Game.expedition.destConfig(Game.save.expedition.dest!);
        label(panel, `${dest.name} · ${TEXTS.expeditionComplete}`, 24, { bold: true, color: THEME.success })
            .setPosition(0, 258, 0);
        if (this.morale) {
            label(panel, TEXTS.slayMorale, 20, { bold: true, color: THEME.success }).setPosition(0, 214, 0);
        }
        const ev = Game.expedition.previewEvent(Game.save);
        label(panel, ev.title, 34, { bold: true, color: THEME.paper })
            .setPosition(0, this.morale ? 158 : 178, 0);
        label(panel, ev.intro, 22, { color: THEME.inkSoft, width: 580, shrink: true })
            .setPosition(0, this.morale ? 106 : 122, 0);
        label(panel, TEXTS.expeditionChoose, 23, { bold: true, color: THEME.goldLight })
            .setPosition(0, this.morale ? 48 : 58, 0);
        ev.options.forEach((opt, i) => {
            const btn = spriteButton(panel, 560, 66, opt.label, () => this.resolve(i), {
                fontSize: 24,
                variant: i === 0 ? 'primary' : 'secondary',
                textColor: i === 0 ? THEME.void : THEME.ink,
            });
            btn.node.setPosition(0, (this.morale ? -18 : -10) - i * 82, 0);
        });
    }

    private depart(dest: DestId) {
        if (!Game.expedition.start(Game.save, dest, Date.now())) {
            toast(this.node, TEXTS.expeditionExhausted);
            return;
        }
        this.resetSlay();
        AudioMgr.play('open');
        Game.persist();
        this.render();
    }

    private useRecall() {
        Ads.show('expeditionRecall', this.node, {
            onSuccess: () => {
                if (!Game.expedition.recall(Game.save, Date.now())) return;
                Game.persist();
                toast(this.node, '召回成功，历练结束');
                this.render();
            },
        });
    }

    private resolve(optionIndex: number) {
        const mult = this.morale ? 1 + SLAY_MORALE_BONUS : 1;
        const r: ExpeditionResolution | null = Game.expedition.resolve(Game.save, optionIndex, Date.now(), mult);
        if (!r) return;
        // 任务进度：历练归来
        Game.quests.progress(Game.save, 'expedition');
        Game.persist();
        if (r.disaster) AudioMgr.play('disaster');
        else AudioMgr.play('rare');
        // 结算后已回到 idle：同步 lastState，避免 update 自动重建面板盖住结算弹窗
        this.lastState = 'idle';
        const lines: Array<string | { text: string; color?: number }> = [
            r.text,
            ...(r.disaster ? [{ text: TEXTS.expeditionDisaster, color: 2 as const }] : []),
            ...r.items.map((i) => ({ text: i.label, color: 1 as const })),
        ];
        showDialog(this.node, {
            title: `${r.eventTitle} · ${r.optionLabel}`,
            lines,
            buttons: [{ text: '收 下', primary: true, cb: () => this.render() }],
        });
    }
}
