import { Color, Label, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { Ads } from '../infra/Ads';
import { RainResult } from '../core/systems/RainSystem';
import { RewardItem } from '../core/systems/BoxSystem';
import { decodeIllusionWeek } from '../core/systems/SocialRank';
import { DouyinSocial, SOCIAL_KEYS, encodeIllusionWeek } from '../infra/DouyinSocial';
import { ILLUSION } from '../core/config/illusion';
import { streakMult } from '../core/config/trial';
import { TEXTS } from '../core/config/texts';
import {
    ButtonHandle,
    DESIGN_H,
    THEME,
    fadeIn,
    label,
    pageBackground,
    spriteButton,
    spritePanel,
} from '../ui/ThemeLib';
import { RainScene } from './RainScene';

export interface IllusionResultParams {
    result: RainResult;
    /** IllusionSystem.finish 发放的档位奖励（可为空） */
    rewards: RewardItem[];
    /** M14 连胜轨（#43）：结算后连胜与奖励倍率；旧调用缺省为 0 */
    streak?: number;
    mult?: number;
    /** 中断待护持：<60 且中断前连胜 >0 */
    interrupted?: boolean;
    /** 中断前的连胜层数（护持恢复用） */
    streakBefore?: number;
}

/** 秘境试炼结算页：得分、连胜、档位与天道赏赐（M8 E 节 + M14 #42/#43；与渡劫结算页独立）。 */
export class IllusionResultScene implements IScene {
    node: Node;
    private p: Required<IllusionResultParams>;
    private againBtn: ButtonHandle | null = null;
    private reviveUsed = false;
    private streakLabel: Label | null = null;
    private reviveTitle: Label | null = null;
    private reviveDesc: Label | null = null;
    private reviveBtn: ButtonHandle | null = null;
    private giveUpBtn: ButtonHandle | null = null;

    constructor(params: IllusionResultParams) {
        this.node = new Node('IllusionResultScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.p = {
            streak: 0, mult: 0, interrupted: false, streakBefore: 0,
            ...params,
        };
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_result/spriteFrame');
        const r = this.p.result;

        const title = label(n, TEXTS.illusionTitle, 34, { bold: true, color: THEME.paper });
        title.setPosition(0, 512, 0);
        fadeIn(title, 14);

        const tierColor = r.score >= ILLUSION.tiers[2].at ? THEME.rainGold
            : r.score >= ILLUSION.tiers[1].at ? THEME.goldLight
                : r.score >= ILLUSION.tiers[0].at ? THEME.rainBlue : THEME.paper;
        const tierName = r.rating ?? '未入档';
        label(n, `${tierName}`, 54, { bold: true, color: tierColor }).setPosition(0, 436, 0);
        label(n, TEXTS.illusionScoreLine(r.score, Game.save.daily.illusionBest), 24, {
            color: THEME.paper, width: 560, shrink: true,
        }).setPosition(0, 384, 0);

        const detail = spritePanel(n, 628, 420);
        detail.setPosition(0, 96, 0);
        fadeIn(detail, 16, 0.05);
        const multText = this.p.mult > 0 ? `×${Math.round(this.p.mult * 10) / 10}` : '';
        const streakText = this.p.interrupted
            ? `连胜中断（原 ${this.p.streakBefore} 连）`
            : this.p.mult > 0
                ? `当前连胜 ${this.p.streak} 连 · 奖励倍率 ${multText}`
                : `当前连胜 ${this.p.streak} 连 · 达 60 分起累计倍率`;
        const lines: string[] = [
            `金色灵雨    ×${r.goldCount}`,
            `最大连击    ×${r.maxCombo}`,
            `劫雨沾身    ×${r.redCount}`,
            `本周最佳    ${Game.save.illusionWeekBest} 分`,
            streakText,
        ];
        lines.forEach((t, i) => {
            const ln = label(detail, t, 26, { color: THEME.paper, align: 'left', width: 440 });
            ln.setPosition(0, 158 - i * 62, 0);
            if (i === 4) this.streakLabel = ln.getComponent(Label);
        });

        // 档位奖励 / 道心护持（互斥复用同一面板）
        const isRevive = this.p.interrupted && this.p.streakBefore > 0;
        const rewardPanel = spritePanel(n, 628, isRevive ? 220 : 150, undefined, THEME.tintPanel);
        rewardPanel.setPosition(0, isRevive ? -148 : -130, 0);
        if (isRevive) {
            this.reviveTitle = label(rewardPanel, TEXTS.trialReviveTitle, 28, { bold: true, color: THEME.goldLight }).getComponent(Label);
            this.reviveTitle!.node.setPosition(0, 74, 0);
            this.reviveDesc = label(rewardPanel, TEXTS.trialReviveDesc(this.p.streakBefore), 23, {
                color: THEME.paper, width: 560, shrink: true,
            }).getComponent(Label);
            this.reviveDesc!.node.setPosition(0, 30, 0);
            this.reviveBtn = spriteButton(rewardPanel, 320, 72, TEXTS.trialReviveBtn, () => this.revive(), {
                fontSize: 24,
                variant: 'primary',
                textColor: THEME.void,
            });
            this.reviveBtn.node.setPosition(-102, -52, 0);
            this.giveUpBtn = spriteButton(rewardPanel, 180, 72, TEXTS.trialReviveGiveUp, () => this.decline(), {
                fontSize: 23,
                variant: 'ghost',
                textColor: THEME.inkSoft,
            });
            this.giveUpBtn.node.setPosition(150, -52, 0);
        } else if (r.rating && this.p.rewards.length) {
            label(rewardPanel, TEXTS.illusionTierReward(String(r.rating)), 24, { bold: true, color: THEME.goldLight })
                .setPosition(0, 44, 0);
            label(rewardPanel, this.p.rewards.map((x) => x.label).join('　'), 25, {
                bold: true, color: THEME.paper, width: 560, shrink: true,
            }).setPosition(0, -8, 0);
            AudioMgr.play('rare');
        } else {
            label(rewardPanel, TEXTS.illusionNoTier, 24, { bold: true, color: THEME.inkSoft, width: 560, shrink: true })
                .setPosition(0, 0, 0);
        }

        // M9b 好友对比（抖音端可用时）：幻境周榜（我的值 = 本周最佳编码）
        if (DouyinSocial.available()) {
            const save = Game.save;
            const myWeek = encodeIllusionWeek(save.illusionWeekKey, save.illusionWeekBest);
            DouyinSocial.compare(SOCIAL_KEYS.illusionWeek, myWeek, (r) => {
                if (!r || r.total === 0 || !this.node.isValid) return;
                const line = label(n, `好友对比：已超越 ${r.beat}/${r.total} 位好友 · 最高 ${decodeIllusionWeek(r.top).score} 分`, 22, {
                    color: THEME.inkSoft,
                    width: 580,
                    shrink: true,
                });
                line.setPosition(0, -300, 0);
                fadeIn(line, 8);
            });
        }

        // 再战（消耗体力）与返回。返回按钮**无条件创建**：
        // 旧版只在可再战时创建，用完次数后页面只剩一个禁用按钮，无任何出口（P0-1 教训）。
        // M14（#42）：进入凭证由「广告加次」改为体力制，1 局 1 点。
        const canAgain = Game.trial.canStart(Game.save);
        this.againBtn = spriteButton(n, 330, 88, TEXTS.illusionEnterAd, () => this.again(), {
            fontSize: 25,
            variant: 'primary',
            textColor: THEME.void,
        });
        this.againBtn.node.setPosition(-108, isRevive ? -520 : -470, 0);
        if (!canAgain) {
            this.againBtn.setEnabled(false);
            this.againBtn.setText(TEXTS.illusionNone);
        }
        const back = spriteButton(n, 206, 88, '返回仙府', () => Game.stack.popToRoot(), {
            fontSize: 26,
            variant: 'secondary',
            textColor: THEME.paper,
        });
        back.node.setPosition(166, isRevive ? -520 : -470, 0);
    }

    /** 道心护持：看广告保留连胜（单次中断仅 1 支，跳过视同放弃） */
    private revive() {
        if (this.reviveUsed) return;
        Ads.show('trialRevive', this.node, {
            onSuccess: () => {
                if (this.reviveUsed) return;
                this.reviveUsed = true;
                Game.trial.reviveStreak(Game.save, this.p.streakBefore);
                Game.persist();
                this.refreshRevive(true);
            },
            onSkip: () => this.decline(),
        });
    }

    /** 放弃护持：连胜清零 */
    private decline() {
        if (this.reviveUsed) return;
        this.reviveUsed = true;
        Game.trial.breakStreak(Game.save);
        Game.persist();
        this.refreshRevive(false);
    }

    private refreshRevive(revived: boolean) {
        if (this.reviveTitle) this.reviveTitle.string = revived ? TEXTS.trialReviveDone : TEXTS.trialReviveGone;
        if (this.reviveDesc) {
            this.reviveDesc.string = revived
                ? `下局达 60 分即续写 ${this.p.streakBefore + 1} 连`
                : '下次达 60 分将从 1 连重新累计';
        }
        this.reviveBtn?.setEnabled(false);
        this.giveUpBtn?.setEnabled(false);
        if (this.streakLabel) {
            this.streakLabel.string = revived
                ? TEXTS.trialStreakLine(this.p.streakBefore, streakMult(this.p.streakBefore))
                : TEXTS.trialStreakLine(0, 1);
        }
    }

    private again() {
        if (!Game.trial.canStart(Game.save)) {
            this.againBtn?.setEnabled(false);
            this.againBtn?.setText(TEXTS.illusionNone);
            return;
        }
        Game.trial.consumeStart(Game.save);
        Game.persist();
        // 先弹回主页再压新雨：旧栈是 [Home, Rain(已结束), 本页]，
        // swap 只会换掉本页、把已结束的旧 Rain 留在栈里。
        Game.stack.popToRoot();
        Game.stack.push(new RainScene('illusion'));
    }
}
