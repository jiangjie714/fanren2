# 凡人开仙缘

国风修仙开箱 + 境界突破手操小游戏（抖音小游戏 / Cocos Creator 3.8.8 + TypeScript）。

> 玩法循环：开仙缘宝盒（蓄力共鸣 → 保底机制 → 圆满三连）→ 积累机缘 → 大境界突破 → 【灵气雨】8 秒手操（三波编排：蕴雨/灵雨潮/劫云压顶，连击、聚灵咒、渡劫评分）→ 晋升或失败 → 循环养成。
> 另有日常循环（修行任务/云游历练/心魔幻境）、成就、好友排行榜、论武切磋等长线内容。

## 环境要求

- **Cocos Creator 3.8.8**（用 Cocos Dashboard 打开本工程）
- Node.js ≥ 18（单测与构建脚本用）
- 抖音开发者工具（真机预览/上传前安装：developer.open-douyin.com）

## 常用命令

```bash
npm install            # 安装 vitest / typescript（首次）
npm test               # 运行 105 个数值/玩法单测（数值核心/导航回归/M7 交互/M8 日常/M9 成就/排行解码/数值护栏/战斗）
npm run build:web      # 构建 web-mobile（本机预览验证用）
npm run build:douyin   # 构建 bytedance-mini-game（抖音交付物）
```

- 构建产物在 `build/<平台>/`；`tools/build.mjs` 会自动补拷构建期偶发丢失的 chunk 并注入启动看门狗。
- 本地预览 web 构建版：`node tools/preview-server.mjs build/web-mobile 8321`，浏览器开 `http://127.0.0.1:8321`。
- 也可以直接用 Cocos Creator 编辑器预览（编辑器内点 ▶）。

## 目录结构

```
assets/
├── main.scene            # 唯一场景：Canvas + GameRoot，其余 UI 全代码构建
└── scripts/
    ├── core/             # 纯数值逻辑（零 cc 依赖，可单测）
    │   ├── config/       # 12 个配置：境界/宝箱/雨滴/经济/灵根/广告/内购/文案
    │   │                 #   + M8 任务/历练/幻境 + M9a 成就
    │   └── systems/      # 11 个系统：Box/Realm/Rain/Economy/Collection
    │   │                 #   + Quest/Expedition/Illusion/Achievement/StatsRecorder
    ├── infra/            # Game(装配+生命周期)/存档/广告(模拟+tt)/社交上报桩/音频/场景栈
    ├── ui/               # 程序化国风 UI 库（ThemeLib/弹窗/状态栏/合规弹窗）
    └── scenes/           # 14 个页面（含修行/历练/论道/幻境结算）
tests/                    # Vitest 8 文件 105 例：core(27)/nav/m7/m8/m9/m9b(8)/balance/combat
tools/                    # build.mjs(双端构建+后处理+子域注入) / preview-server.mjs
                          # generate-art.py(美术+meta) / m7|m8|m9-shots.mjs(回归截图) / uuid.mjs
open-data-context/        # M9b 开放数据域子域（纯 JS 好友榜渲染/对比，构建时自动拷入抖音产物）
build/bytedance-mini-game/  # 抖音交付物（game.json 等，构建生成）
```

## 广告位接入（上线前必填）

`assets/scripts/core/config/ads.ts` → `DOUYIN_AD_UNIT_IDS`，六个广告位（每日仙缘 / 净化劫雨 / 渡劫护道 / 修为加倍 / 历练召回 / 幻境加次）上线前在字节小游戏后台申请并填入。未填 ID 时广告点击自动降级为"跳过"（不发奖），不会报错。

Web 调试端使用模拟广告弹窗（3 秒倒计时自动成功），所有广告均由玩家主动点击触发（合规要求）。

**好友排行榜（M9b）**：`open-data-context/` 子域工程已随包构建（build.mjs 自动注入 `game.json.openDataContext`）。抖音端论道页显示好友榜、结算页显示"超越 n/m 位好友"；Web 端与子域不可用时自动降级为虚拟道友目标线。上报走 `tt.setUserCloudStorage`（`infra/DouyinSocial.ts`）。**联调**：开发者工具（关系链模拟数据）→ 真机预览。

## 抖音上线清单（你需要准备的）

1. **抖音开发者工具（导入必须按此步骤）**：
   - `npm run build:douyin` 后，导入目录必须是 **`build/bytedance-mini-game/`**（不是项目根目录——根目录没有 game.json，工具会判定无效项目）；
   - **AppID 已自动配置**：构建脚本会把正式 AppID（`tools/build.mjs` 顶部 `DOUYIN_APPID` 常量，当前 `tt93ffe5420d87d89502`）注入 `project.config.json`——Cocos CLI 自身只会输出 `testappId` 占位符，换账号/换 AppID 时改那个常量即可；
   - 工具右上角「详情 → 本地设置」勾选「不校验合法域名」（构建时已自动把 `urlCheck` 置为 false，旧产物需手动勾）；
   - 「详情 → 调试器」打开 Console：白屏时先看这里的红色报错；
   - 若模拟器白屏且 Console 无报错：工具菜单「项目 → 重新编译」，并确认基础库为较新版本（工具详情面板可切换）；
   - 构建脚本会在产物不完整（构建被打断）时直接报错退出——**看到 `[build] ❌ 产物不完整` 就重跑一次 `npm run build:douyin`，不要导入半成品**。
2. **字节小程序开发者账号 + 小游戏 AppID**：开发/上传必需（AppID 已配置在 `tools/build.mjs`，构建时自动注入产物）
3. **游戏软著**：抖音小游戏上线审核必需材料
4. **版号**：仅当要开启内购（仙尊月卡/外观）时必需；无版号保持 `core/config/iap.ts` 的 `IAP_ENABLED = false`（内购入口自动隐藏，纯广告变现合规）
5. **流量主/广告位**：上线且满足流量条件后申请 6 个激励视频广告位 ID（见上节）
6. **用户协议 / 隐私政策页面 URL**：设置页与首页底部需要外链（当前为占位文案）
7. **包体积**：✅ 已达标（2026-10-05）——美术迁入 `subres` 分包（构建扩展自动重组产物）+ 功能裁剪关闭 physics-2d/spine/dragon-bones 等零依赖模块 + 面板任务持久化引擎分离，**主包 1.18MB + 分包 0.95MB（总 2.12MB）**，远低于主包 4MB/单分包 4MB 硬限。真机调试/提审产物用 `node tools/douyin-editor-build.mjs` 一键构建（前置：编辑器带 `--remote-debugging-port=9333` 打开工程）；`npm run build:douyin` 的 CLI 产物含全部注入但无引擎分离（≈4.5MB，预览可用）。分包目录的 `game.js` 入口桩由构建扩展自动生成（抖音校验器硬性要求）
8. **合规自查**（PRD 红线，代码已满足）：无赌博暗示词汇、概率公示（设置页/首页底部）、广告不强制弹出、内购不影响突破概率

## 已验证的机制（对应 PRD 第六节测试用例）

| 用例 | 状态 |
|---|---|
| 开箱保底：连续 3 次低收益，第 4 次必出稀有；稀有重置计数、劫难不重置 | ✅ 单测+实机 |
| 灵气雨数值：金雨/劫雨/清雨护盾/心魔干扰的概率合成，10%~95% 边界 | ✅ 单测+实机 |
| 净化劫雨：单局 1 次，期间不生成劫雨 | ✅ 单测 |
| 突破边界：95% 仍可失败、10% 仍可成功 | ✅ 单测 |
| 继续求索：单次会话最多 2 次 | ✅ 单测+实机 |
| 广告全主动触发 | ✅ 实机（Web 模拟） |
| 内购不影响概率 | ✅ 设计保证（内购未开放） |
