/**
 * UI 布局静态审计器（layout-audit.mjs）
 *
 * 为什么需要它：本项目全部 UI 由代码在运行时构建（assets/scripts/scenes/*.ts），
 * 没有 .prefab / .scene 可以对着量坐标。节点位置散落在 `setPosition()` 调用里，
 * 「面板压面板 / 文字溢出容器 / 元素出屏」只能靠人眼或截图发现。这里用 TS AST
 * 把每个场景的节点树（父节点、包围盒、字号）重建出来，做定量检查。
 *
 * 用法：
 *   node tools/layout-audit.mjs                    # 全部场景
 *   npm run audit:layout                          # 同上（package.json 脚本）
 *   node tools/layout-audit.mjs --scene TowerBattle # 单场景
 *   node tools/layout-audit.mjs --json /tmp/lay.json --all   # 导出节点树（含 flat 字段）
 *
 * 检查项：
 *   E1 panel∩panel     两块背板互相压 —— 视觉上「模块叠加」
 *   E2 label-overflow  文本估算宽度超出所在容器 / 压到兄弟容器
 *   E3 out-of-bounds   元素超出设计安全区
 *   E4 label-clip      换行后高度溢出父容器
 *   E5 hit-overlap     两按钮的**点击区**相交（视觉不压、但会互相抢点击）
 *   W1 tiny-touch      可点击元素 < MIN_TOUCH(88) 设计单位
 *
 * ── 建模约定（改判定前必读，每条都对应一类误报）─────────────────────────
 * 1. **作用域**：`const` 是方法局部、`this.x` 是类字段（跨方法可见）。两者混在一张
 *    表里会让同名局部变量把彼此误标成「重新赋值 → 坐标不可信」，整块 UI 漏检。
 * 2. **互斥分支**：不同方法（tab 页）、if/else 的两条腿、循环体都不会同屏，判重叠时
 *    必须按 method + branch 隔离，否则报出一堆假阳性。
 * 3. **点击区 vs 视觉**：`spriteButton` / `iconButton` 的点击区会被撑到 MIN_TOUCH，
 *    视觉尺寸不变（见 ThemeLib 的 touchFloor 构件）。E5 用 hitRect、W1 用撑后尺寸，
 *    E1/E3 用视觉尺寸 —— 两者分开算才对。
 * 4. **透明容器**：`uinode` 只挂子件、不画不接触摸（如 statusBar 的 720×132 根），
 *    不参与叠压判定；满宽构件（w ≥ 700）按设计贴边，不判横向出屏。
 * 5. **第二参不是尺寸**：`statusBar(parent, y)` 传的是 y 坐标。签名表用 `yArg` 标这类
 *    构件，别跟 `w/h` 混。
 * 6. **失效信号**：报告突然变多/变少，先怀疑解析规则（`BUILDERS` 签名、`coreOf`
 *    剥壳、`applyPosition` 的接收者解析），而不是先改布局代码。
 *
 * 局限：只解析字面量与常量算术；依赖运行时数据的坐标（如 `y + i * 30`）
 * 会被标记 dynamic 并跳过。报告需要人眼复核，不替代真机截图。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENES_DIR = path.join(ROOT, 'assets/scripts/scenes');
const UI_DIR = path.join(ROOT, 'assets/scripts/ui');

const argv = process.argv.slice(2);
const argOf = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : null;
};
const only = argOf('--scene');
const jsonOut = argOf('--json');
const showAll = argv.includes('--all');

/** 设计系常量（与 ThemeLib 保持一致，改那边记得同步这里） */
const DESIGN_W = 720;
const DESIGN_H = 1280;
const SAFE = { x: 28, top: 92, bottom: 104 };
const CONSTS = {
    DESIGN_W,
    DESIGN_H,
    SAFE,
    HALF_W: DESIGN_W / 2,
    HALF_H: DESIGN_H / 2,
};

/**
 * 触摸目标下限（设计单位）。
 * 抖音小游戏主流机型屏宽 1080 物理px，设计宽 720 → 1 设计单位 = 1.5 物理px。
 * iOS 44pt@3x / Android 48dp@3x ≈ 132~144 物理px → 折合 88~96 设计单位。
 * 这里取 88（对应 132px / 44pt），低于此值在真机上就是「点不中」。
 */
const MIN_TOUCH = 88;

/** 容器型构件（不透明背板 / 按钮 / 进度条）——只有它们互相压才是「叠加」 */
const CONTAINERS = new Set(['panel', 'button', 'progress', 'washed']);
/** 明确装饰、允许覆盖别人的（全屏底图 / 遮罩 / 渐隐层 / 舞台容器） */
const DECOR = new Set(['background', 'scrim', 'dim', 'stage', 'dialog']);
/** 设计上就允许超屏的构件：pageHeader 顶边贴刘海区、stage 是舞台容器（内容自行避让） */
const MAY_OVERFLOW = new Set(['header', 'stage']);

// ───────────────────────── 表达式求值（只认字面量与常量算术） ─────────────────────────

/** 按文本 eval 一个数值表达式（如 `'286'` / `'-70'` / `'THEME.void'`），失败返回 null */
function evalNumSafe(text, env) {
    if (typeof text !== 'string') return null;
    const n = Number(text);
    if (!Number.isNaN(n)) return n;
    if (env && Object.prototype.hasOwnProperty.call(env, text)) return env[text];
    return null;
}

function evalNum(node, env) {
    if (!node) return null;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.PrefixUnaryExpression) {
        const v = evalNum(node.operand, env);
        if (v === null) return null;
        const op = node.operator;
        if (op === ts.SyntaxKind.MinusToken) return -v;
        if (op === ts.SyntaxKind.PlusToken) return v;
        return null;
    }
    if (ts.isParenthesizedExpression(node)) return evalNum(node.expression, env);
    if (ts.isIdentifier(node)) {
        const name = node.text;
        if (env && Object.prototype.hasOwnProperty.call(env, name)) {
            const v = env[name];
            return typeof v === 'number' ? v : null;
        }
        if (Object.prototype.hasOwnProperty.call(CONSTS, name)) return CONSTS[name];
        return null;
    }
    if (ts.isPropertyAccessExpression(node)) {
        const base = node.expression.getText();
        const key = node.name.text;
        const holder =
            env && Object.prototype.hasOwnProperty.call(env, base) ? env[base] : CONSTS[base];
        if (holder && typeof holder === 'object' && Object.prototype.hasOwnProperty.call(holder, key)) {
            const v = holder[key];
            return typeof v === 'number' ? v : null;
        }
        return null;
    }
    if (ts.isBinaryExpression(node)) {
        const l = evalNum(node.left, env);
        const r = evalNum(node.right, env);
        if (l === null || r === null) return null;
        switch (node.operatorToken.kind) {
            case ts.SyntaxKind.PlusToken: return l + r;
            case ts.SyntaxKind.MinusToken: return l - r;
            case ts.SyntaxKind.AsteriskToken: return l * r;
            case ts.SyntaxKind.SlashToken: return r === 0 ? null : l / r;
            default: return null;
        }
    }
    return null;
}

function evalStr(node, env) {
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isIdentifier(node) && env && typeof env[node.text] === 'string') return env[node.text];
    return null;
}

function boolOf(node, env) {
    if (!node) return false;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (ts.isIdentifier(node)) return node.text === 'true';
    if (ts.isPropertyAccessExpression(node)) return node.name.text === 'true';
    return false;
}

// ───────────────────────── 文本宽度估算 ─────────────────────────

/**
 * 中日韩表意文字按 1.0em、拉丁/数字按 0.56em、空格 0.3em 估算。
 * 字体是 Noto Serif SC + PingFang，量级够用（误差只影响「临界」那一档）。
 */
export function estimateTextWidth(text, fontSize) {
    if (!text) return 0;
    let units = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0);
        const cjk =
            (code >= 0x2e80 && code <= 0x9fff) ||
            (code >= 0xf900 && code <= 0xfaff) ||
            (code >= 0xff00 && code <= 0xff60) ||
            (code >= 0x3000 && code <= 0x303f);
        if (cjk) units += 1;
        else if (ch === ' ') units += 0.3;
        else if (/[iIl1.,:;'!|]/.test(ch)) units += 0.32;
        else if (/[A-Z0-9%]/.test(ch)) units += 0.6;
        else units += 0.56;
    }
    return units * fontSize;
}

// ───────────────────────── 构件签名表 ─────────────────────────

const BUILDERS = {
    uinode: { kind: 'plain', w: 2, h: 3 },
    image: { kind: 'image', w: 2, h: 3 },
    spritePanel: { kind: 'panel', w: 1, h: 2 },
    washedPanel: { kind: 'washed', w: 1, h: 2 },
    progressBar: { kind: 'progress', w: 1, h: 2 },
    // spriteButton(parent, w, h, text, onClick, opts)：w/h 是视觉尺寸，
    // 实际点击区被撑到 MIN_TOUCH（见 ThemeLib.spriteButton）。
    spriteButton: { kind: 'button', w: 1, h: 2, handle: true, touchFloor: true },
    // iconButton(parent, iconPath, onClick, w, h, opts)：w/h 是**视觉**尺寸；
    // 实际点击区会被撑到 MIN_TOUCH（见 ThemeLib.iconButton），故 touchFloor=true。
    iconButton: {
        kind: 'button',
        w: 3,
        h: 4,
        defaults: { w: 88, h: 88 },
        handle: true,
        touchFloor: true,
    },
    scrim: { kind: 'scrim', w: 1, h: 2 },
    dimLayer: { kind: 'dim' },
    pageBackground: { kind: 'background' },
    label: { kind: 'label', w: 2 },
    // labelL 语义就是「x = 文本左边缘」，opts 里不必再写 anchorLeft
    labelL: { kind: 'label', w: 2, anchorLeft: true },
    spriteAnimation: { kind: 'image', w: 2, h: 3 },
    makeRedDot: { kind: 'dot', fixed: { w: 18, h: 18 } },
    toast: { kind: 'toast', fixed: { w: 540, h: 94 }, y: 196 },
    // statusBar(parent, y = DESIGN_H/2 - 132)：第二参是 **y 坐标**、不是高度。
    // 尺寸恒为 720×132。误当成 h 会把 bar 放错高度，引出一堆假重叠。
    // 透明根节点：只挂视觉子件、不画不接触摸 —— 不参与叠压判定（visible=0）
    statusBar: { kind: 'plain', fixed: { w: 720, h: 132 }, yArg: 1, yDefault: DESIGN_H / 2 - 132 },
    pageHeader: { kind: 'header', fixed: { w: DESIGN_W, h: 110 }, y: DESIGN_H / 2 - SAFE.top },
    showDialog: { kind: 'dialog' },
};

// ───────────────────────── 节点模型 ─────────────────────────

let uid = 0;
function makeNode(name, kind, w, h, extra = {}) {
    return {
        uid: uid++,
        name,
        kind,
        w,
        h,
        parent: null,
        x: 0,
        y: 0,
        hasPos: false,
        dynamic: false,
        inLoop: false,
        loopLabel: null,
        children: [],
        ...extra,
    };
}

class Analyzer {
    constructor(file) {
        this.file = file;
        /** 当前所处的类方法名——LudaoScene 等页面按 tab 互斥渲染，
         *  不同方法建的兄弟节点永远不会同屏，判重叠时必须按方法分组。 */
        this.method = '<top>';
        /** 互斥分支编号：if/else 的两条腿、三元表达式只会有一条执行，
         *  同一变量在两条腿里可能被 setPosition 成不同坐标，判重叠必须按分支隔离。 */
        this.branch = 0;
        this.env = { ...CONSTS };
        this.scopes = [this.env];
        /**
         * 局部箭头函数表：`const railLabel = (text, y, x = 286) => label(...)`。
         * 记下它的形参与默认值，调用处漏传时才能算对 —— 否则 `railLabel('图鉴', -70)`
         * 会被当成 x=0，而真实渲染在 x=286（悄悄飞到屏幕另一侧压住别的按钮）。
         */
        this.closures = new Map();
        /** 方法局部变量表（每次进入方法新建，出方法丢弃） */
        this.locals = new Map();
        /** 类字段表（this.xxx，跨方法共享 —— 按钮常存在 this.quitBtn 上） */
        this.fields = new Map();
        this.root = makeNode(path.basename(file, '.ts'), 'root', DESIGN_W, DESIGN_H);
        this.root.hasPos = true;
    }

    pushEnv(extra) {
        this.env = { ...this.env, ...extra };
        this.scopes.push(this.env);
        return this.env;
    }

    popEnv() {
        this.scopes.pop();
        this.env = this.scopes[this.scopes.length - 1];
    }

    bind(name, node, isField = false) {
        if (!name) return;
        const table = isField ? this.fields : this.locals;
        const list = table.get(name) || [];
        for (const old of list) old.dynamic = true;
        list.push(node);
        table.set(name, list);
    }

    lookup(name) {
        // 局部变量优先（当前方法内），回退到类字段
        const local = this.locals.get(name);
        if (local && local.length) return local[local.length - 1];
        const field = this.fields.get(name);
        if (field && field.length) return field[field.length - 1];
        return null;
    }

    /** 把 `n` / `this.node` / `hud` / `this.hud.node` 解析成父节点 */
    resolveParent(arg) {
        if (!arg) return null;
        if (ts.isIdentifier(arg)) {
            if (arg.text === 'n' || arg.text === 'node') return this.root;
            return this.lookup(arg.text) || this.root;
        }
        if (ts.isPropertyAccessExpression(arg)) {
            const text = arg.getText().replace(/\.node$/, '');
            if (text === 'this.node') return this.root;
            const node = this.lookup(text);
            return node || this.root;
        }
        return this.root;
    }

    /**
     * 剥掉尾部调用与属性访问，返回「核心」：
     *   - spritePanel(n, 648, 84).setPosition(0,470,0) → spritePanel(...) 的 CallExpression
     *   - hud.setPosition(0,470,0)                   → Identifier hud
     *   - this.breakBtn.node.setPosition(...)        → PropertyAccess this.breakBtn
     */
    static coreOf(expr) {
        let cur = expr;
        for (;;) {
            if (ts.isCallExpression(cur)) {
                // builder(...) 本身就是核心，停下（它的 callee 是 Identifier）
                if (ts.isIdentifier(cur.expression)) return cur;
                cur = cur.expression;
            } else if (ts.isPropertyAccessExpression(cur)) {
                cur = cur.expression;
            } else if (ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) {
                cur = cur.expression;
            } else {
                return cur;
            }
        }
    }

    /**
     * 在表达式链上找 setPosition 调用，返回 `{ args, recv }`：
     * `args` 是实参，`recv` 是**接收者表达式**（`this.breakBtn.node` / `hud` / `label(...)`）。
     *
     * 必须单独拿接收者：coreOf 会把 `this.breakBtn.node.setPosition(...)` 一路剥到
     * `this`，据此查表必然落空，节点坐标会停在 (0,0) —— 表现为所有「按钮存进类字段」
     * 的写法全部重疊在原点（HomeScene 5 条误报的根因）。
     */
    static findSetPosition(expr) {
        let cur = expr;
        while (cur) {
            if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
                if (cur.expression.name.text === 'setPosition') {
                    return { args: cur.arguments, recv: cur.expression.expression };
                }
            }
            if (ts.isPropertyAccessExpression(cur) || ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) cur = cur.expression;
            else if (ts.isCallExpression(cur)) cur = cur.expression;
            else return null;
        }
        return null;
    }

    /**
     * 若初始化式是箭头函数，解析出 `{ params, body }`（params 记默认值源码）。
     * 只处理本审计器关心的形态：`(a, b = <数字/常量>) => <单个表达式>`。
     */
    static closureOf(init) {
        const arrow = ts.isParenthesizedExpression(init) ? init.expression : init;
        if (!ts.isArrowFunction(arrow) || arrow.parameters.length === 0) return null;
        const params = arrow.parameters.map((p) => {
            const def = p.initializer ? p.initializer.getText() : null;
            return { name: p.name.getText(), def };
        });
        return { params, body: arrow.body };
    }

    handleStatement(st, loopLabel) {
        if (ts.isVariableStatement(st)) {
            for (const d of st.declarationList.declarations) {
                if (!d.initializer) continue;
                const name = d.name.getText();
                const closure = Analyzer.closureOf(d.initializer);
                if (closure) {
                    this.closures.set(name, closure);
                    continue;
                }
                this.handleInit(name, d.initializer, loopLabel);
            }
            return true;
        }
        if (ts.isExpressionStatement(st)) {
            // `this.quitBtn = spriteButton(...)` —— 赋值表达式包着 builder 调用。
            // 少了这一支，23 处「按钮存进类字段」的写法会整体漏检
            // （节点不建 → 既不判重叠也不判出屏）。
            if (ts.isBinaryExpression(st.expression) && st.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                const lhs = st.expression.left;
                if (ts.isPropertyAccessExpression(lhs) && lhs.expression.kind === ts.SyntaxKind.ThisKeyword) {
                    this.handleInit(lhs.getText(), st.expression.right, loopLabel);
                    return true;
                }
            }
            // 局部箭头函数调用：`railLabel('图鉴', -70)`。
            // 把缺失的实参按形参默认值补齐，再把闭包体里的 builder 调用展开 ——
            // 否则这类「工厂函数造出来的 UI」整块不进节点树（HomeScene 的 5 个 rail 标签
            // 全是这样造的，不展开就一个都查不到）。
            const call = st.expression;
            if (ts.isCallExpression(call) && ts.isIdentifier(call.expression)) {
                const cl = this.closures.get(call.expression.text);
                if (cl) {
                    this.expandClosure(call, cl, loopLabel);
                    return true;
                }
            }
            this.handleInit(null, st.expression, loopLabel);
            return true;
        }
        if (ts.isReturnStatement(st)) return true;
        return false;
    }

    /**
     * 展开局部箭头函数调用：把实参与默认值对齐成「完全参数表」，再解析闭包体。
     * 只展开闭包体里**直接的 builder 调用**（不追嵌套闭包、不做控制流）——
     * 足以覆盖 `railLabel = (t, y, x = 286) => label(n, t, 18, {...}).setPosition(x, y, 0)`
     * 这种 UI 工厂的典型写法。
     */
    expandClosure(call, cl, loopLabel) {
        // 对齐形参与实参：实参不足用默认值文本回填，多余的忽略
        const filled = cl.params.map((p, i) => {
            const arg = call.arguments[i];
            if (arg) return arg.getText();
            if (p.def !== null) return p.def;
            return null;
        });
        const tmp = new Map();
        filled.forEach((expr, i) => {
            if (expr === null) return;
            tmp.set(cl.params[i].name, expr);
        });
        // 用「形参名 → 实参值」临时 env 跑一遍闭包体：
        // env 里放的是**求值后的数字**（形参名 → 实参算出来的值），
        // 这样闭包体里的 `x` / `y` 无论来自实参还是默认值都能算对。
        const savedEnv = this.env;
        const bound = {};
        for (const [k, v] of tmp) {
            const n = evalNumSafe(v, savedEnv);
            if (n !== null) bound[k] = n;
        }
        this.pushEnv(bound);
        const body = cl.body;
        if (ts.isCallExpression(body) || ts.isPropertyAccessExpression(body)) {
            this.handleInit(null, body, loopLabel);
        }
        this.popEnv();
    }

    handleInit(name, init, loopLabel, closureParams = null) {
        const sp = Analyzer.findSetPosition(init);
        const setArgs = sp ? sp.args : null;

        // 形式零：`this.breakBtn.node.setPosition(0, -68, 0)` 独立成句。
        // 此时名字从接收者取，与 builder 调用无关。
        if (sp && !name) {
            const recv = sp.recv;
            if (ts.isIdentifier(recv) || ts.isPropertyAccessExpression(recv)) {
                const key = recv.getText().replace(/[!?]?\.node$/, '');
                if (key === 'this.node' || key === 'node') return true;
                const target = this.lookup(key);
                if (target) this.applyPosition(target, setArgs);
                return true;
            }
            // 接收者是 builder 调用（`spriteButton(...).setPosition(...)`）→ 交给下面的 builder 路径
        }

        const core = Analyzer.coreOf(init);

        // 形式一：`hud.setPosition(...)` / `this.breakBtn.node.setPosition(...)` / `x.node.setPosition`
        if (!ts.isCallExpression(core)) {
            const key = core.getText().replace(/\.node$/, '');
            if (key === 'this.node') return;
            const target = this.lookup(key);
            if (target) this.applyPosition(target, setArgs);
            return;
        }

        const fn = core.expression.getText();
        const spec = BUILDERS[fn];
        if (!spec) return;
        const args = core.arguments;
        const env = this.env;
        const parent = this.resolveParent(args[0]);
        const node = this.buildNode(spec, fn, args, env, name);
        if (!node) return;
        node.method = this.method;
        node.branch = this.branch;
        node.parent = parent || this.root;
        if (loopLabel) {
            node.inLoop = true;
            node.loopLabel = loopLabel;
        }
        if (parent) parent.children.push(node);
        // `this.xxx = spriteButton(...)` 是类字段，跨方法可见；
        // 裸 `const xxx = ...` 是方法局部，只在本方法内查得到。
        if (name) this.bind(name, node, name.startsWith('this.'));
        if (setArgs) this.applyPosition(node, setArgs);
    }

    buildNode(spec, fn, args, env, name) {
        if (spec.kind === 'label') {
            const text = evalStr(args[1], env);
            const fontSize = evalNum(args[2], env) ?? 24;
            const opts = { ...this.readLabelOpts(args[3]) };
            if (spec.anchorLeft) opts.anchorLeft = true;
            const est = estimateTextWidth(text ?? '', fontSize);
            const w = opts.width ?? Math.max(20, Math.ceil(est));
            const lineHeight = opts.lineHeight ?? Math.round(fontSize * 1.25);
            const lines = opts.width ? Math.max(1, Math.ceil(est / Math.max(1, opts.width))) : 1;
            return makeNode(`«${(text ?? '?').slice(0, 16)}»`, 'label', text === null ? 0 : w, lineHeight * lines, {
                unknownText: text === null,
                text,
                fontSize,
                lineHeight,
                lines,
                shrink: opts.shrink,
                align: opts.align,
                anchorLeft: opts.anchorLeft,
                estWidth: est,
            });
        }
        if (spec.kind === 'toast') {
            const node = makeNode('toast', 'toast', spec.fixed.w, spec.fixed.h);
            node.y = spec.y;
            node.hasPos = true;
            return node;
        }
        if (spec.kind === 'background' || spec.kind === 'dim' || spec.kind === 'dialog') {
            const big = DESIGN_W * 2;
            const node = makeNode(fn, spec.kind, big, big);
            node.hasPos = true;
            return node;
        }
        const w = spec.fixed ? spec.fixed.w : evalNum(args[spec.w], env) ?? spec.defaults?.w ?? 0;
        const h = spec.fixed ? spec.fixed.h : evalNum(args[spec.h], env) ?? spec.defaults?.h ?? 0;
        const node = makeNode(`${fn}${name2(name, fn)}`, spec.kind, w, h, {
            touchFloor: spec.touchFloor === true,
        });
        if (spec.y !== undefined) {
            node.y = spec.y;
            node.hasPos = true;
        } else if (spec.yArg !== undefined) {
            // 第二参是 y 坐标的构件（statusBar(parent, y)）
            const y = evalNum(args[spec.yArg], env);
            node.y = y === null ? spec.yDefault : y;
            node.hasPos = true;
        }
        return node;
    }

    readLabelOpts(arg) {
        const out = { width: null, shrink: false, align: null, lineHeight: null, anchorLeft: false };
        if (!arg || !ts.isObjectLiteralExpression(arg)) return out;
        for (const p of arg.properties) {
            if (!ts.isPropertyAssignment(p)) continue;
            const key = p.name.getText();
            if (key === 'width') out.width = evalNum(p.initializer, this.env);
            else if (key === 'shrink') out.shrink = boolOf(p.initializer, this.env);
            else if (key === 'align') out.align = evalStr(p.initializer, this.env);
            else if (key === 'lineHeight') out.lineHeight = evalNum(p.initializer, this.env);
            else if (key === 'anchorLeft') out.anchorLeft = boolOf(p.initializer, this.env);
        }
        return out;
    }

    applyPosition(node, setArgs) {
        if (!node) return;
        if (!setArgs) {
            node.dynamic = true;
            return;
        }
        const x = evalNum(setArgs[0], this.env);
        const y = evalNum(setArgs[1], this.env);
        if (x === null || y === null) {
            node.dynamic = true;
            return;
        }
        node.x = x;
        node.y = y;
        node.hasPos = true;
    }

    /** 顶层语句 → 类方法体（UI 全部在 onEnter 里构建） */
    visitProgram(statements) {
        for (const st of statements) {
            if (ts.isClassDeclaration(st)) {
                for (const m of st.members) {
                    if (!ts.isMethodDeclaration(m) || !m.body) continue;
                    const prevMethod = this.method;
                    // 方法局部变量表要隔离：`const quit` 在 buildFooter 与
                    // buildReviveOverlay 各有一个，是两个不同节点。若共用一张表，
                    // 后者会把前者误标成「重新赋值 → 坐标不可信」，footer 的按钮
                    // 就整体漏检了。类字段（this.xxx）仍需跨方法共享，故只快照局部表。
                    const prevLocals = this.locals;
                    this.method = m.name.getText();
                    this.locals = new Map();
                    this.visitBody(m.body.statements);
                    this.locals = prevLocals;
                    this.method = prevMethod;
                }
                continue;
            }
            if (ts.isFunctionDeclaration(st) && st.body) {
                this.visitBody(st.body.statements);
                continue;
            }
            this.handleStatement(st, null);
        }
    }

    visitBody(body, loopLabel = null) {
        const list = Array.isArray(body) ? body : ts.isBlock(body) ? body.statements : ts.isStatement(body) ? [body] : [];
        for (const st of list) {
            if (ts.isForOfStatement(st) || ts.isForStatement(st) || ts.isForInStatement(st)) {
                this.visitLoop(st, loopLabel);
                continue;
            }
            if (ts.isIfStatement(st)) {
                this.branch += 1;
                this.visitBody(st.thenStatement, loopLabel);
                this.branch += 1;
                if (st.elseStatement) this.visitBody(st.elseStatement, loopLabel);
                this.branch -= 2;
                continue;
            }
            if (ts.isBlock(st)) {
                this.visitBody(st.statements, loopLabel);
                continue;
            }
            if (this.handleStatement(st, loopLabel)) continue;
            st.forEachChild((c) => {
                if (ts.isStatement(c) && !ts.isBlock(c) && !ts.isVariableStatement(c) && !ts.isExpressionStatement(c)) {
                    this.handleStatement(c, loopLabel);
                }
            });
        }
    }

    /** 只对数组字面量的 forEach / for-of 展开，让 HomeScene 的入口环也能静态算出 */
    visitLoop(st, loopLabel) {
        const arrNode =
            ts.isForOfStatement(st) && ts.isArrayLiteralExpression(st.expression)
                ? st.expression
                : st.initializer && ts.isCallExpression(st.initializer)
                  ? st.initializer.arguments[0]
                  : null;
        if (!arrNode || !ts.isArrayLiteralExpression(arrNode)) return;
        const label = loopLabel || 'loop';
        const names = destructNames(st);
        if (!names) return;
        arrNode.elements.forEach((el, idx) => {
            this.pushEnv({});
            if (el && ts.isArrayLiteralExpression(el)) {
                el.elements.forEach((v, i) => {
                    if (!names[i]) return;
                    this.env[names[i]] = evalNum(v, this.env) ?? evalStr(v, this.env) ?? null;
                });
            } else if (names[0] != null) {
                this.env[names[0]] = evalNum(el, this.env) ?? evalStr(el, this.env) ?? null;
            }
            this.branch += 1;
            const body = ts.isBlock(st.statement) ? st.statement.statements : [st.statement];
            this.visitBody(body, `${label}#${idx}`);
            this.branch -= 1;
            this.popEnv();
        });
    }
}

function name2(name, fn) {
    return name ? `:${name.replace(/^this\./, '')}` : `:${fn}`;
}

function destructNames(st) {
    if (ts.isForOfStatement(st) && ts.isVariableDeclarationList(st.initializer)) {
        const name = st.initializer.declarations[0]?.name;
        if (name && ts.isObjectBindingPattern(name)) return name.elements.map((e) => e.name.getText());
        return null;
    }
    if (!ts.isForEachStatement(st)) return null;
    const cb = st.statement;
    if (!ts.isArrowFunction(cb) && !ts.isFunctionExpression(cb)) return null;
    const p = cb.parameters[0];
    if (!p) return null;
    if (ts.isObjectBindingPattern(p.name)) return p.name.elements.map((e) => e.name.getText());
    if (ts.isArrayBindingPattern(p.name)) return p.name.elements.map((e) => e.name.getText());
    return null;
}

// ───────────────────────── 遍历 + 检查 ─────────────────────────

function walk(node, cb) {
    cb(node);
    for (const c of node.children) walk(c, cb);
}

/**
 * 节点包围盒，**父容器局部坐标**（用于兄弟重叠判定）。
 * label() 的 anchorLeft 会把锚点挪到左中，此时 x 就是**文本左边缘**，
 * 不再按居中算 —— 否则左对齐列表行会被误判出屏。
 */
const rect = (n) => {
    const x0 = n.anchorLeft ? n.x : n.x - n.w / 2;
    const x1 = n.anchorLeft ? n.x + n.w : n.x + n.w / 2;
    return { x0, x1, y0: n.y - n.h / 2, y1: n.y + n.h / 2 };
};

/** 节点包围盒，**场景绝对坐标**（用于出屏判定）。node._abs 已含自身偏移。 */
const rectAbs = (n) => {
    const x0 = n._abs.x + (n.anchorLeft ? 0 : -n.w / 2);
    const x1 = n._abs.x + (n.anchorLeft ? n.w : n.w / 2);
    return { x0, x1, y0: n._abs.y - n.h / 2, y1: n._abs.y + n.h / 2 };
};

/** a 是否完整包住 b（「面板套面板」是正常设计，不算叠加） */
function contains(a, b) {
    const ra = rect(a);
    const rb = rect(b);
    return ra.x0 <= rb.x0 + 1 && ra.x1 >= rb.x1 - 1 && ra.y0 <= rb.y0 + 1 && ra.y1 >= rb.y1 - 1;
}

/**
 * 按钮的**有效点击区**包围盒（父容器局部坐标）。
 * touchFloor 构件的点击区被撑到 MIN_TOUCH（见 ThemeLib.spriteButton / iconButton），
 * 两个按钮的点击区一旦相交，就会互相抢点击 —— 比「点不中」更糟。
 */
const hitRect = (n) => {
    const r = rect(n);
    if (!n.touchFloor) return r;
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const hw = Math.max(n.w, MIN_TOUCH) / 2;
    const hh = Math.max(n.h, MIN_TOUCH) / 2;
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
};

function overlapArea(a, b) {
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    return w > 0 && h > 0 ? w * h : 0;
}

function analyze(file) {
    const src = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const az = new Analyzer(file);
    az.visitProgram(sf.statements);

    (function abs(node, ax = 0, ay = 0) {
        const nx = ax + (node.hasPos ? node.x : 0);
        const ny = ay + (node.hasPos ? node.y : 0);
        node._abs = { x: nx, y: ny };
        for (const c of node.children) abs(c, nx, ny);
    })(az.root);

    const issues = [];
    const seen = new Set();
    const add = (level, code, msg, nodes) => {
        const key = `${code}|${msg}|${nodes.map((n) => n.uid).join(',')}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push({
            level,
            code,
            msg,
            nodes: nodes.map((n) => `${n.name} @(${n._abs.x},${n._abs.y}) ${n.w}×${n.h}`),
        });
    };

    walk(az.root, (node) => {
        const kids = node.children;
        for (let i = 0; i < kids.length; i++) {
            for (let j = i + 1; j < kids.length; j++) {
                const a = kids[i];
                const b = kids[j];
                if (a.dynamic || b.dynamic || a.inLoop || b.inLoop) continue;
                // 互斥分支（不同 tab / 不同方法 / if-else 的两条腿）不会同屏
                if (a.method !== b.method) continue;
                if (a.branch !== b.branch) continue;
                if (a.unknownText && a.w === 0) continue;
                if (b.unknownText && b.w === 0) continue;
                if (DECOR.has(a.kind) || DECOR.has(b.kind)) continue;
                const area = overlapArea(rect(a), rect(b));
                if (area <= 0) continue;
                // 「大面板内嵌小面板/进度条」是标准容器设计，不算叠加
                if (contains(a, b) || contains(b, a)) continue;
                const bothContainer = CONTAINERS.has(a.kind) && CONTAINERS.has(b.kind);
                const cVsLabel = CONTAINERS.has(a.kind) && b.kind === 'label';
                if (!bothContainer && !cVsLabel) continue;
                const minA = Math.min(a.w * a.h, b.w * b.h);
                const ratio = area / minA;
                if (ratio < 0.06) continue;
                // 容器互相压：比例阈值即可。
                // 文字压容器：既要比例够大（压边设计不算错），也要绝对面积够大 ——
                // 只看比例会漏掉「标签压在按钮上下缘 5px」这类小面积但明确压字的情况。
                if (!bothContainer && ratio < 0.25 && area < 400) continue;
                add(
                    'error',
                    bothContainer ? 'E1-panel-overlap' : 'E2-label-overflow',
                    bothContainer
                        ? `两块背板重叠 ${Math.round(ratio * 100)}%（${Math.round(area)}px²）`
                        : `文字压出容器 ${Math.round(ratio * 100)}%（估算宽 ${a.estWidth ?? '-'} vs 盒宽 ${a.w}）`,
                    [a, b],
                );
            }
        }
    });

    // E5：同父按钮的点击区互抢（视觉尺寸不重叠、但扩出来的点击区相交）
    walk(az.root, (node) => {
        if (node.kind === 'root' || node.children.length < 2) return;
        const btns = node.children.filter((c) => c.kind === 'button' && !c.dynamic && !c.inLoop);
        for (let i = 0; i < btns.length; i++) {
            for (let j = i + 1; j < btns.length; j++) {
                const a = btns[i];
                const b = btns[j];
                if (a.method !== b.method || a.branch !== b.branch) continue;
                const area = overlapArea(hitRect(a), hitRect(b));
                if (area <= 0) continue;
                const visual = overlapArea(rect(a), rect(b));
                if (visual > 0) continue; // 视觉本来就压着，E1 已报
                add(
                    'error',
                    'E5-hit-overlap',
                    `点击区相交 ${Math.round(area)}px²（视觉 ${a.w}×${a.h} / ${b.w}×${b.h}）`,
                    [a, b],
                );
            }
        }
    });

    walk(az.root, (node) => {
        if (node.dynamic || node.unknownText) return;
        const box = rectAbs(node);
        // 满宽构件（statusBar 720、遮罩、页头）按设计就是贴边，横向不参与出屏判定
        const isFullWidthContainer = node.w >= 700;
        if (node.kind !== 'root' && !DECOR.has(node.kind) && !MAY_OVERFLOW.has(node.kind) && !isFullWidthContainer) {
            // 安全区：横向留 SAFE.x（720-28=664 可用宽），纵向到设计边界。
            // 文字宽度是估算值，给 30px 容差；容器/图片按实际尺寸硬判（2px）。
            const slack = node.kind === 'label' ? 30 : 2;
            const limitX = DESIGN_W / 2 - SAFE.x;
            const overX = Math.max(0, -box.x0 - limitX - slack, box.x1 - limitX - slack);
            const overTop = Math.max(0, box.y1 - DESIGN_H / 2 - slack);
            const overBottom = Math.max(0, -DESIGN_H / 2 - box.y0 - slack);
            if (overX > 1 || overTop > 1 || overBottom > 1) {
                add(
                    'warn',
                    'E3-out-of-bounds',
                    `出安全区：横向+${Math.round(overX)} 顶部+${Math.round(overTop)} 底部+${Math.round(overBottom)}`,
                    [node],
                );
            }
        }
        if (node.kind === 'button' && node.w > 0 && node.h > 0) {
            const tw = node.touchFloor ? Math.max(node.w, MIN_TOUCH) : node.w;
            const th = node.touchFloor ? Math.max(node.h, MIN_TOUCH) : node.h;
            if (Math.min(tw, th) < MIN_TOUCH) {
                add('warn', 'W1-tiny-touch', `可点击 ${node.w}×${node.h} < ${MIN_TOUCH}`, [node]);
            }
        }
        if (node.kind === 'label' && node.parent && node.parent.kind !== 'root' && !node.anchorLeft) {
            const p = node.parent;
            if (p.w > 0 && !p.dynamic && node.estWidth > p.w + 2) {
                add('warn', 'E2-label-wider-than-parent', `文本估算 ${Math.round(node.estWidth)} > 容器 ${p.w}`, [node, p]);
            }
            if (node.lines > 1 && !node.shrink && p.h > 0 && node.h > p.h) {
                add('warn', 'E4-label-clip', `换行 ${node.lines} 行高 ${node.h} > 容器高 ${p.h}`, [node, p]);
            }
        }
    });

    const flat = [];
    walk(az.root, (n) =>
        flat.push({
            name: n.name,
            kind: n.kind,
            x: n._abs.x,
            y: n._abs.y,
            w: n.w,
            h: n.h,
            dynamic: n.dynamic,
            inLoop: n.inLoop,
            touchFloor: n.touchFloor === true,
            method: n.method,
            branch: n.branch,
        }),
    );
    // ui/ 下的构件坐标是「相对各自父容器」的局部值（ThemeLib.pageHeader 等），
    // 拿去和设计安全区比没有意义 —— 只在场景目录做绝对出屏判定。
    if (file.includes('/ui/')) {
        for (let i = issues.length - 1; i >= 0; i--) if (issues[i].code === 'E3-out-of-bounds') issues.splice(i, 1);
    }
    return { file: path.relative(ROOT, file), issues, nodes: flat };
}

// ───────────────────────── 主流程 ─────────────────────────

const files = fs
    .readdirSync(SCENES_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(SCENES_DIR, f))
    .concat(fs.readdirSync(UI_DIR).filter((f) => f.endsWith('.ts')).map((f) => path.join(UI_DIR, f)));

const results = [];
for (const f of files) {
    if (only && !f.includes(only)) continue;
    results.push(analyze(f));
}

results.sort((a, b) => b.issues.length - a.issues.length);
let total = 0;
for (const r of results) {
    if (!r.issues.length) continue;
    if (!showAll && r.issues.length < 2 && only == null) {
        // 默认只列问题较少的文件末尾汇总，避免刷屏
    }
    total += r.issues.length;
    console.log(`\n── ${r.file}（${r.issues.length}）`);
    for (const it of r.issues) {
        console.log(`  [${it.level}] ${it.code} ${it.msg}`);
        for (const n of it.nodes) console.log(`       · ${n}`);
    }
}
console.log(`\n合计 ${total} 条，覆盖 ${results.length} 个文件。`);

if (jsonOut) {
    fs.writeFileSync(path.resolve(ROOT, jsonOut), JSON.stringify(results, null, 2));
    console.log(`→ ${jsonOut}`);
}