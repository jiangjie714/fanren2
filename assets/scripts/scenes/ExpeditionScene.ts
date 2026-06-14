import { Color, Label, Layers, Node, Sprite, tween, Vec3 } from 'cc';
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
    image,
    label,
    labelL,
    pageBackground,
    pageHeader,
    progressBar,
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
            const left = Game.expedition.remainingMs(Game.save, Date.now());
            const m = Math.ceil(left / 60_000);
            this.timerLabel.string = `${TEXTS.expeditionRunning} 约 ${m} 分钟`;
            if (this.recallBtn) this.recallBtn.node.active = Game.expedition.recallable(Game.save, Date.now());
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

    // ---------- #35 斩妖 ----------

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
    }

    /** 归来先打拦路妖兽：点按斩击，胜负决定事件灵石是否带战意加成 */
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

        label(panel, TEXTS.slayTitle, 24, { bold: true, color: THEME.danger }).setPosition(0, 262, 0);
        label(panel, `${monster.name}`, 32, { bold: true, color: THEME.paper }).setPosition(0, 210, 0);
        label(panel, monster.intro, 20, { color: THEME.inkSoft, width: 560, shrink: true }).setPosition(0, 164, 0);

        const mon = image(panel, `art/monsters/monster_${dest}/spriteFrame`, 230, 230, {
            fallbackPath: 'art/ui/icons/icon_expedition/spriteFrame',
        });
        mon.setPosition(0, 8, 0);
        this.monsterNode = mon;

        this.monsterBar = progressBar(panel, 560, 34, { text: '妖兽 气血', fontSize: 20 });
        this.monsterBar.node.setPosition(0, -136, 0);
        this.myBar = progressBar(panel, 560, 30, { text: '我方 气血', fontSize: 19 });
        this.myBar.node.setPosition(0, -184, 0);
        this.refreshSlayBars();

        label(panel, TEXTS.slayTip, 19, { color: THEME.inkSoft, width: 560, shrink: true })
            .setPosition(0, -232, 0);

        const slash = spriteButton(panel, 560, 84, '斩 ！', () => this.slashTap(), {
            fontSize: 32,
            variant: 'primary',
        });
        slash.node.setPosition(0, -276, 0);
    }

    private refreshSlayBars() {
        this.monsterBar?.set(Math.max(0, this.monsterHp / this.monsterHpMax), `妖兽 气血 ${Math.max(0, Math.ceil(this.monsterHp))}/${this.monsterHpMax}`);
        this.myBar?.set(Math.max(0, this.myHp / this.myHpMax), `我方 气血 ${Math.max(0, Math.ceil(this.myHp))}/${this.myHpMax}`);
    }

    /** 每次点按：结算一次斩击；每 8 下妖兽额外反扑一次 */
    private slashTap() {
        if (this.slayDone || this.monsterHp <= 0) return;
        this.monsterHp -= Game.combat.slayTapDamage(Game.save);
        this.taps += 1;
        this.strikeAcc = 0;
        this.refreshSlayBars();
        AudioMgr.play('click');
        if (this.monsterHp <= 0) {
            this.slayWin();
            return;
        }
        if (this.taps % SLAY_STRIKE_EVERY_TAPS === 0) this.monsterStrike();
    }

    private monsterStrike() {
        if (this.slayDone || this.monsterHp <= 0) return;
        this.myHp -= Game.combat.slayStrikeDamage(Game.save);
        this.refreshSlayBars();
        // 受击反馈：妖兽前顶 + 短暂红晕
        if (this.monsterNode) {
            tween(this.monsterNode)
                .to(0.06, { position: new Vec3(24, 8, 0) })
                .to(0.12, { position: new Vec3(0, 8, 0) })
                .start();
            const sp = this.monsterNode.getComponent(Sprite);
            if (sp) {
                sp.color = faded(THEME.danger, 255);
                tween(sp).delay(0.14).to(0.1, { color: Color.WHITE }).start();
            }
        }
        AudioMgr.play('disaster');
        if (this.myHp <= 0) this.slayLose();
    }

    private slayWin() {
        this.slayDone = true;
        this.morale = true;
        AudioMgr.play('rare');
        const dest = Game.save.expedition.dest!;
        const items = Game.combat.slayRewards(Game.save, dest);
        Game.persist();
        Game.checkAchievements(this.node);
        showDialog(this.node, {
            title: TEXTS.slayWin,
            lines: [
                { text: TEXTS.slayMorale, color: 3 as const },
                ...items.map((i) => ({ text: i.label, color: 1 as const })),
            ],
            buttons: [{ text: '继 续', primary: true, cb: () => this.render() }],
        });
    }

    private slayLose() {
        this.slayDone = true;
        this.morale = false;
        AudioMgr.play('disaster');
        toast(this.node, TEXTS.slayLose);
        this.render();
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
