# dsh-corner-alert

> DeepSeek Harness（DSH）右下角提醒插件：任务完成 / 需要你操作时，右下角弹窗 + 提示音 + 系统通知，并附带一个「⟳ 热重启」按钮。

[![platform](https://img.shields.io/badge/platform-DSH%20Web%20%2F%20Desktop-blue)](#适用平台)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 目录

- [这是什么](#这是什么)
- [效果](#效果)
- [适用平台](#适用平台)
- [安装方法](#安装方法)
- [使用说明](#使用说明)
- [热重启按钮](#热重启按钮)
- [设置项](#设置项)
- [工作原理](#工作原理)
- [兼容性与更新](#兼容性与更新)
- [卸载](#卸载)
- [目录结构](#目录结构)
- [开发与测试](#开发与测试)
- [License](#license)

---

## 这是什么

`dsh-corner-alert` 是给 **DeepSeek Harness（DSH）Web GUI / 桌面版** 用的客户端插件。

它监听 DSH 本来就维护的会话状态投影（`uiSession.sessionStatus`），在两类真实状态切换时提醒你：

| 触发时机 | 弹窗 | 声音 |
|---|---|---|
| 一轮对话跑完、会话回到空闲且没有待处理交互 | 任务完成 / Task finished | 双音提示 |
| 出现待你处理的交互（工具审批、Agent 提问） | 需要你操作 / Your action is needed | 三音提示 |

特点：

- **不轮询、不重复折叠事件**：直接读状态投影，开销极低。
- **多轮目标合并**：默认 1200ms 的 settle 窗口，把多轮目标中间的短暂空闲合并成一次提醒，不会连环轰炸。
- **子会话默认静默**：子 Agent（subagent）会话不打扰，可在设置里打开。
- **系统通知兜底**：每次提醒同时触发浏览器/系统 `Notification`，窗口在后台也能看到，且带系统提示音。
- **右下角「⟳ 热重启」按钮**：一键让插件/主题改动即时生效（详见下文）。

---

## 效果

任务完成时，窗口右下角（消息输入框上方）会出现一张卡片：

```
┌───────────────────────────────┐
│ ●  任务完成              [跳转] [×] │
│    这一轮已经跑完，可以回来看了      │
└───────────────────────────────┘
```

- 点「跳转」直接打开对应会话；点「×」关闭；默认 7 秒自动消失。
- 卡片样式跟随 DSH 明暗主题（只用 `--dsw-alias-*` / `--dsw-radius-*` 主题变量）。
- 同时弹一条系统通知（`Notification` API），带系统提示音。
- 右下角固定有一个小小的「⟳ 热重启」胶囊按钮。

需要你操作时，卡片边框和圆点变为警示色，文案提示是哪个工具在等你批准、或 Agent 正在等你回复。

---

## 适用平台

| 项目 | 要求 |
|---|---|
| 宿主 | DeepSeek Harness（DSH）Web GUI 或桌面版（Electron） |
| 操作系统 | Windows / macOS / Linux（凡是能跑 DSH 的平台都可，插件是纯浏览器侧 JS） |
| 宿主能力 | 需要 `shell.overlay` 插槽与 `uiSession.sessionStatus` 投影（DSH 0.1.x / 0.2.x 均有） |
| 运行时依赖 | **无**。运行时不依赖 Node/浏览器扩展；仅开发跑测试时需要 Node |

已验证环境：Windows 11 + DSH 桌面版（Electron 打包，profile = `desktop`）。

> 说明：插件是「客户端插件」——宿主侧 `index.js` 是空壳（只为一个合法 Loader 行），真正的功能在浏览器侧 `client.js`。

---

## 安装方法

### 方式一：从 GitHub 安装（推荐）

```bash
# profile 名：桌面版一般是 desktop，dsh web 一般是 web
dsh plugin --profile web add github:<owner>/dsh-corner-alert
```

`dsh plugin` 会把参数转发给 profile 目录里的 pnpm；安装完成后该包会进入 `dependencies`，并在 `dsh.profile.bundles` 中登记（CLI 会自动补 bundles）。随后重启 DSH（或刷新页面）即可。

### 方式二：本地目录安装（开发/自用）

```bash
git clone https://github.com/<owner>/dsh-corner-alert.git
dsh plugin --profile web add file:/绝对路径/dsh-corner-alert
```

Windows 示例：

```powershell
dsh plugin --profile desktop add file:C:/Users/你/.dsh/plugins/dsh-corner-alert
```

> 注意：`file:` 后面跟**绝对路径**最稳；相对路径会按你当前 shell 的目录解析，容易找错地方。

### 方式三：手动安装（不用 CLI）

1. 把仓库整个目录放到 `~/.dsh/plugins/dsh-corner-alert`（Windows 为 `C:\Users\<你>\.dsh\plugins\dsh-corner-alert`）。
2. 编辑 `~/.dsh/profiles/<profile>/package.json`：
   - `dependencies` 里加 `"dsh-corner-alert": "file:../../plugins/dsh-corner-alert"`
   - `dsh.profile.bundles` 里加 `"dsh-corner-alert"`
3. 在 profile 目录执行一次安装，生成 `node_modules` 链接：

   ```bash
   cd ~/.dsh/profiles/<profile>
   pnpm install
   ```

4. 重启 DSH，或刷新页面。

### 安装后确认

- 右下角出现「⟳ 热重启」小按钮。
- 控制台执行 `__dshCornerAlert.test()` 会立刻弹一条测试提醒。

---

## 使用说明

装好后**无需任何操作**，以下场景自动触发：

1. **任务完成**：任意会话跑完一轮 → 右下角「任务完成」卡片 + 提示音 + 系统通知。
2. **需要你操作**：出现工具审批或 Agent 提问 → 「需要你操作」卡片。
3. **多轮目标**：连续多轮之间不会每次都弹，默认合并成一次（可调 `settleMs`）。
4. **子会话**：默认不打扰；需要时把 `subagents` 设为 `1`。

### 控制台入口

在 DSH 窗口打开 DevTools 控制台：

```js
__dshCornerAlert.test();        // 立刻弹一条测试提醒（验证是否生效最快的方式）
__dshCornerAlert.state();       // 查看当前设置、正在显示的弹窗、音频状态
__dshCornerAlert.dismissAll();  // 清掉所有可见弹窗
```

---

## 热重启按钮

右下角固定有一个「⟳ 热重启」胶囊按钮，点击行为：

1. 先向 dshmarket 的自重启接口发 `POST /dsh-market/restart`，尝试**进程级热重启**；
2. 如果当前宿主禁止自重启（例如 DSH 桌面版由 Electron 托管，接口返回 `403`），自动回退为**重载页面**（`location.reload()`），同样能让刚改动的客户端插件 / 主题即时生效。

用途：改完插件、装了新主题、调了 bundle 后，不用关掉整个应用，点一下即可生效。

> 需要 **dshmarket** 插件在场（DSH 官方桌面版一般自带）。没有 dshmarket 时按钮会走页面重载回退。

---

## 设置项

设置持久化在 `localStorage`，统一前缀 `dshCornerAlert.`。在控制台修改，下一次提醒生效，无需重载：

| Key | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `sound` | `true` | 是否播放提示音 |
| `native` | `true` | 是否同时发系统通知 |
| `subagents` | `false` | 是否也为子会话提醒 |
| `settleMs` | `1200` | 完成提醒的静默窗口（0–10000 ms） |
| `toastMs` | `7000` | 弹窗停留时长（1500–60000 ms） |

示例：

```js
localStorage.setItem("dshCornerAlert.sound", "0");     // 静音
localStorage.setItem("dshCornerAlert.settleMs", "3000"); // 多轮间隔更大才提醒
localStorage.setItem("dshCornerAlert.subagents", "1");   // 子会话也提醒
```

> 首次使用系统通知时，浏览器会请求通知权限；允许后才能在窗口后台时收到系统级提醒。

---

## 工作原理

- **宿主侧 `index.js`**：一个空 `apply()`，只为了让这个包成为一个合法的 Cordis Loader 行，供客户端模块扫描器读取清单。
- **浏览器侧 `client.js`**：
  - 通过 `ctx.inject(["uiSession"])` 拿到会话状态投影，`subscribe` 后折叠出「运行中 → 空闲」和「出现待处理交互」两类边沿；
  - 用 settle 窗口去抖，避免多轮目标连环提醒；
  - 弹窗注册在 `shell.overlay`（框架级浮层，位于所有列之上、滚动容器之外，默认点击穿透，卡片自身恢复指针事件）；
  - 提示音用 WebAudio 现场合成双音/三音，不依赖外部音频文件；
  - 系统通知走 `Notification` API；
  - 「热重启」按钮调用 dshmarket 的 `/dsh-market/restart`，失败回退页面重载。

`shell.overlay` 的好处：切走 Chat 面板时浮层仍在，所以「完成提醒」不会因为面板切换而丢；`right:20px; bottom:96px` 的定位避开输入框。

---

## 兼容性与更新

- **DSH 升级不影响本插件**：插件安装在 `~/.dsh/profiles/<profile>` 与 `~/.dsh/plugins` 下，和应用的 `app.asar` 相互独立。DSH 升级只替换 `app.asar`，不动 profile；下次启动按 `dsh.profile.bundles` 自动加载。
- 若宿主未来改动了 `uiSession.sessionStatus` 的结构，`client.js` 会打印一条 `[corner-alert] ...` 警告并自动停用提醒，不会拖垮页面。
- 升级本插件：`dsh plugin --profile <profile> add github:<owner>/dsh-corner-alert` 重装一次，或在你自己的仓库里 `git pull` 后重启。

---

## 卸载

```bash
dsh plugin --profile <profile> remove dsh-corner-alert
```

或手动：从 `package.json` 的 `dependencies` / `dsh.profile.bundles` 中删掉 `dsh-corner-alert`，删目录，`pnpm install`，重启。

---

## 目录结构

```
dsh-corner-alert/
├── package.json          # 包清单 + dsh.client 声明（客户端插件）
├── cordis.patch.yml      # 向 profile 层插入 Loader 行
├── index.js              # 宿主半：空壳 apply()，让本包成为合法插件行
├── client.js             # 浏览器半：状态监听、弹窗栈、提示音、热重启按钮
├── locale/en.json        # 插件管理器里的英文标题/描述
├── locale/zh.json        # 中文标题/描述
├── icon.svg              # 插件图标
├── README.md
├── LICENSE
└── tests/client.test.mjs # 离线测试：在模拟加载器里跑真实 client.js
```

---

## 开发与测试

```bash
node tests/client.test.mjs
```

测试用真实的 `client.js`，在替代的模块加载器与客户端上下文里驱动真实状态切换：种子填充、完成、审批、二次完成、子会话过滤、手动测试入口，并断言弹窗仓库、提示音调用、系统通知调用——共 17 项检查。

无构建步骤：`client.js` 是纯浏览器 JS，由 DSH 客户端模块图直接加载。

---

## License

[MIT](LICENSE)

---

## English (short)

`dsh-corner-alert` is a client plugin for the DeepSeek Harness Web GUI / Desktop. It watches the session status projection and raises a bottom-right toast plus a chime and a native notification when a turn finishes or the agent needs your action. A floating "⟳ Hot restart" chip reloads the client plugins (falls back to a page reload when the host disallows self-restart).

Install: `dsh plugin --profile <profile> add github:<owner>/dsh-corner-alert`, then restart DSH. Test with `__dshCornerAlert.test()` in the DevTools console.
