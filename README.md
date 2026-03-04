# 🔗 LinkSnap — 一键保存网页链接并生成 AI 摘要

人们每天收藏大量链接但从不回看，因为没有摘要就不知道为什么当时要保存。

**LinkSnap** 解决了这个问题：安装浏览器插件，一键保存页面，后端自动抓取正文，用 GPT-4o-mini 生成三句话中文摘要，永远知道"当时为什么存这个"。

---

## 功能特性

| 功能 | 描述 |
|------|------|
| **Chrome 插件** | 一键保存当前页 URL + 标题，填写标签后提交 |
| **AI 摘要** | 自动抓取正文，调用 OpenAI 生成 3 句话摘要 |
| **Web Dashboard** | 列表展示全部链接+摘要，支持全文搜索 |
| **标签系统** | 保存时打标签，按标签筛选 |
| **REST API** | `GET/POST/DELETE/PATCH /links` 完整接口 |
| **额度限制** | 免费 100 条/月，Pro 无限量 |

---

## 快速开始

### 1. 克隆 & 安装依赖

```bash
git clone <repo-url>
cd linksnap-20260304

python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填写你的 OPENAI_API_KEY
```

`.env` 最小配置：

```env
OPENAI_API_KEY=sk-your-real-key-here
```

### 3. 启动后端

```bash
python app.py
```

打开浏览器访问 **http://localhost:5000** 即可看到 Dashboard。

---

## Chrome 扩展安装

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**，选择 `extension/` 目录
4. 插件图标出现在工具栏 — 点击即可保存当前页面

> 默认后端地址为 `http://localhost:5000`。如需修改，在插件弹窗底部点击 **"设置后端地址"**。

---

## API 文档

### GET /health
健康检查，返回运行状态和链接总数。

### GET /links
```
参数：
  q       — 全文搜索
  tag     — 按标签过滤
  limit   — 每页数量（默认 50，最大 200）
  offset  — 分页偏移
  user_id — 用户 ID（默认 default）
```

### POST /links
```json
{
  "url":     "https://example.com",   // 必填
  "title":   "自定义标题",             // 可选，留空则自动抓取
  "tags":    "ai,tech,design",        // 可选，英文逗号分隔
  "user_id": "default"                // 可选
}
```
返回 201 + 保存的链接对象（包含 AI 摘要）。

### GET /links/:id
返回完整链接信息，包含原始正文。

### PATCH /links/:id
```json
{ "title": "新标题", "tags": "updated,tags" }
```

### DELETE /links/:id
软删除，返回 `{ "deleted": id }`。

### GET /tags
返回当前用户使用过的所有标签数组。

### GET /stats
返回用户计划、用量、剩余额度。

---

## 项目结构

```
linksnap-20260304/
├── app.py               # Flask 后端（API + Dashboard）
├── requirements.txt
├── .env.example
├── README.md
├── extension/           # Chrome 扩展
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── background.js
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── tests/
    └── test_api.py      # pytest 测试套件
```

---

## 运行测试

```bash
pip install pytest
pytest tests/ -v
```

---

## 变现方案

| 方案 | 价格 |
|------|------|
| 免费额度 | 100 条链接/月 |
| Pro 月付 | $3/月，无限量 |
| Pro 买断 | $9 一次性，无限量 |

升级逻辑：将 `users` 表中用户的 `plan` 字段更新为 `pro` 即可解锁无限量。

---

## 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OPENAI_API_KEY` | — | **必填**，OpenAI API Key |
| `OPENAI_MODEL` | `gpt-4o-mini` | 使用的模型 |
| `FLASK_ENV` | `production` | `development` 开启 debug 模式 |
| `PORT` | `5000` | 监听端口 |
| `DATABASE_PATH` | `linksnap.db` | SQLite 文件路径 |
| `FREE_TIER_LIMIT` | `100` | 免费用户每月限额 |
| `CORS_ORIGINS` | `*` | 允许跨域的来源 |

---

## 技术栈

- **后端**：Python 3.11+ · Flask 3 · SQLite · OpenAI SDK
- **抓取**：requests + BeautifulSoup4
- **前端**：原生 HTML/CSS/JS（无框架依赖）
- **扩展**：Chrome Manifest V3

---

## License

MIT
