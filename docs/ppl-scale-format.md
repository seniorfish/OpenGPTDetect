# PPL Scale Profile 格式规范(schemaVersion 1)

> 单一来源:`packages/core/src/scale.ts`(Zod schema)。本文件是**算法与格式的行为规范**;
> JSON Schema 产物为 `docs/schemas/ppl-scale-v1.schema.json`(由 `npm run gen:schema -w @opengptdetect/core` 生成,
> Python/社区校验用同一份)。三端(TS 运行时、Python 脚本、社区实现)必须与本规范一致,
> 行为的跨语言锁定由 `test-fixtures/ppl-color.golden.json` 保证。

## 1. 文档结构

```json
{
  "$schema": "https://raw.githubusercontent.com/seniorfish/OpenGPTDetect/main/docs/schemas/ppl-scale-v1.schema.json",
  "schemaVersion": 1,
  "id": "zh-default-2026",
  "name": "中文默认",
  "scope": "中文通用文本(zh, general text)",
  "tags": ["zh", "general"],
  "scale": { "mode": "linear", "stops": [{ "ppl": 12, "color": "#22c55e" }] },
  "guideline": { "aiLikePplMax": 18, "humanLikePplMin": 35, "hardPplMin": 50 }
}
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `$schema` | 否 | 本格式的 JSON Schema 地址(建议保留以便编辑器校验) |
| `schemaVersion` | 是 | 恒为 `1`(升级 = 新版本号,旧版本仍可读) |
| `id` | 是 | 全局唯一标识(小写 kebab-case 惯例) |
| `name` | 是 | 显示名称 |
| `scope` | 是 | **自由描述文本**——"适用范围"而非语言枚举;允"中文编程文档"一类细分 |
| `tags` | 否 | 字符串数组(至少 1 项),供评测脚本/社区过滤 |
| `scale.mode` | 是 | 目前恒为 `linear`(唯一插值模式) |
| `scale.stops` | 是 | 至少 1 个锚点,见 §2 |
| `guideline` | 是 | 分类阈值,见 §4 |

## 2. 锚点

- `stops` 为 `{ ppl, color }` 数组:`ppl ≥ 0`,`color` 为 `#rrggbb`(大小写不敏感,输出统一小写)。
- 语义上要求按 `ppl` 升序;**实现不信任排序**,使用前按 `ppl` 升序稳定排序。
- 锚点**重复 `ppl` 允许**(作为边界情况):落在重复点上的取值遵循"先到先得"(见 §3),
  高于该点的取值落到后续区间。
- 允许**单个锚点**:颜色恒为端点色。

## 3. 插值算法(唯一规范)

输入 `ppl: number` 与排序后的 `stops`,输出 `#rrggbb:

1. **端点 clamp**:`ppl ≤ 最小锚点` → 最小锚点色;`ppl ≥ 最大锚点` → 最大锚点色。
2. **区间线性**:在 `[a.ppl, b.ppl]` 区间内(含边界):
   `t = (ppl - a.ppl) / (b.ppl - a.ppl)`;若 `b.ppl === a.ppl` 则 `t = 0`。
3. **空间**:sRGB 通道值(`0-255` 整数)上线性插值,不做 gamma/感知空间转换——
   数值与简单优先,社区可复制。
4. **舍入与 clamp**:每通道 `round(x)` 定义为 **`floor(x + 0.5)`**(与 JavaScript `Math.round`
   在非负域一致;Python 的 `round()` 是银行家舍入,实现时**禁止**直接使用),
   再 clamp 到 `[0, 255]`,输出 `#rrggbb`(小写)。
5. **无锚点**:返回 `#999999`。

> 常量结果示例:stops `[{ppl: 0, #000000}, {ppl: 2, #656565}]`,`ppl = 1` → 通道 `50.5` → round → `51` → `#333333`(该用例在 golden 夹具中锁定)。

## 4. 分类阈值(`guideline`)

| 字段 | 含义 |
|---|---|
| `aiLikePplMax` | avg ppl ≤ 此值 → 疑似 AI 生成 |
| `humanLikePplMin` | avg ppl ≥ 此值 → 疑似人类写作(高质量) |
| `hardPplMin` | avg ppl ≥ 此值 → 生难文本(低于 `humanLikePplMin` 与 `aiLikePplMax` 之间 = 不确定带) |

阈值为**纯数据**:由消费端(extension 的 AI 判定、评测脚本)按需使用,editor 不消费。

## 5. 内置 profile

| id | stops | guideline (aiLike/humanLike/hard) |
|---|---|---|
| `zh-default-2026` | 12→`#22c55e`, 18→`#eab308`, 50→`#ef4444`, 100→`#7f1d1d` | 18 / 35 / 50 |
| `en-default-2026` | 4→`#22c55e`, 6→`#eab308`, 16.67→`#ef4444`, 33.33→`#7f1d1d` | 6 / 18 / 25 |

`packages/core/src/scale.ts` 的 `BUILTIN_PROFILES` 是唯一来源;extension 的 profile 库
不允许用户以内置 id 覆盖它们。

## 6. 工具链与一致性验证

- `npm run gen:schema -w @opengptdetect/core` — 重新生成 `docs/schemas/ppl-scale-v1.schema.json`。
- `python tools/measure/verify_scales.py` — Python 实现按本算法与 golden 夹具逐条对拍
  (24/24 通过),并抽查 schema 正反例;失败即退出码 1。
- `test-fixtures/ppl-color.golden.json` — TS 与 Python 的共享确定性样本;
  **任何一端算法改动必须先改夹具,另一端必红**。
