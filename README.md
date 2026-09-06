# 云小喵 · MCSManager 一键开服平台（yunxiaomiao / mcsm-shop）

基于 [MCSManager](https://mcsmanager.com/) 面板二次封装的**卡密自助开服平台**：买家在品牌门户
注册、输入卡密即可一键开通游戏服、续费、一键免密进面板管理；管理员在后台管理套餐、卡密、节点、
订单与实例。**不改动 MCSManager 官方代码**，面板 / 守护端依旧是运维引擎。

## 功能特性

**买家侧（门户）**
- 注册 / 登录：账号直接建在 MCSManager 面板，登录由面板校验（网关不存买家密码）
- 在售套餐展示
- 卡密兑换一键开服：自动选最空闲节点，也可手动指定节点
- 我的服务：运行状态、到期时间、连接地址，开机 / 关机 / 重启
- 卡密续费、临期提示
- 一键免密（SSO）跳转 MCSM 面板管理自己的服

**管理员侧（后台 `/console`）**
- 概览看板：套餐 / 卡密 / 订单 / 实例 / 节点统计与低库存预警
- 节点状态：在线情况、负载、实例数
- 套餐管理：增删改查，官方“快捷安装”模板一键导入
- 卡密：批量生成、查询、停用
- 订单与开通记录

**运维 / 安全**
- 定时对账实例状态与到期时间（面板负责到期停机，网关只同步状态、不自动删档）
- Webhook 验签落库（淘宝 / ERP 自动发货预留，HMAC-SHA256）
- 登录 / 操作限流、生产弱配置自检（弱密钥、通配 CORS、默认密码会拒绝启动）
- 默认 SQLite 零依赖，可平滑切 MySQL / PostgreSQL

## 架构

```
买家浏览器
   │  HTTPS
   ▼
Caddy（自动 HTTPS + 反向代理 + 静态托管）
   ├── /              → portal 静态文件（Vue3 单页，SPA history 回退）
   └── /auth /admin /packages /redeem /instances … → gateway（Fastify，JWT 鉴权）
                          │  管理员 apiKey（服务端到服务端）
                          ▼
                   MCSManager 面板 web（23333）
                          │  WSS（加密）
                          ▼
                   MCSManager 守护端 daemon（多台物理机）
                          │
                          ▼
                   Docker 游戏服容器
```

生产环境面板（23333）、网关（8080）、守护端（24444）均只监听 `127.0.0.1`，由本机 Caddy
统一对外 443。本地开发：门户 `5174`、网关 `8080`。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `gateway/` | 开通网关：Node + TypeScript + Fastify + Prisma。持有面板管理员 apiKey，负责注册/登录、卡密开服、续费、选节点、SSO、套餐/卡密/订单、定时对账。 |
| `portal/` | 买家门户：Vue3 + Vite + Pinia + Vue Router + TypeScript。套餐、登录注册、一键开服、我的服务、管理员后台。 |
| `deploy/cloud-nodocker/` | 云服务器（主控）裸机部署：面板 + 网关 + 门户静态页 + Caddy（不用 Docker 跑业务）。含一键脚本 `deploy.sh`、systemd unit、Caddyfile、env 模板。 |
| `deploy/node-nodocker/` | 物理机（被控）部署：原生守护端 + Caddy + Docker（Docker 仅用于游戏服）。 |
| `docs/ROADMAP.md` | 开发路线图与上线 checklist。 |

## 技术栈

- 网关：Fastify 4、Prisma 5（SQLite / MySQL / PostgreSQL）、axios、bcryptjs、jsonwebtoken、zod
- 门户：Vue 3、Vite 5、Pinia、Vue Router、TypeScript
- 部署：Caddy（自动 HTTPS）、systemd、MCSManager 官方一键脚本

## 本地快速开始

前置：Node.js 20+，以及一个可访问的 MCSManager 面板（本地或远程均可）。

**网关**（默认 SQLite，零外部依赖）：

```bash
cd gateway
npm install
cp .env.example .env        # 填 PANEL_BASE_URL / PANEL_API_KEY / MCSM_UI_ORIGIN
npm run setup               # prisma generate + 建表 + 种子（管理员 / 示例套餐 / 示例卡密）
npm run dev                 # http://localhost:8080 ，健康检查 GET /health
```

**门户**：

```bash
cd portal
npm install
npm run dev                 # http://localhost:5174
```

dev 模式 Vite 会把 `/auth`、`/admin`、`/packages`、`/instances` 等 API 路径代理到
`http://localhost:8080`，所以门户的 `VITE_GATEWAY_URL` 可留空（走同源）。

管理员后台：浏览器打开 <http://localhost:5174/console>，默认账号 `admin / admin123456`
（生产务必在 `gateway/.env` 修改 `ADMIN_PASSWORD`）。

## 环境变量（网关 gateway/.env）

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `GATEWAY_PORT` / `GATEWAY_HOST` | 监听端口 / 地址 | `8080` / `0.0.0.0` |
| `CORS_ORIGIN` | 允许的门户来源，生产必须钉死为门户域名 | `*` |
| `JWT_USER_SECRET` / `JWT_ADMIN_SECRET` | 买家 / 管理员 JWT 签名密钥，生产必须改强密钥 | dev 占位 |
| `JWT_EXPIRES_IN` | 买家 JWT 有效期 | `7d` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 后台管理员账号（种子脚本创建） | `admin` / `admin123456` |
| `PANEL_BASE_URL` | 网关访问面板的服务端地址（可用内网地址） | `http://localhost:23333` |
| `PANEL_API_KEY` | 面板**管理员** apiKey（面板设 `enableApiKey = ONLY_ADMIN`） | 空 |
| `MCSM_UI_ORIGIN` | 浏览器访问面板的地址（用于 SSO 跳转） | `http://localhost:23333` |
| `DATABASE_URL` | Prisma 连接串，默认 SQLite 文件 | `file:./data/gateway.db` |
| `RECONCILE_INTERVAL_MINUTES` | 对账定时任务间隔（分钟） | `60` |
| `WEBHOOK_SECRET` | Webhook HMAC-SHA256 验签密钥 | 占位 |

门户变量（`portal/.env.development` / `.env.production`）：`VITE_GATEWAY_URL`，网关地址；
同源反向代理部署时留空即可。

> 生产启动（`NODE_ENV=production`）会自检弱密钥 / 通配 CORS / 默认管理员密码等，不合规直接拒绝启动。

## 部署

- 云主控（面板 + 网关 + 门户 + Caddy）：[`deploy/cloud-nodocker/README.md`](deploy/cloud-nodocker/README.md)，
  一键脚本 `deploy/cloud-nodocker/deploy.sh`（自动装依赖、建库、种子、构建、装 systemd 服务）。
- 物理被控（守护端 + Caddy）：[`deploy/node-nodocker/README-node.md`](deploy/node-nodocker/README-node.md)。
- 切换 MySQL / PostgreSQL：见 [`gateway/README.md`](gateway/README.md)。

## 文档索引

- 网关 API 与数据模型：[`gateway/README.md`](gateway/README.md)
- 门户结构与开发说明：[`portal/README.md`](portal/README.md)
- 路线图 / 上线 checklist：[`docs/ROADMAP.md`](docs/ROADMAP.md)

## 说明

- 仓库不含 `node_modules/`、`dist/`、`data/`、`.env`：依赖在服务器安装构建，`.env` 含密钥不入库
  （配置模板为 `.env.example` / `deploy/cloud-nodocker/gateway.env.example`）。
- MCSManager 面板 / 守护端用官方一键脚本安装，不在本仓库内。
