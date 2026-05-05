/**
 * SceneStack 导航栈语义测试（P0-2 回归防护）。
 *
 * SceneStack 位于 infra 层、依赖 'cc'，这里用 vi.mock 提供最小桩：
 * 只需覆盖 SceneStack 实际用到的 API（parent 赋值 / getComponent / addComponent /
 * setPosition / active / destroy）。断言核心不变量：**栈底（主页）永远不被
 * swap/pop 误销毁** —— 旧版 replace 被误用为「替换当前页」时会把 Home 一并
 * 清掉，返回时栈空白屏。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('cc', () => {
    class FakeNode {
        parent: FakeNode | null = null;
        active = true;
        destroyed = false;
        private components: unknown[] = [];
        getComponent(t: unknown) {
            return this.components.find((c) => c instanceof (t as new () => unknown)) ?? null;
        }
        addComponent(t: unknown) {
            const c = new (t as new () => unknown)();
            this.components.push(c);
            return c;
        }
        setPosition() { /* 桩：布局无关 */ }
        destroy() {
            this.destroyed = true;
            this.parent = null;
        }
    }
    class UITransform {
        size: [number, number] = [0, 0];
        anchor: [number, number] = [0.5, 0.5];
        setContentSize(w: number, h: number) { this.size = [w, h]; }
        setAnchorPoint(x: number, y: number) { this.anchor = [x, y]; }
    }
    return { Node: FakeNode, UITransform };
});

// mock 必须先于被测模块导入（vitest 会 hoist，此处顺序仅为可读性）
import { SceneStack, IScene } from '../assets/scripts/infra/SceneStack';
import { Node } from 'cc';

/** 造一个带生命周期 spy 的假页面 */
function makeScene(name: string) {
    const node = new (Node as unknown as new (n: string) => Node)(name);
    return {
        node,
        onEnter: vi.fn(),
        onExit: vi.fn(),
        onResume: vi.fn(),
    } as unknown as IScene & {
        onEnter: ReturnType<typeof vi.fn>;
        onExit: ReturnType<typeof vi.fn>;
        onResume: ReturnType<typeof vi.fn>;
        node: Node & { destroyed: boolean };
    };
}

function makeStack() {
    const root = new (Node as unknown as new (n: string) => Node)('root');
    return new SceneStack(root as never);
}

describe('SceneStack 导航栈语义', () => {
    it('push：新页 onEnter 收到参数，旧栈顶隐藏保留', () => {
        const st = makeStack();
        const home = makeScene('home');
        const box = makeScene('box');
        st.push(home);
        st.push(box, { k: 1 });
        expect(st.top).toBe(box);
        expect(box.onEnter).toHaveBeenCalledWith({ k: 1 });
        expect((home.node as unknown as { active: boolean }).active).toBe(false);
        expect((box.node as unknown as { active: boolean }).active).toBe(true);
    });

    it('pop：销毁栈顶并恢复下层 onResume；空栈 pop 不抛错', () => {
        const st = makeStack();
        const home = makeScene('home');
        const box = makeScene('box');
        st.push(home);
        st.push(box);
        st.pop();
        expect((box.node as unknown as { destroyed: boolean }).destroyed).toBe(true);
        expect(box.onExit).toHaveBeenCalledTimes(1);
        expect(home.onResume).toHaveBeenCalledTimes(1);
        expect(st.top).toBe(home);
        expect(() => st.pop()).not.toThrow();
    });

    it('swap：只替换栈顶，下层完好且可继续返回（P0-2 核心不变量）', () => {
        const st = makeStack();
        const home = makeScene('home');
        const box = makeScene('box');
        const rain = makeScene('rain');
        st.push(home);
        st.push(box);
        st.swap(rain);
        // 旧栈顶被销毁，Home 完好
        expect((box.node as unknown as { destroyed: boolean }).destroyed).toBe(true);
        expect((home.node as unknown as { destroyed: boolean }).destroyed).toBe(false);
        expect(rain.onEnter).toHaveBeenCalledTimes(1);
        // 开箱→渡劫链路：结算后 popToRoot 必须能回到 Home
        st.popToRoot();
        expect(st.top).toBe(home);
        expect((home.node as unknown as { destroyed: boolean }).destroyed).toBe(false);
        expect(home.onResume).toHaveBeenCalledTimes(1);
    });

    it('replace：清空整栈（含栈底），新页成为唯一页面', () => {
        const st = makeStack();
        const home = makeScene('home');
        const box = makeScene('box');
        const fresh = makeScene('fresh');
        st.push(home);
        st.push(box);
        st.replace(fresh);
        expect((home.node as unknown as { destroyed: boolean }).destroyed).toBe(true);
        expect((box.node as unknown as { destroyed: boolean }).destroyed).toBe(true);
        expect(st.top).toBe(fresh);
        expect(fresh.onEnter).toHaveBeenCalledTimes(1);
    });

    it('popToRoot：销毁到只剩栈底；栈里只有根时是 no-op', () => {
        const st = makeStack();
        const home = makeScene('home');
        const a = makeScene('a');
        const b = makeScene('b');
        st.push(home);
        st.push(a);
        st.push(b);
        st.popToRoot();
        expect((b.node as unknown as { destroyed: boolean }).destroyed).toBe(true);
        expect((a.node as unknown as { destroyed: boolean }).destroyed).toBe(true);
        expect((home.node as unknown as { destroyed: boolean }).destroyed).toBe(false);
        expect(home.onResume).toHaveBeenCalledTimes(1);
        // 已在根：再调一次不应抛错、不应重复 onResume
        expect(() => st.popToRoot()).not.toThrow();
        expect(home.onResume).toHaveBeenCalledTimes(1);
    });

    it('主路径回归：主页→开箱→swap 渡劫→结算→popToRoot，主页始终存活', () => {
        const st = makeStack();
        const home = makeScene('home');
        const box = makeScene('box');
        const rain = makeScene('rain');
        const result = makeScene('result');
        st.push(home);
        st.push(box);
        st.swap(rain);      // 开箱后可突破 → 进入灵气雨
        st.push(result);    // 渡劫结算
        st.popToRoot();     // 返回仙府
        expect(st.top).toBe(home);
        expect((home.node as unknown as { destroyed: boolean }).destroyed).toBe(false);
    });
});
