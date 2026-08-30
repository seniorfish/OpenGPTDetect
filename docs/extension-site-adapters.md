# 扩展站点适配器(Site Adapters)— 设计与现状

> 状态:**骨架已落地,generic-only,行为不变**。本文是未来"网站专用调优"的实现蓝图
> (预计:知乎等站点,首页 / 文章 / 回答等板块的文本结构适配)。

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

## 2. 已落地的骨架(`src/lib/adapters.ts`)

```ts
export interface SiteAdapter {
  id: string // 稳定标识(调试/设置项使用)
  matches(url: URL): boolean // URL 匹配;注册表优先匹配者胜出
  extract?(root, settings): ScannedBlock[] | null // 站点专用候选块;null = 交回通用扫描
  exclude?(el, url): boolean // 对 extract 结果的额外过滤
}
```

- `ADAPTER_REGISTRY`:首个 `matches` 命中的适配器生效;`GENERIC_ADAPTER`
  (`matches: () => true`,无 extract)兜底——**default 行为与重构前完全一致**。
- `extractBlocksFor(href, root, settings)`(纯函数,可测)+ `extractBlocks(root, settings)`
  当前页面包装;`content.ts` 的初次扫描与 mutation watch 重扫都走它。
- 容错:适配器 `extract` 抛异常 → console.warn 并回退 generic(扩展绝不能因适配器而崩)。

## 3. 未来:站点适配器长什么样(知乎示例)

```ts
// src/lib/adapters/zhihu.ts (未来)
const ZHIHU: SiteAdapter = {
  id: 'zhihu',
  matches: (url) => ['www.zhihu.com', 'zhuanlan.zhihu.com'].some((h) => h === url.host),
  /** 按板块挑选"测量单元容器" */
  extract(root, settings) {
    const units: Element[] = []
    // 首页 feed 卡片(标题 + 摘要为一块)
    root.querySelectorAll('div.FeedCard, div.List-item').forEach((c) => {
      const text = (c as HTMLElement).innerText.trim()
      if (text.length >= 30) units.push(c as HTMLElement)
    })
    // 回答正文 / 文章正文:直接取 .RichContent-inner / .Post-RichTextContainer
    for (const sel of ['.RichContent-inner', '.Post-RichTextContainer', '.QuestionAnswer-answer']) {
      root.querySelectorAll(sel).forEach((el) => units.push(el as HTMLElement))
    }
    return units.map((el) => ({ el, text: getFlatText(el).text }))
  },
  exclude(el) {
    // 排除评论区与侧栏吸附框
    return (
      !!el.closest('.CommentList, .App-Column, [data-ppl-exclude]') ||
      !!el.closest('.MoreAnswers, .QuestionHeader')
    )
  },
}
```

注册:在 `adapters.ts` 顶部 `import` 并 unshift 到注册表。测量管线(groupUnits / 状态机 /
渲染)完全复用——适配器只回答"哪些元素是块"。

## 4. 扩展点(尚未实现,接口已预留)

| 扩展点                                     | 已有                                                     | 将来                                                 |
| ------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------- |
| 候选块提取(extract)                        | ✅ 接口                                                  | 各站实现                                             |
| 排除区(exclude)                            | ✅ 接口                                                  | 各站实现                                             |
| SPA 路由变化触发重扫                       | mutation watch(wxt 文档另有 `wxt:locationchange` 可监听) | 站点级 `onNavigate?` 钩子                            |
| 每个站点一套参数(short merge/threshold 等) | settings 全局                                            | `SiteAdapter.overrides?: Partial<ExtensionSettings>` |
| 调试:高亮候选块 / 报告用了哪个适配器       | —                                                        | 设置页"调试"区块(可选)                               |
| 用户自主开关适配器                         | —                                                        | settings 增 `adapters: { [id]: boolean }`            |

## 5. 为什么不做成"全站规则引擎"

通用规则(如"优先 `article` 元素""排除 `nav`/`aside`")是**启发式**,已经在
dom-scan 里做得不错;站点差异是**离散知识**(哪个选择器是正文),适合一份份
适配器代码,不适合继续堆通用启发式。适配器代码可以复用 dom-scan 的导出助手
(`getFlatText`/`charCount` 等),量小、可测、可随站点改版而演进。
