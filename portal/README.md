# MCSManager 一键开服 · 买家门户（Portal）

Vue 3 + Vite + Pinia + Vue Router + TypeScript 的买家门户：套餐展示、登录 / 注册、
一键开服、我的服务（状态 / 到期 / 端口、开关机 / 重启、续费、一键免密进面板），
以及管理员后台。

## 开发 / 构建

```bash
cd portal
npm install
npm run dev        # http://localhost:5174 （--host，局域网可访问）
npm run build      # vue-tsc 类型检查 + 生产构建到 dist/
npm run preview    # 本地预览生产构建
```

## 环境变量

`.env.development` / `.env.production`：

- `VITE_GATEWAY_URL`：开通网关地址。
  - 本地开发留空即可——Vite dev server 会把 `/auth`、`/admin`、`/packages`、`/redeem`、
    `/renew`、`/instances`、`/nodes`、`/webhooks`、`/health` 等 API 路径代理到 `http://localhost:8080`
    （见 `vite.config.ts`）。
  - 生产同源部署（Caddy 反代 API 到网关）时也留空，走相对路径；只有门户与网关不同源时才填完整地址。

## 页面 / 路由（src/router）

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/` | `pages/Home.vue` | 首页 / 套餐展示 |
| `/login` | `pages/Login.vue` | 买家登录 / 注册 |
| `/open` | `pages/OpenServer.vue` | 一键开服（输卡密、选节点），需登录 |
| `/services` | `pages/Services.vue` | 我的服务：状态 / 到期 / 连接信息、开关机重启、续费、进面板 |
| `/console/login` | `pages/admin/AdminLogin.vue` | 管理员后台登录 |
| `/console` | `pages/admin/AdminDashboard.vue` | 管理员后台，需管理员 JWT |

管理员后台含 6 个标签页（`src/components/admin/`）：概览 Overview、节点 Nodes、套餐 Packages、
卡密 Cards、订单 Orders、实例 Instances。

## 目录速览

```
src/
  main.ts / App.ts            应用入口与根组件
  router/index.ts             路由与登录/管理员守卫
  stores/                     Pinia：auth（买家）、admin（管理员）
  api/                        client（HTTP 封装）、types、adminTypes
  pages/                      Home / Login / OpenServer / Services + admin/*
  components/admin/           后台各标签页组件
  i18n/index.ts               全部界面文案集中在此
  utils/format.ts             价格 / 时间等格式化
  styles.css                  全局样式
```

## 说明

- 买家账号与 MCSManager 面板同源：注册即在面板建号，登录由面板校验；门户不存买家密码。
- 所有界面文案集中在 `src/i18n/index.ts`，做品牌白标（改名 / 改文案）主要改这里。
- 生产构建产物 `dist/` 为纯静态文件，由 Caddy 托管并配置 SPA `try_files` 回退
  （刷新 `/console`、`/services` 不 404），见 `deploy/cloud-nodocker/Caddyfile`。
