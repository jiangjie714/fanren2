import { Node, ResolutionPolicy, Widget, view } from 'cc';
import { Rng } from '../core/rng';
import { SaveData } from '../core/saveModel';
import { OfflineGain } from '../core/offline';
import { AchievementSystem } from '../core/systems/AchievementSystem';
import { AlchemySystem } from '../core/systems/AlchemySystem';
import { BoxSystem } from '../core/systems/BoxSystem';
import { CheckinSystem } from '../core/systems/CheckinSystem';
import { OfflineSystem } from '../core/systems/OfflineSystem';
import { CollectionSystem } from '../core/systems/CollectionSystem';
import { CombatSystem } from '../core/systems/CombatSystem';
import { EconomySystem } from '../core/systems/EconomySystem';
import { IllusionSystem } from '../core/systems/IllusionSystem';
import { QuestSystem } from '../core/systems/QuestSystem';
import { RainSystem } from '../core/systems/RainSystem';
import { TrailSystem } from '../core/systems/TrailSystem';
import { TowerSystem } from '../core/systems/TowerSystem';
import { TrialSystem } from '../core/systems/TrialSystem';
import { RealmSystem } from '../core/systems/RealmSystem';
import { TEXTS } from '../core/config/texts';
import { toast, uinode } from '../ui/ThemeLib';
import { ALIGN } from './Align';
import { Ads } from './Ads';
import { AudioMgr } from './AudioMgr';
import { DouyinAdProvider, isDouyinRuntime } from './DouyinAd';
import { DouyinSocial } from './DouyinSocial';
import { SaveStore } from './SaveStore';
import { SceneStack } from './SceneStack';
import { GuideLayer } from '../ui/GuideLayer';
import { HomeScene } from '../scenes/HomeScene';
import { ProfileScene } from '../scenes/ProfileScene';

/** 全局游戏上下文：装配基础设施与数值系统，页面统一通过 Game.xxx 访问。 */
export class Game {
    static stack: SceneStack;
    static save: SaveData;
    static rng: Rng;
    static eco: EconomySystem;
    static combat: CombatSystem;
    static alchemy: AlchemySystem;
    static realm: RealmSystem;
    static box: BoxSystem;
    static rain: RainSystem;
    static col: CollectionSystem;
    static quests: QuestSystem;
    /** M15 妖径（历练重构）：爬关进度/结算/重刷护栏 */
    static trail: TrailSystem;
    /** M22 剑冢试炼：淬剑经济 / 局状态机 / 主线回灌日封顶（塔内独立数值，不外溢主线程） */
    static tower: TowerSystem;
    static illusion: IllusionSystem;
    static trial: TrialSystem;
    static ach: AchievementSystem;
    /** M26 连续登录签到：七日轮回 + 累计里程碑（#53） */
    static checkin: CheckinSystem;
    /** M29 离线吐纳：在线心跳 / 归来结算（#55） */
    static offline: OfflineSystem;
    static social: DouyinSocial;

    /**
     * M29：本次归来结算出的离线所得（**运行时字段，不落存档**）。
     *
     * 为什么不由 HomeScene 自己触发结算：`Game.init` / `onForeground` 才是「回来」
     * 的唯一确定时刻 —— 若等到首页构建才结算，从二级页离开的那次会被随后一小段
     * 在线时间把 `lastAt` 推进掉，收益凭空蒸发。这里先落袋，再交给首页做演出。
     */
    static offlineResult: OfflineGain | null = null;
    /** 心跳累加器（秒）—— 每秒刷新一次 lastAt，不必每帧写 */
    private static heartbeatAcc = 0;

    /** root: GameRoot 节点（场景根子节点，非 Canvas 层级） */
    static init(root: Node) {
        // 保证真机全屏适配：固定 720 宽，高度按屏幕自适应延伸（消除上下黑边与留白）
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);

        // 全局错误钩子
        installErrorHook();

        // 广告服务：抖音端用 tt 激励视频，Web 调试用模拟弹窗
        if (isDouyinRuntime()) Ads.setProvider(new DouyinAdProvider());

        // 存档与系统装配
        this.save = SaveStore.load();
        this.rng = new Rng();
        this.eco = new EconomySystem(this.save);
        this.combat = new CombatSystem(this.eco, this.rng);
        this.alchemy = new AlchemySystem(this.eco);
        this.combat.attachAlchemy(this.alchemy);
        this.col = new CollectionSystem();
        // 修为获取加成 = 灵根图鉴加成（含基数 1）+ 炼丹「智力」四维加成（乘算叠加）
        this.eco.xiuweiBonusProvider = () => this.col.totalBonus(this.save) + this.alchemy.wisdomXiuweiBonus(this.save);
        this.realm = new RealmSystem(this.save, this.eco, this.rng);
        // 突破成功率加成 = 炼丹「机缘」四维（加算进 clamp 前）
        this.realm.fateBonusProvider = () => this.alchemy.fateRateBonus(this.save);
        this.box = new BoxSystem(this.save, this.eco, this.rng);
        this.rain = new RainSystem(this.rng);
        this.quests = new QuestSystem(this.eco);
        this.trail = new TrailSystem(this.eco, this.alchemy, this.rng);
        this.tower = new TowerSystem(this.eco, this.alchemy);
        this.illusion = new IllusionSystem(this.eco, this.alchemy);
        this.trial = new TrialSystem(this.eco, this.alchemy);
        this.ach = new AchievementSystem(this.eco);
        this.checkin = new CheckinSystem(this.eco, this.alchemy);
        this.offline = new OfflineSystem(this.eco);
        this.social = new DouyinSocial();
        this.eco.dailyReset();
        this.settleOffline();
        this.illusion.checkWeek(this.save);
        this.trial.checkWeek(this.save); // M14：秘境赛季周键（周一 0 点换周）
        this.eco.claimMonthlyTicket(); // 月卡每日特权：发 1 张修真宝盒券（#14，购买入口待版号）
        this.ach.check(this.save); // 登录即扫描成就（论道页红点/领取态）
        this.persist();
        this.social.reportScores(this.save); // M9b：排行榜云存储上报（非抖音端 no-op）
        installLifecycleHooks();
        // 调试手柄：开发者工具模拟器（platform=devtools）与浏览器的 Console/CDP 可直接驱动
        // （__fanren.Game.save 等）；真机包不暴露。
        const tt = (globalThis as any).tt;
        const ideSimulator = typeof tt?.getSystemInfoSync === 'function' && tt.getSystemInfoSync().platform === 'devtools';
        if (this.isWebDebug || ideSimulator) {
            (globalThis as any).__fanren = Game; // IDE 自带 Console 可在游戏域求值
            console.log(`[fanren] env=${ideSimulator ? 'simulator' : 'web'} handle=on`);
        }

        // 场景栈根节点放在 Canvas 之下，随屏幕适配
        const canvas = root.scene.getChildByName('Canvas')!;
        const sceneRoot = uinode('SceneRoot', canvas, 720, 1280);
        const widget = sceneRoot.addComponent(Widget);
        widget.alignFlags = ALIGN.TOP | ALIGN.BOT | ALIGN.LEFT | ALIGN.RIGHT;
        widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;

        this.stack = new SceneStack(sceneRoot);
        // M27 新手引导层：SceneRoot **之后**添加 → 永远盖在当前页面之上（见 GuideLayer 头注释）。
        GuideLayer.attach(canvas);
        // M11：未捏人（含 v3 升档老玩家）先进捏人流，确认道号后再入主页
        this.stack.push(this.save.profile.name ? new HomeScene() : new ProfileScene());
    }

    static tick(dt: number) {
        this.stack?.update(dt);
        // M29 离线吐纳：每秒把 lastAt 推到此刻，使「离线时长」只统计真正没在玩的时间
        this.heartbeatAcc += dt;
        if (this.heartbeatAcc >= 1) {
            this.heartbeatAcc = 0;
            this.offline?.touch(this.save);
        }
        // M27 新手引导：每帧同步，内部只比一个 key，未变则零开销
        GuideLayer.sync();
    }

    /**
     * M29 离线吐纳结算（启动 / 回到前台时调用）：把「回来」这个时刻的离线时长
     * 一次性落袋，并暂存本次所得供首页做归来弹窗演出。
     *
     * 结算本身幂等（额度累加与心跳前移在同一次调用里完成），重复调用最多得到
     * `null`（没有新的离线时间），不会二次发放。
     */
    static settleOffline(now: number = Date.now()): OfflineGain | null {
        if (!this.save || !this.offline) return null;
        const got = this.offline.settle(this.save, now);
        if (!got) return null;
        this.offlineResult = got;
        this.persist();
        return got;
    }

    /** 扫描成就：新达成立即落盘并提示（场景层在开箱/结算/合成等关键事件后调用） */
    static checkAchievements(node?: Node) {
        const fresh = this.ach.check(this.save);
        if (!fresh.length) return;
        this.persist();
        fresh.forEach((a) => {
            if (node) toast(node, TEXTS.achieveNew(a.name), 26);
        });
    }

    /** 数值变化后调用，落盘存档 */
    static persist() {
        SaveStore.persist(this.save);
    }

    /** 回到前台（抖音 onShow / Web visibilitychange）：跨天重置每日状态并刷新当前页 */
    static onForeground() {
        if (!this.save) return;
        // M29 离线吐纳：回来就结算（无论是否跨天），产出暂存给首页弹窗
        this.settleOffline();
        const dayChanged = this.eco.dailyReset();
        const weekChanged = this.illusion.checkWeek(this.save) || this.trial.checkWeek(this.save);
        if (dayChanged || weekChanged) {
            // 跨天后补发月卡每日券：与 init 的发放顺序保持一致。
            // 旧版漏调 → 月卡用户跨天必须杀进程重启才拿到券（P0-4）。
            this.eco.claimMonthlyTicket();
            this.persist();
            this.social.reportScores(this.save);
            this.stack?.top?.onResume?.();
        }
    }

    /** 当前 Web 调试环境（抖音端 false） */
    static get isWebDebug(): boolean {
        return typeof document !== 'undefined';
    }
}

function installLifecycleHooks() {
    const g = globalThis as Record<string, any>;
    const tt = g.tt as { onHide?: (cb: () => void) => void; onShow?: (cb: () => void) => void } | undefined;
    if (tt?.onHide && tt?.onShow) {
        tt.onHide(() => AudioMgr.onBackground());
        tt.onShow(() => {
            Game.onForeground();
            AudioMgr.onForeground();
        });
        return;
    }
    if (typeof document !== 'undefined' && document.addEventListener && !g.__fanrenLifecycle) {
        g.__fanrenLifecycle = true;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                AudioMgr.onBackground();
            } else {
                Game.onForeground();
                AudioMgr.onForeground();
            }
        });
    }
}

function installErrorHook() {
    if (typeof window === 'undefined' || !window.addEventListener || (window as any).__fanrenErrHook) return;
    (window as any).__fanrenErrHook = true;
    const show = (msg: string) => {
        console.error('[fanren]', msg);
        if (typeof document === 'undefined') return;
        let box = document.getElementById('fanren-err');
        if (!box) {
            box = document.createElement('div');
            box.id = 'fanren-err';
            box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:40%;overflow:auto;background:rgba(120,20,20,.92);color:#fff;font:12px/1.5 monospace;padding:6px 8px;z-index:99999;white-space:pre-wrap;';
            document.body?.appendChild(box);
        }
        box.textContent += msg + '\n\n';
    };
    window.addEventListener('error', (e) => show('ERROR: ' + e.message + '\n' + (e.error?.stack ?? '')));
    window.addEventListener('unhandledrejection', (e) => show('REJECTION: ' + (e.reason?.stack ?? e.reason)));
}
