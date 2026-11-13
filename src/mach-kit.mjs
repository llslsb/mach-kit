// mach-kit.mjs —— 「机器语言」零件库 v0.2（v0.2：火苗/烟囱/煤仓画质升级，对照 Anatomy 工艺）
// 目标：任何"看不见的状态"都能用这套标准零件拼成一台会动的机器。
// 设计约定（见项目 AGENTS.md §2）：
//   · 零依赖 ES 模块（浏览器原生 import），需经 HTTP 访问（file:// 下模块被浏览器拦截）
//   · 零件 = 工厂函数 (opts, machine) => { el, set, _apply?, tick? }
//       set(v)    传数字 = 只记目标值（Machine 循环里做缓动后调 _apply）
//                 传对象 = 立即生效（复合状态，如警示灯 {level, shake}）
//       tick(now,dt) 时间驱动动画（烟/火苗/摆/传送带/表针）
//   · 渐变按 Machine 实例编号隔离（m.grad(name)），一页多机不串色
//   · 纯渲染层：数据从哪来（真插头/演示假数据）是页面的事，库不关心

const NS = "http://www.w3.org/2000/svg";
let UID = 0;

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function txt(parent, x, y, str, { size = 12, fill = "#888", anchor = "middle", weight, family } = {}) {
  const t = el("text", { x, y, "text-anchor": anchor, "font-size": size, fill }, parent);
  if (weight) t.setAttribute("font-weight", weight);
  if (family) t.setAttribute("font-family", family);
  t.textContent = str;
  return t;
}

// ———————————————————————————————————— 主题（token 齐备，换主题零件零改动） ————————————————————————————————————
export const THEMES = {
  // 工业 · 深色（锅炉房，实测过的配色）
  dark: {
    floor: "#39434f", rivet: "#5d6b7a", shadow: "#000000",
    steelA: "#3b4653", steelB: "#59697a", steelC: "#333d49",
    darkA: "#2c343f", darkB: "#414d5b", darkC: "#272e37",
    copperA: "#8a4a2a", copperB: "#c27a45", copperC: "#7c4023", copperMid: "#a35f33", copperLine: "#5e3318",
    brass: "#d8a53a", brassLine: "#8f6a1e",
    face: "#f4efe6", faceStroke: "#2c343f", faceInk: "#5c554a", needle: "#c23c14", hub: "#2c343f",
    glassA1: "#9fb6c9", glassA2: ".28", glassB1: "#5a7185", glassB2: ".14",
    waterA: "#3f7fae", waterB: "#2a5a82", waterMark: "#8fa0b3",
    fireCore: "#ffd27a", fireMid: "#f2802f", fireEdge: "#c23c14",
    glowA: "#ffb054",
    lampGlow: "#ffffff",
    coal: "#565f6a", coalDot: "#8a939e", coalWin: "#14181d",
    smoke: "#8a939e", smokeDark: "#454e58",
    belt: "#39434f", beltDash: "#5d6b7a", lump: "#454e58", leg: "#2c343f", roller: "#4a5765",
    ok: "#3fae5a", warn: "#d9a53a", alarm: "#e2574a",
    ink: "#a7b6c6", tiny: "#7e8fa1", mark: "#8fa0b3",
  },
  // 家居 · 暖木（钟表屏，实测过的配色）
  warm: {
    floor: "#d8c9ae", rivet: "#b8a480", shadow: "#b09a76",
    steelA: "#b8a480", steelB: "#d8c9ae", steelC: "#a6946e",
    darkA: "#54371c", darkB: "#7a5330", darkC: "#4a3018",
    copperA: "#8a4a2a", copperB: "#c27a45", copperC: "#7c4023", copperMid: "#a35f33", copperLine: "#5e3318",
    brass: "#c9a24a", brassLine: "#8a6a24",
    face: "#fdf8ec", faceStroke: "#8a6a24", faceInk: "#9a8563", needle: "#c0392b", hub: "#4a3823",
    glassA1: "#ffffff", glassA2: ".16", glassB1: "#ffffff", glassB2: ".04",
    waterA: "#3f7fae", waterB: "#2a5a82", waterMark: "#b8a480",
    fireCore: "#ffd27a", fireMid: "#f79b3e", fireEdge: "#e2642c",
    glowA: "#ffb054",
    lampGlow: "#ffffff",
    coal: "#565f6a", coalDot: "#8a939e", coalWin: "#241a10",
    smoke: "#c9bda5", smokeDark: "#8a7a5e",
    belt: "#8a6a24", beltDash: "#c9a24a", lump: "#5e3d20", leg: "#4a3018", roller: "#a6946e",
    ok: "#3f9d5f", warn: "#d9a53a", alarm: "#c0392b",
    ink: "#d8c9ae", tiny: "#9a8563", mark: "#b8a480",
    // 木壳专用
    woodA: "#6e4a2a", woodB: "#92663c", woodC: "#5e3d20", woodLine: "#4a3018",
    woodDarkA: "#54371c", woodDarkB: "#7a5330", woodDarkC: "#4a3018",
    hand: "#4a3823", mercury: "#c0392b", tube: "#e8ddc6", tubeLine: "#b8a480",
    inner: "#241a10", bannerText: "#fdf8ec",
  },
};

// 报警状态机：v 与阈值比较 → 0 正常 / 1 黄 / 2 红
export function alarmLevel(v, { yellow = 75, red = 90 } = {}) {
  return v > red ? 2 : v > yellow ? 1 : 0;
}

function buildDefs(machine) {
  const t = machine.t, id = (n) => `mk${machine.uid}-${n}`;
  const d = el("defs", {}, machine.svg);
  const lg = (name, x2 = "1", y2 = "0", stops) => {
    const g = el("linearGradient", { id: id(name), x1: "0", y1: "0", x2, y2 }, d);
    for (const [off, color, op] of stops) el("stop", { offset: off, "stop-color": color, ...(op != null ? { "stop-opacity": op } : {}) }, g);
  };
  const rg = (name, stops, cx = ".5", cy = ".5", r = ".8") => {
    const g = el("radialGradient", { id: id(name), cx, cy, r }, d);
    for (const [off, color, op] of stops) el("stop", { offset: off, "stop-color": color, ...(op != null ? { "stop-opacity": op } : {}) }, g);
  };
  lg("steel", "1", "0", [["0", t.steelA], [".5", t.steelB], ["1", t.steelC]]);
  lg("steelDark", "1", "0", [["0", t.darkA], [".5", t.darkB], ["1", t.darkC]]);
  lg("copper", "1", "0", [["0", t.copperA], [".5", t.copperB], ["1", t.copperC]]);
  lg("brass", "1", "1", [["0", "#f0d38a"], [".5", t.brass], ["1", t.brassLine]]);
  lg("water", "0", "1", [["0", t.waterA], ["1", t.waterB]]);
  lg("wood", "1", "0", [["0", t.woodA], [".5", t.woodB], ["1", t.woodC]]);
  lg("woodDark", "1", "0", [["0", t.woodDarkA], [".5", t.woodDarkB], ["1", t.woodDarkC]]);
  lg("cream", "0", "1", [["0", "#fdf8ec"], ["1", "#f1e6cf"]]);
  lg("glass", "0", "1", [["0", t.glassA1, t.glassA2], ["1", t.glassB1, t.glassB2]]);
  lg("coalMound", "0", "1", [["0", t.coalDot], [".45", t.coal], ["1", t.coalWin]]);
  rg("fire", [["0", t.fireCore], [".45", t.fireMid], ["1", t.fireEdge, "0"]], ".5", ".75");
  rg("glow", [["0", t.glowA, ".8"], ["1", t.glowA, "0"]], ".5", ".8", ".9");
  rg("lampGlow", [["0", t.lampGlow, ".55"], ["1", t.lampGlow, "0"]]);
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .mk-shake{ animation: mk-shake .14s infinite; }
    @keyframes mk-shake{ 0%{transform:translate(0,0)} 30%{transform:translate(1.2px,-0.8px)} 70%{transform:translate(-1.2px,0.8px)} 100%{transform:translate(0,0)} }
    .mk-blink{ animation: mk-blink .7s infinite; }
    @keyframes mk-blink{ 50%{ opacity:.25; } }
  `;
  document.head.appendChild(s);
}

// ———————————————————————————————————— 装配器 ————————————————————————————————————
export class Machine {
  constructor({ w = 960, h = 560, theme = "dark", width = 900 } = {}) {
    this.t = THEMES[theme] || THEMES.dark;
    this.uid = ++UID;
    this.w = w; this.h = h;
    this.svg = el("svg", { viewBox: `0 0 ${w} ${h}`, width, "aria-label": "机器场景" });
    buildDefs(this);
    this.layers = { back: el("g", {}, this.svg), parts: el("g", {}, this.svg) };
    this.parts = [];
    this._last = performance.now();
    this._running = false;
  }
  grad(name) { return `url(#mk${this.uid}-${name})`; }
  create(Factory, opts = {}) {
    const p = Factory(opts, this);
    this.parts.push(p);
    this.layers.parts.appendChild(p.el);
    return p;
  }
  mount(selector) {
    const host = document.querySelector(selector);
    if (!host) throw new Error(`挂载点不存在: ${selector}`);
    host.appendChild(this.svg);
    injectStyles();
    this.start();
    return this;
  }
  start() {
    if (this._running) return;
    this._running = true;
    const loop = (now) => {
      const dt = Math.min(.05, (now - this._last) / 1000);
      this._last = now;
      const k = 1 - Math.pow(.0018, dt);
      for (const p of this.parts) {
        if (typeof p._target === "number") {
          if (typeof p._cur !== "number") p._cur = p._target;
          p._cur += (p._target - p._cur) * k;
          if (p._apply) p._apply(p._cur);
        }
        if (p.tick) p.tick(now, dt);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// ———————————————————————————————————— 零件 ————————————————————————————————————

// 底座：地面线 + 阴影 + 底板 + 铆钉（静态）
export function Base({ x = 80, y = 486, w = 800 } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.back);
  el("line", { x1: x - 60, y1: y + 22, x2: x + w + 60, y2: y + 22, stroke: t.floor, "stroke-width": 2 }, elg);
  el("ellipse", { cx: x + w / 2, cy: y + 21, rx: w / 2 + 30, ry: 6, fill: t.shadow, opacity: ".35" }, elg);
  el("rect", { x, y, width: w, height: 16, rx: 4, fill: m.grad("steelDark") }, elg);
  for (let i = 0; i <= 8; i++) el("circle", { cx: x + 30 + (i * (w - 60)) / 8, cy: y + 8, r: 2.6, fill: t.rivet }, elg);
  return { el: elg };
}

// 铭牌（静态文字）
export function Plate({ x, y, text, size = 13, fill } = {}, m) {
  const elg = el("g", {}, m.layers.back);
  txt(elg, x, y, text, { size, fill: fill || m.t.ink });
  return { el: elg };
}

// 压力表：表盘 + 8 刻度 + 针（数值 0-100 缓动）；标签在表盘上方（不压针）；nums=true 时盘面标 5 个数
export function Gauge({ x, y, r = 30, label = "", min = 0, max = 100, init, nums = false } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  el("circle", { cx: x, cy: y, r, fill: t.face, stroke: t.faceStroke, "stroke-width": 5 }, elg);
  const tg = el("g", { stroke: t.faceInk, "stroke-width": 2 }, elg);
  for (let i = 0; i < 8; i++) {
    const a = (-120 + i * (240 / 7)) * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    el("line", {
      x1: x + c * r * .9, y1: y + s * r * .9, x2: x + c * r * .7, y2: y + s * r * .7,
    }, tg);
  }
  // 数字刻度：每 1/4 量程一个数，一眼读得出读数
  if (nums) {
    for (let i = 0; i <= 4; i++) {
      const a = (-120 + i * 60) * Math.PI / 180;
      const c = Math.cos(a), s = Math.sin(a);
      txt(elg, x + c * r * .46, y + s * r * .46 + r * .06,
          String(Math.round(min + ((max - min) * i) / 4)),
          { size: Math.max(8, r * .17), fill: t.faceInk });
    }
  }
  // 标签在表盘上方（不在盘内压针）
  if (label) txt(elg, x, y - r - 8, label, { size: Math.max(9, r * .33), fill: t.faceInk });
  const needle = el("path", { d: `M${x} ${y} L${x - r * .107} ${y - r * .8} L${x + r * .107} ${y - r * .8} Z`, fill: t.needle }, elg);
  el("circle", { cx: x, cy: y, r: r * .15, fill: t.hub }, elg);
  const part = {
    el: elg,
    set(v) { this._target = Math.min(max, Math.max(min, Number(v) || 0)); },
    _apply(cur) {
      const p = (cur - min) / (max - min);
      needle.setAttribute("transform", `rotate(${-120 + p * 240} ${x} ${y})`);
    },
  };
  part.set(init != null ? init : min);
  return part;
}

// 水箱：外壳 + 玻璃窗 + 水位（0-100）+ 右侧刻度
export function Tank({ x, y, w = 124, h = 204, init = 0 } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  el("rect", { x, y, width: w, height: h, rx: 10, fill: m.grad("steel") }, elg);
  const win = { x: x + 12, y: y + 16, w: w - 24, h: h - 36 };
  el("rect", { x: win.x, y: win.y, width: win.w, height: win.h, rx: 6, fill: m.grad("glass"), stroke: t.leg, "stroke-width": 2 }, elg);
  const water = el("rect", { x: win.x, y: win.y + win.h, width: win.w, height: 0, fill: m.grad("water"), opacity: ".92" }, elg);
  const mg = el("g", { stroke: t.waterMark, "stroke-width": 1.5, opacity: ".8" }, elg);
  for (let i = 0; i < 5; i++) {
    const yy = win.y + (i * win.h) / 4;
    el("line", { x1: win.x + win.w - 14, y1: yy, x2: win.x + win.w, y2: yy }, mg);
  }
  el("rect", { x: win.x, y: y + 10, width: win.w, height: 8, rx: 3, fill: t.roller }, elg);
  const part = {
    el: elg,
    set(v) { this._target = Math.min(100, Math.max(0, Number(v) || 0)); },
    _apply(cur) {
      const wy = win.y + win.h - win.h * (cur / 100);
      water.setAttribute("y", wy);
      water.setAttribute("height", win.y + win.h - wy);
    },
  };
  part.set(init);
  return part;
}

// 煤仓：漏斗（顶沿+中缝+铆钉）+ 深窗 + 渐变煤堆 + 底煤 + 玻璃反光（0-100 = 存量比例，满仓平顶压窗沿）
export function Bunker({ x, y, init = 0 } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  // 漏斗身（钢渐变四面着色）
  el("path", { d: `M${x - 64} ${y} L${x + 64} ${y} L${x + 48} ${y + 62} L${x - 48} ${y + 62} Z`, fill: m.grad("steelDark"), stroke: t.leg }, elg);
  // 顶沿（比漏斗宽一圈）+ 中缝 + 铆钉（线条落在实体上）
  el("rect", { x: x - 68, y: y - 8, width: 136, height: 9, rx: 3, fill: t.roller, stroke: t.leg, "stroke-width": 1.5 }, elg);
  el("line", { x1: x, y1: y + 1, x2: x, y2: y + 58, stroke: t.leg, "stroke-width": 1.4, opacity: ".45" }, elg);
  for (const rx of [-58, -30, 30, 58]) el("circle", { cx: x + rx, cy: y + 6, r: 2.2, fill: t.rivet }, elg);
  // 深窗
  const win = { x: x - 56, y: y + 62, w: 112, h: 76 };
  el("rect", { x: win.x, y: win.y, width: win.w, height: win.h, rx: 6, fill: t.coalWin, stroke: t.leg, "stroke-width": 2 }, elg);
  // 底煤：永远铺在窗底的一层碎煤（煤堆降到底也看得出"仓里还有煤"）
  el("path", {
    d: `M${win.x + 3} ${win.y + win.h - 3} q14 -7 28 0 q14 -6 26 0 q14 -7 26 0 q14 -5 26 0 L${win.x + win.w - 3} ${win.y + win.h - 3} Z`,
    fill: t.coal, opacity: ".9",
  }, elg);
  // 煤堆（渐变面：顶部受光、底部沉入窗底阴影）
  const mound = el("path", { d: "", fill: m.grad("coalMound") }, elg);
  // 高光煤块（亮面 + 暗芯双色调）
  const dots = [
    el("circle", { r: 4,   fill: t.coalDot }, elg),
    el("circle", { r: 3.6, fill: t.coalDot }, elg),
    el("circle", { r: 3.2, fill: t.coalDot }, elg),
    el("circle", { r: 2.4, fill: t.rivet }, elg),
  ];
  // 玻璃反光盖在煤上面（复用 glass 渐变）
  el("rect", { x: win.x, y: win.y, width: win.w, height: win.h, rx: 6, fill: m.grad("glass"), opacity: ".55" }, elg);
  el("rect", { x: x - 48, y: y + 138, width: 18, height: 28, fill: t.leg }, elg);
  el("rect", { x: x + 30, y: y + 138, width: 18, height: 28, fill: t.leg }, elg);
  const base = y + 134;
  const part = {
    el: elg,
    set(v) { this._target = Math.min(100, Math.max(0, Number(v) || 0)); },
    _apply(cur) {
      // 峰高与存量成正比：0% 也有一层底煤的鼓包，100% 顶到距窗沿 10px。
      // 注意二次贝塞尔的实际峰顶只有控制点高度的一半，所以控制点要给 2 倍峰高。
      const peak = 10 + (cur / 100) * 52;                 // 10..62
      let d;
      if (cur >= 80) {
        // 高仓：煤压着窗沿堆平了——出现平顶，越满平顶越宽
        const t = (cur - 80) / 20;                        // 0..1
        const pw = 8 + t * 36;                            // 平顶半宽 8→44
        d = `M${x - 52} ${base} Q${x - 38} ${base - peak * 1.5} ${x - pw} ${base - peak}`
          + ` L${x + pw} ${base - peak}`
          + ` Q${x + 38} ${base - peak * 1.5} ${x + 52} ${base} Z`;
      } else {
        d = `M${x - 52} ${base} Q${x} ${base - peak * 2} ${x + 52} ${base} Z`;
      }
      mound.setAttribute("d", d);
      dots[0].setAttribute("cx", x - 22); dots[0].setAttribute("cy", base - peak * .45);
      dots[1].setAttribute("cx", x + 8);  dots[1].setAttribute("cy", base - peak * .20);
      dots[2].setAttribute("cx", x - 4);  dots[2].setAttribute("cy", base - peak * .60);
      dots[3].setAttribute("cx", x + 26); dots[3].setAttribute("cy", base - peak * .40);
    },
  };
  part.set(init);
  return part;
}

// 传送带：带体 + 滚轮 + 虚线 + 煤块，速度随值（数字越大跑越快）
export function Belt({ x1, x2, y, init = 0.2 } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  el("rect", { x: x1 - 4, y: y + 8, width: 10, height: 30, fill: t.leg }, elg);
  el("rect", { x: x1, y: y - 5, width: x2 - x1, height: 10, rx: 5, fill: t.belt }, elg);
  const dash = el("line", { x1: x1 + 4, y1: y, x2: x2 - 4, y2: y, stroke: t.beltDash, "stroke-width": 3, "stroke-dasharray": "9 11" }, elg);
  el("circle", { cx: x1, cy: y, r: 7, fill: t.roller, stroke: t.leg, "stroke-width": 2 }, elg);
  el("circle", { cx: x2, cy: y, r: 7, fill: t.roller, stroke: t.leg, "stroke-width": 2 }, elg);
  const lumpG = el("g", { fill: t.lump }, elg);
  const lumps = [];
  for (let i = 0; i < 5; i++) lumps.push(el("circle", { r: 7.5 }, lumpG));
  let off = 0, speed = init;
  const span = x2 - x1 - 4;
  return {
    el: elg,
    set(v) { speed = Math.max(0, Number(v) || 0); },
    tick(now, dt) {
      off -= dt * (12 + speed * 46);
      dash.setAttribute("stroke-dashoffset", off);
      lumps.forEach((l, i) => {
        l.setAttribute("cx", x1 + ((i * 38 + off * .9) % span + span) % span);
        l.setAttribute("cy", y - 9);
      });
    },
  };
}

// 锅炉：铜炉体 + 炉门 + 炉火（0-1 强度，缓动 + 火苗闪烁）
export function Boiler({ x, y, w = 160, h = 200, init = 0 } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  const cx = x + w / 2;
  el("rect", { x, y, width: w, height: h, rx: 14, fill: m.grad("copper") }, elg);
  el("ellipse", { cx, cy: y, rx: w / 2, ry: 24, fill: t.copperMid }, elg);
  el("ellipse", { cx, cy: y, rx: w / 2, ry: 24, fill: "none", stroke: t.copperLine, "stroke-width": 2 }, elg);
  el("rect", { x, y: y + 62, width: w, height: 7, fill: t.copperLine, opacity: ".7" }, elg);
  el("rect", { x, y: y + h - 38, width: w, height: 7, fill: t.copperLine, opacity: ".7" }, elg);
  const fw = { x: x + 36, y: y + 84, w: 88, h: 74 };
  el("rect", { x: fw.x, y: fw.y, width: fw.w, height: fw.h, rx: 10, fill: "#1d232b", stroke: t.copperLine, "stroke-width": 3 }, elg);
  const glow = el("ellipse", { cx, cy: fw.y + 40, rx: 40, ry: 30, fill: m.grad("fire") }, elg);
  const tongue = el("path", { d: `M${cx} ${fw.y + 72} q-9 -12 0 -26 q9 14 0 26`, fill: "#ffb054", opacity: ".85" }, elg);
  el("rect", { x: x + 16, y: y + h - 6, width: 18, height: 26, fill: t.leg }, elg);
  el("rect", { x: x + w - 34, y: y + h - 6, width: 18, height: 26, fill: t.leg }, elg);
  let intensity = init;
  return {
    el: elg,
    set(v) { this._target = Math.min(1, Math.max(0, Number(v) || 0)); },
    tick(now) {
      const flick = 1 + .06 * Math.sin(now * .011) + .04 * Math.sin(now * .023);
      glow.setAttribute("opacity", clamp01(.15 + intensity * .85) * flick);
      tongue.setAttribute("opacity", clamp01(.25 + intensity * .75) * flick);
    },
    _apply(cur) { intensity = cur; },
  };
}
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// 烟囱：箍带烟囱身 + 顶沿顶口 + 底喇叭口 + 烟组（0-1 负载 → 冒烟频率/浓度；第二参 dark=true 冒黑烟）
export function Stack({ x, y } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  // 身（钢渐变）
  el("rect", { x: x - 18, y, width: 36, height: 132, fill: m.grad("steelDark") }, elg);
  // 两道箍带 + 铆钉
  for (const by of [y + 36, y + 94]) {
    el("rect", { x: x - 20, y: by, width: 40, height: 6, rx: 2, fill: t.roller }, elg);
    el("circle", { cx: x - 12, cy: by + 3, r: 1.8, fill: t.rivet }, elg);
    el("circle", { cx: x + 12, cy: by + 3, r: 1.8, fill: t.rivet }, elg);
  }
  // 顶沿 + 顶口暗部（口要"深进去"一圈）
  el("rect", { x: x - 24, y: y - 8, width: 48, height: 10, rx: 3, fill: t.roller, stroke: t.leg, "stroke-width": 1.5 }, elg);
  el("ellipse", { cx: x, cy: y - 8, rx: 18, ry: 4, fill: t.coalWin }, elg);
  // 底部喇叭口（落地感）
  el("path", { d: `M${x - 24} ${y + 132} L${x + 24} ${y + 132} L${x + 19} ${y + 146} L${x - 19} ${y + 146} Z`, fill: t.leg }, elg);
  // 烟组：6 团各自相位，膨胀 + 左右摆（黑烟摆幅更大、更浓）
  const smokeG = el("g", {}, elg);
  const puffs = [];
  for (let i = 0; i < 6; i++) puffs.push(el("circle", {}, smokeG));
  let load = 0, dark = false;
  return {
    el: elg,
    set(v, d) {
      if (typeof v === "object") { load = +v.load || 0; dark = !!v.dark; }
      else { load = Math.min(1, Math.max(0, Number(v) || 0)); if (d !== undefined) dark = !!d; }
    },
    tick(now) {
      const rate = .12 + load * .85;
      smokeG.setAttribute("fill", dark ? t.smokeDark : t.smoke);
      const wob = dark ? 10 : 7;
      const fade = dark ? .30 : .22;
      puffs.forEach((s, i) => {
        const p = ((now * .001 * rate) + i / 6) % 1;
        s.setAttribute("cx", x + p * 30 + Math.sin(p * 7 + i * 2.1) * wob * p);
        s.setAttribute("cy", y - 10 - p * 96);
        s.setAttribute("r", (5 + p * 19) * (.85 + (i % 3) * .12));
        s.setAttribute("opacity", Math.pow(1 - p, 1.15) * (fade + load * .5));
      });
    },
  };
}

// 警示灯：灯柱 + 顶铃 + 灯盘 + 光晕（复合状态 {level:0|1|2, shake:bool} 立即生效）
export function Lamp({ x, y, label = "警示灯", poleTo = y + 224 } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  el("rect", { x: x - 5, y: y - 34, width: 10, height: poleTo - y + 34, fill: m.grad("steelDark") }, elg);
  const bell = el("path", { d: `M${x - 11} ${y - 48} a11 11 0 0 1 22 0 v4 h-22 z`, fill: t.brass, stroke: t.brassLine, "stroke-width": 1.5 }, elg);
  el("circle", { cx: x, cy: y - 40, r: 3.4, fill: t.brass }, elg);
  const disc = el("circle", { cx: x, cy: y, r: 15, fill: t.ok, stroke: "#1e2a35", "stroke-width": 2 }, elg);
  const glow = el("circle", { cx: x, cy: y, r: 34, fill: m.grad("lampGlow"), opacity: "0" }, elg);
  if (label) txt(elg, x, y + 46, label, { size: 12, fill: t.tiny });
  let shake = false;
  return {
    el: elg,
    set(v) {
      const { level = 0, shake: sh = false } = typeof v === "object" ? v : { level: v };
      shake = !!sh;
      disc.classList.remove("mk-blink");
      if (level === 2) { disc.setAttribute("fill", t.alarm); disc.classList.add("mk-blink"); glow.setAttribute("opacity", "1"); }
      else if (level === 1) { disc.setAttribute("fill", t.warn); glow.setAttribute("opacity", ".4"); }
      else { disc.setAttribute("fill", t.ok); glow.setAttribute("opacity", "0"); }
    },
    tick(now) {
      bell.setAttribute("transform", shake ? `rotate(${Math.sin(now * .05) * 12} ${x} ${y - 44})` : "");
    },
  };
}

// 铃：独立铃铛 + 声波圈（{on:bool} 立即生效，on 时摇晃+声波扩散）
export function Bell({ x, y } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  const ring1 = el("circle", { cx: x, cy: y - 2, r: 18, fill: "none", stroke: t.alarm, "stroke-width": 2, opacity: 0 }, elg);
  const ring2 = el("circle", { cx: x, cy: y - 2, r: 26, fill: "none", stroke: t.alarm, "stroke-width": 1.6, opacity: 0 }, elg);
  const dome = el("path", { d: `M${x - 13} ${y} a13 13 0 0 1 26 0 v5 h-26 z`, fill: m.grad("brass"), stroke: t.brassLine, "stroke-width": 1.5 }, elg);
  el("circle", { cx: x, cy: y + 8, r: 3, fill: t.brassLine }, elg);
  let on = false, ringP = -1;
  return {
    el: elg,
    set(v) { on = !!(typeof v === "object" ? v.on : v); if (!on) ringP = -1; },
    tick(now, dt) {
      if (on) {
        dome.setAttribute("transform", `rotate(${Math.sin(now * .045) * 13} ${x} ${y - 14})`);
        ringP = ringP < 0 ? 0 : (ringP + dt * 1.6) % 1;
        ring1.setAttribute("opacity", (1 - ringP) * .9);
        ring1.setAttribute("r", 18 + ringP * 16);
        const p2 = (ringP + .5) % 1;
        ring2.setAttribute("opacity", (1 - p2) * .7);
        ring2.setAttribute("r", 26 + p2 * 16);
      } else {
        dome.removeAttribute("transform");
        ring1.setAttribute("opacity", 0); ring2.setAttribute("opacity", 0);
      }
    },
  };
}

// 摆锤：枢轴 + 杆 + 摆盘（set(bpm)：每分钟摆 bpm 个来回）
export function Pendulum({ x, y, len = 90, discR = 17, init = 0 } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  const rod = el("line", { x1: x, y1: y + 4, x2: x, y2: y + len - 4, stroke: m.grad("brass"), "stroke-width": 5 }, elg);
  // 渐变描边在线段上不可靠，改实色
  rod.setAttribute("stroke", t.brass);
  const disc = el("circle", { cx: x, cy: y + len, r: discR, fill: m.grad("brass"), stroke: t.brassLine, "stroke-width": 1.6 }, elg);
  el("circle", { cx: x, cy: y + len, r: discR * .3, fill: t.brassLine }, elg);
  let bpm = init, phase = 0;
  return {
    el: elg,
    set(v) { bpm = Math.max(0, Number(v) || 0); },
    tick(now, dt) {
      phase += dt * bpm / 60;
      elg.setAttribute("transform", `rotate(${16 * Math.sin(2 * Math.PI * phase)} ${x} ${y})`);
    },
  };
}

// 独立火苗：三层主焰 + 白热芯 + 两片侧火舌 + 飞火星 + 地面光晕（0-1 旺度）
export function Flame({ x, y, init = 1 } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  const glow = el("ellipse", { cx: x, cy: y - 6, rx: 52, ry: 34, fill: m.grad("glow") }, elg);
  const g = el("g", {}, elg);
  // 侧火舌（左右不对称，矮于主焰）
  el("path", { d: `M${x - 21} ${y - 2} C${x - 36} ${y - 14} ${x - 33} ${y - 30} ${x - 25} ${y - 40} C${x - 18} ${y - 27} ${x - 16} ${y - 12} ${x - 21} ${y - 2} Z`, fill: t.fireMid, opacity: ".8" }, g);
  el("path", { d: `M${x + 20} ${y - 2} C${x + 33} ${y - 11} ${x + 36} ${y - 25} ${x + 28} ${y - 35} C${x + 20} ${y - 23} ${x + 17} ${y - 10} ${x + 20} ${y - 2} Z`, fill: t.fireEdge, opacity: ".78" }, g);
  // 主焰三层（外缘暗、中层亮、内芯最亮）
  el("path", { d: `M${x} ${y} C${x - 22} ${y - 20} ${x - 18} ${y - 48} ${x} ${y - 64} C${x + 18} ${y - 48} ${x + 22} ${y - 20} ${x} ${y} Z`, fill: t.fireEdge }, g);
  el("path", { d: `M${x} ${y} C${x - 14} ${y - 16} ${x - 12} ${y - 38} ${x} ${y - 52} C${x + 12} ${y - 38} ${x + 14} ${y - 16} ${x} ${y} Z`, fill: t.fireMid }, g);
  el("path", { d: `M${x} ${y} C${x - 7} ${y - 10} ${x - 6} ${y - 24} ${x} ${y - 32} C${x + 6} ${y - 24} ${x + 7} ${y - 10} ${x} ${y} Z`, fill: t.fireCore }, g);
  const hot = el("ellipse", { cx: x, cy: y - 9, rx: 4.2, ry: 6.5, fill: "#fff3d6", opacity: ".85" }, g);
  // 飞火星：两颗，循环上升渐隐
  const sparkA = el("circle", { r: 1.9, fill: t.fireCore }, elg);
  const sparkB = el("circle", { r: 1.5, fill: t.fireMid }, elg);
  let vigor = init;
  return {
    el: elg,
    set(v) { this._target = Math.min(1, Math.max(0, Number(v) || 0)); },
    tick(now) {
      const flick = 1 + .05 * Math.sin(now * .013) + .03 * Math.sin(now * .007);
      const sway = Math.sin(now * .004) * 2.2;   // 整体轻摆
      const s = (.5 + vigor * .5) * flick;
      g.setAttribute("transform", `translate(${x + sway} ${y}) scale(${s}) translate(${-x} ${-y})`);
      g.setAttribute("opacity", .35 + vigor * .65);
      glow.setAttribute("opacity", .15 + vigor * .85 * flick);
      hot.setAttribute("opacity", .25 + vigor * .65);
      // 火星只在火旺时可见
      const so = Math.max(0, vigor - .18) * 1.4;
      const pa = (now * .00042) % 1, pb = (now * .00031 + .37) % 1;
      sparkA.setAttribute("cx", x - 10 + Math.sin(pa * 9) * 8); sparkA.setAttribute("cy", y - 40 - pa * 52);
      sparkA.setAttribute("opacity", so * (1 - pa));
      sparkB.setAttribute("cx", x + 12 + Math.sin(pb * 7 + 2) * 7); sparkB.setAttribute("cy", y - 34 - pb * 58);
      sparkB.setAttribute("opacity", so * (1 - pb) * .9);
    },
    _apply(cur) { vigor = cur; },
  };
}

// 温度计：玻璃管 + 水银柱 + 刻度 + 底球（set(温度值)）
export function Thermo({ x, y, h = 152, min = 35, max = 41, label = "" } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  el("rect", { x: x - 4.5, y, width: 9, height: h, rx: 4.5, fill: t.tube, stroke: t.tubeLine, "stroke-width": 1.5 }, elg);
  el("circle", { cx: x, cy: y + h + 8, r: 10, fill: t.tube, stroke: t.tubeLine, "stroke-width": 1.5 }, elg);
  const mercury = el("rect", { x: x - 2.5, y: y + h - 4, width: 5, height: 0, rx: 2.5, fill: t.mercury }, elg);
  el("circle", { cx: x, cy: y + h + 6, r: 7, fill: t.mercury }, elg);
  const mg = el("g", { stroke: t.mark, "stroke-width": 1.4 }, elg);
  for (let i = 0; i < 4; i++) {
    const yy = y + 4 + (i * (h - 8)) / 3;
    el("line", { x1: x + 7, y1: yy, x2: x + 13, y2: yy }, mg);
  }
  if (label) txt(elg, x, y + h + 26, label, { size: 12, fill: t.ink });
  const mBot = y + h - 4, mTop = y + 8;
  const part = {
    el: elg,
    set(v) { this._target = Math.min(max, Math.max(min, Number(v) || min)); },
    _apply(cur) {
      const p = (cur - min) / (max - min);
      const mY = mBot - (mBot - mTop) * p;
      mercury.setAttribute("y", mY);
      mercury.setAttribute("height", mBot - mY);
    },
  };
  part.set(min);
  return part;
}

// 表盘钟：真时钟（时/分/秒针自动走时，无需喂值）
export function ClockFace({ x, y, r = 88, label = "" } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  el("circle", { cx: x, cy: y, r, fill: m.grad("brass") }, elg);
  el("circle", { cx: x, cy: y, r: r - 9, fill: m.grad("cream") }, elg);
  const tg = el("g", { stroke: t.mark, "stroke-width": 2.4 }, elg);
  for (let i = 0; i < 8; i++) {
    const a = (i * 45) * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    el("line", { x1: x + c * r * .84, y1: y + s * r * .84, x2: x + c * r * .71, y2: y + s * r * .71 }, tg);
  }
  const hHand = el("line", { x1: x, y1: y, x2: x, y2: y - r * .43, stroke: t.hand, "stroke-width": 6, "stroke-linecap": "round" }, elg);
  const mHand = el("line", { x1: x, y1: y, x2: x, y2: y - r * .68, stroke: t.hand, "stroke-width": 3.6, "stroke-linecap": "round" }, elg);
  const sHand = el("line", { x1: x, y1: y + 8, x2: x, y2: y - r * .76, stroke: t.alarm, "stroke-width": 1.6, "stroke-linecap": "round" }, elg);
  el("circle", { cx: x, cy: y, r: 6, fill: t.hub }, elg);
  if (label) txt(elg, x, y + r * .58, label, { size: 12, fill: t.tiny });
  return {
    el: elg,
    set() { /* 走时无需喂值 */ },
    tick() {
      const d = new Date();
      const hh = (d.getHours() % 12 + d.getMinutes() / 60) * 30;
      const mm = (d.getMinutes() + d.getSeconds() / 60) * 6;
      const ss = (d.getSeconds() + d.getMilliseconds() / 1000) * 6;
      hHand.setAttribute("transform", `rotate(${hh} ${x} ${y})`);
      mHand.setAttribute("transform", `rotate(${mm} ${x} ${y})`);
      sHand.setAttribute("transform", `rotate(${ss} ${x} ${y})`);
    },
  };
}

// 状态条：圆角横幅（复合状态 {text, ok} 立即生效）
export function Banner({ x, y, w = 156, h = 32, text = "" } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.parts);
  const box = el("rect", { x, y, width: w, height: h, rx: 9, fill: t.ok }, elg);
  const label = txt(elg, x + w / 2, y + h / 2 + 6, text, { size: 16, weight: 700, fill: t.bannerText || "#fdf8ec" });
  return {
    el: elg,
    set(v) {
      const { text: s = "", ok = true } = typeof v === "object" ? v : { text: String(v), ok: true };
      box.setAttribute("fill", ok ? t.ok : t.alarm);
      label.textContent = s;
    },
  };
}

// 木壳钟柜：柜体 + 弧顶 + 侧饰线（钟表屏的壳，静态）
export function WoodCase({ x = 330, y = 62, w = 240, h = 528 } = {}, m) {
  const t = m.t;
  const elg = el("g", {}, m.layers.back);
  el("ellipse", { cx: x + w / 2 + 2, cy: y + h + 10, rx: w * .62, ry: 16, fill: t.shadow, opacity: ".35" }, elg);
  el("rect", { x, y, width: w, height: h, rx: 26, fill: m.grad("wood"), stroke: t.woodLine, "stroke-width": 3 }, elg);
  el("path", { d: `M${x} ${y + 58} Q${x} ${y} ${x + w / 2} ${y} Q${x + w} ${y} ${x + w} ${y + 58} Z`, fill: m.grad("woodDark") }, elg);
  el("line", { x1: x + 12, y1: y + 58, x2: x + 12, y2: y + h - 12, stroke: t.woodLine, "stroke-width": 1.4, opacity: ".5" }, elg);
  el("line", { x1: x + w - 12, y1: y + 58, x2: x + w - 12, y2: y + h - 12, stroke: t.woodLine, "stroke-width": 1.4, opacity: ".5" }, elg);
  return { el: elg };
}

// 原始图形逃生舱：页面侧自定义静态图形（不进库的边角料）
export function Raw({ build } = {}, m) {
  const elg = el("g", {}, m.layers.back);
  if (build) build(elg, m);
  return { el: elg };
}
