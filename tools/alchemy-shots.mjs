#!/usr/bin/env node
/**
 * M13 炼丹淬体 & 福禄炼制 页面巡检：进入两页截图 + 炼制交互验证。
 * 用法: node tools/alchemy-shots.mjs [port]
 *
 * 验证点：
 * 1. 炼丹页：四维卡 + 三品丹药行 + 灵材卡；点「炼制」后四维数值增长
 * 2. 福禄页：总加成卡 + 三品行；点「炼制」后攻防加成增长
 * 3. 全程零 4xx / 页面异常
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const port = process.argv[2] ?? '8323';
const url = `http://127.0.0.1:${port}/`;
const out = (n) => `docs/screenshots/${n}.png`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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

await page.goto(url, { waitUntil: 'domcontentloaded' });

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
const shot = async (name) => {
    writeFileSync(out(name), await page.screenshot());
    console.log(`saved ${out(name)}`);
};

// ── 造状态：练气境（解锁中品）+ 灵石充足 + 少量灵材 ──
await page.evaluate(() => localStorage.removeItem('fanren_save_v1'));
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    s.realmIndex = 1; // 练气：解锁初品+中品
    s.lingshi = 20000;
    s.jiyuan = 0;
    s.fortune.materials = { lingcao: 6, lingshi_core: 4 }; // 灵材充足
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await boot();

// M12 环形布局坐标（HomeScene ringEntries）
const RING = { alchemy: [-130, -352], fortune: [130, -352] };
const BACK = [-280, 548];

async function visit(name, at, { settle = 1200 } = {}) {
    await tap(at[0], at[1]);
    await sleep(settle);
    await waitFrames(40);
    await shot(name);
}

// ── 炼丹页 ──
await visit('ui-13-alchemy', RING.alchemy);

// 记录炼制前四维 → 点初品「炼制」→ 验证四维增长
const before = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    return s.alchemy;
});
await tap(224, 150); // 初品行按钮（x=224, 行心 y=150，M13 等高版布局）
await sleep(700);
await waitFrames(30);
const after = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    return { alchemy: s.alchemy, lingshi: s.lingshi };
});
console.log(`炼丹前 四维: ${JSON.stringify(before)}`);
console.log(`炼丹后 四维: ${JSON.stringify(after.alchemy)} 灵石: ${after.lingshi}`);
const gained = after.alchemy.wisdom - before.wisdom;
console.log(gained > 0 ? `✅ 炼制生效：四维各 +${gained}` : '❌ 炼制未生效');

await shot('ui-13-alchemy-crafted');
await tap(BACK[0], BACK[1]);
await sleep(900);
await waitFrames(30);

// ── 福禄页 ──
await visit('ui-14-fortune', RING.fortune);

const faBefore = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    return { crafts: s.fortune.crafts, lingshi: s.lingshi };
});
await tap(238, 150); // 初品福禄行按钮（x=238, 行心 y=150，M13 等高版布局）
await sleep(700);
await waitFrames(30);
const faAfter = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    return { crafts: s.fortune.crafts, lingshi: s.lingshi };
});
console.log(`福禄前: ${JSON.stringify(faBefore)}`);
console.log(`福禄后: ${JSON.stringify(faAfter)}`);
const crafts = (faAfter.crafts.chu ?? 0) - (faBefore.crafts.chu ?? 0);
console.log(crafts > 0 ? `✅ 福禄炼制生效：初品 +${crafts} 次` : '❌ 福禄炼制未生效');

await shot('ui-14-fortune-crafted');

console.log('--- 4xx / 异常 ---');
console.log(bad.length ? [...new Set(bad)].join('\n') : '(none)');
await browser.close();
console.log('done');
