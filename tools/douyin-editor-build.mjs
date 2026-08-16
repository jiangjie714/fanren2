#!/usr/bin/env node
// 真机调试/提审产物构建：通过 CDP 驱动运行中的 Cocos Creator 编辑器执行构建。
//
// 为什么不用 npm run build:douyin（CLI）：CLI 参数串无法承载 separateEngine（引擎
// 分离/按需分块，主包 4.50MB→1.18MB 的关键）等平台选项；编辑器内构建（面板「构建」
// 按钮走的就是 builder 的 add-task 消息）可以带完整选项。
//
// 前置：Cocos Creator 已打开本工程且带调试端口启动：
//   "/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
//     --project "$(pwd)" --remote-debugging-port=9333
//
// 构建后差异说明：编辑器构建不走 tools/build.mjs 的后处理链，本脚本直接补齐
// open-data-context 拷贝 + game.json.openDataContext + project.config.json 的
// urlCheck/appid/bigPackageSizeSupport（与 build.mjs 注入逻辑一致）。
//
// 用法: node tools/douyin-editor-build.mjs [cdp端口，默认 9333]
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.argv[2] ?? '9333';
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(projectRoot, 'build', 'bytedance-mini-game');
const DOUYIN_APPID = 'tt93ffe5420d87d89502';
const CREATOR = '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator';

const cdpUp = async () => {
    try {
        const r = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(2000) });
        return r.ok;
    } catch { return false; }
};

// 编辑器没开（或没带调试端口）时自动拉起：工具自足，不依赖手动启动
if (!(await cdpUp())) {
    console.log(`[editor-build] 编辑器未在 ${PORT} 端口监听，自动启动 Cocos Creator（首次启动含资源库导入，需 1-3 分钟）…`);
    const { spawn } = await import('node:child_process');
    spawn(CREATOR, ['--project', projectRoot, `--remote-debugging-port=${PORT}`], { detached: true, stdio: 'ignore' }).unref();
    const deadline = Date.now() + 240_000;
    while (!(await cdpUp())) {
        if (Date.now() > deadline) { console.error('[editor-build] ❌ 编辑器 240s 内未就绪'); process.exit(2); }
        await new Promise((r) => setTimeout(r, 4000));
    }
    // CDP 端口就绪 ≠ 消息系统就绪，下方就绪等待循环会继续兜底
    await new Promise((r) => setTimeout(r, 10_000));
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && (t.url || '').includes('main.html'));
if (!page) {
    console.error(`[editor-build] ❌ 未找到编辑器页面 target——确认 Cocos Creator 已带 --remote-debugging-port=${PORT} 打开本工程`);
    process.exit(3);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
});
ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m); }
};
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws error')); setTimeout(() => j(new Error('ws open timeout')), 8000); });
const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); // 勿加 timeout 参数（旧协议报 Invalid parameters）
    if (r.result?.exceptionDetails) throw new Error('EVAL_ERROR: ' + String(r.result.exceptionDetails.exception?.description ?? '').slice(0, 400));
    return r.result?.result?.value;
};

// 就绪等待（编辑器启动中消息系统尚未注册）
for (let i = 0; ; i++) {
    try {
        const p = await evaluate(`(async () => typeof Editor === 'undefined' ? 'no-editor' : 'ok:' + await Editor.Message.request('builder', 'query-worker-ready'))()`);
        if (String(p).startsWith('ok')) break;
    } catch (e) { /* 编辑器启动中 */ }
    if (i > 40) { console.error('[editor-build] ❌ 编辑器 160s 内未就绪'); process.exit(4); }
    await new Promise((r) => setTimeout(r, 4000));
}

// 构建选项：以最近一次构建日志的 dump 为基底（跟随默认值演进），叠加本工程的关键覆盖
const logDir = join(projectRoot, 'temp', 'builder', 'log');
const logs = readdirSync(logDir).filter((f) => f.startsWith('bytedance-mini-game')).map((f) => ({ f, m: statSync(join(logDir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
if (!logs.length) { console.error('[editor-build] ❌ 找不到历史构建日志（需要先跑过一次 npm run build:douyin）'); process.exit(5); }
const dump = readFileSync(join(logDir, logs[0].f), 'utf8').match(/Start build task, options:\s*(\{.*?\})\r?\n/s);
const options = JSON.parse(dump[1]);
delete options.logDest;
options.packages['bytedance-mini-game'].separateEngine = true;   // 引擎分离/按需分块：主包 4.50MB→1.18MB 的关键
options.packages['bytedance-mini-game'].appid = DOUYIN_APPID;
options.bundleConfigs = [{ root: 'db://assets/subres', name: 'subres', priority: 8, compressionType: 'subpackage', isRemote: false, output: true }];

console.log('[editor-build] 构建中（约 30-90s）…');
const result = await evaluate(`(async () => {
    const options = ${JSON.stringify(options)};
    return JSON.stringify(await Editor.Message.request('builder', 'add-task', options, true));
})()`);
console.log(`[editor-build] add-task 结果: ${result}（36 = 正常完成码）`);

// —— 后处理注入（对齐 build.mjs）——
if (!existsSync(join(outRoot, 'game.json'))) { console.error('[editor-build] ❌ 产物 game.json 缺失，构建未完成？'); process.exit(6); }
const odcSrc = join(projectRoot, 'open-data-context');
const odcDst = join(outRoot, 'open-data-context');
if (existsSync(odcSrc)) {
    rmSync(odcDst, { recursive: true, force: true }); mkdirSync(odcDst, { recursive: true });
    for (const f of readdirSync(odcSrc)) {
        const p = join(odcSrc, f);
        if (statSync(p).isFile()) copyFileSync(p, join(odcDst, f));
    }
    const gjPath = join(outRoot, 'game.json');
    const gj = JSON.parse(readFileSync(gjPath, 'utf8'));
    gj.openDataContext = 'open-data-context';
    writeFileSync(gjPath, JSON.stringify(gj, null, 2) + '\n');
}
const pcPath = join(outRoot, 'project.config.json');
if (existsSync(pcPath)) {
    const pc = JSON.parse(readFileSync(pcPath, 'utf8'));
    pc.setting = { ...pc.setting, urlCheck: false, bigPackageSizeSupport: true };
    pc.appid = DOUYIN_APPID;
    writeFileSync(pcPath, JSON.stringify(pc));
}
const privPath = join(outRoot, 'project.private.config.json');
let priv = {};
if (existsSync(privPath)) { try { priv = JSON.parse(readFileSync(privPath, 'utf8')); } catch { /* 重建 */ } }
priv.setting = { ...priv.setting, urlCheck: false, bigPackageSizeSupport: true };
writeFileSync(privPath, JSON.stringify(priv, null, 2) + '\n');

// —— 体积盘点（主包 = 总 - 分包目录）——
let total = 0, sub = 0;
const walk = (dir) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else {
            const s = statSync(p).size;
            total += s;
            if (p.startsWith(join(outRoot, 'subpackages'))) sub += s;
        }
    }
};
walk(outRoot);
const mb = (b) => `${(b / 1048576).toFixed(2)}MB`;
console.log(`[editor-build] ✅ 主包 ${mb(total - sub)} + 分包 ${mb(sub)}（真机调试硬限：主包 4MB / 单分包 4MB）`);
if (total - sub > 4 * 1048576) { console.error('[editor-build] ❌ 主包超 4MB'); process.exit(7); }
process.exit(0);
