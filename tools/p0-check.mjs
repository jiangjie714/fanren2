/**
 * P0 修复回归：两条主路径的浏览器实测（puppeteer + 本机 Chrome）。
 *
 * 路径 A（P0-2）：主页 → 商店领每日 → 开箱 → 收下奖励 → swap 灵气雨 → 渡劫结算 → 返回主页
 *   断言：swap 后栈底仍是 HomeScene；结算 popToRoot 后回到主页且主页存活。
 * 路径 B（P0-3）：领过每日后回商店，按钮必须重建为「已领取」且不可再领。
 *
 * 用法：node tools/_p0check.mjs <port>
 */
import puppeteer from 'puppeteer-core';

const PORT = process.argv[2] || '8322';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 720, height: 1280 },
    args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setCacheEnabled(false); // 构建产物同名同路径，浏览器缓存会跑旧代码
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

/** 等引擎起来且场景名为 main */
async function waitMain() {
    for (let i = 0; i < 90; i++) {
        const ok = await page.evaluate(() =>
            !!(window.cc && cc.director.getScene() && cc.director.getScene().name === 'main' && (window.__fanren || {}).stack));
        if (ok) return true;
        await sleep(500);
    }
    return false;
}

/** 按帧等待（headless rAF 节流，等毫秒不可靠） */
async function waitFrames(n = 30) {
    await page.evaluate((k) => new Promise((res) => {
        let c = 0;
        const step = () => { if (++c >= k) res(); else requestAnimationFrame(step); };
        requestAnimationFrame(step);
    }), n);
}

const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

// ---------- 启动与存档注入 ----------
await page.goto(URL, { waitUntil: 'domcontentloaded' });
if (!await waitMain()) throw new Error('引擎未启动');
await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fanren_save_v1'));
    // M11 捏人档：未设道号会进 ProfileScene 挡住巡检
    s.profile = { gender: 'm', name: '云隐', createdAt: Date.now() };
    s.jiyuan = 200;          // 满足突破阈值（100）
    s.lingshi = 5000;
    s.daily.dailyGiftUsed = false;
    localStorage.setItem('fanren_save_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'domcontentloaded' });
if (!await waitMain()) throw new Error('重载后引擎未启动');
await page.evaluate(() => { try { cc.debug.setDisplayStats(false); } catch {} });
await waitFrames(40);

const topName = () => page.evaluate(() => {
    const g = window.__fanren;
    return g && g.stack && g.stack.top ? g.stack.top.node.name : '(none)';
});
const stackNames = () => page.evaluate(() => {
    const g = window.__fanren;
    return g.stack.stack.map((s) => s.node.name);
});
const frame = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
});
/** 设计系坐标 → 页面像素 */
function px(x, y) {
    return [frame.x + frame.w * (x + 360) / 720, frame.y + frame.h * (640 - y) / 1280];
}
async function tap(x, y) {
    const [a, b] = px(x, y);
    await page.mouse.click(a, b);
}
/** 按文字找按钮并点击（世界坐标 → 像素） */
async function tapButton(text) {
    const pos = await page.evaluate((t) => {
        let hit = null;
        const walk = (n) => {
            if (hit || !n) return;
            const lb = n.getComponent && n.getComponent(cc.Label);
            if (lb && lb.string === t) { hit = n; return; }
            n.children.forEach(walk);
        };
        walk(cc.director.getScene());
        if (!hit) return null;
        const w = hit.worldPosition;
        return { x: w.x, y: w.y };
    }, text);
    if (!pos) return false;
    // worldPosition 以屏幕左下为原点、y 向上（Cocos UI 世界系），与 tap() 的中心原点不同
    const a = frame.x + frame.w * (pos.x / 720);
    const b = frame.y + frame.h * (1 - pos.y / 1280);
    await page.mouse.click(a, b);
    return true;
}
async function shot(name) {
    await page.screenshot({ path: `docs/screenshots/p0-${name}.png` });
}

// ---------- 路径 A：主页 → 商店 → 领每日 → 开箱 → 突破 → 渡劫 → 结算 → 回主页 ----------
check('初始在主页', (await topName()) === 'HomeScene', await stackNames().then(JSON.stringify));

await tap(-166, -316); // 仙府商店
await waitFrames(50);
check('进入商店', (await topName()) === 'ShopScene');

await tap(232, 325); // 领取（gift 面板内按钮）
await sleep(4600);   // Mock 广告 3s 倒计时后自动发放
await waitFrames(40);
const used = await page.evaluate(() => window.__fanren.save.daily.dailyGiftUsed);
check('每日已标记领取', used === true);
check('领取后进入开箱页', (await topName()) === 'BoxScene');
await shot('1-box');

// 收下奖励 → afterSettle → canBreakthrough → swap(Rain)
const clicked = await tapButton('收下本次所得，暂作休整');
await waitFrames(60);
check('结果弹窗可点（收下奖励）', clicked);
check('开箱后 swap 进入灵气雨', (await topName()) === 'RainScene');
const namesAfterSwap = await stackNames();
check('swap 保留栈底主页（P0-2 核心）',
    namesAfterSwap[0] === 'HomeScene' && namesAfterSwap[namesAfterSwap.length - 1] === 'RainScene',
    JSON.stringify(namesAfterSwap));
await shot('2-rain');

// 等雨结束自动进结算（雨时长约 8s + 缓冲）
await sleep(13000);
await waitFrames(30);
check('渡劫结束进入结算页', (await topName()) === 'ResultScene', await topName());
await shot('3-result');

const backOk = await tapButton('返回仙府');
await waitFrames(50);
check('结算页有返回按钮（P0-1 同源保障）', backOk);
check('返回后回到主页', (await topName()) === 'HomeScene');
const namesEnd = await stackNames();
check('回到主页后栈只有一层', namesEnd.length === 1, JSON.stringify(namesEnd));
await shot('4-home');

// ---------- 路径 B：P0-3 防重复领取 ----------
await tap(-166, -316); // 再进商店
await waitFrames(50);
const giftText = await page.evaluate(() => {
    let hit = null;
    const walk = (n) => {
        if (hit || !n) return;
        const lb = n.getComponent && n.getComponent(cc.Label);
        if (lb && /已领取|领\s*取/.test(lb.string)) { hit = lb.string; return; }
        n.children.forEach(walk);
    };
    walk(cc.director.getScene());
    return hit;
});
check('商店按钮重建为「已领取」（onResume 整页重建生效）', giftText === '已领取', String(giftText));

// 点「已领取」按钮本体：应被 toast 拦截且不再弹广告/开箱
const btnPos = await page.evaluate(() => {
    let hit = null;
    const walk = (n) => {
        if (hit || !n) return;
        const lb = n.getComponent && n.getComponent(cc.Label);
        if (lb && lb.string === '已领取') { hit = n; return; }
        n.children.forEach(walk);
    };
    walk(cc.director.getScene());
    if (!hit) return null;
    const w = hit.parent.worldPosition; // 按钮容器
    return { x: w.x, y: w.y };
});
if (btnPos) {
    const [a, b] = px(btnPos.x, btnPos.y);
    await page.mouse.click(a, b);
    await sleep(1200);
    await waitFrames(20);
}
check('重复点击不再进入开箱', (await topName()) === 'ShopScene');
const stillUsed = await page.evaluate(() => window.__fanren.save.daily.dailyGiftUsed);
check('领取标记未被篡改', stillUsed === true);
await shot('5-shop-claimed');

await browser.close();

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} 项通过${errors.length ? `；页面错误 ${errors.length} 条：${errors[0]}` : '；零页面错误'}`);
process.exit(fails.length || errors.length ? 1 : 0);
