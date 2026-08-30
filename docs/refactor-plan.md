# Extension 重构 + Monorepo 统一 — 执行计划(定稿)

> 状态:已批准执行(2026-08-30)。本文件是唯一执行蓝本;分步迁移,每步全绿再走下一步。

## 0. 目标

1. `extension/` 铲除裸 JS 手工架构,重建为 **WXT + TS + React + Tailwind v4 + shadcn/ui**,与 editor 同栈。
2. 全仓库单构建源:editor 与 extension 共享契约、纯函数、配置格式与 UI 组件(**零第二份实现**)。
3. 引入"统一 profile 配置格式",可被前端渲染、又被脚本在数据集上精确测量、可导出社区分享。

## 1. 仓库结构(npm workspaces)

```
root package.json   (workspaces: ["packages/*", "editor", "extension"])
├─ test-fixtures/             黄金夹具(跨语言共享, repo 根)
├─ docs/
│  ├─ api.md                  现有 API 契约(不动)
│  ├─ schemas/ppl-scale-v1.schema.json   (z.toJSONSchema 生成产物)
│  └─ ppl-scale-format.md     算法规范(端点 clamp + 线性插值 + sRGB)
├─ packages/core     @opengptdetect/core   纯 TS 零框架、零 React、零浏览器 API
├─ packages/ui       @opengptdetect/ui     shadcn 原语合集 + 业务组件
├─ editor/           单文件 SPA 壳(vite-plugin-singlefile), 依赖 core+ui
├─ extension/        WXT 项目,依赖 core+ui
└─ tools/measure/    Python: profile 校验 + 黄金对拍 + 数据集评测
```

## 2. `packages/core` 清单

| 模块 | 内容 | 来源 |
|---|---|---|
| `schemas.ts` | Zod: `PplResponse`/`TokenDetail`/`HealthResponse` | editor 迁入 |
| `api.ts` | `createApi(transport, serverUrl)`;Transport 抽象(直连 fetch / 经 background 消息) | editor 改造 |
| `color.ts` | `colorForPpl` + hex/rgb 工具 | editor + heatmap 两份合并 |
| `smooth.ts` | `smoothTokens`(token 窗口 / 句均) | heatmap 迁入 |
| `measure.ts` | `detectLang`/`splitChunks`/`mergeChunkResults` | api-client 纯函数化 |
| `scale.ts` | `PplScaleProfile` Zod schema + 导入/导出/校验 + 内置 zh/en 官方 profile | 新写 |
| `errors.ts` | `ErrorCode` 枚举 + `AppError` | 新写 |
| `state.ts` | 测量管线显式状态机(判别联合 + 转换函数,无库) | 新写 |
| `messages.ts` | typed message registry(background↔content↔popup) | 新写 |

## 3. `packages/ui` 清单

- `editor/src/components/ui/*` **整体迁入**(原语合集);editor 删本地副本,双端统一 import。
- 业务组件仅 `ColorStopsEditor`,**受控化**:`value`/`onChange`/i18n 文案 props/toast 回调,不触碰任何 store。
- 组件只引用 token 名(`bg-background`…);视觉 token 由宿主定义;Tailwind v4 由各构建面加 `@source` 声明扫 `packages/ui` 与 `packages/core`(无样式则免)。

## 4. editor 最终形态

- 保留:App/main、stores、commands、i18n、theme、editor.ts(CM)、chunks.ts(**暂留**,无第二消费者,editor-app 拆分时归位)。
- 迁出:schemas/color/api 纯函数、BUILTIN_PRESETS(→core 内置 profile)、`components/ui/*`(→packages/ui)。
- 新能力:profile「导入/导出」入口(挂设置对话框,与 stops 编辑并存)。
- 产物:仍是单文件 HTML,形态不变。

## 5. extension(WXT)最终形态

```
src/entrypoints/
├─ background.ts       代理 /ppl /health(保留转架构;页面直连会被 CORS 拦)+ 快捷键
├─ content.ts          标注层 + 浮层挂载 + 测量编排
├─ popup/index.html    React + Tailwind(普通页)
└─ options/index.html  React + Tailwind;色带编辑器用 packages/ui 的 ColorStopsEditor
```

- **A 标注层**:直接落页面 DOM,全内联样式(零 CSS 注入);禁用=遍历隐藏;状态由 `core/state.ts` 状态机持有。
- **B 浮层**:`createShadowRootUi` + `cssInjectionMode: 'ui'` + 根容器 **`font-size: 16px`**(rem 陷阱修复);**所有 Radix portal 组件指定容器 → shadow root 内**。
- 消息:`core/messages.ts` 注册表;存储:`@wxt-dev/storage` `defineItem` + `version/migrations`(删 onInstalled 硬编码);凡不可信输入(storage 读出、profile 导入)过 Zod。

## 6. 统一 profile 格式(schemaVersion 1)

```json
{
  "$schema": "https://raw.githubusercontent.com/seniorfish/OpenGPTDetect/main/docs/schemas/ppl-scale-v1.schema.json",
  "schemaVersion": 1,
  "id": "zh-default-2026",
  "name": "中文默认",
  "scope": "中文通用文本(zh, general text)",
  "tags": ["zh", "general"],
  "scale": { "mode": "linear", "stops": [ { "ppl": 12, "color": "#22c55e" } ] },
  "guideline": { "aiLikePplMax": 18, "humanLikePplMin": 35, "hardPplMin": 50 }
}
```

- `scope` 为自由描述文本(必填):适用范围不限语言,允"中文编程文档"类细分;`tags` 可选,供评测脚本/社区过滤。
- **数据与绑定解耦**:profile 是纯数据;应用侧设置维护"检测类别 → profile id"绑定。默认绑定内置 zh/en。
- 内置官方 profile(editor 4 锚点曲线 + extension 经验注释;旧扩展默认视觉略有收敛差异,属升级):

| id | stops | guideline (aiLike/humanLike/hard) |
|---|---|---|
| `zh-default-2026` | 12→`#22c55e`, 18→`#eab308`, 50→`#ef4444`, 100→`#7f1d1d` | 18 / 35 / 50 |
| `en-default-2026` | 4→`#22c55e`, 6→`#eab308`, 16.67→`#ef4444`, 33.33→`#7f1d1d` | 6 / 18 / 25 |

- TS 侧 Zod 单一来源;`z.toJSONSchema()` 产出 `docs/schemas/`;Python 端 `jsonschema` 验同一份。

## 7. 黄金夹具与跨语言对拍

- `test-fixtures/ppl-color.golden.json`:端点 clamp、区间插值、多锚点、0/超大 ppl、缺锚点用例。
- TS(core vitest)与 Python(tools/measure/verify_scales.py)读**同一文件**;任一端算法改动必红一方。
- `docs/ppl-scale-format.md` 把插值算法定为规范。

## 8. 测试面

| 层 | 工具 | 对象 |
|---|---|---|
| core | vitest 单测 + golden | color/smooth/measure/scale/state/errors/messages |
| editor | 现有 vitest + puppeteer e2e(保持绿) | 业务层 |
| extension | WxtVitest + fakeBrowser(+jsdom) | 消息路由、storage 迁移、状态机、content 编排 |
| 跨语言 | python jsonschema + golden 对拍 | profile + 算法 |

## 9. 已并入的代码范式(本次引入)

1. **Registry-first 平移**:typed message registry(入口消息表,双端类型推导)。
2. **显式纯状态机**(无库):测量管线存活期,判别联合 + 转移函数在 core,非法转换测试即爆。
3. **跨语言黄金夹具**:算法行为一份样本、双端读。
4. **WxtVitest + fakeBrowser**:扩展行为测试层(三明治中层的 extension 对应物)。
5. **凡不可信输入过 Zod**:API 边界以外,storage 读出与 profile 导入也过校验。

刻意不引入:XState(社/状态机库)、TanStack Query/SWR、react-router、fp-ts/Effect、业务 DI 容器。理由同 editor/AGENTS.md 的排除清单。

## 10. 迁移顺序(每步绿)

置信度:🟢高 / 🟡中 / 🔴低。通用规则:写码前必读 D:\references 对应文档;不确定的 API 先查后写,不许瞎写。

| 步 | 内容 | 置信 | 验证(结束标志) | D:\references 计划 |
|---|---|---|---|---|
| **S0 工程基线** ✅ | root workspaces + prettier/eslint flat + 根 .gitignore 增补;`npm install` 全量 | 🟢 | `npm run typecheck -w editor` 绿;无 ERESOLVE;root lock 生成 | 无 |
| **S1 packages/core** ✅ | 迁 schemas/api/color/smooth + 新写 measure/errors/state/messages/scale(内置 profile);单测迁入;`z.toJSONSchema` | 🟡(Zod4 JSON Schema 新面) | core 全量 vitest 绿 + golden v1 通过 | **zod/04** 必读；01/02/03 按需 |
| **S2 editor 切 core** ✅ | import 改名;删本地副本 | 🟢 | editor `npm test` + e2e(需 mock server)绿 | — |
| **S3 packages/ui + editor 切换** ✅ | 原语迁移;ColorStopsEditor 受控化;style.css 加 `@source` | 🟡(@source 为实测点) | editor 全绿 + design-screenshot 视觉回归 | **tailwindcss/02** 必读 |
| **S4 WXT 骨架** ✅ | 手工搭 entrypoints(不跑 `wxt init`);wxt.config(module-react + tailwindcss);popup/options 最小页;root workspaces 补 `extension` | 🟡(web-ext 自动开浏览器/Windows) | `wxt build` 产出 `.output/chrome-mv3` | **WXT reference.md/react.md/config.md 精读** |
| **S5 纯函数落 content** | dom-scan 拆分;测量管线用 core(state+errors+messages);background 消息翻新 | 🟡(DOM 行为保持敏感) | WxtVitest 行为测试绿;mock server 手动验证 | **WXT extension-apis.md 必读** |
| **S6 浮层 UI** | createShadowRootUi + cssInjectionMode ui + `font-size:16px` + Radix portal 指回 shadow root | 🟡(Radix 文档就绪后升 🟢) | 多站点(不同 root font-size)实测:无缩放、弹窗样式完整 | **D:\references\Radix\reference.md(用户后台制作中,S6 前必读)**;WXT react.md CSS notes 复查 |
| **S7 profile 落地** | core/scale.ts 终版 + `z.toJSONSchema` 产出;editor 导入导出;extension options+profile 库(storage migrations) | 🟡 | 双端导入→渲染一致;python jsonschema 验同文件 | zod/04 复查;WXT extension-apis.md(storage)复查 |
| **S8 对拍与文档** | `test-fixtures/` 终版;tools/measure/verify_scales.py;`docs/ppl-scale-format.md`;更新 AGENTS/README | 🟢 | python 脚本过;S1 夹具与 python 输出全同 | 无 |
| **S9(可后置) CI** | GitHub Actions:三包 typecheck+test+build + verify_scales;extension puppeteer e2e | 🟢 | 远端跑绿 | 无 |

依赖:S1→S2→S3 串行;S4 可与 S1–S3 并行;S5→S6→S7 串行。

## 11. 已知风险与回滚

- **首次 `npm install` 的全量 hoist**:可能 ERESOLVE(peer 冲突)或 editor 构建路径变化 → 记录并处理;每步均可 `git revert` 该步文件,单步独立可回退。
- **editor/package-lock.json**:workspaces 后由 root lock 统一替代;如被自动更新/废弃,删除并由根 lock 接管(单一 lock)。
- **工作树已有未提交修改**(editor/src 5 个文件):S0–S3 绝不触碰;若某步必须改,先与用户确认。
- **extension 旧默认值与新内置 profile 的视觉差异**:已定调为"收敛升级",S7 交付时在 README 说明。

## 13. 会话协定(2026-08-30 增补)

1. 若会话触发上下文压缩:确保本 plan 与当前阶段所需文档(见第 10 节 refs 列)重新在上下文中(不在则全量重读),再继续。
2. editor 既有代码编写时未参考最新参考文档;迁移中发现其用法过时,以文档最新版为准,同时把差异记录入项目 AGENTS.md 或记忆,再继续迁移。

## 12. 验收总标准

- 双端共享无第二份实现(git grep 验证:colorForPpl/smoothTokens/ColorStop 仅 core 一份)。
- editor 单文件产物可双击打开;extension 全新架构可加载运行。
- profile 文件可从 editor 导出、extension 导入、python 脚本校验并测量,三方一致。
