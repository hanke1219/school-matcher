# Synology NAS 部署说明

目标方案：

1. GitHub 保存代码。
2. GitHub Actions 自动构建 Docker 镜像。
3. 镜像发布到 GitHub Container Registry，地址类似：
   `ghcr.io/hanke1219/school-matcher:latest`
4. Synology Container Manager 运行这个镜像。
5. Watchtower 在 NAS 上自动拉取新版并重启容器。

## 1. 准备 GitHub 仓库

当前使用的 GitHub 仓库：

```text
https://github.com/hanke1219/school-matcher
```

把本项目推送到这个仓库的 `main` 分支。推送后，GitHub Actions 会自动运行 `.github/workflows/docker-publish.yml`。

发布成功后，镜像地址通常是：

```text
ghcr.io/hanke1219/school-matcher:latest
```

如果仓库是私有的，需要在 GitHub Packages 里确认 NAS 能拉取镜像。最简单的长期方式是先把镜像包设置为 public。

## 2. 在 Synology 上部署

打开 Synology DSM：

1. 打开 `Container Manager`。
2. 新建一个 Project。
3. 上传或粘贴 `deploy/synology-compose.yml`。
4. 确认里面的镜像地址是：

```yaml
image: ghcr.io/hanke1219/school-matcher:latest
```

5. 创建 `.env`，内容参考 `deploy/.env.example`：

```text
BASIC_AUTH_USERNAME=family
BASIC_AUTH_PASSWORD=换成一个家人知道的密码
```

6. 启动 Project。

局域网内可以访问：

```text
http://NAS的局域网IP:8000/
```

## 3. 自动更新机制

`watchtower` 会每小时检查一次镜像。

以后更新流程是：

```text
修改代码 -> 推送到 GitHub main -> GitHub 自动发布镜像 -> NAS 自动拉取并重启
```

家人访问地址不需要变化。

## 4. 外网访问

不建议直接把 `8000` 端口暴露到公网。

推荐二选一：

- Cloudflare Tunnel：家人可以用普通 HTTPS 域名访问。
- Tailscale：家人手机需要安装 App，安全但不如普通链接方便。

如果使用 Cloudflare Tunnel，可以把隧道转发到：

```text
http://school-matcher:8000
```

或者在 NAS 上转发到：

```text
http://127.0.0.1:8000
```

## 5. 安全建议

- 保留 `BASIC_AUTH_USERNAME` 和 `BASIC_AUTH_PASSWORD`。
- 不要在 GitHub 提交真实 `.env` 文件。
- 不要直接开放路由器端口 `8000`。
- 如果用 Cloudflare Tunnel，开启 HTTPS。
