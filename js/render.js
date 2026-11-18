// HTML for each screen. Buttons carry data-action; app.js handles the clicks.

import {
  DAILY, DONE, FAIL, GOAL, MILESTONES, NAMES, PEOPLE, SKIP, SKIP_REASONS, WEEKLY,
  addDays, dayRec, dayStatus, missingItems, overLimit, shortOfMinimum, streak, weekTotal,
} from "./rules.js";

const WEEKDAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const weeklyLabel = (person, key) => WEEKLY[person].find((w) => w.key === key).label;

export function dayLabel(day, today) {
  const d = new Date(`${day}T00:00:00Z`);
  const name = WEEKDAYS[(d.getUTCDay() + 6) % 7];
  const rel = day === today ? " · hôm nay" : day === addDays(today, -1) ? " · hôm qua" : "";
  return `${name} ${day.slice(8)}/${day.slice(5, 7)}${rel}`;
}

export function renderSetup(hasToken, who) {
  const pick = PEOPLE.map((p) => `<button class="big ${who === p ? "on" : ""}"
    data-action="who" data-person="${p}">Tôi là ${NAMES[p]}</button>`).join("");
  return `<section class="card">
    <h2>Cài lần đầu trên điện thoại này</h2>
    <p>1. Bạn là ai?</p><div class="row">${pick}</div>
    ${hasToken ? "<p>✅ Đã có mã truy cập.</p>" : `<p>2. Dán mã truy cập (hỏi Any):</p>
      <input id="token" type="password" autocomplete="off" placeholder="github_pat_…">
      <button class="big" data-action="token">Lưu mã</button>`}
  </section>`;
}

function statusLine(data, person, day, status) {
  const rec = dayRec(data, person, day);
  if (status === SKIP) return `⏭ Skip: ${esc(rec.skip)}`;
  if (status === DONE) return "✅ Xong ngày này!";
  const over = overLimit(data, person, day);
  if (over.length) return `❌ Vượt giới hạn tuần (${over.map((k) => weeklyLabel(person, k)).join(", ")}) nên đứt chuỗi`;
  const left = missingItems(data, person, day).length;
  const parts = left ? [`còn ${left} việc`] : [];
  shortOfMinimum(data, person, day).forEach((k) => parts.push(`tuần chưa có ${weeklyLabel(person, k)}`));
  return status === FAIL ? `❌ Đứt chuỗi (${parts.join(", ")}). Tick bù là nối lại.` : `⏳ ${parts.join(", ")}`;
}

function checklist(data, person, day, today, editable, skipMenu) {
  const rec = dayRec(data, person, day);
  const status = dayStatus(data, person, day, today);
  const dis = editable ? "" : "disabled";
  let body;
  if (rec.skip) {
    body = `<button class="item" data-action="unskip" ${dis}>↩️ Bỏ skip</button>`;
  } else if (skipMenu) {
    body = SKIP_REASONS.map((r) => `<button class="item" data-action="skip" data-reason="${esc(r)}">${r}</button>`).join("")
      + `<div class="row"><input id="reason" placeholder="✏️ Lý do khác"><button data-action="skip-other">Lưu</button></div>
      <button class="item ghost" data-action="skip-menu">↩️ Quay lại</button>`;
  } else {
    body = DAILY.map((i) => {
      const on = rec.ticks.includes(i.key);
      return `<button class="item ${on ? "on" : ""}" data-action="tick" data-key="${i.key}" ${dis}>
        <span class="box">${on ? "✅" : "⬜"}</span>${i.label}</button>`;
    }).join("") + WEEKLY[person].map((w) => {
      const n = rec.counts[w.key] || 0;
      const total = weekTotal(data, person, w.key, day);
      const goal = w.most !== undefined ? `tuần ${total}/${w.most}` : `tuần ${total} (cần ≥${w.least})`;
      return `<div class="counter"><span>${w.label} hôm nay: <b>${n}</b><small>${goal}</small></span>
        <button data-action="count" data-key="${w.key}" data-n="${n - 1}" ${dis}>−</button>
        <button data-action="count" data-key="${w.key}" data-n="${n + 1}" ${dis}>+</button></div>`;
    }).join("") + (editable ? `<button class="item ghost" data-action="skip-menu">⏭ Skip ngày này</button>` : "");
  }
  return `<p class="status ${status}">${statusLine(data, person, day, status)}</p>${body}`;
}

export function renderMain(data, ui, today) {
  const { who, viewing, day, skipMenu } = ui;
  const tabs = PEOPLE.map((p) => {
    const s = streak(data, p, today);
    return `<button class="tab ${viewing === p ? "on" : ""}" data-action="view" data-person="${p}">
      ${NAMES[p]}${p === who ? " (tôi)" : ""}<br><b>🔥 ${s.current}</b> · kỷ lục ${s.best}</button>`;
  }).join("");
  const nav = `<div class="nav">
    <button data-action="day" data-day="${addDays(day, -1)}" ${data.start && day <= data.start ? "disabled" : ""}>‹</button>
    <span>${dayLabel(day, today)}</span>
    <button data-action="day" data-day="${addDays(day, 1)}" ${day >= today ? "disabled" : ""}>›</button></div>`;
  const back = day !== today ? `<button class="link" data-action="day" data-day="${today}">Về hôm nay</button>` : "";
  const editable = viewing === who && (!data.start || day >= data.start);
  return `<div class="tabs">${tabs}</div>${nav}${back}
    <section class="card">${checklist(data, viewing, day, today, editable, skipMenu)}
    ${viewing !== who ? `<p class="hint">Chỉ xem: đây là checklist của ${NAMES[viewing]}.</p>` : ""}</section>
    ${rewards(data, today)}`;
}

function rewards(data, today) {
  const s = Object.fromEntries(PEOPLE.map((p) => [p, streak(data, p, today)]));
  const rows = MILESTONES.map((m) => {
    const what = m.reward || `mục tiêu ${GOAL} ngày`;
    if (data.rewards[m.days]) return `<li class="won">✅ ${m.days} ngày: ${what}</li>`;
    const prog = PEOPLE.map((p) => `${NAMES[p]} ${s[p].best >= m.days ? "✅" : `${s[p].current}/${m.days}`}`).join(", ");
    return `<li>⏳ ${m.days} ngày: ${what} <small>(${prog})</small></li>`;
  }).join("");
  return `<section class="card"><h3>🎁 Phần thưởng</h3><p class="hint">Cả hai cùng qua mốc mới được nhận, mỗi mốc một lần.</p><ul>${rows}</ul></section>`;
}
