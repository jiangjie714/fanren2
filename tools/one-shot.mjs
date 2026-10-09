#!/usr/bin/env node
/**
 * 单页截图：走真实引擎运行时，比静态审计器更可信（最终验收手段）。
 *
 * 用法：
 *   node tools/one-shot.mjs <port> <scene>
 *   node tools/one-shot.mjs 8333 home      → docs/screenshots/shot-home.png
 *
 * 前置：
 *   ELECTRON_DISABLE_SANDBOX=1 node tools/build.mjs web-mobile
 *   node tools/preview-server.mjs build/web-mobile 8333
 *
 * 两个必须做对的细节（都踩过）：
 * 1. **轮询等场景名变成 'main'**：reload 后引擎要重新 import + 建场景，
 *    只等 domcontentloaded 会截到 Cocos 启动画面（一片黑 + 火焰 logo）。
 * 2. **关掉引擎调试性能面板**（cc.debug.setDisplayStats(false)）：
 *    否则左下角盖一层性能面板，这种图不能用于验收。
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8333';
const scene = process.argv[3] ?? 'home';
const url = `http://127.0.0.1:${port}/`;
const file = `docs/screenshots/shot-${scene}.png`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 720, height: 1280 },
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
const bad = [];
page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) bad.push(`${r.status()} ${r.url()}`);
});
page.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 160)));

/** 轮询等场景就绪并关掉调试面板 —— 与 m7-shots.mjs 的 boot() 同规 */
async function boot() {
    let ready = false;
    for (let i = 0; i < 40; i++) {
        ready = await page.evaluate(
            () => !!(window.cc && cc.director && cc.director.getScene() && cc.director.getScene().name === 'main'),
        );
        if (ready) break;
        await sleep(500);
    }
    await page.evaluate(() => {
        try {
            cc.debug.setDisplayStats(false);
        } catch {
            /* release 构建没有 debug，忽略 */
        }
    });
    await sleep(800);
    return ready;
}

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!localStorage.getItem('fanren_save_v1'), { timeout: 60000 });
console.log('boot1:', await boot());

// 注入「已捏人」的存档：新号会停在 ProfileScene，截不到主页（手法同 m7-shots.mjs）
await page.evaluate(() => {
    const raw = localStorage.getItem('fanren_save_v1');
    if (!raw) return;
    const s = JSON.parse(raw);
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
console.log('boot2:', await boot());

// 切页：走场景栈。场景类是模块作用域的构造器，window 上取不到 ——
// 只能点坐标（同 m7-shots.mjs 的 tap）。这里只支持 home，其余页面另写脚本。
if (scene !== 'home') {
    console.log(`提示：${scene} 需要专用导航脚本，本脚本只出主页`);
}

writeFileSync(file, await page.screenshot());
console.log('saved', file);
if (bad.length) {
    console.log('--- 异常 ---');
    for (const b of bad.slice(0, 20)) console.log(' ', b);
} else {
    console.log('零 4xx / 零页面异常');
}
await browser.close();
