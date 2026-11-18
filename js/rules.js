// Habits, limits, rewards and the streak rules (pure functions: no DOM, no network).
//
// A day is, for one person:
// - skip:    marked as skipped (injury, holiday, period...). Neither counts nor breaks the streak.
// - done:    every daily item ticked, no weekly limit broken, and (on Sunday) weekly minimums met.
// - fail:    a weekly limit went over that day, or the day is closed and not done.
// - pending: today or yesterday and not done yet (last night's sleep is ticked this morning).
//            Neither counts nor breaks.
// Old days can be ticked later, so everything is recomputed from the data every time.

export const PEOPLE = ["any", "eny"];
export const NAMES = { any: "Any", eny: "Eny" };

// Keys are stored in data.json: change labels freely, keep keys.
// "ngu" is the night starting that day (23:00 → 06:00 next morning), ticked the next morning.
export const DAILY = [
  { key: "tap", label: "💪 Tập 5 phút (không tính đi bộ)" },
  { key: "doc", label: "📖 Đọc 10 trang sách" },
  { key: "hoc", label: "🧠 Học 5 phút nâng cấp bản thân" },
  { key: "kiemtien", label: "💰 Học 5 phút kỹ năng kiếm tiền" },
  { key: "ngu", label: "😴 Ngủ 7 tiếng rưỡi (đêm nay)" },
  { key: "mxh", label: "📵 MXH không quá 2 tiếng" },
  { key: "an", label: "🥗 Ăn uống healthy" },
];

// Counted per week (Monday-Sunday). most: going over breaks the streak that day.
// least: fewer than this by Sunday breaks the streak on Sunday.
export const WEEKLY = {
  any: [
    { key: "game", label: "🎮 Game", most: 2 },
    { key: "rieng", label: "🔒 Mục riêng", most: 1 },
    { key: "network", label: "🤝 Network", least: 1 },
  ],
  eny: [],
};

export const SKIP_REASONS = ["🤕 Chấn thương", "🤒 Ốm", "🎉 Ngày lễ", "🩸 Đến tháng"];

// Each reward is given once, when both have reached that streak (not necessarily together).
export const MILESTONES = [
  { days: 7, reward: "Du lịch miền Bắc" },
  { days: 14, reward: "Du lịch miền Nam" },
  { days: 21, reward: "Du lịch Trung Quốc" },
  { days: 50, reward: null },
];
export const GOAL = 50;

export const DONE = "done", FAIL = "fail", SKIP = "skip", PENDING = "pending";

// --- dates as "YYYY-MM-DD" strings ---
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
export const addDays = (iso, n) =>
  new Date(toDate(iso).getTime() + n * 86400000).toISOString().slice(0, 10);
export const weekday = (iso) => (toDate(iso).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
export const weekStart = (iso) => addDays(iso, -weekday(iso));
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// --- data access ---
export function emptyData() {
  return { version: 1, start: null, people: { any: { days: {} }, eny: { days: {} } }, rewards: {} };
}
const EMPTY_DAY = { ticks: [], counts: {}, skip: null };
export const dayRec = (data, person, day) => data.people[person].days[day] || EMPTY_DAY;

export function weekTotal(data, person, key, day, upToDay = false) {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart(day), i);
    if (upToDay && d > day) break;
    total += dayRec(data, person, d).counts[key] || 0;
  }
  return total;
}

export const overLimit = (data, person, day) =>
  WEEKLY[person]
    .filter((w) => w.most !== undefined && (dayRec(data, person, day).counts[w.key] || 0) > 0)
    .filter((w) => weekTotal(data, person, w.key, day, true) > w.most)
    .map((w) => w.key);

export const shortOfMinimum = (data, person, day) =>
  weekday(day) !== 6
    ? []
    : WEEKLY[person]
        .filter((w) => w.least !== undefined && weekTotal(data, person, w.key, day) < w.least)
        .map((w) => w.key);

export const missingItems = (data, person, day) => {
  const ticks = dayRec(data, person, day).ticks;
  return DAILY.filter((i) => !ticks.includes(i.key)).map((i) => i.key);
};

export function dayStatus(data, person, day, today) {
  if (dayRec(data, person, day).skip) return SKIP;
  if (overLimit(data, person, day).length) return FAIL;
  if (!missingItems(data, person, day).length && !shortOfMinimum(data, person, day).length)
    return DONE;
  return day >= addDays(today, -1) ? PENDING : FAIL;
}

export function streak(data, person, today) {
  let current = 0, best = 0, skipped = 0;
  if (!data.start) return { current, best, skipped };
  for (let day = data.start; day <= today; day = addDays(day, 1)) {
    const status = dayStatus(data, person, day, today);
    if (status === DONE) best = Math.max(best, ++current);
    else if (status === FAIL) current = 0;
    else if (status === SKIP) skipped++;
  }
  return { current, best, skipped };
}

// Milestones both have reached that are not yet recorded in data.rewards.
export function newRewards(data, today) {
  const best = PEOPLE.map((p) => streak(data, p, today).best);
  return MILESTONES.filter((m) => !data.rewards[m.days] && best.every((b) => b >= m.days));
}

// --- edits (idempotent: safe to re-apply after a save conflict) ---
function editDay(data, person, day) {
  const days = data.people[person].days;
  days[day] = days[day] || { ticks: [], counts: {}, skip: null };
  return days[day];
}
export const ops = {
  tick: (person, day, key, on) => (data) => {
    const rec = editDay(data, person, day);
    rec.ticks = rec.ticks.filter((k) => k !== key);
    if (on) rec.ticks.push(key);
  },
  count: (person, day, key, n) => (data) => {
    editDay(data, person, day).counts[key] = Math.max(0, n);
  },
  skip: (person, day, reason) => (data) => {
    editDay(data, person, day).skip = reason || null;
  },
  start: (day) => (data) => {
    data.start = data.start || day;
  },
  reward: (days, day) => (data) => {
    data.rewards[days] = data.rewards[days] || day;
  },
};
