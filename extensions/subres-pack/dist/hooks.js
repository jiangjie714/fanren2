'use strict';

const fs = require('fs');
const path = require('path');

/**
 * subres 美术分包（Cocos Creator 3.8.8 + 抖音小游戏）
 *
 * 背景：bundle 的「小游戏分包」压缩类型在 3.8 里由构建面板「Bundle 配置」驱动，
 * .meta 的 compressionType 已不被读取；CLI 参数串无法承载该配置（JSON 被 `;` 分割
 * 破坏 / 校验回退），且 onBeforeBuild 钩子收到的 options 是副本（已实验证实，改动
 * 不会传导到管线）。因此这里在 onAfterBuild（产物已落盘的最后阶段）直接按引擎的
 * 官方分包布局做磁盘重组：
 *
 *   build/<output>/assets/subres  →  build/<output>/subpackages/subres
 *   game.json                    +=  subpackages: [{root: "subpackages/subres", name: "subres"}]
 *   src/settings.json             →  assets.subpackages: ["subres"]
 *
 * 运行时契约（逆向产物 engine-adapter.js 确认）：引擎 assetManager.init 读
 * settings.assets.subpackages，对其中 bundle 先 tt.loadSubpackage({name})，再从
 * subpackages/<名>/config.json 加载、base=subpackages/<名>/。与上面布局严格对应。
 *
 * 扩展钩子在 CLI 构建与 IDE 构建中都会执行，IDE 的「真机调试」产物同样带分包。
 */
exports.onAfterBuild = function (options) {
    if (options.platform !== 'bytedance-mini-game') return;

    const projectName = (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path) || process.cwd();
    const root = path.join(projectName, 'build', options.outputName || 'bytedance-mini-game');
    const src = path.join(root, 'assets', 'subres');
    const dest = path.join(root, 'subpackages', 'subres');

    if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
        fs.renameSync(src, dest);
        console.log('[subres-pack] assets/subres -> subpackages/subres（分包重组）');
    }
    if (!fs.existsSync(dest)) {
        console.warn('[subres-pack] ⚠ 未找到分包产物 assets/subres，跳过分包声明（本次产物为单包形态）');
        return;
    }

    // 分包入口 game.js：①抖音/微信校验器要求每个分包根目录必须有 game.js（缺失报
    // 「should have game.js」编译错误）；②tt.loadSubpackage 完成后平台会执行它，
    // 必须 require('./index.js') 把 bundle 的 SystemJS 模块（含
    // virtual:///prerequisite-imports/subres 注册）加载进引擎——写成空桩会报
    // 「Unable to instantiate virtual:///prerequisite-imports/subres」且美术全空。
    const stubPath = path.join(dest, 'game.js');
    const stubWant = "require('./index.js');\n";
    if (!fs.existsSync(stubPath) || fs.readFileSync(stubPath, 'utf8') !== stubWant) {
        fs.writeFileSync(stubPath, stubWant);
        console.log('[subres-pack] 写入分包入口 subpackages/subres/game.js（require index.js）');
    }

    // game.json：声明分包（幂等）
    const gjPath = path.join(root, 'game.json');
    if (fs.existsSync(gjPath)) {
        const gj = JSON.parse(fs.readFileSync(gjPath, 'utf8'));
        const list = Array.isArray(gj.subpackages) ? gj.subpackages : [];
        if (!list.some((s) => s.root === 'subpackages/subres')) {
            list.push({ root: 'subpackages/subres', name: 'subres' });
            gj.subpackages = list;
            fs.writeFileSync(gjPath, `${JSON.stringify(gj, null, 2)}\n`);
            console.log('[subres-pack] game.json 写入 subpackages 声明');
        }
    }

    // src/settings.json：assets.subpackages = ["subres"]（引擎分包映射的数据源，幂等）
    const settingsPath = path.join(root, 'src', 'settings.json');
    if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        settings.assets = settings.assets || {};
        const list = Array.isArray(settings.assets.subpackages) ? settings.assets.subpackages : [];
        if (!list.includes('subres')) {
            list.push('subres');
            settings.assets.subpackages = list;
            fs.writeFileSync(settingsPath, `${JSON.stringify(settings)}\n`);
            console.log('[subres-pack] src/settings.json 写入 assets.subpackages');
        }
    }
};
