#!/usr/bin/env node
/**
 * M22 剑冢专项截图：首页横幅（低/高层两种状态）+ 剑冢首页 + 教学弹窗 + 蓄力窗口打断。
 * 用法: node tools/preview-server.mjs build/web-mobile 8322 &  node tools/tower-shots.mjs 8322
 * 产物 docs/screenshots/m22-tower-*.png
 *
 * 判读要点：
 * - m22-tower-home-empty / home-deep：横幅主标「剑冢试炼」与副行「最高第 N 层 · 剑气 X」
 *   必须左右分栏、不相压（这是本次修复的回归点）。
 * - m22-tower-tutorial：首次入冢教学弹窗（spec §10 R5）。
 * - m22-tower-charge：红环亮起、凝神一击可点（窗口外置灰但仍可点）。
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8322';
const url = `http://127.0.0.1:${port}/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE_KEY = 'fanren_save_v1';

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
page.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 200)));

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
    await page.evaluate(() => { try { cc.debug.setDisplayStats(false); } catch {} });
    await sleep(900);
    await waitFrames(30);
}
const pt = (dx, dy) => [360 + dx, 640 - dy];
async function tap(dx, dy) {
    const [x, y] = pt(dx, dy);
    await page.mouse.click(x, y);
}
let shotSeq = 0;
const shot = async (name) => {
    const f = `docs/screenshots/m22-tower-${name}.png`;
    writeFileSync(f, await page.screenshot());
    console.log(`saved ${f} (${++shotSeq})`);
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
// 造一个「已捏人 + 富余资源」的档，并清空剑冢（首次入冢 → 触发教学）
await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    s.jiyuan = 200;
    s.lingshi = 5000;
    s.tower = { best: 1, swordLevel: 0, crystal: 0, daily: { day: '', lingshi: 0, mats: 0, xiuwei: 0 } };
    localStorage.setItem(k, JSON.stringify(s));
}, SAVE_KEY);
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await shot('home-empty');

// 剑冢首页（空档）
await tap(0, -179);
await sleep(1200);
await waitFrames(40);
await shot('scene-empty');

// 入冢 → 首次入冢应有教学弹窗（且弹窗期间战斗暂停）
await tap(0, -226);
await sleep(1200);
await waitFrames(40);
await shot('tutorial');

// 关掉弹窗 → 等蓄力窗口（t=5.0~7.0s）。
// 注意：headless 下 rAF 被节流、Cocos 的 dt 又有钳制，waitFrames 会把游戏时间
// 拉得比墙钟长 —— 抓瞬时提示必须只用 sleep，密集连拍。
await tap(0, -100); // 「入冢」按钮大致位置（弹窗单钮）
for (let i = 1; i <= 10; i++) {
    await sleep(400);
    await shot(i === 7 ? 'charge' : `burst-${i}`);
}
// 打断
await tap(0, -378);
await sleep(160);
await shot('interrupt');

// 高层档：验横幅副行在三位数层号下不与主标相压
await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.tower = { best: 187, swordLevel: 369, crystal: 1.23e15, daily: { day: '', lingshi: 0, mats: 0, xiuwei: 0 } };
    localStorage.setItem(k, JSON.stringify(s));
}, SAVE_KEY);
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await shot('home-deep');

console.log('--- 4xx / 异常 ---');
console.log(bad.length ? [...new Set(bad)].join('\n') : '(none)');
await browser.close();
console.log('done');
