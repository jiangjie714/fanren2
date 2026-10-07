#!/usr/bin/env node
/**
 * 幻境「未达标」布局取证：进心魔幻境 → 局内 HUD 截图 → 不操作等 15s 自然结束
 * → 未入档结算页截图。用法: node tools/shot-illusion-layout.mjs [port]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8344';
const url = `http://127.0.0.1:${port}/`;
const out = (n) => `docs/screenshots/illusion-layout-${n}.png`;
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
async function boot() {
    for (let i = 0; i < 40; i++) {
        const ok = await page.evaluate(() => !!(window.cc && cc.director && cc.director.getScene() && cc.director.getScene().name === 'main'));
        if (ok) break;
        await sleep(500);
    }
    await page.evaluate(() => { try { cc.debug.setDisplayStats(false); } catch { } });
    await sleep(800);
}
const shot = async (name) => {
    writeFileSync(out(name), await page.screenshot());
    console.log(`saved ${out(name)}`);
};
const pt = (dx, dy) => [360 + dx, 640 - dy];
async function tap(dx, dy) {
    const [x, y] = pt(dx, dy);
    await page.mouse.click(x, y);
}

// 1. 预注入已捏人最小存档（migrate 会补全其余字段）
await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
await page.evaluate(() => {
    localStorage.setItem('fanren_save_v1', JSON.stringify({
        version: 6,
        profile: { gender: 'm', name: '云隐', createdAt: Date.now() },
    }));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();

// 2. 主页 → 修行任务页 → 心魔幻境入口
await tap(286, 396);
await sleep(900);
await tap(214, 316);
await sleep(2500);

// 3. 局内 HUD（不操作，评分 0 = 未达标）
await shot('hud-ingame');

// 4. 扫摆接金 ~13s：争取 ≥60 分拿档位奖励（有档布局验证）
for (let t = 0; t < 160; t++) {
    const x = Math.round(360 + Math.sin(t / 3.2) * 300);
    await page.mouse.move(x, 640 - 330);
    await sleep(80);
}

// 5. 等局结束 → 结算页截图（未入档或入档二选一，都会落新布局）
await sleep(3500);
const score = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    return s.daily.illusionRewardedTier ?? 0;
});
console.log('rewardedTier =', score);
await shot(score > 0 ? 'result-tiered' : 'result-final');

console.log(bad.length ? `异常:\n${bad.join('\n')}` : 'no page errors');
await browser.close();
