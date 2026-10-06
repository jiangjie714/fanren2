// 一次性：捏人流端到端（清档 → ProfileScene → 随机道号 → 踏入仙途 → 主页）
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 720, height: 1280 }, args: ['--no-sandbox', '--disable-gpu-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 720, height: 1280 });
const bad = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
page.on('pageerror', (e) => bad.push(`PAGEERROR ${e.message}`));
await page.goto('http://127.0.0.1:8322/index.html', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
const waitBoot = async () => { await page.waitForFunction(() => window.__fanren && window.__fanren.save, { timeout: 60000 }).catch(() => {});
    for (let i = 0; i < 120; i++) {
        const ok = await page.evaluate(() => !!(window.__fanren || document.querySelector('canvas')));
        if (ok) break;
        await new Promise((r) => setTimeout(r, 500));
    }
    await new Promise((r) => setTimeout(r, 2500));
};
await page.reload({ waitUntil: 'domcontentloaded' });
await waitBoot();
await page.evaluate(() => window.cc?.debug?.setDisplayStats?.(false));
const frames = await page.evaluate(() => [...document.querySelectorAll('canvas')].length);
// 等待引擎帧渲染
await page.evaluate(() => new Promise((res) => { let n = 0; const tick = () => (++n >= 30) ? res() : requestAnimationFrame(tick); tick(); }));
writeFileSync('docs/screenshots/m11-profile.png', await page.screenshot());
console.log('saved m11-profile, canvas=', frames);
// 点「随机道号」→ 输入框应有值；再点「踏入仙途」
const design = (dx, dy) => ({ x: 360 + dx, y: 640 - dy });
// 两按钮同宽 280、中心 ±148（原 ±130 / 220×300 不同宽，2026-10-06 统一样式后同步改）
await page.mouse.click(design(-148, -330).x, design(-148, -330).y); // 随机道号
await new Promise((r) => setTimeout(r, 600));
await page.mouse.click(design(148, -330).x, design(148, -330).y); // 踏入仙途
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => new Promise((res) => { let n = 0; const tick = () => (++n >= 30) ? res() : requestAnimationFrame(tick); tick(); }));
writeFileSync('docs/screenshots/m11-profile-confirmed.png', await page.screenshot());
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fanren_save_v1') || 'null'));
console.log('profile after confirm:', JSON.stringify(saved?.profile));
console.log(bad.length ? 'BAD:\n' + [...new Set(bad)].join('\n') : '(no 4xx)');
await browser.close();
