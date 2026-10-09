#!/usr/bin/env node
/**
 * 运行时节点树 dump —— 查「元素跑到了不该在的位置」这类问题。
 *
 * 静态审计器（tools/layout-audit.mjs）按源码解析坐标，但它解不出**闭包默认参数**：
 * `railLabel(text, y, x = 286)` 里 `railLabel('图鉴', -70)` 会被算成 x=0（实际 286），
 * 于是「图鉴」标签悄悄飞到右侧压住「法器」钮 —— 源码看着没问题，静态报告 0 条，
 * 只有真实节点树能发现。
 *
 * 用法：
 *   node tools/node-dump.mjs [port] [--home]      # 只看主页（默认）
 *   node tools/node-dump.mjs 8333 --all           # 全树
 *   node tools/node-dump.mjs 8333 --at x=-286     # 只看 x≈-286 的节点
 *   node tools/node-dump.mjs 8333 --text 图鉴     # 只看文本含「图鉴」的节点
 *
 * 前置：已构建 + node tools/preview-server.mjs build/web-mobile 8333
 */
import puppeteer from 'puppeteer-core';

const argv = process.argv.slice(2);
const port = argv.find((a) => /^\d+$/.test(a)) ?? '8333';
const flag = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : null;
};
const at = flag('--at');
const text = flag('--text');
const all = argv.includes('--all');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 720, height: 1280 },
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!localStorage.getItem('fanren_save_v1'), { timeout: 60000 });
// 注入已捏人存档，否则停在 ProfileScene 看不到主页
await page.evaluate(() => {
    const raw = localStorage.getItem('fanren_save_v1');
    if (!raw) return;
    const s = JSON.parse(raw);
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(
        () => !!(window.cc && cc.director && cc.director.getScene() && cc.director.getScene().name === 'main'),
    );
    if (ok) break;
    await sleep(500);
}
await page.evaluate(() => {
    try {
        cc.debug.setDisplayStats(false);
    } catch {
        /* release 构建无 debug */
    }
});
await sleep(1200);

const rows = await page.evaluate(
    ({ at, text, all }) => {
        const out = [];
        const walk = (node, depth) => {
            const pos = node.position;
            const lb = node.getComponent(cc.Label);
            const s = lb ? String(lb.string) : '';
            const sz = node.getComponent(cc.UITransform)?.contentSize;
            let keep = all;
            if (!keep && at !== null) {
                const target = Number(at);
                keep = Math.abs(pos.x - target) < 120;
            }
            if (!keep && text !== null) keep = s.includes(text);
            if (keep) {
                out.push(
                    `${'  '.repeat(depth)}${node.name} @(${Math.round(pos.x)},${Math.round(pos.y)})`
                    + `${sz ? ` ${Math.round(sz.width)}x${Math.round(sz.height)}` : ''}`
                    + `${s ? ` "${s}"` : ''}`
                    + `${node.active === false ? ' [inactive]' : ''}`,
                );
            }
            for (const c of node.children) walk(c, depth + 1);
        };
        walk(cc.director.getScene(), 0);
        return out;
    },
    { at, text, all },
);

console.log(rows.length ? rows.join('\n') : '(无匹配节点；试 --all 或放宽 --at/--text)');
await browser.close();
