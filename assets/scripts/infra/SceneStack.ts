import { Node, UITransform } from 'cc';

/**
 * 页面接口：每个"页面"是一个全屏 Node 层，由代码构建自身 UI。
 * 页面栈只激活栈顶页面，其余隐藏保留状态。
 */
export interface IScene {
    node: Node;
    onEnter?(params?: unknown): void;
    onExit?(): void;
    onResume?(): void;
    update?(dt: number): void;
}

export class SceneStack {
    private stack: IScene[] = [];

    constructor(private root: Node) {}

    get top(): IScene | undefined {
        return this.stack[this.stack.length - 1];
    }

    /** 压入新页面：原栈顶隐藏保留，供 pop 返回 */
    push(s: IScene, params?: unknown) {
        const prev = this.top;
        if (prev) {
            prev.node.active = false;
        }
        this.stack.push(s);
        s.node.parent = this.root;
        const ut = s.node.getComponent(UITransform) || s.node.addComponent(UITransform);
        ut.setContentSize(720, 1280);
        ut.setAnchorPoint(0.5, 0.5);
        s.node.setPosition(0, 0, 0);
        s.node.active = true;
        s.onEnter?.(params);
    }

    /** 弹出栈顶并销毁，恢复上一层 */
    pop() {
        const s = this.stack.pop();
        if (!s) return;
        s.onExit?.();
        s.node.destroy();
        const prev = this.top;
        if (prev) {
            prev.node.active = true;
            prev.onResume?.();
        }
    }

    /**
     * 清空整个栈并压入新页面：新页成为**栈底**，没有「返回」可回任何旧页。
     * 只用于真正重开局的场景（目前无调用方）。页面流转请用 swap()。
     */
    replace(s: IScene, params?: unknown) {
        while (this.stack.length) {
            const x = this.stack.pop()!;
            x.onExit?.();
            x.node.destroy();
        }
        this.push(s, params);
    }

    /**
     * 只替换栈顶、下层保留：用于「当前页流转到下一页」且仍需能返回上一层。
     * 例：开箱页突破 → 渡劫雨（下层 Home 保留，结算 popToRoot 回主页）。
     * 旧版误用 replace 会把 Home 一并销毁 → 返回时栈空白屏。
     */
    swap(s: IScene, params?: unknown) {
        const old = this.stack.pop();
        if (old) {
            old.onExit?.();
            old.node.destroy();
        }
        this.push(s, params);
    }

    /** 弹到只剩栈底（如渡劫结算 → 回仙府主页）；已在根时是严格 no-op */
    popToRoot() {
        if (this.stack.length <= 1) return;
        while (this.stack.length > 1) {
            const s = this.stack.pop()!;
            s.onExit?.();
            s.node.destroy();
        }
        const root = this.stack[0];
        if (root) {
            root.node.active = true;
            root.onResume?.();
        }
    }

    update(dt: number) {
        this.top?.update?.(dt);
    }
}
