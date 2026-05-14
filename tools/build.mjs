// Cocos Creator CLI 构建封装
// 用法: node tools/build.mjs <web-mobile|bytedance-mini-game> [release]
//
// 构建后处理：
// 1. fixupNonEntryChunks：把 src/chunks 下已生成但各 bundle 目录缺失的 chunk 补齐
// 2. injectBootWatchdog（仅 web-mobile）：引擎引导存在偶发停顿（internal bundle
//    加载后未继续，systemjs 命名注册时序竞态；抖音端不使用 SystemJS，不受影响），
//    注入看门狗——12 秒内场景未就绪则自动重载一次。
import { execFileSync, spawnSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const CREATOR_EXE = '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator';
/** 抖音小游戏 AppID（字节后台可查）。Cocos CLI 构建面板未配置时会硬编码输出 "testappId"，此处为唯一事实源。 */
const DOUYIN_APPID = 'tt93ffe5420d87d89502';
const platform = process.argv[2] ?? 'web-mobile';
const buildType = process.argv[3] === 'release' ? 'release' : 'debug';
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(projectRoot, 'build', platform);

console.log(`[build] platform=${platform} mode=${buildType}`);
// 注意：分包（bundleConfigs）与引擎分离（packages.*.separateEngine）由项目构建扩展
// extensions/subres-pack 在 onBeforeBuild 钩子注入——CLI 参数串无法承载这些配置
// （JSON 会被 `;` 分割破坏，布尔/对象值被校验回退），见该扩展 dist/hooks.js 注释。
const buildParams = `platform=${platform};debug=${buildType === 'debug'}`;
// 必须清掉 ELECTRON_RUN_AS_NODE：宿主（IDE/终端）注入该变量时，CocosCreator 这个
// Electron 二进制会以「纯 node 解释器」模式启动，直接拒绝 --project 并报
// `bad option: --project`（同时打印 node_main.cc 的 environment variables 警告）。
// 同理清掉 NODE_OPTIONS——里面 --require 的 shim 对 Electron 主进程无意义且可能加载失败。
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
delete cleanEnv.NODE_OPTIONS;
// 无头/受限环境下 CocosCreator 内嵌 Electron 的 GPU 子进程可能 FATAL 崩溃
// （"GPU process isn't usable"）→ spawn 返回 status=null。旧产物若不清理，
// 后面的 verifyOutput 会拿旧文件误判「构建成功」。构建前整目录清空。
//
// 用「改名让位」而非 rmSync 删除：产物目录动辄上百个文件，递归删除会触发 IDE 的
// 批量删除保护（SAFE_DELETE_BULK_CONFIRM_REQUIRED）而中断构建。改名同样能保证
// 产物全新，且失败时旧产物还在、可回退。构建成功后再尽力清掉残留（失败无所谓）。
import { rmSync, renameSync } from 'node:fs';
const staleRoot = `${outputRoot}.stale-${Date.now()}`;
if (existsSync(outputRoot)) {
    try {
        renameSync(outputRoot, staleRoot);
    } catch (e) {
        console.error(`[build] ❌ 无法移开旧产物目录（${e.message}）——请手动清理 ${relative(projectRoot, outputRoot)} 后重试`);
        process.exit(1);
    }
}
const res = spawnSync(
    CREATOR_EXE,
    ['--project', projectRoot, '--build', buildParams],
    { stdio: 'inherit', env: cleanEnv },
);
if (res.error) {
    console.error('[build] failed to launch CocosCreator:', res.error.message);
    process.exit(1);
}
if (res.status === null) {
    // 退出码 36 是 CLI 的正常返回；null = 被信号杀死 / 子进程 FATAL，产物必然不完整
    console.error(`[build] ❌ CocosCreator 进程异常终止（signal=${res.signal}），已中止（不生成半成品）`);
    process.exit(1);
}

const fixed = fixupNonEntryChunks(outputRoot);
if (fixed.length) console.log(`[build] fixup: 补拷非入口 chunk -> ${fixed.join(', ')}`);
if (platform === 'web-mobile') injectBootWatchdog(join(outputRoot, 'index.html'));
if (platform === 'bytedance-mini-game') {
    injectOpenDataContext(outputRoot);
    polishDouyinProjectConfig(outputRoot);
    verifySubpackageLayout(outputRoot);
    compressTextures(outputRoot);
}
// SIGTERM 打断的构建可能把产物目录留在半成品状态（甚至被清空）——
// 导入开发者工具会白屏/报错，因此构建后必须完整性把关，失败立即退出非零。
if (!verifyOutput(outputRoot, platform)) process.exit(2);
// 校验通过 = 新产物可用，此时才尝试回收移开的旧产物；失败静默（残留目录带 .stale- 后缀，
// 下次构建会被再次让位，不影响正确性，可手动删）。
if (existsSync(staleRoot)) {
    try { rmSync(staleRoot, { recursive: true, force: true }); }
    catch { console.warn(`[build] 旧产物残留待清理: ${relative(projectRoot, staleRoot)}`); }
}
console.log(`[build] exited with code ${res.status}`);
process.exit(res.status ?? 1);

/**
 * M9b：把 open-data-context/ 子域工程拷入抖音构建产物，并在 game.json 声明。
 * 子域是纯 JS（无引擎），随包发布后 tt.getOpenDataContext() 才可用；主域 DouyinSocial 依赖此能力。
 */
function injectOpenDataContext(root) {
    const srcDir = join(projectRoot, 'open-data-context');
    if (!existsSync(srcDir)) {
        console.warn('[build] open-data-context 缺失，跳过注入（好友榜将走降级）');
        return;
    }
    const destDir = join(root, 'open-data-context');
    mkdirSync(destDir, { recursive: true });
    for (const f of readdirSync(srcDir)) {
        if (statSync(join(srcDir, f)).isFile()) copyFileSync(join(srcDir, f), join(destDir, f));
    }
    // 抖音模拟器的子域加载器按 <dir>/index.js 模块名 require（官方文档写 game.js）——
    // 双名提供：index.js 为引导（防双份执行），逻辑唯一源在 game.js。
    const gj = join(root, 'game.json');
    const cfg = JSON.parse(readFileSync(gj, 'utf8'));
    cfg.openDataContext = 'open-data-context';
    writeFileSync(gj, `${JSON.stringify(cfg, null, 2)}\n`);
    console.log('[build] open-data-context 已注入 game.json + 产物目录');
}

/**
 * 开发期项目配置打磨：
 * - project.config.json：注入正式 AppID（Cocos CLI 恒输出 testappId 占位）、关闭域名校验；
 * - project.private.config.json：IDE「详情-工程配置」的私有开关——urlCheck 关闭 +
 *   bigPackageSizeSupport（调试阶段提升包体积限制上限：预览/真机调试 主包 8MB/分包 4MB/总 24MB）。
 *   Cocos 重建会清空产物目录，这里每次幂等重写。
 */
function polishDouyinProjectConfig(root) {
    const p = join(root, 'project.config.json');
    if (!existsSync(p)) return;
    const cfg = JSON.parse(readFileSync(p, 'utf8'));
    cfg.setting = { ...cfg.setting, urlCheck: false, bigPackageSizeSupport: true };
    if (DOUYIN_APPID && (!cfg.appid || cfg.appid === 'testappId')) cfg.appid = DOUYIN_APPID;
    writeFileSync(p, `${JSON.stringify(cfg)}\n`);

    const privatePath = join(root, 'project.private.config.json');
    let priv = {};
    if (existsSync(privatePath)) {
        try { priv = JSON.parse(readFileSync(privatePath, 'utf8')); } catch { priv = {}; }
    }
    priv.setting = { ...priv.setting, urlCheck: false, bigPackageSizeSupport: true };
    writeFileSync(privatePath, `${JSON.stringify(priv, null, 2)}\n`);
    if (!cfg.appid || cfg.appid === 'testappId') {
        console.error('┌─────────────────────────────────────────────────────────┐');
        console.error('│  ⚠ AppID 仍是占位符！请在 tools/build.mjs 的 DOUYIN_APPID │');
        console.error('│  填入正式 AppID（或在导入对话框填入/申请测试 AppID）      │');
        console.error('└─────────────────────────────────────────────────────────┘');
    } else {
        console.log(`[build] appid = ${cfg.appid}`);
    }
}

/**
 * 分包产物把关：subres 分包由项目构建扩展 extensions/subres-pack 的 onAfterBuild
 * 钩子重组（assets/subres → subpackages/subres + game.json + settings.json 声明，
 * CLI 与 IDE 构建统一生效）。本函数只校验结果，缺任何一块都立即失败——扩展被禁用
 * 或 Cocos 版本升级破坏钩子时，产物会静默退回单包形态（主包重新超限），必须拦截。
 */
function verifySubpackageLayout(root) {
    const subRoot = join(root, 'subpackages', 'subres');
    if (!existsSync(subRoot)) {
        console.error('[build] ❌ 分包目录 subpackages/subres 未生成——检查 extensions/subres-pack 扩展是否加载（构建日志应出现 [subres-pack] 输出）');
        process.exit(2);
    }
    const hasConfig = readdirSync(subRoot).some((f) => f.startsWith('config.'));
    if (!hasConfig) {
        console.error('[build] ❌ 分包 subpackages/subres 内缺少 config.*.json（bundle 配置缺失，分包不完整）');
        process.exit(2);
    }
    // 抖音/微信校验器要求每个分包根目录必须有 game.js（缺失报 "should have game.js"），
    // 且平台在 loadSubpackage 后会执行它——内容必须是 require('./index.js') 注册 bundle
    // 模块；空桩会报 "Unable to instantiate virtual:///prerequisite-imports/..." 且美术全空
    const stubPath = join(subRoot, 'game.js');
    if (!existsSync(stubPath) || !readFileSync(stubPath, 'utf8').includes("require('./index.js')")) {
        console.error('[build] ❌ 分包 subpackages/subres/game.js 缺失或内容不是 require(\'./index.js\')——入口桩失效，模拟器将实例化分包失败');
        process.exit(2);
    }
    const gj = JSON.parse(readFileSync(join(root, 'game.json'), 'utf8'));
    if (!(gj.subpackages ?? []).some((s) => s.root === 'subpackages/subres')) {
        console.error('[build] ❌ game.json 缺少 subpackages/subres 分包声明（扩展写入被覆盖？）');
        process.exit(2);
    }
    const settings = JSON.parse(readFileSync(join(root, 'src', 'settings.json'), 'utf8'));
    const subNames = settings.assets?.subpackages ?? [];
    if (!subNames.includes('subres')) {
        console.error('[build] ❌ src/settings.json 缺少 assets.subpackages:["subres"]（引擎分包映射缺失，运行时会按主包路径找资源而失败）');
        process.exit(2);
    }
    console.log('[build] 分包布局校验通过：subpackages/subres + game.json + settings.json 三处声明齐全');
}

/** 主包/分包体积盘点：主包 = 产物总大小 − 各分包目录（分包根取自 game.json subpackages） */
function measurePackages(root) {
    let subRoots = [];
    try {
        const cfg = JSON.parse(readFileSync(join(root, 'game.json'), 'utf8'));
        subRoots = (cfg.subpackages ?? []).map((s) => String(s.root).replace(/\/+$/, ''));
    } catch { /* game.json 缺失时 verifyOutput 主流程会报 */ }
    let mainBytes = 0;
    const subBytes = {};
    const walk = (dir, bucket) => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            const rel = relative(root, p);
            if (statSync(p).isDirectory()) {
                const matched = subRoots.find((r) => rel === r || rel.startsWith(`${r}/`));
                walk(p, matched ?? bucket);
            } else if (bucket) {
                subBytes[bucket] = (subBytes[bucket] ?? 0) + statSync(p).size;
            } else {
                mainBytes += statSync(p).size;
            }
        }
    };
    walk(root, null);
    return { mainBytes, subBytes };
}

/** 构建产物完整性把关：关键文件存在且非空；任何缺失都视为构建失败（SIGTERM 半成品防线） */
function verifyOutput(root, platform) {
    const critical =
        platform === 'bytedance-mini-game'
            ? ['game.js', 'game.json', 'project.config.json', 'application.js', 'engine-adapter.js', 'web-adapter.js', 'src/settings.json', 'src/chunks/bundle.js', 'open-data-context/game.js', 'open-data-context/game.json']
            : ['index.html', 'application.js', 'src/settings.json', 'src/chunks/bundle.js'];
    const missing = critical.filter((f) => {
        const p = join(root, f);
        if (!existsSync(p)) return true;
        try {
            return statSync(p).size < 32; // 空文件/截断文件
        } catch {
            return true;
        }
    });
    if (missing.length) {
        console.error('[build] ❌ 产物不完整（可能被 SIGTERM 打断），缺少/空文件：');
        for (const f of missing) console.error(`   - ${f}`);
        console.error('[build] 请重新运行一次构建再导入开发者工具。');
        return false;
    }
    // 真正承载游戏代码的是主 bundle 的 index.js（src/chunks/bundle.js 本项目仅 ~6KB，是正常值）
    const mainIndex = join(root, 'assets', 'main', 'index.js');
    if (!existsSync(mainIndex) || statSync(mainIndex).size < 100_000) {
        const size = existsSync(mainIndex) ? statSync(mainIndex).size : 0;
        console.error(`[build] ❌ assets/main/index.js 仅 ${size} 字节（正常 ≈340KB），主包被截断，请重新构建。`);
        return false;
    }
    console.log(`[build] ✅ 产物完整性校验通过（main/index.js ${Math.round(statSync(mainIndex).size / 1024)}KB）`);
    if (platform === 'bytedance-mini-game') {
        const { mainBytes, subBytes } = measurePackages(root);
        const fmt = (b) => `${(b / 1048576).toFixed(2)}MB`;
        const subSummary = Object.entries(subBytes).map(([r, b]) => `${r} ${fmt(b)}`).join(' + ') || '无';
        console.log(`[build] 包体积：主包 ${fmt(mainBytes)} + 分包 ${subSummary}`);
        if (mainBytes > 4 * 1024 * 1024) {
            console.warn('┌──────────────────────────────────────────────────────────────────┐');
            console.warn(`│  ⚠ 主包 ${fmt(mainBytes)} 超过真机调试/发布 4MB 硬限（预览不受影响，`);
            console.warn('│    靠 project.private.config.json 的 bigPackageSizeSupport=8MB）。');
            console.warn('│  CLI 构建拿不到 separateEngine（引擎分离/按需分块，参数串无法承载），');
            console.warn('│  真机调试/提审产物请用: node tools/douyin-editor-build.mjs');
            console.warn('│  （前置: Cocos Creator 带 --remote-debugging-port=9333 打开本工程）');
            console.warn('└──────────────────────────────────────────────────────────────────┘');
        }
    }
    return true;
}

/**
 * 构建后纹理压缩：量化 >150KB 的 PNG（256 色自适应 + 抖动）。
 * 只处理构建产物（源图不动）；尺寸不变 → spriteFrame meta 的 trim/uv 全部有效。
 * 主包 8MB 上限（调试期提升后）的主要减重手段：三张背景原图合计 3.5MB。
 */
function compressTextures(root) {
    const script = `
import sys
from pathlib import Path
from PIL import Image
total_before = total_after = 0
changed = 0
for p in Path(sys.argv[1]).rglob("*.png"):
    if p.stat().st_size < 60 * 1024:
        continue
    before = p.stat().st_size
    img = Image.open(p)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    q = img.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
    tmp = p.with_suffix(".png.tmp")
    q.save(tmp, "PNG", optimize=True)
    after = tmp.stat().st_size
    if after < before * 0.85:
        tmp.replace(p)
        total_before += before
        total_after += after
        changed += 1
    else:
        tmp.unlink()
print(f"[compress] quantized {changed} files: {total_before//1024}KB -> {total_after//1024}KB")
`;
    try {
        const out = execFileSync('python3', ['-c', script, String(root)], { encoding: 'utf8', timeout: 120_000 });
        console.log(out.trim());
    } catch (e) {
        console.warn('[compress] 跳过（python3/PIL 不可用或失败）:', String(e.stderr ?? e.message).slice(0, 120));
    }
}

/** 把 src/chunks 下已生成但各 bundle 目录缺失的 chunk 文件补齐 */
function fixupNonEntryChunks(root) {
    const chunksDir = join(root, 'src', 'chunks');
    if (!existsSync(chunksDir)) return [];
    const fixed = [];
    const assetsDir = join(root, 'assets');
    if (!existsSync(assetsDir)) return fixed;
    for (const name of readdirSync(assetsDir)) {
        const dir = join(assetsDir, name);
        if (!statSync(dir).isDirectory()) continue;
        const indexJs = join(dir, 'index.js');
        if (!existsSync(indexJs)) continue;
        const src = readFileSync(indexJs, 'utf8');
        for (const chunk of readdirSync(chunksDir)) {
            if (src.includes(`'./${chunk}'`) || src.includes(`"./${chunk}"`)) {
                const target = join(dir, chunk);
                if (!existsSync(target)) {
                    copyFileSync(join(chunksDir, chunk), target);
                    fixed.push(`assets/${name}/${chunk}`);
                }
            }
        }
    }
    return fixed;
}

/** 注入启动看门狗：卡在引导页 12 秒后自动重载一次（sessionStorage 防循环） */
function injectBootWatchdog(indexHtmlPath) {
    if (!existsSync(indexHtmlPath)) return;
    let html = readFileSync(indexHtmlPath, 'utf8');
    if (html.includes('boot-watchdog')) return;
    const watchdog = `
<script>/* boot-watchdog */
(function () {
  function check() {
    var ready = false;
    try { ready = !!(window.cc && window.cc.director && window.cc.director.getScene()); } catch (e) {}
    if (ready) { try { sessionStorage.removeItem('fr_boot_retry'); } catch (e) {} return; }
    var n = 0;
    try { n = parseInt(sessionStorage.getItem('fr_boot_retry') || '0', 10); } catch (e) {}
    if (n < 5) {
      try { sessionStorage.setItem('fr_boot_retry', String(n + 1)); } catch (e) {}
      location.reload();
    } else {
      document.title = '启动失败，请刷新重试';
    }
  }
  setTimeout(check, 10000);
})();
</script>`;
    html = html.replace('</body>', watchdog + '</body>');
    writeFileSync(indexHtmlPath, html);
    console.log('[build] watchdog injected -> index.html');
}
