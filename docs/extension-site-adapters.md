# 扩展站点适配器(Site Adapters)— 设计与现状

> 状态:**架构已落地,默认适配器与站点适配器完全同级,行为不变**。
> 本文是"网站专用调优"(预计:知乎等站点,首页 / 文章 / 回答等板块)的实现蓝图。

## 1. 动机

通用文本提取(`extension/src/lib/dom-scan.ts`)基于块元素启发式:

1. 遍历 DOM,收集块级元素(`P`/`BLOCK_TAGS`),跳过脚本/隐藏区;
2. `textBlockMode: 'article'` 时要求候选是"正文段落";
3. 短段合并、按句子分块 → 交给测量管线。

这在一个**纯文档型页面**上很准;但"内容社区"站点的 DOM 是**结构多样的画布**:

| 站点板块 | DOM 形态                       | 通用启发式的痛点                                   |
| -------- | ------------------------------ | -------------------------------------------------- |
| 知乎首页 | 每个 feed 卡片是一个 DNNN 容器 | 卡片内标题、摘要、作者行会被当作多个小段合并或漏测 |
| 知乎问题 | 问题正文、回答列表、评论区混排 | 答案列表外的讨论区、推荐区易被误测                 |
| 知乎文章 | 正文是长段落 + 引用块          | body 里的推荐/关注组件被当成段落                   |

站点的"内容容器"是**特定选择器 + 特定规则**,而通用启发式无法在不开"后门"的情况
下学到这些。适配器把这条知识内聚成接口。

## 2. 架构:每个适配器都是同一种东西

所有适配器实现**同一个接口**,差异只在 `matches` 规则与 `extract` 实现:

```ts
// src/lib/adapters/index.ts (接口 + 引擎 + 注册表)
export interface SiteAdapterContext {
  url: URL // 当前板块(首页/文章/回答)靠它分流
  root: Element
  settings: ExtensionSettings
}

export interface SiteAdapter {
  id: string
  matches(url: URL): boolean // 注册表按顺序取首个命中
  extract(ctx: SiteAdapterContext): ScannedBlock[] | null // null = 交给默认适配器
  exclude?(el: Element, url: URL): boolean // 后置过滤,对最终块列表一律生效
}
```

- **默认适配器**(`src/lib/adapters/default.ts`)就是一位普通"适配器":`id: 'default'`,
  `matches: () => true`,extract 实现 = 通用启发式扫描(dom-scan 的 `scan`)。
  **与未来的 `zhihu.ts` 完全同级,只是规则不同**。
- **`ADAPTER_REGISTRY`**:具体站点适配器排前、默认适配器恒在最后兜底。
- 引擎 `extractBlocksFor(href, root, settings)`:
  1. 首个 `matches` 命中的适配器干活 → 产块;
  2. 返回 null/[]/抛异常 → `DEFAULT_ADAPTER.extract`(通用扫描);
  3. `exclude` 对**最终块列表**统一过滤——因此"复用通用扫描,只排除垃圾区"
     是适配器最轻松的用法(知乎侧栏/评论区即此)。
- `ScannedBlock` 上还有 `unitBoundary: 'before' | 'after' | 'both'`(可选)供适配器表达
  **测量单元边界**:默认扫描不产生边界,行为与从前完全一致。

## 3. 未来:知乎适配器示例

```ts
// src/lib/adapters/zhihu.ts (未来)
import { getFlatText } from '../dom-scan.ts'
import { type SiteAdapter, type SiteAdapterContext } from './index.ts'

export const ZHIHU: SiteAdapter = {
  id: 'zhihu',
  matches: (url) => ['www.zhihu.com', 'zhuanlan.zhihu.com'].includes(url.host),
  extract({ url, root }: SiteAdapterContext) {
    const isHome = url.pathname === '/' || url.href.includes('feed')
    const containers: Element[] = []
    if (isHome) {
      root.querySelectorAll('div.FeedCard, div.List-item').forEach((c) => containers.push(c))
    } else {
      for (const sel of [
        '.RichContent-inner',
        '.Post-RichTextContainer',
        '.QuestionAnswer-answer',
      ]) {
        root.querySelectorAll(sel).forEach((el) => containers.push(el))
      }
    }
    return containers.map((el) => ({
      el: el as HTMLElement,
      text: getFlatText(el).text,
      // 每块独立成单元,绝不跨文章合并
      unitBoundary: 'both' as const,
    }))
  },
  exclude(el) {
    // 评论区/侧栏吸附框/推荐区
    return !!el.closest('.CommentList, .App-Column, [data-ppl-exclude]')
  },
}
```

注册:在 `adapters.ts` 顶部 `import { ZHIHU } from './zhihu.ts'` 并 `ADAPTER_REGISTRY.unshift(ZHIHU)`。
测量管线(状态机 / 分组 / 渲染)完全复用——适配器只回答"哪些元素是块、每块属于哪个单元"。

## 4. 适配器编写指南(checklist)

抓 2-3 个该网站的页面样本(浏览器保存完整 HTML,或预览渲染后快照),按此 checklist 交付:

1. **样本落库**:`extension/test/site/<site>-<board>.html`(与 e2e 样本同目录,含多板块)。
2. **写适配器**:单文件 `src/lib/adapters/<site>.ts`,实现上面接口:
   - `matches`:host(+ 必要时 path 区间);
   - `extract`:板块分流 → 内容容器选择器 → `getFlatText` 产块;
   - 需要时 `exclude` 排除导航/评论/推荐区;短文卡片类容器给
     `unitBoundary: 'both'` 防跨文章合并。
3. **单测对拍**:`jsdom` 里加载样本 HTML,断言 `extractBlocksFor(样本URL, …)`
   精确产生预期的块集(texts/顺序/边界)—— 与 dom-scan/adapters 测试同模式。
4. **回归**:`npm run test`(vitest)+ `node test/e2e.mjs`(真实浏览器管线)。

样本采集工具(bookmarklet / puppeteer 抓 HTML)与"调试高亮面板"(显示命中适配器与候选块)
尚未实现,见 §5。

## 5. 扩展点(接口已预留,尚未实现)

| 扩展点                                     | 已有                                                     | 将来                                                 |
| ------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------- |
| 候选块提取(extract)                        | ✅ 接口 + ctx.url 板块分流                               | 各站实现                                             |
| 排除区(exclude,含 generic 回退)            | ✅ 接口,后置统一过滤                                     | 各站实现                                             |
| 测量单元边界(unitBoundary)                 | ✅ 接口(dom-scan 合并尊重)                               | 各站实现                                             |
| SPA 路由变化触发重扫                       | mutation watch(wxt 文档另有 `wxt:locationchange` 可监听) | 站点级 `onNavigate?` 钩子                            |
| 每个站点一套参数(short merge/threshold 等) | settings 全局                                            | `SiteAdapter.overrides?: Partial<ExtensionSettings>` |
| 调试:高亮候选块 / 报告用了哪个适配器       | —                                                        | 设置页"调试"区块(可选)                               |
| 用户自主开关适配器                         | —                                                        | settings 增 `adapters: { [id]: boolean }`            |

## 6. 为什么不做成"全站规则引擎"

通用规则(如"优先 `article` 元素""排除 `nav`/`aside`")是**启发式**,已经在
dom-scan 里做得不错;站点差异是**离散知识**(哪个选择器是正文),适合一份份
适配器代码,不适合继续堆通用启发式。适配器代码可以复用 dom-scan 的导出助手
(`getFlatText`/`charCount` 等),量小、可测、可随站点改版而演进。
