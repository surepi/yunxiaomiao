# MCSManager 一键开服 · 开通网关（Provisioning Gateway）

独立的开通后端，通过 MCSManager 面板的**管理员 API Key** 调用面板，实现
“卡密自助一键开服 / 续费 / 我的服务 / 一键登录面板”。**不改动 MCSManager 本体。**

- 运行时：Node 20 + TypeScript + Fastify 4 + Prisma 5。
- 买家账号复用 MCSManager 面板账号：注册即在面板建普通用户，登录走面板校验，网关只签发自己的 JWT。
- 卡密 / 订单 / 套餐 / 开通台账存数据库；实例运行与到期停机由面板 / 守护端负责。

## 架构

```
买家浏览器 -> portal(5174) -> gateway(8080, JWT) -> 面板 /api/*(23333, 管理员 apiKey) -> 守护节点(24444)
```

- 到期：守护端到期自动停机；网关定时（`RECONCILE_INTERVAL_MINUTES`）对账状态与到期时间，只同步状态、不自动删档。
- 选节点：套餐可钉死某个节点（`daemonId`）；否则 `ping` 所有在线节点，选运行实例最少、最空闲者；买家也可在门户手选。

## 快速开始（本地默认 SQLite，零依赖）

```bash
cd gateway
npm install
cp .env.example .env          # 填写 PANEL_API_KEY 等
npm run setup                 # prisma generate + db push + seed（管理员/示例套餐/示例卡密）
npm run dev                   # http://localhost:8080 ，健康检查 GET /health
```

构建 / 运行：

```bash
npm run build                 # tsc 编译到 dist/
npm run start                 # node dist/server.js
```

### 面板侧准备（只配置，不改码）

1. 面板设置里开启 API Key：`enableApiKey = ONLY_ADMIN`。
2. 新建（或使用）一个**管理员服务账号**，生成其 apiKey。
3. 在 `.env` 设置：
   - `PANEL_BASE_URL`：网关访问面板的内网地址，如 `http://127.0.0.1:23333`。
   - `PANEL_API_KEY`：管理员 apiKey。
   - `MCSM_UI_ORIGIN`：浏览器访问官方面板的地址（一键登录跳转用）。

默认管理员后台账号见 `.env`（`ADMIN_USERNAME` / `ADMIN_PASSWORD`，首次启动 / 种子时自动创建）。
密码策略：用户名 4–32 位字母数字下划线；密码 9–36 位且含大小写字母与数字（与面板一致）。

## 切换到 MySQL / PostgreSQL（生产）

Schema 字段全部使用可移植类型（JSON 以字符串存），切换步骤：

1. 用本目录 `docker-compose.yml` 启动 MySQL（或自备实例）。
2. 编辑 `prisma/schema.prisma`，将 `provider = "sqlite"` 改为 `"mysql"`（Postgres 用 `"postgresql"`）。
3. 设置 `DATABASE_URL=mysql://gateway:gatewaypass@localhost:3306/mcsm_gateway`。
4. 执行 `npx prisma db push` 与 `npm run seed`（或 `node dist/prisma/seed.js`）。

## 数据模型（prisma/schema.prisma）

| 模型 | 说明 |
| --- | --- |
| `Package` | 在售套餐：名称、价格（分）、时长、`setupInfo`（实例模板 JSON）、可选钉死 `daemonId` |
| `RedeemCard` | 卡密：`code`、归属套餐、批次号 `batchNo`、状态（未用 / 已用 / 停用）、过期时间 |
| `Order` | 兑换 / 续费订单：卡密、买家、套餐、类型（开通 / 续费）、金额 |
| `ProvisionedInstance` | 开通台账：面板 `instanceId` + `daemonId`、归属买家、到期时间、状态 |
| `AdminUser` | 网关本地管理员（独立于面板，用于后台登录） |
| `WebhookEvent` | 收到的 webhook 原始载荷与验签结果（预留自动发货） |

## HTTP 接口

买家 / 公开接口（除注册登录外，需 `Authorization: Bearer <买家JWT>`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查，返回 `{ ok, time }` |
| `POST` | `/auth/register` | 注册 `{username,password}`（同时在面板建号） |
| `POST` | `/auth/login` | 登录 `{username,password}`，返回买家 JWT |
| `GET` | `/packages` | 在售套餐列表 |
| `GET` | `/nodes` | 可选择的在线节点（一键开服选节点，按空闲度排序） |
| `POST` | `/redeem` | 卡密一键开服 `{code, nodeId?}`（JWT 决定归属；`nodeId` 可选手选） |
| `POST` | `/renew` | 续费 `{code, instanceId}` |
| `GET` | `/instances` | 我的服务（状态、到期、连接地址、所属节点） |
| `POST` | `/instances/sso` | `{instanceId}` 获取一键免密登录面板链接 |
| `POST` | `/instances/action` | `{instanceId, action}` 开机 / 关机 / 重启，`action ∈ open|stop|restart`（到期不可开机） |

管理员接口（先 `POST /admin/login` 拿管理员 JWT）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/admin/login` | `{username,password}`，返回管理员 JWT |
| `GET` / `POST` | `/admin/packages` | 套餐列表 / 新建 |
| `PUT` / `DELETE` | `/admin/packages/:id` | 修改 / 删除套餐 |
| `GET` | `/admin/templates` | 官方“快捷安装”模板列表（用于一键导入套餐） |
| `POST` | `/admin/cards/generate` | 批量生成卡密 `{packageId,count,batchNo?,expiresAt?}` |
| `GET` | `/admin/cards` | 卡密查询（支持按套餐 / 批次 / 状态过滤） |
| `POST` | `/admin/cards/:id/status` | 启用 / 停用卡密 |
| `GET` | `/admin/nodes` | 节点列表与在线状态 / 负载 |
| `GET` | `/admin/overview` | 概览统计与低库存预警 |
| `GET` | `/admin/orders` | 订单记录 |
| `GET` | `/admin/instances` | 全部开通实例台账 |

预留：`POST /webhooks/taobao`（HMAC-SHA256，头 `X-Webhook-Signature`，密钥 `WEBHOOK_SECRET`）。
v1 仅验签落库返回 202，自动直开待接 ERP / 聚水潭或淘宝 TOP。

> 限流：注册 / 登录走认证限流，兑换 / 续费 / 实例操作走动做限流，webhook 单独限流。

## 套餐模板（setupInfo）

套餐的 `setupInfo` 是 MCSManager 实例配置（`IGlobalInstanceConfig`）片段，可直接采用官方
“快捷安装”模板（Docker 镜像、`{mcsm_port1}` 端口占位符、启动命令等）；`resourceLimits`
覆盖 Docker 限额（`memory` MB、`cpuUsage` 百分比、`maxSpace` MB 等）。游戏端口由守护端自动分配，
买家在“我的服务”里看到 `节点公网地址:端口` 直连。

## 目录速览

```
src/
  config.ts            env 读取与生产自检
  app.ts / server.ts   Fastify 装配、路由注册、定时任务启动
  panel/client.ts      MCSManager 面板 API 封装（建号/校验/实例/节点）
  routes/              auth / package / redeem / instance / admin / webhook
  services/            auth/card/instance/node/package/redeem/stats + payloadBuilder
  security/            jwt、密码哈希、鉴权 guard、限流
  cron/reconcile.ts    定时对账
prisma/
  schema.prisma        数据模型
  seed.ts              管理员 + 示例套餐 + 示例卡密
```
