// Page wiring: who is using this phone, which day is shown, clicks → edits → GitHub.

import { DATA_REPO } from "./config.js";
import { GitHubStore } from "./github-store.js";
import { renderMain, renderSetup } from "./render.js";
import { MILESTONES, NAMES, PEOPLE, localToday, newRewards, ops, streak } from "./rules.js";

const $app = document.getElementById("app");
const $sync = document.getElementById("sync");
const $toast = document.getElementById("toast");

const storage = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: ask again next time */ } },
};

// A setup link "#k=<token>&who=eny" fills this phone in once; the hash is removed right away.
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get("k")) storage.set("token", hash.get("k"));
if (PEOPLE.includes(hash.get("who"))) storage.set("who", hash.get("who"));
if (location.hash) history.replaceState(null, "", location.pathname);

const ui = { who: storage.get("who"), viewing: storage.get("who"), day: localToday(), skipMenu: false };
let store = null;

function toast(text) {
  $toast.textContent = $toast.hidden ? text : `${$toast.textContent}\n${text}`; // keep both news
  $toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($toast.hidden = true), 6000);
}

function render() {
  const token = storage.get("token");
  if (!token || !ui.who) {
    $app.innerHTML = renderSetup(Boolean(token), ui.who);
    return;
  }
  if (!store) return start(token);
  const today = localToday();
  if (ui.day > today) ui.day = today;
  $app.innerHTML = renderMain(store.view(), ui, today);
}

// One celebration per milestone per phone; a reward is also written into data.json once.
function celebrate() {
  const data = store.view();
  const today = localToday();
  const best = streak(data, ui.who, today).best;
  MILESTONES.filter((m) => best >= m.days && !storage.get(`seen-${ui.who}-${m.days}`)).forEach((m) => {
    storage.set(`seen-${ui.who}-${m.days}`, "1");
    toast(`🎉 ${NAMES[ui.who]} đã đạt chuỗi ${m.days} ngày!`);
  });
  newRewards(data, today).forEach((m) => {
    store.apply(ops.reward(m.days, today));
    toast(m.reward ? `🏆 Cả Any và Eny đã qua mốc ${m.days} ngày → ${m.reward}! 🎉`
      : `🏁 Cả Any và Eny đã cán mốc ${m.days} ngày!`);
  });
}

async function start(token) {
  store = new GitHubStore({ ...DATA_REPO, token });
  store.onChange = render;
  store.onStatus = (status, err) => {
    $sync.textContent = { saving: "Đang lưu…", saved: "Đã lưu ✓", error: `⚠️ ${err?.message || "Lỗi"}` }[status];
    if (status === "saved") celebrate();
  };
  $app.innerHTML = `<p class="hint">Đang tải…</p>`;
  try {
    await store.load();
    $sync.textContent = "";
  } catch (err) {
    store = null;
    $app.innerHTML = `<section class="card"><p>⚠️ ${err.message}</p>
      <button class="big" data-action="reset-token">Nhập lại mã truy cập</button></section>`;
  }
}

function edit(op) {
  const today = localToday();
  if (!store.view().start) store.apply(ops.start(today));
  store.apply(op);
}

$app.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const { action, person, key, day, n, reason } = el.dataset;
  const who = ui.who;
  switch (action) {
    case "who": ui.who = ui.viewing = person; storage.set("who", person); break;
    case "token": {
      const value = document.getElementById("token").value.trim();
      if (value) storage.set("token", value);
      break;
    }
    case "reset-token": storage.set("token", ""); break;
    case "view": ui.viewing = person; ui.skipMenu = false; break;
    case "day": ui.day = day; ui.skipMenu = false; break;
    case "tick": {
      const on = !store.view().people[who].days[ui.day]?.ticks.includes(key);
      return edit(ops.tick(who, ui.day, key, on));
    }
    case "count": return edit(ops.count(who, ui.day, key, Number(n)));
    case "skip-menu": ui.skipMenu = !ui.skipMenu; break;
    case "skip": ui.skipMenu = false; return edit(ops.skip(who, ui.day, reason));
    case "skip-other": {
      const text = document.getElementById("reason").value.trim().slice(0, 100);
      if (!text) return;
      ui.skipMenu = false;
      return edit(ops.skip(who, ui.day, text));
    }
    case "unskip": return edit(ops.skip(who, ui.day, null));
  }
  render();
});

// See the other person's ticks: reload when the page comes back to the front, and every minute.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && store) store.refresh().catch(() => {});
});
setInterval(() => store && document.visibilityState === "visible" && store.refresh().catch(() => {}), 60000);

render();
