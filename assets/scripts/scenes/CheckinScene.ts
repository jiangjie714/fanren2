import { Layers, Node, UIOpacity } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { CHECKIN_REWARDS, CheckinMilestone, CheckinReward, CheckinView } from '../core/checkin';
import { MATERIALS } from '../core/config/alchemy';
import { TEXTS } from '../core/config/texts';
import { statusBar } from '../ui/StatusBar';
import {
    THEME,
    faded,
    fadeIn,
    label,
    labelL,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    toast,
} from '../ui/ThemeLib';

/**
 * M26 连续登录签到（#53）：七日轮回 + 累计里程碑，纯展示 + 两个领取按钮。
 *
 * 布局（statusBar 底缘 370 → 内容从 364 起，安全区下限 -585）：
 *   摘要卡 y=306 → 七格面板 y=140 → 里程碑三行 15/-69/-153 → 主按钮 -245 → 底部提示 -330
 * 七格单排：格宽 84、间距 6，总宽 624 < 720，左右各留 48（不出安全区）。
 */
export class CheckinScene implements IScene {
    node: Node;
    private bar = { refresh: () => {} };

    constructor() {
        this.node = new Node('CheckinScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        this.build();
    }

    /** 回前台/从弹窗返回：直接重建，保证连续天数与红点状态最新 */
    onResume() {
        this.build();
    }

    private build() {
        this.node.removeAllChildren();
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, TEXTS.checkinPageTitle, () => Game.stack.pop());
        this.bar = statusBar(n, 436);

        const v: CheckinView = Game.checkin.view(Game.save);
        this.renderSummary(n, v);
        this.renderBoard(n, v);
        this.renderMilestones(n, v);
        this.renderClaimBtn(n, v);

        labelL(n, TEXTS.checkinHint, 17, {
            color: faded(THEME.inkSoft, 200), width: 600, shrink: true,
        }).setPosition(-300, -330, 0);
    }

    // ── 顶部摘要卡：连续天数 + 累计天数 + 轮回提示 ──
    private renderSummary(n: Node, v: CheckinView) {
        const card = spritePanel(n, 660, 116, undefined, THEME.tintPanel);
        card.setPosition(0, 306, 0);
        fadeIn(card, 12);

        labelL(card, TEXTS.checkinPageTitle, 26, { bold: true, color: THEME.goldLight })
            .setPosition(-300, 34, 0);
        // 文案统一走 TEXTS（禁止散落硬编码）；字号 20 + 居中锚点 x=228，
        // 保证「已连续问道 12 天」右缘 ≤320 不捅出卡片（半宽 330）
        label(card, TEXTS.checkinStreak(v.streak), 20, {
            bold: true, color: THEME.goldLight,
        }).setPosition(228, 34, 0);

        const parts: string[] = [TEXTS.checkinTotal(v.totalDays)];
        // 今天领完就到轮回节点时提示「明日回到第 1 天」，避免玩家误以为断了
        if (v.canClaim && v.cycleDayAfter === CHECKIN_REWARDS.length) {
            parts.push(TEXTS.checkinCycleReset(1));
        }
        labelL(card, v.streak > 0 ? parts.join('　·　') : TEXTS.checkinStreakZero, 18, {
            color: THEME.inkSoft, width: 600, shrink: true,
        }).setPosition(-300, -20, 0);
    }

    // ── 七日轮回格（单排 7 格）──
    private renderBoard(n: Node, v: CheckinView) {
        const board = spritePanel(n, 660, 162, undefined, THEME.tintPanel);
        board.setPosition(0, 140, 0);
        fadeIn(board, 12, 0.03);

        const cur = v.cycleDayAfter;
        for (let i = 0; i < CHECKIN_REWARDS.length; i++) {
            const day = i + 1;
            const isToday = v.canClaim && day === cur;
            const isDone = day < cur;
            const cell = spritePanel(
                board, 84, 112, undefined,
                isToday ? THEME.tintCard : isDone ? THEME.tintPanel : THEME.tintMuted,
            );
            cell.setPosition(-270 + i * 90, 0, 0);

            const titleColor = isToday ? THEME.goldLight : isDone ? THEME.ink : THEME.ash;
            label(cell, TEXTS.checkinDayLabel(day), 17, { color: titleColor }).setPosition(0, 34, 0);
            label(cell, String(CHECKIN_REWARDS[i].lingshi), 24, {
                bold: true, color: isToday ? THEME.gold : isDone ? THEME.paperDim : THEME.ash,
            }).setPosition(0, 6, 0);
            label(cell, '灵石', 12, { color: faded(THEME.inkSoft, 190) }).setPosition(0, -18, 0);
            label(cell, isToday ? TEXTS.checkinCellToday : isDone ? TEXTS.checkinCellDone : TEXTS.checkinCellLocked, 14, {
                color: isToday ? THEME.gold : faded(THEME.inkSoft, 200),
            }).setPosition(0, -40, 0);
        }
    }

    // ── 累计里程碑三行 ──
    private renderMilestones(n: Node, v: CheckinView) {
        v.milestones.forEach((m, i) => {
            const row = spritePanel(n, 660, 76, undefined, THEME.tintPanel);
            row.setPosition(0, 15 - i * 84, 0);
            fadeIn(row, 12, 0.06 + i * 0.03);

            const claimable = m.reached && !m.claimed;
            labelL(row, TEXTS.checkinMilestoneTitle(m.days), 22, {
                bold: true, color: m.reached ? THEME.goldLight : THEME.inkSoft,
            }).setPosition(-300, 14, 0);
            labelL(row, rewardText(m.reward), 17, {
                color: THEME.inkSoft, width: 400, shrink: true,
            }).setPosition(-300, -18, 0);

            const btnText = m.claimed
                ? TEXTS.checkinMilestoneClaimed
                : m.reached
                    ? TEXTS.checkinMilestoneClaim
                    : TEXTS.checkinMilestoneLocked(m.days - v.totalDays);
            const btn = spriteButton(row, 150, 64, btnText, () => this.onClaimMilestone(m.days), {
                fontSize: 20,
                variant: claimable ? 'primary' : 'secondary',
                textColor: claimable ? THEME.void : THEME.disabled,
            });
            btn.node.setPosition(240, 0, 0);
            // ⚠ 置灰只能用 UIOpacity：setEnabled(false) 会让回调一并失效（M22 踩过）
            if (!claimable) dimNode(btn.node, 130);
        });
    }

    // ── 主按钮：领取今日 ──
    private renderClaimBtn(n: Node, v: CheckinView) {
        const canClaim = v.canClaim && !!v.pending;
        const text = canClaim ? TEXTS.checkinClaim(v.pending!.lingshi) : TEXTS.checkinClaimDone;
        const btn = spriteButton(n, 420, 88, text, () => this.onClaim(), {
            fontSize: 28,
            variant: 'primary',
            textColor: canClaim ? THEME.void : THEME.disabled,
        });
        btn.node.setPosition(0, -245, 0);
        if (!canClaim) dimNode(btn.node, 130);
    }

    private onClaim() {
        const v = Game.checkin.view(Game.save);
        if (!v.canClaim) {
            toast(this.node, TEXTS.checkinClaimDone);
            return;
        }
        const r = Game.checkin.claim(Game.save);
        if (!r) return;
        AudioMgr.play('success');
        toast(this.node, TEXTS.checkinToast(rewardText(r)));
        Game.persist();
        this.build();
    }

    private onClaimMilestone(days: number) {
        const got = Game.checkin.claimMilestone(Game.save, days);
        if (!got) return;
        AudioMgr.play('success');
        toast(this.node, TEXTS.checkinMilestoneToast(days));
        Game.persist();
        this.build();
    }
}

/** 置灰：只压不透明度，不动 Button 的 enabled（回调必须保持可达） */
function dimNode(node: Node, opacity: number) {
    const op = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
    op.opacity = opacity;
}

/** 奖励文案（灵石 / 机缘 / 灵材 / 券），格内与里程碑行共用 */
function rewardText(r: CheckinReward | CheckinMilestone): string {
    const parts: string[] = [];
    if (r.lingshi > 0) parts.push(`灵石 ${r.lingshi}`);
    if (r.jiyuan > 0) parts.push(`机缘 ${r.jiyuan}`);
    const ids = Object.keys(r.mats ?? {});
    for (let i = 0; i < ids.length; i++) {
        const n = r.mats[ids[i]];
        if (n > 0) parts.push(`${materialName(ids[i])} ×${n}`);
    }
    const tickets = (r as CheckinMilestone).tickets ?? 0;
    if (tickets > 0) parts.push(`修真宝盒券 ×${tickets}`);
    return parts.length > 0 ? parts.join(' · ') : '些许心意';
}

function materialName(id: string): string {
    for (let i = 0; i < MATERIALS.length; i++) {
        if (MATERIALS[i].id === id) return MATERIALS[i].name;
    }
    return id;
}
