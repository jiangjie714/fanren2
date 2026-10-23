#!/usr/bin/env node
/**
 * D1-60s 新手流三态截图：StarterScene → StarterBoxScene（1/3、3/3）→ 首战 RainScene。
 *
 * 用法: node tools/starter-shots.mjs [port]   （先起 tools/preview-server.mjs）
 * 产物: docs/screenshots/d1-1-home.png / d1-2-box.png / d1-3-done.png / d1-4-rain.png
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8322';
const url = `http://127.0.0.1:${port}/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEW = { width: 720, height: 1280 };
const OUT = 'docs/screenshots';

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: VIEW,
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport(VIEW);
page.on('pageerror', (e) => console.error('[pageerror]', e.message));

async function waitBoot() {
    for (let i = 0; i < 60; i += 1) {
        const ok = await page.evaluate(() => !!(window.cc && cc.director && cc.director.getScene()
            && cc.director.getScene().name === 'main'));
        if (ok) break;
        await new Promise((r) => setTimeout(r, 500));
    }
    await page.evaluate(() => { try { cc.debug.setDisplayStats(false); } catch { /* 旧版 */ } });
    await new Promise((r) => setTimeout(r, 800));
}

async function waitFrames(n) {
    await page.evaluate(async (count) => {
        await new Promise((resolve) => {
            let i = 0;
            const step = () => {
                i += 1;
                if (i >= count) resolve();
                else requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }, n);
}

async function shot(name) {
    await waitFrames(6);
    writeFileSync(`${OUT}/${name}`, await page.screenshot({ type: 'png' }));
    console.log(`[d1] ${name}`);
}

const tap = async (x, y) => page.mouse.click(360 + x, 640 - y);

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitBoot();
// 全新存档：清掉 localStorage 后 reload，Game.init 会走 StarterScene
await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await waitBoot();
await waitFrames(20);
await shot('d1-1-home.png');

// 主 CTA（0,-330）→ 新手三连
await tap(0, -330);
await waitFrames(16);
await shot('d1-2-box.png');

// 开第 1 只（按钮 0,-300），再开第 2/3 只
await tap(0, -300);
await waitFrames(12);
await tap(0, -300);
await waitFrames(12);
await tap(0, -300);
await waitFrames(20);
await shot('d1-3-done.png');

// 「去渡劫」→ 首战
await tap(0, -300);
await waitFrames(40);
await shot('d1-4-rain.png');

// 首战 8 秒跑完 → 首胜结算页（验证「继续修仙 + 解锁提示」）
await new Promise((r) => setTimeout(r, 9500));
await waitFrames(20);
await shot('d1-5-result.png');

await browser.close();
console.log('[d1] done');
