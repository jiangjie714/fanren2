import { Camera, Color, Graphics, Layers, Node } from 'cc';
import { IScene } from '../infra/SceneStack';
import { Game } from '../infra/Game';
import { Analytics } from '../infra/Analytics';
import { Share } from '../infra/Share';
import { TEXTS } from '../core/config/texts';
import { Modifier } from '../core/tianjie';
import { TianjieRunResult, TianjieView } from '../core/systems/TianjieSystem';
import {
    THEME,
    faded,
    fadeIn,
    label,
    spriteButton,
    toast,
    uinode,
    visibleHeight,
    visibleWidth,
} from '../ui/ThemeLib';

/** 分享卡尺寸（竖屏 3:4，抖音图文/私信预览不裁切；比例与 720×960 一致） */
export const SHARE_CARD = { w: 720, h: 960 } as const;

export interface TianjieShareParams {
    run: TianjieRunResult;
    view: TianjieView;
}

/**
 * 天劫战绩卡（M36 第二个交付物）：把「今日分数 + 词条 + 击败/超越关系」合成一张可分享的竖图。
 *
 * **为什么单独一页**：`ResultScene` 是一屏密集信息（明细/按钮/好友对比），直接把整屏当截图分享
 * 会带上按钮和「再战」这类私域元素（不该出现在分享图里）。这里用独立 Canvas 起一个脱屏渲染，
 * 卡面只保留「值得炫耀的 5 个数字」，再走 `tt.toTempFilePath` 合成临时图 → `Share.share({imageUrl})`。
 *
 * **Web 端降级**：没有 toTempFilePath 时只展示卡面 + toast（调试期看版式），不发分享。
 * **失败必回收**：离屏 Canvas/Camera 不销毁会造成每次点分享多一份 GPU 资源（真机内存杀手）。
 */
export class TianjieShareScene implements IScene {
    node: Node;
    private p: TianjieShareParams;
    private cardRoot: Node | null = null;
    private exporting = false;

    constructor(params: TianjieShareParams) {
        this.node = new Node('TianjieShareScene');
        this.node.layer = Layers.Enum.UI_2D;
        this.p = params;
    }

    onEnter() {
        const n = this.node;
        // 背景：整屏压暗，卡面居中，四周留出「预览边」
        const bg = uinode('shareBg', n, visibleWidth(), visibleHeight());
        const g = bg.addComponent(Graphics);
        g.fillColor = faded(THEME.void, 232);
        g.roundRect(-visibleWidth() / 2, -visibleHeight() / 2, visibleWidth(), visibleHeight(), 0);
        g.fill();
        bg.on(Node.EventType.TOUCH_END, () => { /* 吸点击：卡外不穿透 */ });

        // 卡面本体（与导出的 720×960 同版式，只是整体缩放 0.62 预览）
        const card = this.buildCard(false);
        const holder = uinode('cardHolder', n, SHARE_CARD.w, SHARE_CARD.h);
        holder.addChild(card);
        holder.setPosition(0, 40, 0);
        holder.setScale(0.62, 0.62, 1);

        // 底部按钮：保存/分享 + 返回
        spriteButton(n, 420, 92, '分享战报', () => this.exportAndShare(), {
            fontSize: 32,
            variant: 'primary',
            textColor: THEME.void,
        }).node.setPosition(0, 40 - SHARE_CARD.h * 0.62 / 2 - 70, 0);
        spriteButton(n, 260, 80, '返回', () => Game.stack.pop(), {
            fontSize: 26,
            variant: 'secondary',
            textColor: THEME.paper,
        }).node.setPosition(0, -visibleHeight() / 2 + 120, 0);
        fadeIn(holder, 18);
    }

    onExit() {
        this.cardRoot?.destroy();
        this.cardRoot = null;
    }

    onResume() {
        // 静态战报页：无子页压栈，无动态区块需要刷新
    }

    // ---------------- 卡面 ----------------

    /**
     * 构建卡面节点树。
     * @param detached true = 导出用（尺寸固定 720×960），false = 预览用（同尺寸但缩放到预览区）
     */
    private buildCard(detached: boolean): Node {
        const { run, view } = this.p;
        // 用 uinode 建根：与 ThemeLib 的节点创建约定一致（layer=UI_2D + 居中锚点 + 尺寸），
        // 也便于截图脚本/测试按名字定位「card / shareCard」
        const root = uinode(detached ? 'shareCard' : 'card', null, SHARE_CARD.w, SHARE_CARD.h);

        // ① 底：纯黑打底（分享图会被贴到各种背景上，不能透出预览页的深色底），
        //    再加一层低透明度金/紫光环做「仙气」。光环半径刻意 < 卡宽/2，避免溢出成方框外的圆。
        const base = uinode('base', root, SHARE_CARD.w, SHARE_CARD.h);
        const gb = base.addComponent(Graphics);
        gb.fillColor = new Color(8, 6, 18, 255);
        gb.rect(-SHARE_CARD.w / 2, -SHARE_CARD.h / 2, SHARE_CARD.w, SHARE_CARD.h);
        gb.fill();
        // 光晕圆心与半径都限制在卡内（左右各留 ≥60），避免像「一个圆盘压在卡上」
        // 不做整块光晕：Graphics 无渐变/无模糊，任何 alpha 的实心圆在分享图上都会变成一块
        // 明显的「土黄圆盘」（实测 110/38 都脏）。改用分数自身发光 + 一条金色装饰线表达层级。
        // 金线内框
        gb.strokeColor = faded(THEME.goldLight, 150);
        gb.lineWidth = 3;
        gb.roundRect(-SHARE_CARD.w / 2 + 22, -SHARE_CARD.h / 2 + 22, SHARE_CARD.w - 44, SHARE_CARD.h - 44, 20);
        gb.stroke();

        // ② 头：游戏名 + 今日种子
        label(root, '凡 人 开 仙 缘', 30, { bold: true, color: THEME.goldLight }).setPosition(0, SHARE_CARD.h / 2 - 70, 0);
        label(root, `每日天劫 · ${TEXTS.tianjieSeed(view.seed)}`, 20, { color: THEME.inkSoft })
            .setPosition(0, SHARE_CARD.h / 2 - 112, 0);

        // ③ 主体：分数（最大元素）
        label(root, String(run.score), 190, { bold: true, color: THEME.goldLight }).setPosition(0, 150, 0);
        // 分数下的金色装饰线（两条：中央短金线 + 两侧暗线），替代光晕做「聚焦」表达
        const deco = uinode('deco', root, 320, 4);
        deco.setPosition(0, 2, 0);
        const gd = deco.addComponent(Graphics);
        gd.fillColor = faded(THEME.goldLight, 220);
        gd.rect(-40, -2, 80, 4);
        gd.fill();
        gd.fillColor = faded(THEME.goldDeep, 120);
        gd.rect(-160, -1, 110, 2);
        gd.fill();
        gd.rect(50, -1, 110, 2);
        gd.fill();
        label(root, run.rating, 46, { bold: true, color: THEME.paper }).setPosition(0, 40, 0);

        // ④ 三个数字行：金/清/劫 + 连击
        const stats: Array<[string, string]> = [
            ['金雨', `${run.result.goldCount}`],
            ['清雨', `${run.result.blueCount}`],
            ['劫雨', `${run.result.redCount}`],
            ['最大连击', `${run.result.maxCombo}`],
        ];
        stats.forEach(([k, v], i) => {
            const x = -240 + i * 160;
            label(root, v, 44, { bold: true, color: THEME.paper }).setPosition(x, -52, 0);
            label(root, k, 19, { color: THEME.inkSoft }).setPosition(x, -92, 0);
        });

        // ⑤ 词条行（可讨论点：同一天大家都是这组）
        this.renderMods(root, view.mods, -168);

        // ⑥ 关系行：今日/历史/周最佳/连续
        label(root, `${TEXTS.tianjieTodayBest(view.todayBest)}　·　${TEXTS.tianjieWeekBest(view.weekBest)}`, 22, {
            color: THEME.rainGold,
            width: 620,
            shrink: true,
        }).setPosition(0, -248, 0);
        if (run.newBest) {
            label(root, TEXTS.tianjieNewBest, 30, { bold: true, color: THEME.goldLight }).setPosition(0, -292, 0);
        }
        label(root, view.streak > 0 ? TEXTS.tianjieStreak(view.streak) : TEXTS.tianjieStreakZero, 22, {
            color: THEME.paper,
        }).setPosition(0, -334, 0);

        // ⑦ 页脚：标语（品牌位，弱化）
        label(root, '8 秒 · 同一场雨 · 比的是手', 20, { color: THEME.inkSoft })
            .setPosition(0, -SHARE_CARD.h / 2 + 60, 0);
        return root;
    }

    private renderMods(root: Node, mods: Modifier[], y: number) {
        if (!mods.length) return;
        label(root, '今日词条', 18, { color: THEME.inkSoft }).setPosition(0, y + 34, 0);
        const w = 190;
        const pitch = w + 10;
        const startX = -((mods.length - 1) * pitch) / 2;
        mods.forEach((m, i) => {
            const chip = uinode('chip', root, w, 44);
            chip.setPosition(startX + i * pitch, y - 10, 0);
            const g = chip.addComponent(Graphics);
            g.fillColor = faded(m.negative ? THEME.cinnabar : THEME.slate, 200);
            g.roundRect(-w / 2, -22, w, 44, 10);
            g.fill();
            g.strokeColor = faded(m.negative ? THEME.rainRed : THEME.goldLight, 170);
            g.lineWidth = 2;
            g.roundRect(-w / 2, -22, w, 44, 10);
            g.stroke();
            label(chip, m.name, 18, {
                bold: true,
                color: m.negative ? THEME.paper : THEME.goldLight,
                width: w - 14,
                shrink: true,
            });
        });
    }

    // ---------------- 导出 ----------------

    /**
     * 导出战报图并分享。
     * 抖音：临时 Canvas + Camera 渲染 cardRoot → `tt.toTempFilePath` → `Share.share({ imageUrl })`。
     * 失败/非抖音：toast 降级（不阻断页面）。
     */
    private exportAndShare(): void {
        if (this.exporting) return; // 连点保护：导出是重操作，重复点击会叠多张纹理
        const title = TEXTS.tianjieShareTitle(this.p.run.score, this.p.run.rating);
        const tt = (globalThis as any).tt;
        if (!tt || typeof tt.toTempFilePath !== 'function') {
            // Web 调试：卡面即所见即所得，直接 toast 提示不可分享
            toast(this.node, TEXTS.shareUnavailable);
            this.shareWithReport(title);
            return;
        }
        this.exporting = true;
        const off = new Node('shareOffscreen');
        off.layer = Layers.Enum.UI_2D;
        const card = this.buildCard(true);
        off.addChild(card);
        const camNode = new Node('shareCamera');
        const cam = camNode.addComponent(Camera);
        cam.clearColor = new Color(11, 8, 23, 255);
        cam.orthoHeight = SHARE_CARD.h / 2;
        cam.visibility = Layers.Enum.UI_2D;
        off.addChild(camNode);
        this.cardRoot = off;
        try {
            // 让离屏相机在本帧渲染：Cocos 3.8 需把节点挂到活动场景，直接 addChild 到当前场景根
            this.node.scene?.addChild(off);
            Game.tick(0); // 推一帧，确保 Graphics 已提交到渲染队列
            tt.toTempFilePath({
                x: 0,
                y: 0,
                width: SHARE_CARD.w,
                height: SHARE_CARD.h,
                destWidth: SHARE_CARD.w,
                destHeight: SHARE_CARD.h,
                success: (res: { tempFilePath?: string }) => {
                    this.exporting = false;
                    this.releaseOffscreen();
                    const path = res?.tempFilePath;
                    if (!path) {
                        toast(this.node, TEXTS.shareUnavailable);
                        return;
                    }
                    this.shareWithReport(title, path);
                },
                fail: () => {
                    this.exporting = false;
                    this.releaseOffscreen();
                    toast(this.node, TEXTS.shareUnavailable);
                },
            });
        } catch {
            this.exporting = false;
            this.releaseOffscreen();
            toast(this.node, TEXTS.shareUnavailable);
        }
    }

    /**
     * 发起分享并记埋点：`share_result` 的 result 区分 success / fail / unavailable。
     * 只统计，不发任何奖励（合规：分享不能是必须动作）。
     */
    private shareWithReport(title: string, imageUrl?: string): void {
        const score = this.p.run.score;
        const ok = Share.share({
            title,
            imageUrl,
            onSuccess: () => Analytics.track('share_result', { scene: 'tianjie', result: 'success', score }),
            onFail: () => Analytics.track('share_result', { scene: 'tianjie', result: 'fail', score }),
        });
        if (!ok) Analytics.track('share_result', { scene: 'tianjie', result: 'unavailable', score });
    }

    /** 离屏节点回收（幂等）：不回收 = 每次分享多一份 GPU 资源 */
    private releaseOffscreen(): void {
        if (this.cardRoot) {
            this.cardRoot.destroy();
            this.cardRoot = null;
        }
    }
}
