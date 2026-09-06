# 腾讯云服务器部署（不用 Docker）

目标：一台云服务器跑「面板(官方) + 开通网关(Node 进程) + 门户(静态文件) + Caddy(HTTPS 反代)」。
3 台物理机只跑守护端（另见 `deploy/node/README-node.md`）。

- 面板：用 MCSManager 官方一键脚本（自包含，自带 systemd `mcsm-web`）。
- 网关：Node 常驻，用 systemd 管理；数据库默认 SQLite（一个文件）。
- 门户：`vite build` 出静态文件，Caddy 直接托管；网关 API 由 Caddy 同源反代。

## 0. 域名与安全组
- DNS A 记录到本云服务器公网 IP：
  - `portal.example.com`（买家门户）
  - `panel.example.com`（控制面板）
- 云安全组 / 防火墙**只放行** `22(SSH)、80、443`；不要放行 23333 / 8080 / 3306。
  （23333 面板和 8080 网关都只监听 127.0.0.1，由本机 Caddy 反代。）

## 1. 安装运行环境（Node 20 + Caddy）
```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Caddy (自动 HTTPS)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

## 2. 安装 MCSM 面板（官方，仅面板）
```bash
wget -qO- https://script.mcsmanager.com/setup.sh | sudo bash
# 云上不跑游戏服，关掉本机守护端，只保留面板(web)
sudo systemctl enable --now mcsm-web
sudo systemctl disable --now mcsm-daemon 2>/dev/null || true
# 验证
curl -s -o /dev/null -w "panel local -> %{http_code}\n" http://127.0.0.1:23333/api/auth
# 期望 403（路由正常，需要登录）
```

## 3. 部署网关 + 门户
把本仓库放到云服务器 `/opt/mcsm`（只需 `gateway/`、`portal/`、`deploy/cloud-nodocker/` 即可，整个仓库拷过去也行）：
```bash
sudo mkdir -p /opt/mcsm && sudo chown -R "$USER:$USER" /opt/mcsm
# 用 scp/rsync/git 把代码放到 /opt/mcsm，使目录为 /opt/mcsm-shop/gateway、/opt/mcsm/portal
```

准备网关环境配置：
```bash
cd /opt/mcsm
cp deploy/cloud-nodocker/gateway.env.example gateway/.env
# 编辑 gateway/.env：
#   CORS_ORIGIN=https://portal.example.com
#   MCSM_UI_ORIGIN=https://panel.example.com
#   PANEL_BASE_URL=http://127.0.0.1:23333
#   PANEL_API_KEY= 先留空，第 5 步拿到后回填
#   改掉所有 *_SECRET 和 ADMIN_PASSWORD
nano gateway/.env
```

一键构建并安装网关服务（构建网关、生成 Prisma 客户端、建表、种子、装 systemd）：
```bash
sudo bash deploy/cloud-nodocker/deploy.sh
# 验证
systemctl status mcsm-gateway
curl -s http://127.0.0.1:8080/health
```

## 4. 配置 Caddy（HTTPS + 反代）
```bash
sudo cp deploy/cloud-nodocker/Caddyfile /etc/caddy/Caddyfile
# 把里面的 example.com 改成你的真实域名
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
Caddy 会自动为两个域名申请证书。此时 `https://panel.example.com` 应能打开面板登录页。

## 5. 面板初始化与 API Key
1. 浏览器打开 `https://panel.example.com`，按提示创建管理员账号。
2. 面板设置里开启 API Key：`enableApiKey = ONLY_ADMIN`。
3. 新建一个**专用管理员服务账号**（或用当前 admin），在用户设置里生成/查看其 apiKey。
4. 回填到网关并重启：
```bash
nano /opt/mcsm-shop/gateway/.env      # 填 PANEL_API_KEY
sudo systemctl restart mcsm-gateway
```

## 6. 接入 3 台物理机
先按 `deploy/node/README-node.md` 把 3 台 9950X 守护端起好（`nodeN.example.com`，Caddy 443 → 本机 daemon）。
然后在云面板「节点管理」新增 3 个节点：
- 地址：`wss://node1.example.com`（必须带 `wss://`），端口 `443`，密钥填各守护端 key，前缀留空。
- 连接成功后，网关 `ping` 会自动在 3 台中选最空闲节点开通。

## 7. 上架（套餐与卡密）
网关后台默认账号见 `gateway/.env`（`ADMIN_USERNAME/ADMIN_PASSWORD`）。
- 登录拿管理员 JWT：
```bash
curl -X POST https://portal.example.com/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"你的ADMIN_PASSWORD"}'
```
- 用返回的 token 调 `POST /admin/packages` 建套餐、`POST /admin/cards/generate` 批量生成卡密
  （接口见 `gateway/README.md`）。卡密导出后在淘宝虚拟商品“自动发货(卡密)”里发放。
- 买家：打开 `https://portal.example.com` 注册 → 输卡密一键开服 → 我的服务里一键进面板/续费。

## 附：可选——改用原生 MySQL（而非 SQLite）
```bash
sudo apt-get install -y mysql-server
sudo mysql -e "CREATE DATABASE mcsm_gateway; \
  CREATE USER 'gateway'@'localhost' IDENTIFIED BY 'gatewaypass'; \
  GRANT ALL ON mcsm_gateway.* TO 'gateway'@'localhost'; FLUSH PRIVILEGES;"
# 1) 编辑 /opt/mcsm-shop/gateway/prisma/schema.prisma：provider = "mysql"
# 2) gateway/.env：
#    DATABASE_URL=mysql://gateway:gatewaypass@127.0.0.1:3306/mcsm_gateway
cd /opt/mcsm-shop/gateway
npx prisma db push
npm run build
node dist/prisma/seed.js
sudo systemctl restart mcsm-gateway
```

## 运维/备份
- 网关：`sudo systemctl restart|status mcsm-gateway`，日志 `journalctl -u mcsm-gateway -f`。
- 面板：`sudo systemctl restart mcsm-web`。
- 备份：网关 SQLite 文件 `/opt/mcsm-shop/gateway/data/gateway.db`（用 MySQL 则 `mysqldump`）；
  面板数据在官方安装目录 `/opt/mcsmanager/web/data`。
- 游戏存档在各物理机 `/opt/mcsm/daemon/data/InstanceData`（分别备份）。
