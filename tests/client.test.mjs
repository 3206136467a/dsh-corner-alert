/**
 * Offline functional harness for dsh-corner-alert's browser half.
 *
 * Runs the real client.js inside a minimal stand-in for the Harness module
 * loader and client context: a fake `slots` service, a fake session-status
 * projection, a fake AudioContext and a fake Notification. It then drives real
 * transitions and asserts the toast store and sound calls.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const clientPath = resolve(here, "..", "client.js");
const source = readFileSync(clientPath, "utf8");

const results = [];

function check(name, ok, detail) {
  results.push({ name, ok, detail });
}

/* ---------- fakes ---------- */

function makeStore(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (init) => {
    const value = typeof init === "function" ? init() : init;
    return [value, () => {}];
  },
  useEffect: () => {},
  useRef: (init) => ({ current: init }),
};

const chimeCalls = [];
const notificationCalls = [];
const registeredSlots = [];
const injectCalls = [];

const fakeCtx = {
  get: (name) => (name === "sessions" ? fakeSessions : name === "uiWorkspace" ? fakeWorkspace : undefined),
  inject: (deps, callback) => {
    injectCalls.push(deps);
    return callback(fakeScope);
  },
  effect: (factory) => {
    const disposer = factory();
    return typeof disposer === "function" ? disposer : () => {};
  },
  slots: {
    inject: (owner, factory) => {
      const dispose = factory();
      return () => {
        if (typeof dispose === "function") dispose();
      };
    },
    register: (options, component) => {
      registeredSlots.push({ options, component });
      return () => {};
    },
  },
};

const statusStore = makeStore(new Map());
const fakeScope = {
  uiSession: { sessionStatus: statusStore },
  get: fakeCtx.get,
};

const fakeSessions = {
  list: makeStore({ byId: { "sess-1": { sessionId: "sess-1", displayTitle: "测试会话", parentId: undefined } } }),
};
const fakeWorkspace = { openSession: () => {} };

class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.destination = {};
  }
  resume() {
    return Promise.resolve();
  }
  createOscillator() {
    return {
      type: "",
      frequency: { setValueAtTime: (value) => chimeCalls.push(["freq", value]) },
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
    };
  }
}

class FakeNotification {
  constructor(title, options) {
    notificationCalls.push({ title, options });
    this.title = title;
  }
  close() {}
}
FakeNotification.permission = "granted";
FakeNotification.requestPermission = () => Promise.resolve("granted");

const storage = new Map();
const timers = [];
let timerId = 0;

const sandbox = {
  console,
  window: {
    __ModuleLoader__: {
      load: (entry) => {
        if (entry.id !== "dsh-corner-alert") throw new Error(`unexpected module id ${entry.id}`);
        const loaded = entry.factory((name) => {
          if (name === "react") return react;
          throw new Error(`unknown module ${name}`);
        });
        sandbox.__loaded = loaded;
      },
    },
  },
  document: {
    documentElement: { lang: "zh-CN" },
    getElementById: () => null,
    createElement: () => ({ id: "", textContent: "" }),
    head: { appendChild: () => {} },
  },
  navigator: { language: "zh-CN" },
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  },
  AudioContext: FakeAudioContext,
  Notification: FakeNotification,
  setTimeout: (fn, ms) => {
    timerId += 1;
    timers.push({ id: timerId, fn, ms });
    return timerId;
  },
  clearTimeout: (id) => {
    const index = timers.findIndex((timer) => timer.id === id);
    if (index >= 0) timers.splice(index, 1);
  },
  focus: () => {},
  Set,
  Map,
  Number,
  String,
  Object,
  Array,
  JSON,
  Date,
  Promise,
};
sandbox.globalThis = sandbox;
sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.setTimeout = sandbox.setTimeout;
sandbox.window.clearTimeout = sandbox.clearTimeout;
sandbox.window.AudioContext = FakeAudioContext;
sandbox.window.Notification = FakeNotification;
sandbox.window.navigator = sandbox.navigator;

const context = vm.createContext(sandbox);
vm.runInContext(source, context, { filename: clientPath });

check("module registers under its package id", typeof sandbox.__loaded === "object" && sandbox.__loaded !== null);
check("exports apply", typeof sandbox.__loaded.apply === "function");
check("declares slots dependency", Array.isArray(sandbox.__loaded.inject) && sandbox.__loaded.inject.includes("slots"));

sandbox.__loaded.apply(fakeCtx);

check("injects uiSession", injectCalls.some((deps) => Array.isArray(deps) && deps.includes("uiSession")));
check(
  "registers a shell.overlay entry",
  registeredSlots.length === 1 &&
    registeredSlots[0].options.name === "shell.overlay" &&
    registeredSlots[0].options.id === "dsh-corner-alert",
  JSON.stringify(registeredSlots.map((entry) => entry.options)),
);
check("exposes the console API", typeof sandbox.__dshCornerAlert === "object");

/* ---------- drive real transitions ---------- */

const api = sandbox.__dshCornerAlert;

function setStatus(map) {
  statusStore.set(map);
}

// Seed: a session already running must not alert on first observation.
setStatus(new Map([["sess-1", { running: true, pendingInteraction: undefined }]]));
check("seeding produces no toast", api.state().toasts.length === 0);

// Turn finishes -> settle window -> done toast + chime + native notification.
setStatus(new Map([["sess-1", { running: false, pendingInteraction: undefined }]]));
const settleTimer = timers.find((timer) => timer.ms === 1200);
check("schedules a settle window", settleTimer !== undefined, `timers=${timers.map((t) => t.ms).join(",")}`);
if (settleTimer) settleTimer.fn();
check("done toast raised", api.state().toasts.some((toast) => toast.kind === "done"));
check("chime played on done", chimeCalls.length > 0);
check("native notification raised on done", notificationCalls.length > 0);

// Needs user: a pending approval appears while idle.
setStatus(
  new Map([
    ["sess-1", { running: false, pendingInteraction: { toolName: "pwsh", toolCallId: "call-1" } }],
  ]),
);
const needToast = api.state().toasts.find((toast) => toast.kind === "need");
check("needs-user toast raised", needToast !== undefined);
check(
  "needs-user body names the tool",
  needToast !== undefined && String(needToast.body).includes("pwsh"),
  needToast ? needToast.body : "",
);
check(
  "needs-user toast is toned as a warning",
  needToast !== undefined && needToast.tone === "need",
);

// Re-running and finishing again raises a second done toast.
const before = api.state().toasts.length;
setStatus(
  new Map([
    ["sess-1", { running: true, pendingInteraction: undefined }],
  ]),
);
setStatus(
  new Map([
    ["sess-1", { running: false, pendingInteraction: undefined }],
  ]),
);
const settle2 = timers.filter((timer) => timer.ms === 1200).pop();
if (settle2) settle2.fn();
check("a second completion raises another toast", api.state().toasts.length > before);

// Sub-agent rows stay silent by default.
setStatus(
  new Map([
    ["sess-1", { running: false, pendingInteraction: undefined }],
    ["sub-1", { running: true, pendingInteraction: undefined }],
    ["sub-1b", { running: false, pendingInteraction: undefined }],
  ]),
);
check("unknown session rows are not announced", api.state().toasts.every((toast) => toast.sessionId !== "sub-1b"));

// Manual test entry point.
api.test();
check("test() raises a toast", api.state().toasts.some((toast) => toast.kind === "test"));

/* ---------- report ---------- */

const failed = results.filter((result) => !result.ok);
for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}${result.detail ? `  [${result.detail}]` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exitCode = failed.length === 0 ? 0 : 1;
