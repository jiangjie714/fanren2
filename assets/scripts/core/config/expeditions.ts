/** M8 历练系统配置：目的地、事件与选项结算（数值假设 #28） */
export type DestId = 'qianshan' | 'migu' | 'gudong';

export interface DestConfig {
    id: DestId;
    name: string;
    blurb: string;
    /** 风险提示（公示给玩家） */
    risk: string;
    /** 期望产出提示 */
    reward: string;
}

export const DESTINATIONS: DestConfig[] = [
    { id: 'qianshan', name: '前山小径', blurb: '山道平缓，采药拾荒', risk: '无风险', reward: '灵石 80~150' },
    { id: 'migu',     name: '落霞秘谷', blurb: '雾谷藏宝，亦有兽嚎', risk: '20% 劫难（-5% 修为）', reward: '灵石 150~260 或碎片' },
    { id: 'gudong',   name: '荒古洞天', blurb: '上古遗府，机缘凶险并存', risk: '20% 劫难（-8% 修为）', reward: '灵石 300~500 / 碎片+机缘' },
];

/** 单次历练时长（挂机，可离线） */
export const EXPEDITION_DURATION_MS = 20 * 60_000;
/** 出发多少时长后可看广告立即召回 */
export const EXPEDITION_RECALL_AFTER_MS = 5 * 60_000;
/** 每日免费历练次数 */
export const EXPEDITION_DAILY_LIMIT = 2;

/**
 * 历练灵草掉落概率（#41：灵草来源之一为历练；按目的地档次递减，契合"前山采药拾荒"主题）。
 * 掉落的是低阶炼材「灵草」，供中/高品炼丹与福禄炼制消耗；斩妖另产灵石髓/妖兽丹（#41）。
 */
export const EXPED_MAT_CHANCE: Record<DestId, number> = {
    qianshan: 0.7,
    migu: 0.4,
    gudong: 0.2,
};

export interface OutcomeEffect {
    text: string;
    lingshi?: number;
    lingshiRange?: [number, number];
    /** 按当前修为百分比损失（0.05 = -5%） */
    xiuweiPctLoss?: number;
    fragments?: number;
    jiyuan?: number;
}

export interface EventOption {
    label: string;
    outcomes: { weight: number; effect: OutcomeEffect }[];
}

export interface ExpeditionEvent {
    id: string;
    dest: DestId;
    title: string;
    intro: string;
    /** 固定三个选项：进取 / 稳妥 / 回避 */
    options: [EventOption, EventOption, EventOption];
}

const FRAG = '灵根碎片';

export const EXPEDITION_EVENTS: ExpeditionEvent[] = [
    // ---------- 前山小径（无风险） ----------
    {
        id: 'qs1', dest: 'qianshan', title: '山道茶棚',
        intro: '半山茶棚炊烟袅袅，歇脚的散修们正闲谈近日见闻。',
        options: [
            { label: '帮茶农驱兽', outcomes: [{ weight: 1, effect: { text: '你赶走了啃食茶田的妖鼠，茶农以灵石相谢。', lingshiRange: [110, 150] } }] },
            { label: '买茶歇脚', outcomes: [{ weight: 1, effect: { text: '一盏灵茶入喉，神清气爽，还打听到一处灵泉。', lingshiRange: [80, 110] } }] },
            { label: '匆匆赶路', outcomes: [{ weight: 1, effect: { text: '不敢耽搁，一路采药而下。', lingshiRange: [70, 90] } }] },
        ],
    },
    {
        id: 'qs2', dest: 'qianshan', title: '断崖药田',
        intro: '崖壁上几株灵草迎风摇曳，根下泥土微微发亮。',
        options: [
            { label: '攀崖采撷', outcomes: [{ weight: 1, effect: { text: '灵草入囊，露水未干。', lingshiRange: [120, 150], fragments: 1 } }] },
            { label: '布绳而取', outcomes: [{ weight: 1, effect: { text: '稳扎稳打，收获尚可。', lingshiRange: [90, 120] } }] },
            { label: '恐高作罢', outcomes: [{ weight: 1, effect: { text: '望崖兴叹，拾级而归。', lingshiRange: [60, 80] } }] },
        ],
    },
    {
        id: 'qs3', dest: 'qianshan', title: '野庙残碑',
        intro: '荒废山神庙里立着半截石碑，碑文在暮色中隐隐发烫。',
        options: [
            { label: '拓印碑文', outcomes: [{ weight: 1, effect: { text: '碑文入心，似有所悟。', lingshiRange: [100, 130], fragments: 1 } }] },
            { label: '参拜祈福', outcomes: [{ weight: 1, effect: { text: '心诚则灵，夜宿安稳。', lingshiRange: [90, 120] } }] },
            { label: '绕道而行', outcomes: [{ weight: 1, effect: { text: '不惹因果，平安是福。', lingshiRange: [70, 90] } }] },
        ],
    },
    {
        id: 'qs4', dest: 'qianshan', title: '灵溪石滩',
        intro: '溪水清可见底，滩上散落着被水流磨圆的灵石碎粒。',
        options: [
            { label: '下水淘洗', outcomes: [{ weight: 1, effect: { text: '衣衫尽湿，收获满囊。', lingshiRange: [120, 150] } }] },
            { label: '岸边拾取', outcomes: [{ weight: 1, effect: { text: '细水长流，积少成多。', lingshiRange: [90, 120] } }] },
            { label: '洗手便走', outcomes: [{ weight: 1, effect: { text: '略作歇息，继续前行。', lingshiRange: [70, 90] } }] },
        ],
    },
    // ---------- 落霞秘谷（20% 劫难 -5% 修为） ----------
    {
        id: 'mg1', dest: 'migu', title: '雾中兽径',
        intro: '浓雾里传来低低的喘息声，地面留着新鲜的爪印。',
        options: [
            { label: '循迹猎宝', outcomes: [
                { weight: 4, effect: { text: '你反杀了落单的雾狼，兽腹中剖出一袋灵石。', lingshiRange: [200, 260] } },
                { weight: 1, effect: { text: '雾狼群蜂拥而至，你且战且退，狼狈负伤。', xiuweiPctLoss: 0.05 } },
            ] },
            { label: '结阵缓行', outcomes: [{ weight: 1, effect: { text: '护体灵光不散，稳稳穿过兽径，拾得遗落行囊。', lingshiRange: [150, 200] } }] },
            { label: '退出迷雾', outcomes: [{ weight: 1, effect: { text: '谨慎为上，在谷口采药而归。', lingshiRange: [80, 110] } }] },
        ],
    },
    {
        id: 'mg2', dest: 'migu', title: '沉没石舟',
        intro: '谷底浅潭中沉着一艘古舟，船身灵纹仍未黯淡。',
        options: [
            { label: '潜入探舟', outcomes: [
                { weight: 4, effect: { text: '舱中灵石虽已斑驳，仍值一笔横财。', lingshiRange: [210, 260] } },
                { weight: 1, effect: { text: '水下禁制骤然发难，你护住心脉逃出，修为受挫。', xiuweiPctLoss: 0.05 } },
            ] },
            { label: '撇取浮物', outcomes: [{ weight: 1, effect: { text: '船舷飘着几片灵材，收入囊中。', fragments: 2, lingshiRange: [120, 160] } }] },
            { label: '潭边观望', outcomes: [{ weight: 1, effect: { text: '不碰机缘，也就不碰凶险。', lingshiRange: [80, 110] } }] },
        ],
    },
    {
        id: 'mg3', dest: 'migu', title: '落霞药圃',
        intro: '谷中一小片药圃被阵法护着，紫叶灵草长势正好。',
        options: [
            { label: '破阵采药', outcomes: [
                { weight: 4, effect: { text: '阵纹应手而碎，灵草连根而得。', lingshiRange: [180, 240], fragments: 2 } },
                { weight: 1, effect: { text: '阵法反噬，气血翻涌，修为倒退几分。', xiuweiPctLoss: 0.05 } },
            ] },
            { label: '拾阵外遗株', outcomes: [{ weight: 1, effect: { text: '阵外散落的药草虽少，胜在安稳。', lingshiRange: [140, 180] } }] },
            { label: '标记再来', outcomes: [{ weight: 1, effect: { text: '记下方位，日后再来不迟。', lingshiRange: [80, 110] } }] },
        ],
    },
    {
        id: 'mg4', dest: 'migu', title: '旅尸遗囊',
        intro: '雾深处躺着一位殒落散修的遗骸，腰间锦囊尚在。',
        options: [
            { label: '取囊走人', outcomes: [
                { weight: 4, effect: { text: '锦囊里灵石充盈，愿他早登仙界。', lingshiRange: [200, 260] } },
                { weight: 1, effect: { text: '尸身骤起，你拼死挣脱，中了一记尸毒。', xiuweiPctLoss: 0.05 } },
            ] },
            { label: '诵经超度', outcomes: [{ weight: 1, effect: { text: '超度亡魂，遗骸自行消散，留下一枚灵根碎片。', fragments: 2, lingshiRange: [120, 160] } }] },
            { label: '不取分毫', outcomes: [{ weight: 1, effect: { text: '敬畏生死，空手而归。', lingshiRange: [70, 100] } }] },
        ],
    },
    // ---------- 荒古洞天（20% 劫难 -8% 修为，高回报） ----------
    {
        id: 'gd1', dest: 'gudong', title: '上古丹室',
        intro: '丹室炉火未熄，炉旁玉简与丹瓶散落一地。',
        options: [
            { label: '开炉取丹', outcomes: [
                { weight: 4, effect: { text: '炉中余丹尚存药力，价值不菲。', lingshiRange: [380, 500], jiyuan: 15 } },
                { weight: 1, effect: { text: '余火轰然而起，你破门而出，道基震荡。', xiuweiPctLoss: 0.08 } },
            ] },
            { label: '只取玉简', outcomes: [{ weight: 1, effect: { text: '玉简记载的功法残篇已值此行。', fragments: 3, jiyuan: 10, lingshiRange: [200, 280] } }] },
            { label: '敬而远之', outcomes: [{ weight: 1, effect: { text: '前人遗产，不夺为敬。', lingshiRange: [100, 140] } }] },
        ],
    },
    {
        id: 'gd2', dest: 'gudong', title: '镇魔石链',
        intro: '洞天深处，万钧石链锁着一方祭坛，魔气丝丝缕缕上涌。',
        options: [
            { label: '破链夺源', outcomes: [
                { weight: 4, effect: { text: '坛心魔晶被你完整取下，灵石与机缘俱得。', lingshiRange: [400, 500], jiyuan: 15, fragments: 2 } },
                { weight: 1, effect: { text: '魔气反扑入体，你镇压心魔已然竭力，修为大损。', xiuweiPctLoss: 0.08 } },
            ] },
            { label: '炼化外溢魔气', outcomes: [{ weight: 1, effect: { text: '只取外溢之气炼化，稳妥有得。', jiyuan: 10, lingshiRange: [250, 320] } }] },
            { label: '封洞而退', outcomes: [{ weight: 1, effect: { text: '布下封印，回禀仙门再作计较。', lingshiRange: [100, 140] } }] },
        ],
    },
    {
        id: 'gd3', dest: 'gudong', title: '断臂石像',
        intro: '一尊断臂石像立于洞厅中央，指间卡着一枚储物戒。',
        options: [
            { label: '攀像取戒', outcomes: [
                { weight: 4, effect: { text: '储物戒中灵石琳琅，先人厚赠。', lingshiRange: [380, 500], jiyuan: 15 } },
                { weight: 1, effect: { text: '石像骤然转身，一掌将你拍飞。', xiuweiPctLoss: 0.08 } },
            ] },
            { label: '叩首三拜', outcomes: [{ weight: 1, effect: { text: '拜别先贤，像指松开，戒指轻轻落在你掌心。', fragments: 3, jiyuan: 10, lingshiRange: [220, 300] } }] },
            { label: '环行而去', outcomes: [{ weight: 1, effect: { text: '不惊扰先贤，安静离开。', lingshiRange: [100, 140] } }] },
        ],
    },
    {
        id: 'gd4', dest: 'gudong', title: '灵泉眼',
        intro: '洞天尽头的灵泉汩汩涌动，泉底隐约有金光闪动。',
        options: [
            { label: '入泉探底', outcomes: [
                { weight: 4, effect: { text: '泉底一颗灵珠入手，此行圆满。', lingshiRange: [400, 500], jiyuan: 15, fragments: 2 } },
                { weight: 1, effect: { text: '泉眼暗流暴起，把你卷出洞外，筋骨俱伤。', xiuweiPctLoss: 0.08 } },
            ] },
            { label: '汲取泉水', outcomes: [{ weight: 1, effect: { text: '泉水炼体，温和绵长。', fragments: 2, jiyuan: 10, lingshiRange: [240, 320] } }] },
            { label: '掬水即止', outcomes: [{ weight: 1, effect: { text: '沾沾灵气，点到即止。', lingshiRange: [100, 140] } }] },
        ],
    },
];

/** 目的地事件池（各 4 个，归来时按目的地随机一个） */
export function eventsOfDest(dest: DestId): ExpeditionEvent[] {
    return EXPEDITION_EVENTS.filter((e) => e.dest === dest);
}
