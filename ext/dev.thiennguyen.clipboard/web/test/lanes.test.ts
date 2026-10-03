import assert from "node:assert/strict";
import { test } from "node:test";
import { backoff, Foreground, isBusy, newest, serial, Superseded } from "../src/lanes.ts";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test("a serial lane never runs two tasks at once and keeps the order", async () => {
  const lane = serial();
  let running = 0;
  let most = 0;
  const order: number[] = [];
  const task = (n: number) => async () => {
    running++;
    most = Math.max(most, running);
    await tick(5);
    order.push(n);
    running--;
    return n;
  };
  const answers = await Promise.all([lane(task(1)), lane(task(2)), lane(task(3))]);
  assert.deepEqual(answers, [1, 2, 3]);
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(most, 1);
});

test("the newest lane also drops a task replaced before it ever started", async () => {
  const lane = newest();
  const ran: string[] = [];
  const one = lane(async () => ran.push("a"));
  const two = lane(async () => ran.push("b"));
  await assert.rejects(one, Superseded);
  await two;
  assert.deepEqual(ran, ["b"]);
});

test("a task that throws does not end the lane", async () => {
  const lane = serial();
  await assert.rejects(lane(async () => Promise.reject(new Error("no"))), /no/);
  assert.equal(await lane(async () => 7), 7);
});

test("the newest lane drops what is still waiting when another arrives", async () => {
  const lane = newest();
  const ran: string[] = [];
  const task = (name: string) => async () => {
    ran.push(name);
    await tick(5);
    return name;
  };
  const first = lane(task("a"));
  await tick();
  const second = lane(task("b"));
  const third = lane(task("c"));
  assert.equal(await first, "a");
  await assert.rejects(second, Superseded);
  assert.equal(await third, "c");
  assert.deepEqual(ran, ["a", "c"]);
});

test("idle answers at once when nothing is running", async () => {
  const front = new Foreground();
  await front.idle(1000);
});

test("idle waits for the person's request and not longer", async () => {
  const front = new Foreground();
  front.enter();
  let woke = false;
  const waiting = front.idle(1000).then(() => (woke = true));
  await tick(10);
  assert.equal(woke, false);
  front.leave();
  await waiting;
  assert.equal(woke, true);
});

test("idle gives up after its limit so a stuck request cannot starve the lane", async () => {
  const front = new Foreground();
  front.enter();
  const started = Date.now();
  await front.idle(30);
  assert.ok(Date.now() - started < 500);
  assert.equal(front.busy, true);
});

test("leave never counts below zero", () => {
  const front = new Foreground();
  front.leave();
  front.enter();
  assert.equal(front.busy, true);
});

test("a refused request is retried about a second and then handed back", () => {
  assert.equal(isBusy(503), true);
  assert.equal(isBusy(502), false);
  const waits: number[] = [];
  for (let attempt = 0; backoff(attempt) !== null; attempt++) waits.push(backoff(attempt)!);
  assert.deepEqual(waits, [150, 300, 600]);
});
