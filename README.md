# URL 路由规则调试台

本地运行的 URL 路由规则编排与模拟调试工具（React + TypeScript + Vite）。
编排有序规则后，输入一个「方法 + URL」即可逐步追踪匹配过程：命中了哪条规则、
捕获了哪些路径参数、URL 如何变化、因何终止。

## 快速开始（Docker，单条命令）

```bash
docker compose up --build
```

启动后访问 **http://localhost:8080**

## 本地开发

```bash
npm install      # 安装依赖
npm run dev      # 开发服务器（默认 http://localhost:5173）
npm test         # 运行引擎单元测试（vitest）
npm run build    # 类型检查并产出静态文件到 dist/
npm run preview  # 预览构建产物
```

## 规则模型

每条规则按顺序包含以下条件与动作，**首条全部条件命中的规则生效**：

| 字段 | 说明 |
| --- | --- |
| `method` | `ANY` 或具体方法（`GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS`） |
| `host` | 精确主机（`example.com`）或通配子域（`*.example.com`，匹配任意层级子域但不含裸域）；`*` 匹配任意主机；忽略端口 |
| `pathTemplate` | 路径模板，按 `/` 分段：字面段精确比较，`:name` 段捕获为路径参数；留空或 `*` 匹配任意路径；忽略末尾斜杠差异，匹配不看查询串 |
| `action.type` | `rewrite`（重写后继续匹配）/ `redirect`（立即终止）/ `stop`（立即终止请求） |
| `action.target` | 重写 / 重定向目标，可引用路径参数（如 `/v2/users/:id`、`https://new.com/:id`）；以 `/` 开头替换路径，http(s) 绝对地址整体替换；目标不含 `?` 时保留原查询串 |
| `action.status` | 重定向状态码：`301` / `302` / `303` / `307` / `308` |

## 模拟语义

1. 从第一条规则开始查找首个命中（未启用的规则跳过）。
2. **重写**：应用目标后回到第 1 步，从第一条规则重新匹配。
3. **重定向 / 停止**：立即终止，不再评估后续规则。
4. 每步以浏览器 `URL` API 序列化后的「方法 + URL」作为状态键；
   状态重复即判定**循环**，执行超过 **20 步**判定**超限**——两者都不会给出成功结果。
5. 不再有任何规则命中时，以当前 URL 作为最终结果（成功终止）。

界面会逐步展示：命中的规则与条件明细、捕获的路径参数、URL 变化、
每步的状态键，以及最终终止原因。

## 规则 JSON 导入 / 导出

- **导出 JSON**：将当前规则表下载为 `url-rules.json`。
- **导入 JSON**：选择 JSON 文件整体替换当前规则表，导入前会逐条校验并给出中文错误提示。
- 规则同时自动保存在浏览器 `localStorage`，刷新页面不丢失。

规则 JSON 示例：

```json
[
  {
    "id": "r1",
    "name": "API v1 → v2 重写",
    "enabled": true,
    "method": "ANY",
    "host": "api.example.com",
    "pathTemplate": "/v1/users/:id",
    "action": { "type": "rewrite", "target": "/v2/users/:id", "status": 302 }
  },
  {
    "id": "r2",
    "name": "旧博客 301",
    "enabled": true,
    "method": "GET",
    "host": "blog.example.com",
    "pathTemplate": "/posts/:slug",
    "action": {
      "type": "redirect",
      "target": "https://www.example.com/blog/:slug",
      "status": 301
    }
  },
  {
    "id": "r3",
    "name": "后台禁止访问",
    "enabled": true,
    "method": "ANY",
    "host": "internal.example.com",
    "pathTemplate": "/admin/:token",
    "action": { "type": "stop", "target": "", "status": 302 }
  }
]
```

## 项目结构

```
src/
├── engine.ts        # 匹配与模拟引擎（主机/路径匹配、参数替换、循环检测）
├── engine.test.ts   # 引擎单元测试（vitest）
├── types.ts         # 规则 / 步骤 / 模拟结果类型
├── validate.ts      # 导入 JSON 的校验与规范化
├── samples.ts       # 内置示例规则与快捷请求
└── components/      # 规则编辑、模拟输入、执行轨迹 UI
```
