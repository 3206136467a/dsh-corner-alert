# 免责声明 / Disclaimer

> 最后更新 / Last updated: 2026-10-29

## 中文

1. **非官方项目。** `dsh-corner-alert` 是第三方开源插件，由社区独立开发，与 DeepSeek、DeepSeek Harness（DSH）及其关联公司**没有任何隶属、合作、赞助或背书关系**。"DeepSeek"、"DeepSeek Harness" 等名称与商标归其各自所有者所有。

2. **按"现状"提供。** 本软件按 MIT 许可「AS IS」提供，不附带任何明示或暗示的担保，包括但不限于适销性、特定用途适用性和不侵权的担保。

3. **使用风险自负。** 你理解并同意，安装、使用或无法使用本软件的风险由你自行承担。因使用或无法使用本软件而导致的任何直接、间接、偶然、特殊或后果性损失（包括但不限于数据丢失、界面中断、未保存内容丢失、通知未送达等），作者与贡献者**不承担任何责任**。

4. **不保证提醒必达。** 提醒依赖宿主 API、浏览器通知权限、操作系统通知开关、勿扰/专注模式、主题与宿主版本等因素，可能出现**延迟、丢失、重复或不触发**。本插件不构成任何形式的可靠性、及时性或可用性保证。

5. **数据与隐私。** 本插件**不收集、不上传**任何个人数据或使用数据。所有设置仅保存在浏览器本地 `localStorage`（前缀 `dshCornerAlert.`）。「热重启」按钮只会请求**本机** dshmarket 接口（`/dsh-market/restart`），不向外网发送任何内容。

6. **热重启风险。** 「热重启」可能中断当前界面、刷新页面或重启宿主进程，可能导致**未保存的输入丢失**。在部分部署（如桌面版由 Electron 托管）下进程级自重启会被宿主禁用，此时仅回退为页面重载。

7. **合规使用。** 你应自行确保在所在组织与司法辖区内的使用符合相关规定与政策。若你不同意以上任何条款，请**不要安装或使用**本软件。

## English

1. **Not official.** `dsh-corner-alert` is a third-party open-source plugin, independently developed by the community. It is **not affiliated with, endorsed by, sponsored by, or in any way connected to** DeepSeek, DeepSeek Harness (DSH), or their affiliates. "DeepSeek", "DeepSeek Harness" and related names/marks belong to their respective owners.

2. **Provided "AS IS".** This software is provided under the MIT License on an "AS IS" basis, without warranties of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose, and non-infringement.

3. **Use at your own risk.** You understand and agree that the entire risk of installing, using, or being unable to use this software is yours. The authors and contributors **accept no liability** for any direct, indirect, incidental, special, or consequential damages (including but not limited to data loss, UI interruption, loss of unsaved input, or missed notifications).

4. **No delivery guarantee.** Alerts depend on host APIs, browser notification permission, OS notification settings, Do Not Disturb / Focus modes, themes and host versions, and may be **delayed, dropped, duplicated, or not fire at all**. This plugin makes no guarantee of reliability, timeliness, or availability.

5. **Data & privacy.** This plugin **collects and uploads nothing**. All settings live only in the browser's local `localStorage` (prefix `dshCornerAlert.`). The "Hot restart" chip only calls the **local** dshmarket endpoint (`/dsh-market/restart`) and sends nothing to the internet.

6. **Hot-restart risk.** "Hot restart" may interrupt the current UI, reload the page, or restart the host process, and may cause **loss of unsaved input**. On some deployments (e.g. an Electron-managed desktop build) process-level self-restart is disabled by the host, in which case it falls back to a page reload.

7. **Compliance.** You are responsible for ensuring your use complies with the rules and policies of your organization and jurisdiction. If you do not agree with any of the above, **do not install or use** this software.
