/**
 * M31 宗门社交（A18，#57）视图层：作为论道页第 5 个 tab「宗门」内联渲染。
 *
 * **为什么不是 IScene**：入口是 tab（与排行/幻境/论武/成就同级的内联视图），
 * 不是压栈页面——返回语义由论道页自己的 tab 切换承担，不占 SceneStack。
 * 全部状态从 Game.save.sect + core/sect.ts 派生，动作经 Game.sect 入账后整窗重建
 * （同 LudaoScene.renderTab 的无状态重建范式，不存在「界面与存档不同步」的中间态）。
 *
 * 布局节距硬约束：spriteButton 命中区 = max(h, MIN_TOUCH=88)，纵向堆叠的
 * spriteButton 行距必须 ≥88，否则邻行误 hit；商店行因此用**裸 Button 整行点击**
 * （同仙闻录范式，行高 48 自持命中区）。
 */
import { Button, Layers, Node, UIOpacity } from 'cc';
import { Game } from '../infra/Game';
import { todayString } from '../core/saveModel';
import { TEXTS } from '../core/config/texts';
import { SECTS, SECT_DONATE_TIERS, SECT_MEMBER_NAMES } from '../core/config/sect';
import {
    sectCandidates,
    sectLevelProgress,
    sectPositionOf,
    sectSalary,
    sectDonateView,
    sectHelp,
    sectShopView,
    sectMyRank,
    todayHelper,
    joinSect,
} from '../core/sect';
import { Share } from '../infra/Share';
import { AudioMgr } from '../infra/AudioMgr';
import {
    THEME,
    DESIGN_H,
    faded,
    image,
    label,
    labelL,
    progressBar,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';

/** 整窗重建（动作后刷新） */
function refresh(root: Node) {
    root.destroyAllChildren();
    if (!Game.save.sect.id) buildJoin(root);
    else buildMain(root);
}

export class SectView {
    /** 构建宗门视图（返回视图根节点，挂入论道页 content） */
    static buildInto(parent: Node): Node {
        const root = uinode('sectView', parent, 720, DESIGN_H);
        if (!Game.save.sect.id) buildJoin(root);
        else buildMain(root);
        return root;
    }
}

// ---------- 加入态 ----------

function buildJoin(root: Node) {
    label(root, TEXTS.sectJoinTitle, 30, { bold: true, color: THEME.goldLight }).setPosition(0, 330, 0);
    label(root, TEXTS.sectJoinHint, 19, { color: THEME.inkSoft, width: 620, shrink: true }).setPosition(0, 292, 0);

    sectCandidates().forEach((c, i) => {
        const cy = 200 - i * 170;
        const card = spritePanel(root, 660, 150, undefined, THEME.tintPanel);
        card.setPosition(0, cy, 0);
        labelL(card, c.name, 28, { bold: true, color: THEME.goldLight, width: 380, shrink: true })
            .setPosition(-300, 46, 0);
        labelL(card, c.tagline, 19, { color: THEME.inkSoft, width: 380, shrink: true })
            .setPosition(-300, 12, 0);
        labelL(card, `门下成员 ${c.memberCount} 人 ｜ ${c.perk}`, 17, {
            color: faded(THEME.paper, 210), width: 430, shrink: true,
        }).setPosition(-300, -22, 0);
        const btn = spriteButton(card, 170, 62, TEXTS.sectJoinBtn, () => {
            if (!joinSect(Game.save, c.id)) return;
            Game.persist();
            AudioMgr.play('rare');
            toast(root, `${TEXTS.sectJoined} · ${c.name}`);
            refresh(root);
        }, { fontSize: 24, variant: 'primary', textColor: THEME.void });
        btn.node.setPosition(232, 4, 0);
    });

    label(root, '宗门本地模拟 · 抖音关系链真机联调后开放邀请道友', 17, {
        color: THEME.inkSoft, width: 620, shrink: true,
    }).setPosition(0, -DESIGN_H / 2 + 96, 0);
}

// ---------- 主态 ----------

function buildMain(root: Node) {
    buildInfoCard(root);
    buildDailyCard(root);
    buildShopCard(root);
    buildInvite(root);
}

/** 信息卡：宗门名/等级/职位/贡献点/成员/经验条 */
function buildInfoCard(root: Node) {
    const s = Game.save;
    const cfg = SECTS.find((x) => x.id === s.sect.id)!;
    const prog = sectLevelProgress(s);
    const card = spritePanel(root, 660, 150, undefined, THEME.tintCard);
    card.setPosition(0, 205, 0);

    labelL(card, cfg.name, 30, { bold: true, color: THEME.goldLight, width: 320, shrink: true })
        .setPosition(-300, 56, 0);
    label(card, TEXTS.sectInfoLevel(prog.level), 22, {
        bold: true, color: THEME.rainGold, align: 'right', width: 200,
    }).setPosition(200, 56, 0);
    labelL(card, TEXTS.sectInfoPosition(sectPositionOf(s)), 20, { color: THEME.paper, width: 300, shrink: true })
        .setPosition(-300, 24, 0);
    label(card, TEXTS.sectContrib(s.sect.contrib), 22, {
        bold: true, color: THEME.goldLight, align: 'right', width: 200,
    }).setPosition(200, 24, 0);
    labelL(card, TEXTS.sectInfoMembers(SECT_MEMBER_NAMES.length, sectMyRank(s)), 18, { color: THEME.inkSoft, width: 460, shrink: true })
        .setPosition(-300, -6, 0);
    label(card, cfg.perk, 17, {
        color: faded(THEME.paper, 200), align: 'right', width: 280, shrink: true,
    }).setPosition(160, -6, 0);
    const bar = progressBar(card, 600, 24, { fontSize: 17 });
    bar.node.setPosition(0, -48, 0);
    bar.set(prog.ratio, TEXTS.sectExpLine(prog.cur, prog.next));
}

/** 日常卡：俸禄 / 助力 / 捐献三档（spriteButton 行距 88 防邻行误 hit） */
function buildDailyCard(root: Node) {
    const s = Game.save;
    const today = todayString(new Date());
    const card = spritePanel(root, 660, 316, undefined, THEME.tintPanel);
    card.setPosition(0, 12, 0);
    labelL(card, TEXTS.sectDailyTitle, 24, { bold: true, color: THEME.goldLight, width: 300 })
        .setPosition(-300, 134, 0);

    // 俸禄行（y=+66）
    const salary = sectSalary(s, today);
    const salaryBtn = spriteButton(card, 190, 62, '', () => {
        const g = Game.sect.claimSalary(s);
        if (!g) return;
        Game.persist();
        AudioMgr.play('coin');
        toast(root, TEXTS.sectSalaryGain(g.xiuwei, g.contrib, g.frag));
        refresh(root);
    }, { fontSize: 22, variant: salary ? 'primary' : 'secondary', textColor: THEME.void });
    salaryBtn.node.setPosition(-205, 66, 0);
    if (salary) {
        salaryBtn.setText(TEXTS.sectSalaryBtn);
        labelL(card, TEXTS.sectSalaryGain(salary.xiuwei, salary.contrib, salary.frag), 19, {
            color: THEME.paper, width: 340, shrink: true,
        }).setPosition(-80, 66, 0);
    } else {
        salaryBtn.setEnabled(false);
        salaryBtn.setText(TEXTS.sectSalaryDone);
        labelL(card, '明日再来', 18, { color: THEME.inkSoft, width: 200 }).setPosition(-80, 66, 0);
    }

    // 助力行（y=-22；与俸禄行距 88，命中区恰好相接不重叠）
    const help = sectHelp(s, today);
    const helperName = todayHelper(s, today) ?? '';
    const helpBtn = spriteButton(card, 190, 62, '', () => {
        const r = Game.sect.claimHelp(s);
        if (!r) return;
        Game.persist();
        AudioMgr.play('coin');
        toast(root, TEXTS.sectHelpGain(r.helper, r.gain.xiuwei, r.gain.contrib));
        refresh(root);
    }, { fontSize: 22, variant: help ? 'primary' : 'secondary', textColor: THEME.void });
    helpBtn.node.setPosition(-205, -22, 0);
    if (help) {
        helpBtn.setText(TEXTS.sectHelpBtn);
        labelL(card, TEXTS.sectHelpLine(help.helper), 19, {
            color: THEME.paper, width: 340, shrink: true,
        }).setPosition(-80, -22, 0);
    } else {
        helpBtn.setEnabled(false);
        helpBtn.setText(TEXTS.sectHelpDone);
        labelL(card, TEXTS.sectHelpLine(helperName), 18, {
            color: THEME.inkSoft, width: 300, shrink: true,
        }).setPosition(-80, -22, 0);
    }

    // 捐献行（y=-110；与助力行距 88）：左标签 + 右三档
    const dv = sectDonateView(s, today);
    labelL(card, `捐献灵石（${TEXTS.sectDonateRemain(dv.remaining)}）`, 17, {
        color: THEME.paperDim, width: 190, shrink: true,
    }).setPosition(-300, -110, 0);
    SECT_DONATE_TIERS.forEach((tier, i) => {
        const can = dv.canTiers[i];
        const btn = spriteButton(card, 140, 52, TEXTS.sectDonateBtn(tier), () => {
            const r = Game.sect.donate(s, tier);
            if (!r) return;
            Game.persist();
            AudioMgr.play('coin');
            toast(root, TEXTS.sectDonateGain(r.contrib));
            refresh(root);
        }, { fontSize: 20, variant: 'secondary', textColor: THEME.goldLight });
        btn.node.setPosition(-70 + i * 148, -110, 0);
        if (!can) btn.setEnabled(false);
    });
}

/** 宝库卡：贡献点商店（5 物单列，裸 Button 整行点击，行高 48 自持命中区） */
function buildShopCard(root: Node) {
    const s = Game.save;
    const today = todayString(new Date());
    const card = spritePanel(root, 660, 296, undefined, THEME.tintPanel);
    card.setPosition(0, -312, 0);
    labelL(card, TEXTS.sectShopTitle, 24, { bold: true, color: THEME.goldLight, width: 300 })
        .setPosition(-300, 122, 0);
    label(card, TEXTS.sectContrib(s.sect.contrib), 20, {
        bold: true, color: THEME.rainGold, align: 'right', width: 200,
    }).setPosition(200, 122, 0);

    sectShopView(s, today).forEach((row, i) => {
        const ry = 74 - i * 48;
        const line = spritePanel(card, 620, 42, undefined, row.canBuy ? THEME.tintCard : THEME.tintPanel);
        line.setPosition(0, ry, 0);
        image(line, `art/ui/icons/${row.item.icon}/spriteFrame`, 32, 32).setPosition(-276, 0, 0);
        labelL(line, row.item.name, 19, { color: THEME.paper, width: 190, shrink: true })
            .setPosition(-248, 0, 0);
        label(line, `${row.item.cost} 贡献`, 17, { color: THEME.goldLight, width: 130, shrink: true })
            .setPosition(-80, 0, 0);
        label(line, TEXTS.sectShopBought(row.boughtToday, row.item.daily), 15, {
            color: THEME.inkSoft, width: 110, shrink: true,
        }).setPosition(70, 0, 0);
        label(line, row.canBuy ? '兑 换' : s.sect.contrib < row.item.cost ? '贡献不足' : '今日已兑', 17, {
            bold: true,
            color: row.canBuy ? THEME.rainGold : faded(THEME.paper, 160),
            align: 'right', width: 110,
        }).setPosition(230, 0, 0);
        if (!row.canBuy) line.addComponent(UIOpacity).opacity = 130;

        // 整行一个裸 Button（Transition.NONE）：行高 42 < MIN_TOUCH，若用 spriteButton
        // 会把命中区撑到 88，48 行距必然邻行误 hit（仙闻录同坑）
        const b = line.addComponent(Button);
        b.transition = Button.Transition.NONE;
        b.target = line;
        b.interactable = row.canBuy;
        line.on(Button.EventType.CLICK, () => {
            if (!b.interactable) return;
            const give = Game.sect.buyShopItem(s, row.item.id);
            if (!give) return;
            Game.persist();
            AudioMgr.play('coin');
            toast(root, `兑换成功 · ${row.item.name}`);
            refresh(root);
        });
    });
}

/** 邀请道友（真机 share；web toast 降级） */
function buildInvite(root: Node) {
    const btn = spriteButton(root, 240, 60, TEXTS.sectInviteBtn, () => {
        if (!Share.share({ title: '道友，快来加入我的宗门，共赴大道！——《凡人开仙缘》' })) {
            toast(root, TEXTS.sectInviteToast);
        }
    }, { fontSize: 23, variant: 'secondary', textColor: THEME.goldLight });
    btn.node.setPosition(0, -502, 0);
}
