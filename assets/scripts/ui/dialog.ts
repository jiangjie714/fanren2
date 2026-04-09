/** Common modal: title, content lines, and stacked/side-by-side gold-dark buttons. */
import { Color, Node } from 'cc';
import { label, spriteButton, spritePanel, THEME, dimLayer } from './ThemeLib';

export interface DialogButton {
    text: string;
    cb?: () => void;
    primary?: boolean;
    close?: boolean;
}

export interface DialogOpts {
    title: string;
    lines: Array<string | { text: string; color?: number }>;
    buttons: DialogButton[];
    width?: number;
}

export function showDialog(parent: Node, opts: DialogOpts): Node {
    const width = opts.width ?? 620;
    const lineH = 42;
    const btns = opts.buttons;
    const maxChars = Math.max(...btns.map((b) => b.text.length));
    const fontSize = maxChars > 10 ? 24 : maxChars > 8 ? 26 : 28;
    const charW = fontSize + 1;
    const hBtn = 74;
    const gap = 14;

    const needW = btns.length * (maxChars * charW + 52) + gap * (btns.length - 1);
    const stack = needW > width - 42;
    const bw = stack ? width - 86 : Math.min(width - 42, maxChars * charW + 58);
    const rows: DialogButton[][] = stack ? btns.map((b) => [b]) : [btns];
    const btnAreaH = stack ? btns.length * (hBtn + 12) - 12 : hBtn;

    const contentH = opts.lines.length * lineH;
    const h = 118 + contentH + 18 + btnAreaH + 28;

    const layer = dimLayer(parent, 170);
    // Dark navy dialog panel with gold border
    const box = spritePanel(layer, width + 12, h + 8);
    label(box, opts.title, 36, { bold: true, color: THEME.goldLight })
        .setPosition(0, h / 2 - 52, 0);

    opts.lines.forEach((line, i) => {
        let text: string;
        const o: { color?: typeof THEME.gold; bold?: boolean } = { bold: true };
        if (typeof line === 'string') {
            text = line;
            o.color = THEME.paper;
        } else {
            text = line.text;
            if (line.color === 1) o.color = THEME.goldLight;
            else if (line.color === 2) o.color = THEME.danger;
            else if (line.color === 3) o.color = THEME.success;
            else o.color = THEME.paper;
        }
        label(box, text, 27, { ...o, width: width - 94, shrink: true })
            .setPosition(0, h / 2 - 104 - lineH * i - lineH / 2, 0);
    });

    const top = -h / 2 + 26 + btnAreaH;
    rows.forEach((row, r) => {
        const totalW = row.length * bw + gap * (row.length - 1);
        row.forEach((b, i) => {
            const x = -totalW / 2 + bw / 2 + i * (bw + gap);
            const y = top - r * (hBtn + 12) - hBtn / 2;
            const handle = spriteButton(box, bw, hBtn, b.text, () => {
                if (b.close !== false) layer.destroy();
                b.cb?.();
            }, {
                fontSize,
                variant: b.primary ? 'primary' : 'secondary',
                textColor: b.primary ? THEME.void : THEME.ink,
            });
            handle.node.setPosition(x, y, 0);
        });
    });
    return layer;
}
