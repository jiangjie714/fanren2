import { Button, Color, Graphics, Layers, Node, UITransform } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { AudioMgr } from '../infra/AudioMgr';
import { TEXTS } from '../core/config/texts';
import { showAgreementDialog, showPrivacyDialog, showProbabilityDialog } from '../ui/infoDialogs';
import {
    DESIGN_W,
    THEME,
    faded,
    label,
    pageBackground,
    pageHeader,
    spriteButton,
    spritePanel,
    uinode,
} from '../ui/ThemeLib';
import { DouyinSocial } from '../infra/DouyinSocial';
import { Ads } from '../infra/Ads';
import { AD_PLACES } from '../core/config/ads';

/**
 * 设置页 — PRD 页面7。
 * 音效/BGM 开关（持久化）；概率公示（数字与 core/config 同源生成，抖音审核必需）；
 * 用户协议/隐私政策（文本上线前为占位，URL 由运营补充）。
 */
export class SettingsScene implements IScene {
    node: Node;

    constructor() {
        this.node = new Node('SettingsScene');
        this.node.layer = Layers.Enum.UI_2D;
    }

    onResume() {
        // 开关状态以存档为准，返回/回前台后整页重建保持一致
        // （页面无长驻监听，重建安全）（P1-3）。
        this.node.destroyAllChildren();
        this.onEnter();
    }

    onEnter() {
        const n = this.node;
        pageBackground(n, 'art/ui/bg_home/spriteFrame');
        pageHeader(n, '设置', () => Game.stack.pop());

        const panelW = 650;

        // 三个分组整体下移 105px：可用高度是「头部 548 ~ 安全线 -536」，原先内容全挤在
        // 上半区（重心 y≈98，可用区重心 y≈6），下半屏空出一大片只有背景。
        // ---------- 分组 1：声音与氛围 ----------
        label(n, '— 声音与氛围 —', 22, { bold: true, color: THEME.goldLight })
            .setPosition(0, 340, 0);

        const audioPanel = spritePanel(n, panelW, 176, undefined, THEME.tintPanel);
        audioPanel.setPosition(0, 224, 0);

        // 音效开关
        this.buildToggleItem(audioPanel, 42, TEXTS.settingsSound, Game.save.settings.sound, (on) => {
            Game.save.settings.sound = on;
            Game.persist();
        });

        // 细分割线
        this.buildDivider(audioPanel, 0, 580);

        // BGM 开关
        this.buildToggleItem(audioPanel, -42, TEXTS.settingsBgm, Game.save.settings.bgm, (on) => {
            Game.save.settings.bgm = on;
            Game.persist();
            AudioMgr.setBgm(on);
        });

        // ---------- 分组 2：公约与公示 ----------
        label(n, '— 公约与公示 —', 22, { bold: true, color: THEME.goldLight })
            .setPosition(0, 82, 0);

        const docPanel = spritePanel(n, panelW, 216, undefined, THEME.tintPanel);
        docPanel.setPosition(0, -58, 0);

        this.buildLinkItem(docPanel, 58, TEXTS.settingsProbability, () => this.showProbability());
        this.buildDivider(docPanel, 18, 580);
        this.buildLinkItem(docPanel, -14, TEXTS.settingsUserAgreement, () => this.showAgreement());
        this.buildDivider(docPanel, -48, 580);
        this.buildLinkItem(docPanel, -76, TEXTS.settingsPrivacy, () => this.showPrivacy());

        // ---------- 分组 3：版本与技术信息 ----------
        const vpanel = spritePanel(n, panelW, 126, undefined, THEME.tintPanel);
        vpanel.setPosition(0, -290, 0);
        label(vpanel, '《凡人开仙缘》', 26, { bold: true, color: THEME.goldLight }).setPosition(0, 30, 0);
        label(vpanel, '版本 1.0.0 · 墨夜星辰修仙', 20, { color: THEME.inkSoft }).setPosition(0, -2, 0);
        label(vpanel, '健康游戏忠告：抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。', 16, { color: THEME.inkSoft })
            .setPosition(0, -34, 0);
        // M9b 真机联调：长按版本信息面板 1.5s 弹出社交管线自检（生产无副作用，正常点击不触发）
        this.enableLongPress(vpanel, () => this.showSocialDiag(n));

        // 底部吉语
        label(n, '道历庚子 · 天道酬勤 · 顺遂无虞', 18, { color: THEME.inkSoft })
            .setPosition(0, -470, 0);
    }

    private buildDivider(parent: Node, y: number, w: number) {
        const div = uinode('divider', parent, w, 2);
        div.setPosition(0, y, 0);
        const g = div.addComponent(Graphics);
        g.strokeColor = faded(THEME.bronze, 100);
        g.lineWidth = 1;
        g.moveTo(-w / 2, 0);
        g.lineTo(w / 2, 0);
        g.stroke();
    }

    // ---------- 开关单项 ----------
    private buildToggleItem(parent: Node, y: number, text: string, initial: boolean, onChange: (on: boolean) => void) {
        // label 宽 360，中心位于 -90，左缘对齐在 -270
        label(parent, `✦ ${text}`, 28, { bold: true, color: THEME.ink, align: 'left', width: 360 })
            .setPosition(-90, y, 0);

        // 开关：胶囊 + 滑块
        const swW = 92;
        const swH = 46;
        const sw = uinode('switch', parent, swW, swH);
        sw.setPosition(225, y, 0);
        const g = sw.addComponent(Graphics);
        let isOn = initial;
        let knob: Node | null = null;

        const draw = () => {
            g.clear();
            g.fillColor = isOn ? THEME.gold : THEME.mist;
            g.roundRect(-swW / 2, -swH / 2, swW, swH, swH / 2);
            g.fill();
            g.strokeColor = THEME.border;
            g.lineWidth = 2;
            g.roundRect(-swW / 2, -swH / 2, swW, swH, swH / 2);
            g.stroke();
            if (knob) knob.setPosition(isOn ? swW / 2 - swH / 2 : -(swW / 2 - swH / 2), 0, 0);
        };
        knob = uinode('knob', sw, swH - 10, swH - 10);
        const kg = knob.addComponent(Graphics);
        kg.fillColor = new Color(255, 255, 255, 255);
        kg.circle(0, 0, (swH - 10) / 2);
        kg.fill();
        draw();

        const btn = sw.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.94;
        btn.target = sw;
        sw.on(Button.EventType.CLICK, () => {
            isOn = !isOn;
            draw();
            onChange(isOn);
        });
    }

    // ---------- 文本链接单项 ----------
    private buildLinkItem(parent: Node, y: number, text: string, onTap: () => void) {
        const item = uinode('linkItem', parent, 610, 52);
        item.setPosition(0, y, 0);
        // 左缘严格对齐：中心在 -75，宽度 390 → 左缘在 -270
        label(item, `✦ ${text}`, 26, { color: THEME.goldLight, align: 'left', width: 390 })
            .setPosition(-75, 0, 0);
        label(item, '›', 32, { bold: true, color: THEME.inkSoft })
            .setPosition(265, 0, 0);

        const btn = item.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.98;
        btn.target = item;
        item.on(Button.EventType.CLICK, onTap);
    }

    // ---------- 弹窗入口 ----------
    private showProbability() {
        showProbabilityDialog(this.node);
    }

    private showAgreement() {
        showAgreementDialog(this.node);
    }

    private showPrivacy() {
        showPrivacyDialog(this.node);
    }

    // ---------- M9b 真机联调诊断 ----------

    /** 长按触发（1.5s）：在不改动正常交互的前提下，给真机联调一个只读自检入口 */
    private enableLongPress(node: Node, cb: () => void) {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const cancel = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        };
        node.on(Node.EventType.TOUCH_START, () => {
            timer = setTimeout(cb, 1500);
        });
        node.on(Node.EventType.TOUCH_END, cancel);
        node.on(Node.EventType.TOUCH_CANCEL, cancel);
    }

    /** 上线自检面板：广告位配置（B1）+ 社交管线状态（M9b），只读，正常点击不触发 */
    private showSocialDiag(parent: Node) {
        const d = DouyinSocial.getDiag();
        const ad = Ads.auditConfig();
        const adLine =
            `广告位配置: ${ad.configured}/${ad.total}` +
            (ad.missing.length
                ? ` · 未配 ${ad.missing.map((p) => AD_PLACES[p].name).join('、')}`
                : ' · 全部就绪');
        const lines = [
            adLine,
            `运行环境(抖音 tt): ${d.runtime ? '是' : '否'}`,
            `开放数据域可用: ${d.available ? '是' : '否'}`,
            `共享画布尺寸: ${d.sharedCanvas ? `${d.sharedCanvas.w}×${d.sharedCanvas.h}` : '无'}`,
            `请求好友榜次数: ${d.rankRequestCount}`,
            `对比回传次数: ${d.compareCount}`,
            `上次上报三榜: ${d.lastReport ? JSON.stringify(d.lastReport.values) : '无（未触发上报）'}`,
            `上次对比结果: ${d.lastCompare ? `超越 ${d.lastCompare.beat}/${d.lastCompare.total} · 最高 ${d.lastCompare.top}` : '无'}`,
            `末次错误: ${d.lastError || '无'}`,
        ];
        const panel = spritePanel(parent, 660, 580, undefined, THEME.tintPanel);
        panel.setPosition(0, 0, 50);
        label(panel, '上线自检 · 广告位 + 社交管线', 27, { bold: true, color: THEME.goldLight }).setPosition(0, 240, 0);
        const body = uinode('diagBody', panel, 620, 420);
        body.setPosition(0, -10, 0);
        lines.forEach((t, i) => {
            // 首行是广告位配置：漏配用警示色，全配用墨色，便于一眼判定
            const color = i === 0 && ad.missing.length > 0 ? THEME.danger : THEME.ink;
            label(body, t, 21, { color, align: 'left', width: 600 })
                .setPosition(-290, 170 - i * 40, 0);
        });
        const close = spriteButton(panel, 240, 72, '关闭', () => panel.destroy(), {
            fontSize: 26,
            variant: 'secondary',
            textColor: THEME.paper,
        });
        close.node.setPosition(0, -246, 0);
    }
}
