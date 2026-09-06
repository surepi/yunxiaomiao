# MCSManager 一键开服 · 开通网关 (Provisioning Gateway)

独立的开通后端，通过 MCSManager 面板的**管理员 API Key** 调用面板，实现
“卡密自助一键开服 / 续费 / 我的服务 / 一键登录面板”。**不改动 MCSManager 本体**。

## 架构

```
买家浏览器 -> portal(5174) -> gateway(8080, JWT) -> 面板 /api/*(23333, 管理员 apiKey) -> 守护节点(24444)
```

- 买家账号复用 MCSManager 面板账号（注册即建面板普通用户，登录由面板校验）。
- 卡密/订单/套餐/开通台账存数据库；实例与到期时间由面板/守护端负责。
- 到期：守护端到期自动停机；网关定时对账状态与到期时间（不自动删档）。

## 快速开始（本地默认 SQLite，零依赖）

```bash
cd gateway
npm install
cp .env.example .env          # 填写 PANEL_API_KEY 等
npm run setup                 # prisma generate + db push + seed(管理员/示例套餐/示例卡密)
npm run dev                   # http://localhost:8080
```

### 面板侧准备（只配置，不改码）

1. 面板设置里开启 API Key：`enableApiKey = ONLY_ADMIN`。
2. 新建（或使用）一个**管理员服务账号**，生成其 apiKey。
3. `.env` 中设置：
   - `PANEL_BASE_URL`：网关访问面板的内网地址，如 `http://localhost:23333`。
   - `PANEL_API_KEY`：管理员 apiKey。
   - `MCSM_UI_ORIGIN`：浏览器访问官方面板的地址（一键登录跳转用）。

默认管理员后台账号见 `.env`（`ADMIN_USERNAME/ADMIN_PASSWORD`，首次启动自动创建）。

## 切换到 MySQL / PostgreSQL（生产）

Schema 字段全部使用可移植类型（JSON 以字符串存），切换步骤：

1. 用本目录 `docker-compose.yml` 启动 MySQL（或自备实例）。
2. 编辑 `prisma/schema.prisma`，将 `provider = "sqlite"` 改为 `"mysql"`
   （Postgres 用 `"postgresql"`）。
3. 设置 `DATABASE_URL=mysql://gateway:gatewaypass@localhost:3306/mcsm_gateway`。
4. 执行 `npx prisma db push` 与 `npm run seed`。

## 主要接口

公开/买家（JWT 为登录后 `Authorization: Bearer <token>`）：

- `POST /auth/register` `{username,password}` 注册（密码 9-36 位，含大小写+数字）
- `POST /auth/login` `{username,password}` 登录，返回 JWT
- `GET  /packages` 在售套餐
- `POST /redeem` `{code}` 一键开服（JWT 决定归属）
- `POST /renew` `{code,instanceId}` 续费
- `GET  /instances` 我的服务
- `POST /instances/sso` `{instanceId}` 获取一键登录面板链接

管理员（`POST /admin/login` 拿 JWT）：

- `GET/POST/PUT/DELETE /admin/packages` 套餐管理（`setupInfo` 为实例模板 JSON）
- `POST /admin/cards/generate` `{packageId,count,batchNo?,expiresAt?}` 批量生成卡密
- `GET  /admin/cards`、`POST /admin/cards/:id/status` 卡密查询/停用
- `GET  /admin/orders`、`GET /admin/instances` 订单与开通记录

预留：`POST /webhooks/taobao`（HMAC-SHA256 头 `X-Webhook-Signature`，密钥 `WEBHOOK_SECRET`）。
v1 仅验签落库返回 202，自动直开待接 ERP/聚水潭或淘宝 TOP。

## 套餐模板

套餐的 `setupInfo` 是 MCSManager 实例配置（`IGlobalInstanceConfig`）片段，可直接采用
官方“快捷安装”模板（Docker 镜像、`{mcsm_port1}` 端口占位符、启动命令等）；
`resourceLimits` 覆盖 Docker 限额（`memory` MB、`cpuUsage` 百分比、`maxSpace` MB 等）。
端口由守护端自动分配，无需网关管理。
