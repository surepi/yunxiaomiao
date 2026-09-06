# MCSManager 一键开服 · 买家门户 (Portal)

Vue 3 + Vite + Pinia + Vue Router 的买家门户：套餐展示、登录/注册、一键开服、
我的服务（状态/到期/端口、续费、一键进入面板）。

```bash
cd portal
npm install
npm run dev        # http://localhost:5174
npm run build      # 类型检查 + 生产构建到 dist/
```

环境变量（`.env.development` / `.env.production`）：

- `VITE_GATEWAY_URL`：开通网关地址。本地默认 `http://localhost:8080`；
  生产环境同源部署（反向代理）时可留空走相对路径。

所有界面文案集中在 `src/i18n/index.ts`。
