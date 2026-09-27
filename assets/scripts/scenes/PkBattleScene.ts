import { Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Ads } from '../infra/Ads';
import { AudioMgr } from '../infra/AudioMgr';
import { PK_CHARGE_MAX_ADS, PK_DAILY_LIMIT } from '../core/config/combat';
import { TEXTS } from '../core/config/texts';
import { statusBar } from '../ui/StatusBar';
import { showDialog } from '../ui/dialog';
import {
    ButtonHandle,
    THEME,
    fadeIn,
    image,
    label,
    labelL,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';
import { BattleOutcome, PkMode, PkOpponent } from '../core/systems/CombatSystem';
import { RewardItem } from '../core/systems/BoxSystem';

/**
 * 论武切磋（M11 #36/#37）：蓄力看广告提升本场攻防（每支 +10%，最多 10 支），
 * 回合制模拟决胜负；落败可「蓄力再战」同一对手继续看广告（同场共享 10 支上限）。
 * 一场论武消耗一次每日切磋次数，败后再战不重复消耗。
 */
export class PkBattleScene implements IScene {
    node: Node;
    private opp: PkOpponent;
    private chargeAds = 0;
    private bar = { refresh: () => {} };
    private body: Node | null = null;
    private chargeBtn: ButtonHandle | null = null;
    private chargeInfo!: Label;
    private myInfo!: Label;

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

    private render() {
        this.body?.destroy();
        this.bar.refresh();
        const n = this.node;
        this.body = uinode('body', n, 720, 1280);
        const save = Game.save;
        const profile = save.profile;

        // 对手卡
        const oppCard = spritePanel(this.body, 668, 190, undefined, THEME.tintPanel);
        oppCard.setPosition(0, 236, 0);
        fadeIn(oppCard, 12);
        labelL(oppCard, this.opp.name, 30, { bold: true, color: THEME.goldLight }).setPosition(-306, 56, 0);
        labelL(oppCard, this.opp.mode === 'friend' ? TEXTS.pkFriendHint : '山野散修 · 以武会友', 20, {
            color: THEME.inkSoft, width: 420, shrink: true,
        }).setPosition(-306, 16, 0);
        labelL(oppCard, TEXTS.pkOppPower(this.opp.atk + this.opp.def), 22, { color: THEME.paper })
            .setPosition(-306, -24, 0);

        // 我方卡（蓄力后攻防实时刷新）
        const myCard = spritePanel(this.body, 668, 190, undefined, THEME.tintCard);
        myCard.setPosition(0, 26, 0);
        fadeIn(myCard, 12, 0.05);
        labelL(myCard, `${profile.name || '无名修士'}（我）`, 30, { bold: true, color: THEME.goldLight })
            .setPosition(-306, 56, 0);
        this.myInfo = labelL(myCard, '', 22, { color: THEME.paper }).getComponent(Label)!;
        this.myInfo.node.setPosition(-306, 16, 0);
        this.refreshMyInfo();

        // 蓄力区
        const chargeCard = spritePanel(this.body, 668, 150, undefined, THEME.tintPanel);
        chargeCard.setPosition(0, -166, 0);
        fadeIn(chargeCard, 12, 0.1);
        this.chargeBtn = spriteButton(chargeCard, 360, 84, TEXTS.pkChargeBtn, () => this.watchChargeAd(), {
            fontSize: 24,
            variant: 'secondary',
            textColor: THEME.goldLight,
        });
        this.chargeBtn.node.setPosition(158, 0, 0);
        image(this.chargeBtn.node, 'art/ui/icons/icon_ad/spriteFrame', 44, 44).setPosition(-132, 0, 0);
        this.chargeInfo = labelL(chargeCard, '', 21, { color: THEME.inkSoft }).getComponent(Label)!;
        this.chargeInfo.node.setPosition(-306, 34, 0);
        labelL(chargeCard, '败者可蓄力再战同一对手，蓄力攻防仅本场有效', 18, {
            color: THEME.inkSoft, width: 300, shrink: true,
        }).setPosition(-306, -14, 0);
        this.refreshChargeInfo();

        // 开战
        const fightBtn = spriteButton(this.body, 460, 96, TEXTS.pkStart, () => this.battle(true), {
            fontSize: 30,
            variant: 'primary',
        });
        fightBtn.node.setPosition(0, -330, 0);

        labelL(this.body, TEXTS.pkRemaining(save.daily.pkUsed, PK_DAILY_LIMIT), 20, { color: THEME.paperDim })
            .setPosition(-306, -414, 0);
        labelL(this.body, TEXTS.pkRecord(save.pk.wins, save.pk.losses, save.pk.bestStreak), 20, {
            color: THEME.paperDim,
        }).setPosition(-306, -444, 0);
    }

    private refreshMyInfo() {
        const s = Game.combat.chargedStats(Game.save, this.chargeAds);
        this.myInfo.string = `${TEXTS.statAtk} ${s.atk} ｜ ${TEXTS.statDef} ${s.def} ｜ ${TEXTS.statPower} ${s.atk + s.def}`;
    }

    private refreshChargeInfo() {
        const pct = this.chargeAds * 10;
        this.chargeInfo.string = this.chargeAds >= PK_CHARGE_MAX_ADS
            ? TEXTS.pkChargeMaxed
            : TEXTS.pkChargeInfo(this.chargeAds, pct);
        if (this.chargeBtn) this.chargeBtn.node.active = this.chargeAds < PK_CHARGE_MAX_ADS;
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
                this.refreshChargeInfo();
                this.refreshMyInfo();
            },
            onSkip: () => toast(this.node, '广告未看完，蓄力未生效'),
        });
    }

    /** 一场论武：consume=true 消耗每日次数（首战）；败后再战不重复消耗 */
    private battle(consume: boolean) {
        if (consume && !Game.combat.consumePk(Game.save)) {
            toast(this.node, TEXTS.pkExhausted);
            return;
        }
        const my = Game.combat.chargedStats(Game.save, this.chargeAds);
        const outcome = Game.combat.simulateBattle(my, this.opp, Game.rng);
        AudioMgr.play(outcome.win ? 'rare' : 'disaster');
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
                this.refreshChargeInfo();
                this.refreshMyInfo();
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
