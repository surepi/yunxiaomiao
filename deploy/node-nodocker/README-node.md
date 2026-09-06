# 9950X 物理机部署（原生安装，不用 Docker 跑服务）

每台物理机：原生安装 MCSM 守护端（systemd `mcsm-daemon`）+ Caddy 反代 + Docker（用于游戏服容器）。
控制面板通过 `https://nodeN.xxx.com`(443) 连接；明文 24444 只监听 127.0.0.1。

## 1. 基础环境
```bash
# Docker（MCSM 用它来跑游戏服容器；守护端本身是原生 node）
curl -fsSL https://get.docker.com | sh

# Caddy（自动 HTTPS）
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```
- DNS：`node1.xxx.com` A 记录到本机公网 IP（3 台分别 node1/2/3）。
- 安全组：放行 `80、443` + **游戏端口段**（建议改小，如 25000-26000）；**不要放行 24444**。

## 2. 原生安装 MCSM（只用守护端）
```bash
wget -qO- https://script.mcsmanager.com/setup.sh | sudo bash
# 物理机不需要面板(web)，关掉；保留守护端
sudo systemctl disable --now mcsm-web 2>/dev/null || true
sudo systemctl enable --now mcsm-daemon
```

## 3. 让守护端只监听本机 + 取密钥
编辑 `/opt/mcsmanager/daemon/data/Config/global.json`：
- `"ip": "127.0.0.1"`（原为 `""`，不对公网监听）
- 可把端口段改小：`"allocatablePortRange": [25000, 26000]`

然后：
```bash
sudo systemctl restart mcsm-daemon
sudo grep '"key"' /opt/mcsmanager/daemon/data/Config/global.json   # 记下这个 key
```

## 4. 配置 Caddy
```bash
# 用 deploy/node-nodocker/Caddyfile，把域名改成本机的 nodeN.xxx.com
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 5. 在云面板添加节点
云上面板 → 节点管理 → 新增：
- 地址：`wss://node1.xxx.com`（**必须带 wss://**）
- 端口：`443`
- 密钥：第 3 步的 `key`
- 前缀：留空

3 台都添加后，网关会自动在其中选最空闲的开通。

> 说明：游戏服若用 Docker 类型实例，MCSM 守护端会调用本机 Docker 创建容器；
> 玩家用“本机公网 IP:游戏端口”直连。守护端控制链路始终走 Caddy 的 443 加密。
