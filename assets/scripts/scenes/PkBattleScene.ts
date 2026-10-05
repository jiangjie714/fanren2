import { Color, Graphics, Label, Layers, Node, Sprite, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { PK_CHARGE_MAX_ADS, PK_DAILY_LIMIT } from '../core/config/combat';
import { TEXTS } from '../core/config/texts';
import { statusBar, StatusBarHandle } from '../ui/StatusBar';
import { showDialog } from '../ui/dialog';
import {
    ButtonHandle,
    ProgressBarHandle,
    THEME,
    boltFx,
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
import { BattleOutcome, PkMode, PkOpponent } from '../core/systems/CombatSystem';
import { RewardItem } from '../core/systems/BoxSystem';

/** 蓄力重数中文序数（一~十重） */
const STAGE_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 斗法演出的一步：等 d 秒 → 执行 run */
interface CineStep { d: number; run?: () => void }

/**
 * 论武切磋（M11 #36/#37，M11b 演出细化）：
 * - 斗法舞台：我方左、影修对手右，回合演出（突进斩击 / 灵光法弹 + 受击红闪 + 震屏 + 伤害飘字），
 *   气血条按回合伤害比例递减，败者最后倒下；
 * - 蓄力交互：十段蓄力条 + 蓄力重数 + 我身灵光环（随重数增亮）+ 胜率预估实时刷新，
 *   每支广告 +10% 攻防（本场有效），最多 10 支；败后可蓄力再战同一对手（共享 10 支上限）。
 * 一场论武消耗一次每日次数，败后再战不重复消耗。
 */
export class PkBattleScene implements IScene {
    node: Node;
    private opp: PkOpponent;
    private chargeAds = 0;
    private bar: StatusBarHandle = { node: null as unknown as Node, refresh: () => {} };
    private body: Node | null = null;
    private chargeBtn: ButtonHandle | null = null;
    private fightBtn: ButtonHandle | null = null;
    private chargeTitle!: Label;
    private oddsLabel!: Label;
    private segs!: Node;
    private aura: Node | null = null;
    private playerNode: Node | null = null;
    private oppNode: Node | null = null;
    private stageNode: Node | null = null;
    private myBar: ProgressBarHandle | null = null;
    private oppBar: ProgressBarHandle | null = null;
    /** 演出步进队列（update 按 dt 消费，帧驱动比 tween 链可控） */
    private cine: { steps: CineStep[]; t: number; i: number; done: () => void } | null = null;

    constructor(private mode: PkMode = 'random') {
        this.node = new Node('PkBattleScene');
        this.node.layer = Layers.Enum.UI_2D;
        // 对手在进页时定格：蓄力再战的是同一个对手（#37）
        this.opp = Game.combat.makeOpponent(Game.save, mode, Game.rng);
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.pkPageTitle, () => Game.stack.pop());
        this.bar = statusBar(n, 436);
        this.render();
        if (this.mode === 'friend') this.tryShare();
    }

    update(dt: number) {
        if (!this.cine) return;
        this.cine.t += dt;
        const step = this.cine.steps[this.cine.i];
        if (step && this.cine.t >= step.d) {
            this.cine.t = 0;
            step.run?.();
            this.cine.i += 1;
            if (this.cine.i >= this.cine.steps.length) {
                const { done } = this.cine;
                this.cine = null;
                done();
            }
        }
    }

    private render() {
        this.body?.destroy();
        this.bar.refresh();
        const n = this.node;
        this.body = uinode('body', n, 720, 1280);
        const save = Game.save;
        const profile = save.profile;

        // 对手名牌
        const plate = spritePanel(this.body, 668, 72, undefined, THEME.tintPanel);
        plate.setPosition(0, 320, 0);
        fadeIn(plate, 12);
        labelL(plate, this.opp.name, 27, { bold: true, color: THEME.goldLight }).setPosition(-280, 0, 0);
        labelL(plate, this.opp.mode === 'friend' ? '应战道友' : '影修 · 以武会友', 18, { color: THEME.inkSoft })
            .setPosition(60, 0, 0);
        label(plate, TEXTS.pkOppPower(this.opp.atk + this.opp.def), 21, { bold: true, color: THEME.paper, width: 180, align: 'right', shrink: true })
            .setPosition(200, 0, 0);

        // 斗法舞台：我方左（带蓄力灵光环）、影修右（紫黑 tint + 镜像对峙）
        const stage = uinode('pkStage', this.body, 640, 300);
        stage.setPosition(0, 100, 0);
        this.stageNode = stage;

        const pAtk = uinode('playerAtk', stage, 190, 190);
        pAtk.setPosition(-150, 4, 0);
        const aura = uinode('aura', pAtk, 240, 240);
        aura.addComponent(Graphics);
        const pBob = uinode('pBob', pAtk, 190, 190);
        const gender = profile.gender;
        const pPath = gender === 'f' ? 'art/characters/char_realm_00_f/spriteFrame' : 'art/characters/char_realm_00/spriteFrame';
        image(pBob, pPath, 190, 190, { fallbackPath: 'art/characters/char_realm_00/spriteFrame' });
        tween(pBob).repeatForever(
            tween().to(1.1, { y: 8 }, { easing: 'sineInOut' }).to(1.1, { y: 0 }, { easing: 'sineInOut' })
        ).start();
        this.playerNode = pAtk;
        this.aura = aura;
        this.drawShadow(stage, -150, -82, 96);

        const oAtk = uinode('oppAtk', stage, 190, 190);
        oAtk.setPosition(150, 0, 0);
        const oBob = uinode('oBob', oAtk, 190, 190);
        const oppImg = image(oBob, `art/characters/char_realm_0${Math.min(5, save.realmIndex + 1)}/spriteFrame`, 190, 190, {
            fallbackPath: 'art/characters/char_realm_01/spriteFrame',
        });
        oppImg.setScale(-1, 1); // 镜像面向我方
        const oppSprite = oppImg.getComponent(Sprite);
        if (oppSprite) oppSprite.color = new Color(150, 122, 205, 255); // 影修紫黑
        tween(oBob).repeatForever(
            tween().to(0.95, { y: -9 }, { easing: 'sineInOut' }).to(0.95, { y: 0 }, { easing: 'sineInOut' })
        ).start();
        this.oppNode = oAtk;
        this.drawShadow(stage, 150, -82, 96);

        // 气血条（按回合伤害比例递减）
        this.oppBar = progressBar(this.body, 520, 28, { text: '对手 气血', fontSize: 19 });
        this.oppBar.node.setPosition(0, -116, 0);
        this.oppBar.set(1, '对手 气血');
        this.myBar = progressBar(this.body, 520, 28, { text: '我方 气血', fontSize: 19 });
        this.myBar.node.setPosition(0, -152, 0);
        this.myBar.set(1, '我方 气血');

        // 蓄力区
        const chargeCard = spritePanel(this.body, 668, 168, undefined, THEME.tintPanel);
        chargeCard.setPosition(0, -268, 0);
        fadeIn(chargeCard, 12, 0.08);
        this.chargeTitle = labelL(chargeCard, '', 24, { bold: true, color: THEME.goldLight }).getComponent(Label)!;
        this.chargeTitle.node.setPosition(-306, 58, 0);
        this.segs = uinode('segs', chargeCard, 300, 16);
        this.segs.addComponent(Graphics); // refreshChargeUI 里要画十段蓄力条，漏挂会 null.clear() 打断渲染循环
        this.segs.setPosition(-156, 22, 0);
        this.chargeBtn = spriteButton(chargeCard, 280, 66, TEXTS.pkChargeBtn, () => this.watchChargeAd(), {
            fontSize: 23,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        this.chargeBtn.node.setPosition(180, 44, 0);
        image(this.chargeBtn.node, 'art/ui/icons/icon_ad/spriteFrame', 42, 42).setPosition(-116, 0, 0);
        this.oddsLabel = labelL(chargeCard, '', 21, { bold: true, color: THEME.paper }).getComponent(Label)!;
        this.oddsLabel.node.setPosition(-306, -10, 0);
        labelL(chargeCard, '每支广告攻防 +10%（本场有效）· 败者可蓄力再战同一对手', 17, {
            color: THEME.inkSoft, width: 600, shrink: true,
        }).setPosition(-306, -52, 0);

        // 开战
        this.fightBtn = spriteButton(this.body, 460, 92, TEXTS.pkStart, () => this.battle(true), {
            fontSize: 30,
            variant: 'primary',
        });
        this.fightBtn.node.setPosition(0, -410, 0);

        labelL(this.body, TEXTS.pkRemaining(save.daily.pkUsed, PK_DAILY_LIMIT), 19, { color: THEME.paperDim })
            .setPosition(-306, -468, 0);
        labelL(this.body, TEXTS.pkRecord(save.pk.wins, save.pk.losses, save.pk.bestStreak), 19, { color: THEME.paperDim })
            .setPosition(-306, -496, 0);

        this.refreshChargeUI();
    }

    private drawShadow(parent: Node, x: number, y: number, w: number) {
        const n = uinode('shadow', parent, w, 22);
        n.setPosition(x, y, 0);
        const g = n.addComponent(Graphics);
        g.fillColor = faded(THEME.void, 120);
        g.ellipse(0, 0, w / 2, 10);
        g.fill();
    }

    // ---------- 蓄力交互 ----------

    private refreshChargeUI() {
        const ads = this.chargeAds;
        // 十段蓄力条
        const g = this.segs.getComponent(Graphics)!;
        g.clear();
        const w = 300;
        const h = 16;
        const gap = 5;
        const seg = (w - 9 * gap) / 10;
        for (let i = 0; i < 10; i++) {
            const x = -w / 2 + i * (seg + gap);
            g.fillColor = i < ads ? THEME.gold : THEME.mist;
            g.roundRect(x, -h / 2, seg, h, 4);
            g.fill();
        }
        // 重数标题
        this.chargeTitle.string = ads >= PK_CHARGE_MAX_ADS
            ? TEXTS.pkChargeFull
            : ads > 0 ? TEXTS.pkChargeStage(STAGE_CN[ads - 1]) : TEXTS.pkChargeStageZero;
        // 胜率预估：当前 vs 再蓄一支
        const odds = Game.combat.pkWinOdds(Game.save, ads, this.opp);
        if (ads >= PK_CHARGE_MAX_ADS) {
            this.oddsLabel.string = TEXTS.pkWinOdds(Math.round(odds * 100));
        } else {
            const next = Game.combat.pkWinOdds(Game.save, ads + 1, this.opp);
            this.oddsLabel.string = `${TEXTS.pkWinOdds(Math.round(odds * 100))} · ${TEXTS.pkWinOddsNext(Math.round((next - odds) * 100))}`;
        }
        if (this.chargeBtn) this.chargeBtn.node.active = ads < PK_CHARGE_MAX_ADS;
        // 我身灵光环：重数越高越亮越大（Graphics 直涂 + 呼吸脉动）。
        // 重开脉动前必须停掉旧 tween——repeatForever 叠加会让引擎动作列表无限增长。
        if (this.aura) {
            const ag = this.aura.getComponent(Graphics)!;
            ag.clear();
            Tween.stopAllByTarget(this.aura);
            this.aura.setScale(1, 1, 1);
            if (ads > 0) {
                const r = 84 + ads * 5;
                ag.fillColor = faded(THEME.gold, 24 + ads * 7);
                ag.circle(0, 0, r);
                ag.fill();
                ag.fillColor = faded(THEME.goldLight, 18 + ads * 6);
                ag.circle(0, 0, r * 0.66);
                ag.fill();
                ag.strokeColor = faded(THEME.goldLight, 120 + ads * 12);
                ag.lineWidth = 2;
                ag.circle(0, 0, r + 6);
                ag.stroke();
                tween(this.aura)
                    .repeatForever(tween().to(0.7, { scale: new Vec3(1.07, 1.07, 1) }).to(0.7, { scale: new Vec3(1, 1, 1) }))
                    .start();
            }
        }
    }

    private watchChargeAd() {
        if (this.chargeAds >= PK_CHARGE_MAX_ADS) {
            toast(this.node, TEXTS.pkChargeMaxed);
            return;
        }
        Ads.show('pkCharge', this.node, {
            onSuccess: () => {
                this.chargeAds += 1;
                AudioMgr.play('rare');
                this.refreshChargeUI();
                if (this.playerNode && this.stageNode) {
                    floatText(this.stageNode, this.playerNode.position.x, 118, `战意 +${this.chargeAds * 10}%`, THEME.goldLight, 26);
                }
            },
            onSkip: () => toast(this.node, '广告未看完，蓄力未生效'),
        });
    }

    // ---------- 斗法演出 ----------

    private lunge(node: Node, dx: number) {
        const ox = node.position.x;
        const oy = node.position.y;
        tween(node)
            .to(0.08, { position: new Vec3(ox + dx, oy, 0) }, { easing: 'sineOut' })
            .delay(0.06)
            .to(0.1, { position: new Vec3(ox, oy, 0) }, { easing: 'sineIn' })
            .start();
    }

    private hitFlash(charNode: Node | null) {
        if (!charNode) return;
        const img = charNode.children[1] ?? charNode.children[0];
        const sp = img?.getComponent(Sprite);
        if (!sp) return;
        sp.color = faded(THEME.danger, 255);
        tween(sp).delay(0.1).to(0.12, { color: Color.WHITE }).start();
    }

    /** 一场论武：consume=true 消耗每日次数（首战）；败后再战不重复消耗 */
    private battle(consume: boolean) {
        if (this.cine) return; // 演出中不可再开战
        if (consume && !Game.combat.consumePk(Game.save)) {
            toast(this.node, TEXTS.pkExhausted);
            return;
        }
        const my = Game.combat.chargedStats(Game.save, this.chargeAds);
        const outcome = Game.combat.simulateBattle(my, this.opp, Game.rng);
        this.fightBtn?.setEnabled(false);
        this.chargeBtn?.node && (this.chargeBtn.node.active = false);
        this.playCinematic(outcome, consume);
    }

    /**
     * 回合演出：simulateBattle 的 rounds 逐步回放——我方回合突进斩击（金弧），
     * 对方回合灵光法弹（紫霄），气血条按累计伤害比例递减；收尾败者倒下。
     */
    private playCinematic(outcome: BattleOutcome, consume: boolean) {
        const steps: CineStep[] = [{ d: 0.45, run: () => {
            if (this.stageNode) floatText(this.stageNode, 0, 128, '斗 法', THEME.goldLight, 44);
            AudioMgr.play('open');
        } }];

        // 气血映射：把每回合伤害线性缩放到 100 → 终局剩余比例
        const oppTaken = outcome.rounds.filter((r) => r.actor === 'me');
        const myTaken = outcome.rounds.filter((r) => r.actor === 'opp');
        const oppTotal = oppTaken.reduce((a, r) => a + r.dmg, 0);
        const myTotal = myTaken.reduce((a, r) => a + r.dmg, 0);
        const oppLoss = 100 * (1 - outcome.oppHpLeft);
        const myLoss = 100 * (1 - outcome.myHpLeft);
        let cumOpp = 0;
        let cumMy = 0;
        const px = this.playerNode?.position.x ?? -150;
        const ox = this.oppNode?.position.x ?? 150;

        outcome.rounds.forEach((r, i) => {
            const isFinal = i === outcome.rounds.length - 1;
            steps.push({
                d: isFinal ? 0.62 : 0.5,
                run: () => {
                    if (!this.stageNode) return;
                    if (r.actor === 'me') {
                        this.lunge(this.playerNode, 108);
                        cumOpp += r.dmg;
                        tween(this.node).delay(0.09).call(() => {
                            if (!this.stageNode) return;
                            slashFx(this.stageNode, ox, 6, isFinal ? 1.35 : 1);
                            this.hitFlash(this.oppNode);
                            floatText(this.stageNode, ox - 12, 104, `-${r.dmg}`, THEME.goldLight, isFinal ? 38 : 29);
                            if (!isFinal) shakeNode(this.stageNode, 4);
                            this.oppBar?.set(Math.max(0, (100 - cumOpp * (oppTotal > 0 ? oppLoss / oppTotal : 0)) / 100),
                                `对手 气血 ${Math.max(0, Math.round(100 - cumOpp * (oppTotal > 0 ? oppLoss / oppTotal : 0)))}%`);
                        }).start();
                    } else {
                        this.lunge(this.oppNode, -108);
                        cumMy += r.dmg;
                        tween(this.node).delay(0.09).call(() => {
                            if (!this.stageNode) return;
                            boltFx(this.stageNode, { x: ox - 44, y: 30 }, { x: px + 40, y: 26 });
                            this.hitFlash(this.playerNode);
                            floatText(this.stageNode, px - 12, 108, `-${r.dmg}`, THEME.cinnabar, isFinal ? 38 : 27);
                            if (!isFinal) shakeNode(this.stageNode, 4);
                            this.myBar?.set(Math.max(0, (100 - cumMy * (myTotal > 0 ? myLoss / myTotal : 0)) / 100),
                                `我方 气血 ${Math.max(0, Math.round(100 - cumMy * (myTotal > 0 ? myLoss / myTotal : 0)))}%`);
                        }).start();
                    }
                    AudioMgr.play(r.actor === 'me' ? 'click' : 'disaster');
                },
            });
        });

        // 收尾：胜者挺立、败者倒下
        steps.push({ d: 0.15, run: () => {
            const loser = outcome.win ? this.oppNode : this.playerNode;
            if (loser) {
                const op = loser.addComponent(UIOpacity);
                tween(loser).by(0.4, { angle: outcome.win ? -78 : 78 }).start();
                tween(op).to(0.45, { opacity: 90 }).start();
            }
            if (this.stageNode) {
                floatText(this.stageNode, 0, 60, outcome.win ? '胜' : '负', outcome.win ? THEME.success : THEME.cinnabar, 52);
            }
            AudioMgr.play(outcome.win ? 'rare' : 'disaster');
        } });
        steps.push({ d: 0.75, run: () => { /* 定格 */ } });

        this.cine = { steps, t: 0, i: 0, done: () => this.settle(outcome, consume) };
    }

    /** 演出结束：结算战绩与奖励（数值即时入账，演出只是回放） */
    private settle(outcome: BattleOutcome, consume: boolean) {
        void consume;
        const win = outcome.win;
        const streak = Game.combat.recordPkResult(Game.save, win);
        const items = win ? Game.combat.pkWinRewards(Game.save, streak) : [];
        Game.persist();
        if (win) Game.checkAchievements(this.node);
        this.showResult(outcome, win, streak, items);
    }

    private showResult(outcome: BattleOutcome, win: boolean, streak: number, items: RewardItem[]) {
        const tail = outcome.rounds.slice(-4)
            .map((r) => (r.actor === 'me' ? `你出手，造成 ${r.dmg} 伤害` : `对方反击，你受 ${r.dmg} 伤害`));
        const lines: Array<string | { text: string; color?: number }> = [
            `鏖战 ${Math.ceil(outcome.rounds.length / 2)} 回合`,
            { text: `你余 ${Math.round(outcome.myHpLeft * 100)}% 气血 ｜ 对手余 ${Math.round(outcome.oppHpLeft * 100)}%`, color: 0 },
            ...tail,
            ...(win
                ? items.map((i) => ({ text: i.label, color: 1 as const }))
                : [{ text: TEXTS.pkNoReward, color: 2 as const }]),
            ...(win && streak > 1 ? [{ text: TEXTS.pkStreak(streak), color: 1 as const }] : []),
        ];

        if (win) {
            showDialog(this.node, {
                title: TEXTS.pkWinTitle,
                lines,
                buttons: [
                    {
                        text: '再战一场',
                        primary: true,
                        cb: () => {
                            if (Game.combat.canPk(Game.save)) Game.stack.swap(new PkBattleScene('random'));
                            else {
                                toast(this.node, TEXTS.pkExhausted);
                                Game.stack.pop();
                            }
                        },
                    },
                    { text: '回论道', cb: () => Game.stack.pop() },
                ],
            });
        } else {
            const canRetry = this.chargeAds < PK_CHARGE_MAX_ADS;
            showDialog(this.node, {
                title: TEXTS.pkLoseTitle,
                lines,
                buttons: [
                    ...(canRetry ? [{
                        text: TEXTS.pkChargeRetry,
                        primary: true,
                        cb: () => this.rematchAfterCharge(),
                    }] : []),
                    { text: TEXTS.pkGiveUp, cb: () => Game.stack.pop() },
                ],
            });
        }
    }

    /** 败后蓄力再战：同一对手、不重复计次（#37） */
    private rematchAfterCharge() {
        Ads.show('pkCharge', this.node, {
            onSuccess: () => {
                this.chargeAds += 1;
                this.refreshChargeUI();
                this.battle(false);
            },
            onSkip: () => toast(this.node, '广告未看完，蓄力未生效'),
        });
    }

    /** 约人切磋：抖音端发出切磋帖，其余端提示降级 */
    private tryShare() {
        let shared = false;
        try {
            const tt = (globalThis as { tt?: { shareAppMessage?: (o: object) => void } }).tt;
            if (tt?.shareAppMessage) {
                tt.shareAppMessage({ title: '道友，与我一战论高下！——《凡人开仙缘》切磋帖' });
                shared = true;
            }
        } catch { /* 分享失败不阻断切磋 */ }
        if (!shared) toast(this.node, TEXTS.pkFriendShared);
    }
}
