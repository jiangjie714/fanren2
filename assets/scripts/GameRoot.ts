import { _decorator, Component } from 'cc';
import { Game } from './infra/Game';

const { ccclass } = _decorator;

/**
 * 场景唯一入口组件（挂在 main.scene 的 GameRoot 节点上）。
 * 所有页面 UI 均由代码构建，本组件只负责启动与每帧驱动。
 */
@ccclass('GameRoot')
export class GameRoot extends Component {
    start() {
        Game.init(this.node);
    }

    update(dt: number) {
        Game.tick(dt);
    }
}
