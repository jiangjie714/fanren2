#!/usr/bin/env node
/**
 * M33 妖径第 11 章「溯光长河」（#47 续）验收截图：
 *   1. 第 11 章地图页（curLayer=101：章节信息卡 + 十层格 + 新背景）
 *   2. 第 101 层战斗局（时鳞鱼龙立绘，非兜底图）
 *   3. 第 110 层 Boss 战（光阴蜃主立绘）
 *
 * 用法: node tools/m33-shots.mjs [port]   （需先起 tools/preview-server.mjs）
 * 产物: docs/screenshots/m33-*.png
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8323';
const url = `http://127.0.0.1:${port}/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEW = { width: 720, height: 1280 };

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: VIEW,
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport(VIEW);

const bad = [];
page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) bad.push(`${r.status()} ${r.url()}`);
});
page.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 160)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFrames(n = 40) {
    await page.evaluate(
        (count) => new Promise((res) => {
            let i = 0;
            const tick = () => (++i >= count ? res(i) : requestAnimationFrame(tick));
            requestAnimationFrame(tick);
        }),
        n,
    );
}
async function boot() {
    for (let i = 0; i < 60; i++) {
        const ok = await page.evaluate(
            () => !!(window.cc && cc.director && cc.director.getScene() && cc.director.getScene().name === 'main'),
        );
        if (ok) break;
        await sleep(500);
    }
    await page.evaluate(() => { try { cc.debug.setDisplayStats(false); } catch { /* 无调试面板时忽略 */ } });
    await sleep(900);
    await waitFrames(30);
}
/** 设计系坐标 → 屏幕像素（720×1280 视口，半高 640） */
const pt = (dx, dy) => [VIEW.width / 2 + dx, VIEW.height / 2 - dy];
async function tap(dx, dy) {
    const [x, y] = pt(dx, dy);
    await page.mouse.click(x, y);
}
async function shot(name) {
    const s = await page.screenshot({ type: 'png' });
    writeFileSync(`docs/screenshots/${name}.png`, s);
    console.log(`saved -> docs/screenshots/${name}.png`);
}
async function waitScene(name, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        const cur = await page.evaluate(() => (window.__fanren && window.__fanren.stack ? window.__fanren.stack.top.node.name : ''));
        if (cur === name) return true;
        await sleep(200);
    }
    console.error(`等待场景 ${name} 超时，当前 = ${await page.evaluate(() => (window.__fanren || {}).stack?.top?.node?.name)}`);
    return false;
}
/** 关掉可能出现的剧情演出层（防御性跳过） */
async function skipStory() {
    for (let i = 0; i < 30; i++) {
        const has = await page.evaluate(() => {
            const g = window.__fanren;
            return !!(g && g.stack && g.stack.top && g.stack.top.node.name === 'StoryLayer');
        });
        if (!has) return;
        await tap(250, -356);
        await sleep(400);
    }
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await boot();

// ── 捏人流：随机道号 → 踏入仙途 ──
await tap(-148, -330);
await sleep(300);
await tap(148, -330);
if (!(await waitScene('HomeScene'))) process.exit(1);
await sleep(400);
await waitFrames(10);
// opening 演出：跳过
await tap(250, -356);
await sleep(500);
await waitFrames(10);
// 结束新手引导（引导遮罩全屏吸点击，先落档再导航）
await page.evaluate(() => {
    const g = window.__fanren;
    if (g && g.save && g.save.tutorial) { g.save.tutorial.done = true; g.persist(); }
});
await sleep(400);
await waitFrames(10);

// ── 预置进度：curLayer=101（第 11 章第 1 层） ──
// 必须在进妖径页之前设置——地图页按 chapterOf(curLayer) 构建，进去再改不触发重建。
await page.evaluate(() => {
    const g = window.__fanren;
    if (g && g.save && g.save.trail) { g.save.trail.curLayer = 101; g.persist(); }
});
await sleep(300);
await waitFrames(10);

// ── 妖径 rail 钮 @(286,266) → 第 11 章地图页 ──
await tap(286, 266);
if (!(await waitScene('TrailScene'))) process.exit(1);
await sleep(900);
await waitFrames(20);
await skipStory();
await waitFrames(20);
await shot('m33-1-map');                // 地图页：第 11 章信息卡 + 十层格 + 溯光长河背景

// ── 第 1 层格（x=-158, y=236）→ 战斗局（时鳞鱼龙） ──
await tap(-158, 236);
if (!(await waitScene('TrailBattleScene'))) process.exit(1);
await sleep(1200);
await waitFrames(40);
await shot('m33-2-battle');             // 战斗局：时鳞鱼龙立绘

// ── pop 两次回首页（Home→Trail→Battle），改 curLayer=110 后重进（地图页按 curLayer 构建） ──
await page.evaluate(() => { window.__fanren.stack.pop(); });
await sleep(500);
await page.evaluate(() => { window.__fanren.stack.pop(); });
await sleep(600);
await waitFrames(10);
await page.evaluate(() => {
    const g = window.__fanren;
    if (g && g.save && g.save.trail) { g.save.trail.curLayer = 110; g.persist(); }
});
await sleep(300);
await waitFrames(10);
await tap(286, 266);
if (!(await waitScene('TrailScene'))) process.exit(1);
await sleep(900);
await waitFrames(20);
// 第 10 层 Boss 格（x=+158, y=-212）
await tap(158, -212);
if (!(await waitScene('TrailBattleScene'))) process.exit(1);
await sleep(1200);
await waitFrames(40);
await shot('m33-3-boss');               // Boss 战：光阴蜃主立绘

await browser.close();
if (bad.length) {
    console.error('页面异常:\n' + bad.join('\n'));
    process.exit(1);
}
console.log('M33 三态截图完成');
