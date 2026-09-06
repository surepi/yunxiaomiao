# mcsm-shop — 一键开服 网关 + 门户（自开发部分）

本目录是与 MCSManager 官方代码分离的、我们自己开发的部分，可独立打包/上传到服务器。

## 目录结构
- `gateway/`  开通网关（Node + TypeScript + Fastify + Prisma）。持有面板 admin apiKey，
  负责建号、一键开服、续费、选节点、卡密/订单、SSO、定时对账。
- `portal/`   买家门户（Vue3 + Vite）。套餐展示、登录/注册、一键开服、我的服务。
- `deploy/`
  - `cloud-nodocker/`  云服务器（主控）部署：面板+网关+门户静态页+Caddy，不用 Docker。
  - `node-nodocker/`   9950X 物理机（被控）部署：原生守护端 + Caddy，不用 Docker 跑服务。

## 部署位置（与脚本默认路径一致）
把整个目录放到云服务器 `/opt/mcsm-shop`，然后按
`deploy/cloud-nodocker/README.md` 一步步操作（一键构建脚本 `deploy/cloud-nodocker/deploy.sh`
会自动 `npm install`、建库、种子、构建，并安装 systemd 服务 `mcsm-gateway`）。

物理机按 `deploy/node-nodocker/README-node.md` 安装守护端并在云面板添加节点
（地址 `wss://nodeN.你的域名`、端口 `443`）。

## 说明
- 不含 node_modules/dist/data：部署脚本会在服务器上安装依赖并构建。
- 网关配置从 `gateway/.env` 读取（模板见 `gateway/.env.example`）。
- MCSManager 面板/守护端用官方一键脚本安装，不在本目录内。
# yunxiaomiao
