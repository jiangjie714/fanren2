import { EditBox, Graphics, Label, Layers, Node, Sprite } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { TEXTS } from '../core/config/texts';
import {
    THEME,
    fadeIn,
    image,
    label,
    pageBackground,
    spriteButton,
    spritePanel,
    toast,
    uinode,
} from '../ui/ThemeLib';
import { HomeScene } from './HomeScene';
import { showAgreementDialog, showPrivacyDialog, showProbabilityDialog } from '../ui/infoDialogs';

type Gender = 'm' | 'f';

/**
 * 捏人开局（M11 #32）：择性别、取道号。
 * 存档 profile.name 为空时由 Game.init 引导至此，确认后 swap 进主页。
 * 老玩家升级到 v4 存档也会先走一次（进度全保留，仅补档案）。
 */
export class ProfileScene implements IScene {
    node: Node;
    private gender: Gender = 'm';
    private cards = new Map<Gender, Node>();
    private editBox!: EditBox;

    constructor() {
        this.node = new Node('ProfileScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');

        label(n, TEXTS.profileTitle, 48, {
            bold: true,
            color: THEME.goldLight,
            shadow: true,
            shadowColor: THEME.shadow,
        }).setPosition(0, 380, 0);
        label(n, TEXTS.profileHint, 22, { color: THEME.paperDim, width: 560, shrink: true })
            .setPosition(0, 320, 0);

        this.renderCards();
        this.renderNameInput();
        this.renderLinks();
        fadeIn(n, 16);
    }

    /** 底部合规入口（自主页迁入）：位于 -440，高于底部 -536 安全线，远离手势栏冲突 */
    private renderLinks() {
        const n = this.node;
        const links: Array<[string, () => void]> = [
            [TEXTS.probabilityPublic, () => showProbabilityDialog(n)],
            [TEXTS.settingsUserAgreement, () => showAgreementDialog(n)],
            [TEXTS.settingsPrivacy, () => showPrivacyDialog(n)],
        ];
        const linkW = 184;
        const linkH = 46;
        links.forEach(([text, cb], i) => {
            const b = spriteButton(n, linkW, linkH, text, cb, {
                fontSize: 19,
                variant: 'ghost',
                textColor: THEME.inkSoft,
            });
            b.node.setPosition((i - 1) * (linkW + 16), -440, 0);
        });
    }

    /** 性别双卡：选中卡亮起金环，未选中灰置 */
    private renderCards() {
        const defs: Array<{ g: Gender; text: string; path: string }> = [
            { g: 'm', text: TEXTS.profileMale, path: 'art/characters/char_realm_00/spriteFrame' },
            { g: 'f', text: TEXTS.profileFemale, path: 'art/characters/char_realm_00_f/spriteFrame' },
        ];
        defs.forEach((d, i) => {
            const card = spritePanel(this.node, 280, 380, undefined, THEME.tintCard);
            card.setPosition(i === 0 ? -160 : 160, 60, 0);
            image(card, d.path, 210, 210, {
                // 女修立绘若尚未随包发布，回退男修立绘，避免空白
                fallbackPath: 'art/characters/char_realm_00/spriteFrame',
            }).setPosition(0, 40, 0);
            label(card, d.text, 30, { bold: true, color: THEME.paper }).setPosition(0, -128, 0);
            card.on(Node.EventType.TOUCH_END, () => {
                if (this.gender !== d.g) {
                    this.gender = d.g;
                    this.refreshCards();
                }
            });
            this.cards.set(d.g, card);
        });
        this.refreshCards();
    }

    private refreshCards() {
        this.cards.forEach((card, g) => {
            const sp = card.getComponent(Sprite);
            if (sp) sp.color = g === this.gender ? THEME.white : THEME.tintMuted;
            // 选中金环（Graphics 直涂实色，不与 tint 混用）
            let ring = card.getChildByName('ring');
            if (g === this.gender && !ring) {
                ring = uinode('ring', card, 292, 392);
                const gr = ring.addComponent(Graphics);
                gr.strokeColor = THEME.gold;
                gr.lineWidth = 4;
                gr.roundRect(-140, -186, 280, 372, 14);
                gr.stroke();
            } else if (g !== this.gender && ring) {
                ring.destroy();
            }
        });
    }

    private renderNameInput() {
        const n = this.node;
        // 输入框底板：标准玄墨 9-slice，EditBox 直接挂同一节点。
        // 不要自建 textLabel/placeholderLabel 再赋值——实测引擎（3.8 web impl）在
        // _placeholderLabel 为空时会自建 PLACEHOLDER_LABEL/TEXT_LABEL 子节点并刷上
        // 默认串 "label"，与自建 label 双双显示。正确做法：让引擎自建，update 里接管样式。
        const input = spritePanel(n, 460, 88, undefined, THEME.tintPanel);
        input.setPosition(0, -220, 0);
        this.editBox = input.addComponent(EditBox);
        this.editBox.maxLength = 6;
        this.editBox.inputMode = EditBox.InputMode.SINGLE_LINE;

        const rnd = spriteButton(n, 220, 76, TEXTS.profileRandomName, () => {
            this.editBox.string = Game.combat.randomName();
        }, { fontSize: 24, variant: 'secondary', textColor: THEME.goldLight });
        rnd.node.setPosition(-130, -330, 0);

        const go = spriteButton(n, 300, 76, TEXTS.profileConfirm, () => this.confirm(), {
            fontSize: 27,
            variant: 'primary',
        });
        go.node.setPosition(130, -330, 0);
    }

    /**
     * 接管 EditBox 自建的内建 label：PLACEHOLDER_LABEL（占位）/ TEXT_LABEL（输入串）。
     * 引擎 onLoad 后才会创建，且默认串是 "label"、锚在左上——这里逐帧等到创建完成后
     * 统一摆正居中并改文案（onEnter 时机太早，实测翻车三轮的坑）。
     */
    private editBoxStyled = false;

    update() {
        if (this.editBoxStyled || !this.editBox?.node?.isValid) return;
        const node = this.editBox.node;
        const phNode = node.getChildByName('PLACEHOLDER_LABEL');
        const txNode = node.getChildByName('TEXT_LABEL');
        if (!phNode) return;
        this.editBoxStyled = true;
        phNode.setPosition(0, 0, 0);
        const ph = phNode.getComponent(Label)!;
        ph.string = TEXTS.profileNameHint;
        ph.fontSize = 26;
        ph.lineHeight = 32;
        ph.color = THEME.inkSoft;
        ph.isBold = false;
        if (txNode) {
            txNode.setPosition(0, 0, 0);
            const tx = txNode.getComponent(Label)!;
            tx.string = '';
            tx.fontSize = 30;
            tx.lineHeight = 38;
            tx.color = THEME.paper;
            tx.isBold = true;
        }
    }

    private confirm() {
        const name = (this.editBox.string ?? '').trim();
        if (name.length < 2 || name.length > 6) {
            toast(this.node, TEXTS.profileNameInvalid);
            return;
        }
        Game.save.profile = { gender: this.gender, name, createdAt: Date.now() };
        Game.persist();
        Game.stack.swap(new HomeScene());
    }
}
