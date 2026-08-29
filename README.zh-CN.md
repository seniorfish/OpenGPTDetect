# OpenGPTDetect

基于**本地大语言模型**的文本困惑度（Perplexity / PPL）分析工具包。它把文本逐 token 的困惑度算出来，作为一种可解释的"文本复杂度"信号，可辅助识别疑似 AI 生成内容。

后端使用 `llama.cpp`（`llama-cpp-python`），所有推理都在本机完成，文本与结果不出本地。

**语言：** [English](README.md) | 简体中文

## 组件

| 组件 | 位置 | 说明 |
|---|---|---|
| **PPL 分析服务**（后端） | `server/api.py` + `server/backends/` | FastAPI + llama.cpp，逐 token NLL / PPL，缓存友好的两步式接口，可切换后端 |
| **API 协议** | `docs/api.md` | 服务端接口定义、数据模型、字段语义 |
| **页面编辑器** | `editor/` | Vite + CodeMirror 6 的困惑度文本编辑器，构建为单个 HTML |
| **Chrome 插件** | `extension/` | MV3 插件，在网页上以热力图 + 标注显示文本困惑度 |

## 架构

```
浏览器页面 (editor/)  ─┐
Chrome 插件 (extension/) ├─ HTTP/JSON ─► server/api.py ─► (后端) ─► llama.cpp ─► GGUF 模型（本地）
curl / 脚本            ─┘                    （FastAPI，全局串行锁）
```

四个端共享同一份 API 契约，见 `docs/api.md`。

## 快速开始

### 1. 准备模型

下载任意 GGUF 格式的因果语言模型，例如 Qwen、Llama 系列的 GGUF 量化版。

### 2. 启动服务

```bash
cd server
pip install -r requirements.txt
cp .env.example .env        # 然后把 .env 里的 MODEL_PATH 改为你的模型路径
python api.py
```

模型加载完成后访问 `http://127.0.0.1:8000/docs`（Swagger）或用 `curl` 验证：

```bash
curl -X POST "http://127.0.0.1:8000/ppl" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!"}'
```

### 3. 使用前端 / 插件

- **页面编辑器**：`cd editor && npm install && npm run dev`，浏览器打开 Vite 提示的地址即可；生产形态是单个 HTML（`npm run build` 产物在 `editor/dist/index.html`）。
- **Chrome 插件**：`chrome://extensions` → 开启"开发者模式" → "加载已解压的扩展程序" → 选择 `extension/` 目录。插件会扫描当前页面文本并调用本地服务。

> 两者都默认连接 `http://127.0.0.1:8000`，服务须先启动。

## 配置

服务全部配置通过 `server/.env` 或环境变量注入（`MODEL_PATH` 必须设置，其余均有默认值），完整清单见 `docs/api.md` 的"快速开始"一节。`NLL` 计算默认使用 PyTorch 加速（自动选择 cuda / xpu / cpu）；未安装 torch 时自动回退 numpy。

## 硬件要求与后端选择

服务分两层，硬件需求由 llama.cpp 的安装后端与 torch 的可选加速共同决定；任何能运行 llama.cpp 的机器（包括纯 CPU）都可以使用，差别只在速度。

- **模型推理层（llama.cpp）**：由 `llama-cpp-python` 的安装方式决定。
  - PyPI 官方 wheel：Windows / Linux 为 CPU-only，macOS（Apple Silicon）为 Metal。
  - GPU 加速需换构建：NVIDIA 用 CUDA 构建；Intel 用 SYCL / XPU 构建，需 oneAPI 运行时。
  - 代码默认 `n_gpu_layers=-1`（尽量把层放入 GPU）；在 CPU-only 构建下无效果，自动回退 CPU。
- **NLL 后处理层**：`PPL_USE_TORCH=1` 且已安装 torch 时，按 CUDA → XPU → CPU 依次探测可用设备；未安装 torch 或 `PPL_USE_TORCH=0` 时使用 numpy（纯 CPU，单线程分块）。

> 注意：`/health` 返回的 `nll_backend` 只反映后处理层后端（`torch/*` 或 `numpy`），并不代表 llama.cpp 推理层实际使用的硬件。

## 项目结构

```
├─ server/          # FastAPI 服务 + 可插拔后端（api.py、backends/、requirements、.env.example）
├─ docs/api.md      # API 协议（契约基线：路由、字段、错误码、FAQ）
├─ editor/          # Vite + CodeMirror 前端
├─ extension/       # Chrome MV3 插件
└─ README.md
```

## License

[MIT](LICENSE)