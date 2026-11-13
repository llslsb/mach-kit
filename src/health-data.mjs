// health-data.mjs —— 健康数据 CSV 适配（契约见 docs/05_健康数据格式契约）
// 隐私红线（AGENTS.md §2.5）：数据只在本机页面内解析，不出网、不上传。

export const HEALTH_COLUMNS = ["时间", "心率", "收缩压", "舒张压", "血氧", "体温"];

// 解析 CSV 文本 → { rows:[{time,hr,sys,dia,spo2,temp}], skipped, error? }
// 规则：首行表头（按列名定位，列顺序无关）；「心率」列必需；缺心率或非数字的行跳过并计数。
export function parseHealthCSV(text) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], skipped: 0, error: "内容为空" };
  const head = lines[0].split(",").map(s => s.trim());
  const idx = {};
  for (const name of HEALTH_COLUMNS) idx[name] = head.indexOf(name);
  if (idx["心率"] < 0) return { rows: [], skipped: lines.length - 1, error: "表头缺少「心率」列（需含：时间,心率,收缩压,舒张压,血氧,体温）" };
  const num = (s) => { const t = String(s ?? "").trim(); if (!t) return null; const v = Number(t); return isFinite(v) ? v : null; };
  const rows = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",").map(s => s.trim());
    const at = (name) => (idx[name] >= 0 ? num(c[idx[name]]) : null);
    const hr = at("心率");
    if (hr == null) { skipped++; continue; }
    rows.push({
      time: (idx["时间"] >= 0 ? c[idx["时间"]] : "") || "",
      hr,
      sys: at("收缩压"), dia: at("舒张压"),
      spo2: at("血氧"), temp: at("体温"),
    });
  }
  rows.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return { rows, skipped };
}

// 示例数据（一夜：凌晨 3 点血氧跌到 91，用于回放演示报警）
export const HEALTH_SAMPLE_CSV = `时间,心率,收缩压,舒张压,血氧,体温
2026-11-12 22:00,66,118,76,98,36.4
2026-11-12 23:00,63,116,74,98,36.3
2026-11-13 00:00,61,115,73,97,36.3
2026-11-13 01:00,60,114,72,96,36.2
2026-11-13 02:00,59,114,72,94,36.2
2026-11-13 03:00,58,113,71,91,36.1
2026-11-13 04:00,60,115,73,93,36.2
2026-11-13 05:00,62,116,74,96,36.3
2026-11-13 06:00,66,118,76,97,36.4
2026-11-13 07:00,72,122,78,98,36.5`;

// 行 → 页面目标值（缺字段沿用当前值）
export function applyRow(T, row) {
  if (row.hr != null) T.hr = row.hr;
  if (row.sys != null) T.sys = row.sys;
  if (row.dia != null) T.dia = row.sys != null ? row.sys - 38 : T.dia;
  if (row.spo2 != null) T.spo2 = row.spo2;
  if (row.temp != null) T.temp = row.temp;
}

// ———————————————————— 宽容转换层（docs/05 §二之一，契约 v1.1） ————————————————————
// 品牌/设备导出的 CSV、Apple 健康导出的 export.xml → 本契约 CSV。
// 全程在浏览器页面内解析（FileReader/DOMParser），不出网、不上传（AGENTS.md §2.5 红线）。
// 规则：① 表头别名自动识别（认不出时把表头交给页面的列映射兜底）；
//      ② 时间统一成 "YYYY-MM-DD HH:MM"（支持 年-月-日/斜杠/点/T 分隔/epoch 秒或毫秒）；
//      ③ 单位归位：血氧 0~1 小数 ×100，体温华氏（>60 的数）自动转摄氏；心率取整。

const normName = (s) => String(s || "").toLowerCase().replace(/[\s_-]/g, "");
const FIELD_ALIASES = {
  "时间":  ["时间", "日期", "datetime", "date", "time", "timestamp", "时间戳", "测量时间", "记录时间", "开始时间", "startdate"],
  "心率":  ["心率", "脉搏", "heartrate", "hr", "bpm", "pulse", "平均心率"],
  "血氧":  ["血氧", "spo2", "血氧饱和度", "oxygen", "bloodoxygen"],
  "收缩压": ["收缩压", "高压", "systolic"],
  "舒张压": ["舒张压", "低压", "diastolic"],
  "体温":  ["体温", "温度", "皮温", "体表温度", "temperature", "temp", "bodytemperature"],
};
const pad2 = (n) => String(n).padStart(2, "0");
const fmtTime = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
  + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());

function normTime(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d{10,13}$/.test(s)) {                                   // epoch：10 位=秒、13 位=毫秒
    const d = new Date(Number(s) > 1e12 ? Number(s) : Number(s) * 1000);
    if (!isNaN(d)) return fmtTime(d);
  }
  const m = s.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (m) return fmtTime(new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)));
  const d = new Date(s);                                          // 兜底交给 Date（ISO 带时区等）
  return isNaN(d) ? "" : fmtTime(d);
}

// 一行 CSV 的拆分：容忍引号包裹的逗号（"a,b" 算一格）
function splitCSVLine(line) {
  const out = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normValue(field, raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const v = Number(String(raw).replace(/[^\d.-]/g, ""));
  if (!isFinite(v)) return null;
  if (field === "心率") return v >= 20 && v <= 250 ? Math.round(v) : null;
  if (field === "血氧") { const x = v > 0 && v <= 1 ? v * 100 : v; return x >= 50 && x <= 100 ? Math.round(x * 10) / 10 : null; }
  if (field === "收缩压") return v >= 50 && v <= 260 ? Math.round(v) : null;
  if (field === "舒张压") return v >= 30 && v <= 160 ? Math.round(v) : null;
  if (field === "体温") { const c = v > 60 ? (v - 32) * 5 / 9 : v; return c >= 30 && c <= 43 ? Math.round(c * 10) / 10 : null; }
  return null;
}

// 只看表头：给页面列映射兜底用（容忍分号分隔与 BOM）
export function peekCSVHead(text) {
  const first = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  return splitCSVLine(delim === ";" ? first.replace(/;/g, ",") : first);
}

export function toContractCSV(rows) {
  const cell = (v) => (v == null ? "" : String(v));
  return "时间,心率,收缩压,舒张压,血氧,体温\n"
    + rows.map((r) => [r.time, r.hr, cell(r.sys), cell(r.dia), cell(r.spo2), cell(r.temp)].join(",")).join("\n");
}

// CSV → 本契约 CSV。userMap 可选（{字段: 列名或null}），页面列映射兜底时传入。
// 返回 { csv, rows, skipped, mapping } 或 { error, mapping? }
export function convertHealthCSV(text0, userMap) {
  let text = String(text0).replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  if (delim === ";") text = text.replace(/;/g, ",");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { error: "内容太少，看不出表头和数据行" };
  const head = splitCSVLine(lines[0]);
  const mapping = {};
  for (const field of Object.keys(FIELD_ALIASES)) {
    if (userMap && Object.prototype.hasOwnProperty.call(userMap, field)) {
      const want = userMap[field];
      mapping[field] = want ? head.find((h) => normName(h) === normName(want)) || null : null;
    } else {
      const aliases = FIELD_ALIASES[field].map(normName);
      const i = head.findIndex((h) => aliases.includes(normName(h)));
      mapping[field] = i >= 0 ? head[i] : null;
    }
  }
  const idx = {};
  for (const f in mapping) idx[f] = mapping[f] ? head.indexOf(mapping[f]) : -1;
  if (idx["心率"] < 0 && idx["时间"] < 0) return { error: "认不出表头（没找到时间或心率列）", mapping, head };
  const rows = []; let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const c = splitCSVLine(lines[i]);
    const hr = idx["心率"] >= 0 ? normValue("心率", c[idx["心率"]]) : null;
    if (hr == null) { skipped++; continue; }                       // 契约要求：心率必需
    rows.push({
      time: (idx["时间"] >= 0 ? normTime(c[idx["时间"]]) : "") || "",
      hr,
      sys: idx["收缩压"] >= 0 ? normValue("收缩压", c[idx["收缩压"]]) : null,
      dia: idx["舒张压"] >= 0 ? normValue("舒张压", c[idx["舒张压"]]) : null,
      spo2: idx["血氧"] >= 0 ? normValue("血氧", c[idx["血氧"]]) : null,
      temp: idx["体温"] >= 0 ? normValue("体温", c[idx["体温"]]) : null,
    });
  }
  rows.sort((a, b) => a.time.localeCompare(b.time));
  return { csv: toContractCSV(rows), rows, skipped, mapping };
}

// Apple 健康 export.xml → 本契约 CSV（页内 DOMParser）。按开始时间逐分钟聚合成行。
export function convertAppleHealthXML(text) {
  const doc = new DOMParser().parseFromString(String(text), "text/xml");
  if (doc.querySelector("parsererror")) return { error: "不是有效的 XML（Apple 健康导出的 export.xml 才行）" };
  const TYPE = {
    HKQuantityTypeIdentifierHeartRate: (v) => { const n = Number(v); return isFinite(n) && n >= 20 && n <= 250 ? { hr: Math.round(n) } : {}; },
    HKQuantityTypeIdentifierOxygenSaturation: (v) => ({ spo2: normValue("血氧", v) }),
    HKQuantityTypeIdentifierBodyTemperature: (v) => ({ temp: normValue("体温", v) }),
    HKQuantityTypeIdentifierBloodPressureSystolicValue: (v) => ({ sys: normValue("收缩压", v) }),
    HKQuantityTypeIdentifierBloodPressureDiastolicValue: (v) => ({ dia: normValue("舒张压", v) }),
  };
  const byKey = new Map();
  let skipped = 0;
  for (const rec of doc.querySelectorAll("Record")) {
    const mk = TYPE[rec.getAttribute("type") || ""];
    if (!mk) continue;
    const patch = mk(rec.getAttribute("value"));
    if (!Object.keys(patch).length) { skipped++; continue; }
    const k = normTime(rec.getAttribute("startDate"));
    if (!k) { skipped++; continue; }
    if (!byKey.has(k)) byKey.set(k, { time: k, hr: null, sys: null, dia: null, spo2: null, temp: null });
    Object.assign(byKey.get(k), patch);
  }
  const rows = [...byKey.values()].filter((r) => r.hr != null).sort((a, b) => a.time.localeCompare(b.time));
  if (!rows.length) return { error: "XML 里没找到可用的心率记录（心率是回放必需项）", skipped };
  return {
    csv: toContractCSV(rows), rows, skipped,
    mapping: { 时间: "startDate", 心率: "HeartRate 记录", 血氧: "OxygenSaturation", 收缩压: "BloodPressure", 舒张压: "BloodPressure", 体温: "BodyTemperature" },
  };
}

// 总入口：开头像 XML 就走 Apple 转换，否则当品牌 CSV 转换
export function convertHealthText(text) {
  const head = String(text).slice(0, 2000);
  if (/^\s*(<\?xml|<HealthData)/.test(head) || /<Record\s/.test(head)) return convertAppleHealthXML(text);
  return convertHealthCSV(text);
}
