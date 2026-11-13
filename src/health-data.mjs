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
  const num = (s) => { const v = Number(String(s ?? "").trim()); return isFinite(v) ? v : null; };
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
