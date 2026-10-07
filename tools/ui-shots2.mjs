#!/usr/bin/env node
/**
 * UI 巡检补拍：ui-shots.mjs 未覆盖的 4 页——仙府商店 / 设置 / 人物属性 / 论武战斗。
 * 用法: node tools/ui-shots2.mjs [port]
 * 产物 docs/screenshots/ui2-NN-xxx.png
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8344';
const url = `http://127.0.0.1:${port}/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 720, height: 1280 },
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
const bad = [];
page.on('pageerror', (e) => bad.push('pageerror: ' + e.message.slice(0, 160)));

await page.goto(url, { waitUntil: 'domcontentloaded' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFrames(n = 40) {
    await page.evaluate((count) => new Promise((res) => {
        let i = 0;
        const tick = () => (++i >= count ? res(i) : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
    }), n);
}
async function boot() {
    for (let i = 0; i < 60; i++) {
        const ok = await page.evaluate(() => !!(window.cc && cc.director && cc.director.getScene() && cc.director.getScene().name === 'main'));
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
let seq = 0;
const shot = async (name) => {
    const f = `docs/screenshots/ui2-${String(++seq).padStart(2, '0')}-${name}.png`;
    writeFileSync(f, await page.screenshot());
    console.log(`saved ${f}`);
};
const BACK = [-280, 548];

await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    s.jiyuan = 200;
    s.lingshi = 5000;
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();

// 1. 仙府商店（中央 0,-268）
await tap(0, -268);
await sleep(1200);
await waitFrames(40);
await shot('shop');
await tap(BACK[0], BACK[1]);
await sleep(900);
await waitFrames(30);

// 2. 设置页（左上齿轮 -286,370）
await tap(-286, 370);
await sleep(1200);
await waitFrames(40);
await shot('settings');
await tap(BACK[0], BACK[1]);
await sleep(900);
await waitFrames(30);

// 3. 人物属性页（点角色立绘 stage 0,195）
await tap(0, 195);
await sleep(1200);
await waitFrames(40);
await shot('player');
await tap(BACK[0], BACK[1]);
await sleep(900);
await waitFrames(30);

// 4. 论武战斗：论道 → 论武 tab → 随机切磋
await tap(286, 110);
await sleep(900);
await tap(86, 480);
await sleep(700);
await tap(-158, 89);
await sleep(2500);
await waitFrames(40);
await shot('pk-battle');
// 战斗结算弹窗（若有）直接截第二张
await sleep(3500);
await waitFrames(30);
await shot('pk-battle-result');

console.log('--- 异常 ---');
console.log(bad.length ? [...new Set(bad)].join('\n') : '(none)');
await browser.close();
console.log('done');
