/**
 * Browser half of `dsh-corner-alert`.
 *
 * Watches the Session status projection that `@deepseek-ai/dsh-client-ui-session`
 * already maintains (`uiSession.sessionStatus`) and raises, for every real
 * transition, a bottom-right toast plus a notification sound:
 *
 *   - a running Session settles to idle with no pending interaction  -> 任务完成
 *   - a pending interaction appears (approval / question)            -> 需要你操作
 *
 * Nothing here polls and nothing folds session events twice: the projection is
 * the single source of truth, and a short settle window collapses the idle gap
 * of a multi-round goal into one alert.
 *
 * Settings live in localStorage under `dshCornerAlert.`:
 *   enabled, sound, native, settleMs, toastMs, subagents
 * Console entry point: `__dshCornerAlert.test()` / `__dshCornerAlert.state()`.
 */
window.__ModuleLoader__.load({
  id: "dsh-corner-alert",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");
    var h = react.createElement;

    var STORAGE_PREFIX = "dshCornerAlert.";
    var TOAST_ID = "dsh-corner-alert";

    //#region settings

    function readFlag(key, fallback) {
      try {
        var raw = globalThis.localStorage?.getItem(STORAGE_PREFIX + key);
        if (raw === undefined || raw === null || raw === "") return fallback;
        return raw !== "0" && raw !== "false";
      } catch (_error) {
        return fallback;
      }
    }

    function readNumber(key, fallback, min, max) {
      try {
        var raw = globalThis.localStorage?.getItem(STORAGE_PREFIX + key);
        if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
        var value = Number(raw);
        if (!Number.isFinite(value) || value < min || value > max) return fallback;
        return value;
      } catch (_error) {
        return fallback;
      }
    }

    function readSettings() {
      return {
        enabled: readFlag("enabled", true),
        sound: readFlag("sound", true),
        native: readFlag("native", true),
        subagents: readFlag("subagents", false),
        settleMs: readNumber("settleMs", 1200, 0, 10000),
        toastMs: readNumber("toastMs", 7000, 1500, 60000)
      };
    }

    function isChinese() {
      var lang = globalThis.document?.documentElement?.lang || globalThis.navigator?.language || "en";
      return String(lang).toLowerCase().indexOf("zh") === 0;
    }

    function copy() {
      var zh = isChinese();
      return {
        doneTitle: zh ? "任务完成" : "Task finished",
        doneBody: zh ? "这一轮已经跑完，可以回来看了" : "The turn finished — come back and review",
        needTitle: zh ? "需要你操作" : "Your action is needed",
        approvalBody: function (tool) {
          return zh ? "等待你批准工具调用：" + tool : "Approval needed for: " + tool;
        },
        questionBody: zh ? "Agent 正在等你回复" : "The agent is waiting for your reply",
        genericBody: zh ? "有一步在等你处理" : "Something is waiting for you",
        testTitle: zh ? "提示测试" : "Alert test",
        testBody: zh ? "这是一条测试提醒" : "This is a test alert",
        jump: zh ? "跳转" : "Open",
        close: zh ? "关闭" : "Dismiss",
        restartLabel: zh ? "热重启" : "Hot restart",
        restartConfirm: zh
          ? "确定热重启 DSH 吗？界面会重载，未保存的输入会丢失。"
          : "Hot restart DSH now? The UI reloads and unsaved input is lost.",
        restartBusy: zh ? "重启中…" : "Restarting…",
        restartFail: zh ? "重启请求失败：" : "Restart request failed: "
      };
    }

    //#endregion

    //#region store

    function createStore(initial) {
      var value = initial;
      var listeners = new Set();
      return {
        getSnapshot: function () {
          return value;
        },
        subscribe: function (listener) {
          listeners.add(listener);
          return function () {
            listeners.delete(listener);
          };
        },
        set: function (next) {
          if (next === value) return;
          value = next;
          listeners.forEach(function (listener) {
            try {
              listener();
            } catch (error) {
              console.warn("[corner-alert] listener failed:", error);
            }
          });
        }
      };
    }

    function useStore(store) {
      var pair = react.useState(function () {
        return store.getSnapshot();
      });
      var value = pair[0];
      var setValue = pair[1];
      react.useEffect(
        function () {
          return store.subscribe(function () {
            setValue(function () {
              return store.getSnapshot();
            });
          });
        },
        [store]
      );
      return value;
    }

    //#endregion

    //#region sound

    var audioContext = null;

    function audio() {
      if (audioContext !== null) return audioContext;
      try {
        var Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (typeof Ctor !== "function") return null;
        audioContext = new Ctor();
      } catch (_error) {
        audioContext = null;
      }
      return audioContext;
    }

    /** Resume the audio context after the first user gesture (autoplay policy). */
    function unlockAudio() {
      var context = audio();
      if (context && context.state === 'suspended') {
        try { context.resume().catch(function () {}); } catch (_error) {}
      }
    }

    /** Two-tone chime, schedule-safe, no external asset. */
    function playChime(kind) {
      var context = audio();
      if (context === null) return false;
      try {
        if (context.state === "suspended") {
          context.resume().catch(function () {});
        }
        var now = context.currentTime + 0.02;
        var tones = kind === "need" ? [880, 1174.7, 880] : [659.3, 987.8];
        for (var i = 0; i < tones.length; i += 1) {
          var start = now + i * 0.14;
          var oscillator = context.createOscillator();
          var gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(tones[i], start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.24, start + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.40);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 0.36);
        }
        return true;
      } catch (error) {
        console.warn("[corner-alert] chime failed:", error);
        return false;
      }
    }

    /** System notification, which carries the platform's own sound. */
    function raiseNative(title, body) {
      var Api = globalThis.Notification;
      if (typeof Api !== "function") return false;
      try {
        if (Api.permission === "denied") return false;
        if (Api.permission === "default") {
          Api.requestPermission().catch(function () {});
          return false;
        }
        var notification = new Api(title, { body: body, tag: TOAST_ID, silent: false });
        notification.onclick = function () {
          try {
            globalThis.focus();
          } catch (_error) {}
          try {
            notification.close();
          } catch (_error) {}
        };
        return true;
      } catch (error) {
        console.warn("[corner-alert] native notification failed:", error);
        return false;
      }
    }

    //#endregion

    //#region styles

    var STYLE_ID = "dsh-corner-alert-css";
    var CSS = [
      "@keyframes dshCornerAlertIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}",
      "@keyframes dshCornerAlertOut{to{opacity:0;transform:translateY(6px) scale(.98)}}",
      ".dshCornerAlertStack{position:fixed;right:20px;bottom:96px;z-index:2200;display:flex;flex-direction:column;align-items:flex-end;gap:10px;max-width:min(380px,calc(100vw - 40px));pointer-events:none}",
      ".dshCornerAlertCard{pointer-events:auto;box-sizing:border-box;width:100%;display:flex;gap:10px;padding:12px 12px 12px 14px;border-radius:var(--dsw-radius-lg,10px);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);box-shadow:0 10px 30px rgba(0,0,0,.22);font-size:13px;line-height:1.45;animation:dshCornerAlertIn .18s ease-out}",
      ".dshCornerAlertCard[data-tone=need]{border-color:var(--dsw-alias-state-warn-secondary,var(--dsw-alias-border-l3))}",
      ".dshCornerAlertDot{flex:none;width:8px;height:8px;margin-top:5px;border-radius:50%;background:var(--dsw-alias-brand-primary,#247bbf)}",
      ".dshCornerAlertCard[data-tone=need] .dshCornerAlertDot{background:var(--dsw-alias-state-warn-primary,#f59e0b)}",
      ".dshCornerAlertText{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}",
      ".dshCornerAlertTitle{font-weight:600}",
      ".dshCornerAlertBody{color:var(--dsw-alias-label-secondary);word-break:break-word}",
      ".dshCornerAlertActions{flex:none;display:flex;align-items:flex-start;gap:2px}",
      ".dshCornerAlertBtn{appearance:none;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:var(--dsw-radius-sm,6px);padding:2px 6px;font-size:12px;line-height:18px;font-family:inherit}",
      ".dshCornerAlertBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".dshCornerAlertRestartChip{position:fixed;right:20px;bottom:20px;z-index:2199;pointer-events:auto;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;font-family:inherit;cursor:pointer;opacity:.82;box-shadow:0 6px 18px rgba(0,0,0,.18);transition:opacity .15s ease,color .15s ease}",
      ".dshCornerAlertRestartChip:hover{opacity:1;color:var(--dsw-alias-label-primary)}",
      ".dshCornerAlertRestartChip:disabled{cursor:progress;opacity:.6}",
      ".dshCornerAlertRestartIcon{font-size:13px;line-height:1}"
    ].join("");

    //#endregion

    //#region detection

    /**
     * Install the status watcher; returns its disposer.
     * @param {object} ctx - client plugin context.
     * @param {object} store - toast store.
     * @param {function} emit - raise one alert.
     */
    function installWatcher(scope, store, emit) {
      var status = scope.uiSession?.sessionStatus;
      if (status === undefined || status === null || typeof status.subscribe !== "function") {
        console.warn(
          "[corner-alert] uiSession.sessionStatus is unavailable; alerts stay off. The client API changed."
        );
        return function () {};
      }
      var running = new Map();
      var interactions = new Map();
      var timers = new Map();
      var seeded = false;
      var diagnostics = { shapeOk: true, raised: 0, lastKind: undefined, lastAt: undefined };

      function rowOf(sessionId) {
        var sessions = scope.get("sessions");
        if (sessions === undefined || sessions === null || sessions.list === undefined) return undefined;
        var snapshot = sessions.list.getSnapshot();
        return snapshot && snapshot.byId ? snapshot.byId[sessionId] : undefined;
      }

      function admits(row) {
        if (row === undefined) return false;
        var settings = readSettings();
        if (settings.subagents) return true;
        if (row.origin === "subagent") return false;
        return row.parentId === undefined;
      }

      function titleOf(sessionId) {
        var row = rowOf(sessionId);
        return (row && (row.displayTitle || row.title)) || sessionId;
      }

      function clearTimer(sessionId) {
        var handle = timers.get(sessionId);
        if (handle !== undefined) {
          globalThis.clearTimeout(handle);
          timers.delete(sessionId);
        }
      }

      function raise(sessionId, kind, body) {
        var settings = readSettings();
        if (!settings.enabled) return;
        if (!admits(rowOf(sessionId))) return;
        var strings = copy();
        var title = kind === "need" ? strings.needTitle : kind === "test" ? strings.testTitle : strings.doneTitle;
        var text = body !== undefined && body !== "" ? body : kind === "need" ? strings.genericBody : kind === "test" ? strings.testBody : strings.doneBody;
        emit({
          sessionId: sessionId,
          kind: kind,
          tone: kind === "need" ? "need" : "done",
          title: title,
          body: text,
          sessionTitle: titleOf(sessionId),
          at: Date.now()
        });
        if (settings.sound) playChime(kind);
        if (settings.native) raiseNative(title + " · " + titleOf(sessionId), text);
        diagnostics.raised += 1;
        diagnostics.lastKind = kind;
        diagnostics.lastAt = Date.now();
      }

      function settle(sessionId) {
        if (running.get(sessionId) === true) return;
        var interaction = interactions.get(sessionId);
        if (interaction !== undefined && interaction !== null) return;
        raise(sessionId, "done");
      }

      function scheduleSettle(sessionId) {
        var settings = readSettings();
        clearTimer(sessionId);
        if (settings.settleMs === 0) {
          settle(sessionId);
          return;
        }
        var handle = globalThis.setTimeout(function () {
          timers.delete(sessionId);
          settle(sessionId);
        }, settings.settleMs);
        timers.set(sessionId, handle);
      }

      function evaluate() {
        var snapshot = status.getSnapshot();
        if (snapshot === undefined || snapshot === null || typeof snapshot.forEach !== "function") {
          if (diagnostics.shapeOk) {
            diagnostics.shapeOk = false;
            console.warn("[corner-alert] the session status projection changed shape; alerts stay off.");
          }
          return;
        }
        try {
          fold(snapshot);
        } catch (error) {
          if (diagnostics.shapeOk) {
            diagnostics.shapeOk = false;
            console.warn("[corner-alert] reading the session status projection failed:", error);
          }
        }
      }

      function fold(snapshot) {
        var present = new Set();
        var strings = copy();
        snapshot.forEach(function (entry, sessionId) {
          present.add(sessionId);
          var isRunning = entry && entry.running === true;
          var interaction = entry ? entry.pendingInteraction : undefined;
          var knownRunning = running.get(sessionId);
          var knownInteraction = interactions.get(sessionId);
          running.set(sessionId, isRunning);
          interactions.set(sessionId, interaction === null ? undefined : interaction);
          if (!seeded) return;
          if (interaction !== undefined && interaction !== null && interaction !== knownInteraction) {
            clearTimer(sessionId);
            var tool = typeof interaction.toolName === "string" ? interaction.toolName : undefined;
            raise(sessionId, "need", tool !== undefined ? strings.approvalBody(tool) : strings.questionBody);
            return;
          }
          if (isRunning) {
            clearTimer(sessionId);
            return;
          }
          if (knownRunning === true) scheduleSettle(sessionId);
        });
        running.forEach(function (_value, sessionId) {
          if (present.has(sessionId)) return;
          running.delete(sessionId);
          interactions.delete(sessionId);
          clearTimer(sessionId);
        });
        seeded = true;
      }

      var unsubscribe = status.subscribe(evaluate);
      evaluate();

      return function () {
        try {
          unsubscribe();
        } catch (_error) {}
        timers.forEach(function (handle) {
          globalThis.clearTimeout(handle);
        });
        timers.clear();
      };
    }

    //#endregion

    //#region component

    function createToastCard(toast, dismiss, open) {
      var strings = copy();
      return h(
        "div",
        { key: toast.id, className: "dshCornerAlertCard", "data-tone": toast.tone, role: "status" },
        h("span", { className: "dshCornerAlertDot" }),
        h(
          "div",
          { className: "dshCornerAlertText" },
          h("div", { className: "dshCornerAlertTitle" }, toast.title),
          h("div", { className: "dshCornerAlertBody" }, toast.body)
        ),
        h(
          "div",
          { className: "dshCornerAlertActions" },
          toast.sessionId !== undefined
            ? h(
                "button",
                {
                  type: "button",
                  className: "dshCornerAlertBtn",
                  title: strings.jump,
                  onClick: function () {
                    open(toast.sessionId);
                    dismiss(toast.id);
                  }
                },
                strings.jump
              )
            : null,
          h(
            "button",
            {
              type: "button",
              className: "dshCornerAlertBtn",
              title: strings.close,
              "aria-label": strings.close,
              onClick: function () {
                dismiss(toast.id);
              }
            },
            "×"
          )
        )
      );
    }

    //#endregion

    /**
     * Cordis plugin body.
     * @param {object} ctx - browser application context.
     */
    function apply(ctx) {
      var store = createStore([]);
      // Unlock WebAudio on the first interaction so the chime can play without a console window.
      try {
        globalThis.addEventListener('pointerdown', unlockAudio, { once: true });
        globalThis.addEventListener('keydown', unlockAudio, { once: true });
      } catch (_error) {}
      /** Monotonic banner identity, so two alerts in the same millisecond stay distinct. */
      var sequence = 0;
      var openSession = function (sessionId) {
        try {
          var workspace = typeof ctx.get === "function" ? ctx.get("uiWorkspace") : undefined;
          if (workspace && typeof workspace.openSession === "function") workspace.openSession(sessionId);
        } catch (error) {
          console.warn("[corner-alert] could not open the session:", error);
        }
      };

      var raiseAlert = function (toast) {
        var current = store.getSnapshot();
        sequence += 1;
        var id = String(toast.at) + ":" + String(toast.sessionId) + ":" + toast.kind + ":" + String(sequence);
        var next = current.slice();
        next.push({
          id: id,
          sessionId: toast.sessionId,
          kind: toast.kind,
          tone: toast.tone,
          title: toast.title,
          body: toast.body,
          sessionTitle: toast.sessionTitle
        });
        store.set(next);
        var settings = readSettings();
        globalThis.setTimeout(function () {
          dismiss(id);
        }, settings.toastMs);
      };

      var dismiss = function (id) {
        var current = store.getSnapshot();
        var next = current.filter(function (item) {
          return item.id !== id;
        });
        if (next.length !== current.length) store.set(next);
      };

      function RestartChip() {
        var pair = react.useState(false);
        var busy = pair[0];
        var setBusy = pair[1];
        var strings = copy();
        function doRestart() {
          if (busy) return;
          var ok = true;
          try {
            ok = globalThis.confirm ? globalThis.confirm(strings.restartConfirm) : true;
          } catch (_error) {
            ok = true;
          }
          if (!ok) return;
          setBusy(true);
          var opts = {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: "{}"
          };
          globalThis
            .fetch("/dsh-market/restart", opts)
            .then(function (response) {
              if (response.status === 403) {
                console.info("[corner-alert] self-restart disabled on this host; reloading the UI instead");
                globalThis.location.reload();
                return;
              }
              if (!response.ok && response.status !== 202) throw new Error("HTTP " + response.status);
            })
            .catch(function (error) {
              console.warn("[corner-alert] restart failed:", error);
              setBusy(false);
              try {
                globalThis.alert(strings.restartFail + (error && error.message ? error.message : error));
              } catch (_error2) {}
            });
        }
        return h(
          "button",
          {
            type: "button",
            className: "dshCornerAlertRestartChip",
            title: strings.restartConfirm,
            onClick: doRestart,
            disabled: busy
          },
          h("span", { className: "dshCornerAlertRestartIcon" }, busy ? "⏳" : "⟳"),
          h("span", null, busy ? strings.restartBusy : strings.restartLabel)
        );
      }

      function CornerAlert() {
        useStore(store);
        var current = store.getSnapshot();
        var hasStyle = react.useRef(false);
        react.useEffect(
          function () {
            if (hasStyle.current) return undefined;
            if (document.getElementById(STYLE_ID) === null) {
              var el = document.createElement("style");
              el.id = STYLE_ID;
              el.textContent = CSS;
              document.head.appendChild(el);
            }
            hasStyle.current = true;
            return undefined;
          },
          []
        );
        return h(
          react.Fragment,
          null,
          h(RestartChip, { key: "restart" }),
          current.length === 0
            ? null
            : h(
                "div",
                { className: "dshCornerAlertStack", "data-plugin": "dsh-corner-alert" },
                current.map(function (toast) {
                  return createToastCard(toast, dismiss, openSession);
                })
              )
        );
      }

      /**
       * Attach the watcher once `uiSession` exists; disposers run when the
       * service disappears, so a client reload never leaves a stale watcher.
       */
      ctx.inject(["uiSession"], function (scope) {
        ctx.effect(function () {
          return installWatcher(
            {
              uiSession: scope.uiSession,
              get: function (name) {
                return scope.get ? scope.get(name) : ctx.get(name);
              }
            },
            store,
            raiseAlert
          );
        }, "corner-alert: session watcher");
      });

      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register(
          {
            name: "shell.overlay",
            id: TOAST_ID,
            order: 900
          },
          CornerAlert
        );
      });

      var api = {
        test: function () {
          var strings = copy();
          raiseAlert({
            sessionId: undefined,
            kind: "test",
            tone: "done",
            title: strings.testTitle,
            body: strings.testBody,
            sessionTitle: "",
            at: Date.now()
          });
        },
        state: function () {
          return {
            settings: readSettings(),
            toasts: store.getSnapshot(),
            audio: audioContext === null ? "uninitialised" : audioContext.state
          };
        },
        dismissAll: function () {
          store.set([]);
        }
      };
      globalThis.__dshCornerAlert = api;
      console.info("[corner-alert] ready — settings:", readSettings());
    }

    exports.name = "dsh-corner-alert";
    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  }
});
