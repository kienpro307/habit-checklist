import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DAILY, DONE, FAIL, PENDING, SKIP, addDays, dayStatus, emptyData, localToday, newRewards, ops,
  streak, weekday,
} from "../js/rules.js";

const MONDAY = "2026-11-16";
const d = (n) => addDays(MONDAY, n);

function data() {
  const x = emptyData();
  x.start = MONDAY;
  return x;
}
const complete = (x, person, day) => DAILY.forEach((i) => ops.tick(person, day, i.key, true)(x));
const run = (x, person, first, count) => {
  for (let i = 0; i < count; i++) complete(x, person, addDays(first, i));
};

test("dates", () => {
  assert.equal(weekday(MONDAY), 0);
  assert.equal(weekday(d(6)), 6);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(localToday(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("full days count, today and yesterday stay open", () => {
  const x = data();
  run(x, "eny", d(0), 3);
  assert.equal(dayStatus(x, "eny", d(3), d(4)), PENDING);
  assert.equal(dayStatus(x, "eny", d(4), d(4)), PENDING);
  assert.equal(streak(x, "eny", d(4)).current, 3);
});

test("one missing item on a closed day resets; ticking it later mends", () => {
  const x = data();
  run(x, "eny", d(0), 3);
  complete(x, "eny", d(4));
  ops.tick("eny", d(3), "doc", true)(x);
  assert.equal(dayStatus(x, "eny", d(3), d(5)), FAIL);
  assert.deepEqual(streak(x, "eny", d(5)), { current: 1, best: 3, skipped: 0 });
  complete(x, "eny", d(3));
  assert.equal(streak(x, "eny", d(5)).current, 5);
});

test("untick removes the item", () => {
  const x = data();
  complete(x, "eny", d(0));
  ops.tick("eny", d(0), "doc", false)(x);
  assert.deepEqual(x.people.eny.days[d(0)].ticks.includes("doc"), false);
});

test("skip day neither counts nor breaks", () => {
  const x = data();
  run(x, "eny", d(0), 2);
  ops.skip("eny", d(2), "🩸 Đến tháng")(x);
  complete(x, "eny", d(3));
  assert.equal(dayStatus(x, "eny", d(2), d(5)), SKIP);
  assert.deepEqual(streak(x, "eny", d(5)), { current: 3, best: 3, skipped: 1 });
});

test("third game of the week breaks Any that day, even while open", () => {
  const x = data();
  run(x, "any", d(0), 3);
  ops.count("any", d(0), "game", 2)(x);
  assert.equal(dayStatus(x, "any", d(0), d(4)), DONE);
  ops.count("any", d(2), "game", 1)(x);
  assert.equal(dayStatus(x, "any", d(2), d(2)), FAIL);
  assert.equal(streak(x, "any", d(2)).current, 0);
});

test("weekly limits start over on Monday; private item allows one", () => {
  const x = data();
  ops.count("any", d(6), "game", 2)(x);
  ops.count("any", d(7), "game", 2)(x);
  complete(x, "any", d(7));
  assert.equal(dayStatus(x, "any", d(7), d(7)), DONE);
  run(x, "any", d(0), 2);
  ops.count("any", d(0), "rieng", 1)(x);
  ops.count("any", d(1), "rieng", 1)(x);
  assert.equal(dayStatus(x, "any", d(0), d(3)), DONE);
  assert.equal(dayStatus(x, "any", d(1), d(3)), FAIL);
});

test("no network by Sunday fails Sunday once it closes", () => {
  const x = data();
  run(x, "any", d(0), 7);
  assert.equal(dayStatus(x, "any", d(6), d(6)), PENDING);
  assert.equal(dayStatus(x, "any", d(6), d(8)), FAIL);
  ops.count("any", d(2), "network", 1)(x);
  assert.equal(streak(x, "any", d(8)).current, 7);
});

test("counts never go below zero", () => {
  const x = data();
  ops.count("any", d(0), "game", -1)(x);
  assert.equal(x.people.any.days[d(0)].counts.game, 0);
});

test("a reward needs both, not at the same time, and is recorded once", () => {
  const x = data();
  run(x, "any", d(0), 7);
  ops.count("any", d(2), "network", 1)(x);
  assert.deepEqual(newRewards(x, d(8)), []);
  run(x, "eny", d(5), 7); // Eny gets there later; Any has lost the streak by then
  assert.equal(streak(x, "any", d(12)).current, 0);
  const won = newRewards(x, d(12));
  assert.deepEqual(won.map((m) => m.days), [7]);
  ops.reward(7, d(12))(x);
  assert.deepEqual(newRewards(x, d(12)), []);
});

test("no start date yet: no streak", () => {
  assert.deepEqual(streak(emptyData(), "any", d(0)), { current: 0, best: 0, skipped: 0 });
});
