# 日本中学智能选校与日程匹配原型

这是一个开箱即用的 Mock 原型，包含：

- 10 所日本中学 Mock 数据
- 学生画像输入：偏差值、家里地址、核心需求标签、学校类型
- 结果筛选：学校类型精确筛选，需求标签至少命中一个才进入结果
- 併願カレンダー：每所学校可维护多个入試回次，每个回次有日期、午前/午後/全日、回次名、回次別偏差値、出願期間
- 日程冲突检测：同一天同一时段，或全日入試与同日任一回次会提示冲突
- Python 评分函数 `calculate_matching_score(student, school)`
- 手机优先的网页界面
- 分享按钮：部署到公网后可直接发到微信、Line、小红书
- Docker / Synology NAS / GitHub Actions 自动更新部署配置

## 本地运行

在本文件所在目录运行：

```powershell
python app.py
```

如果电脑没有安装 Python，在 Codex 当前环境可使用：

```powershell
C:\Users\hanke\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe app.py
```

打开：

```text
http://localhost:8000
```

## 重要文件

- `app.py`：本地网页服务和 API
- `matching_engine.py`：核心匹配算法
- `schedule_engine.py`：入試日程冲突检测
- `schools_data.py`：Mock 学校数据库（10 所学校，学校名・住所・紹介文・タグは日本語）
- `static/index.html`：页面结构
- `static/styles.css`：页面样式
- `static/app.js`：前端交互
- `tests.py`：最小算法测试
- `Dockerfile`：Docker 镜像构建入口
- `.github/workflows/docker-publish.yml`：GitHub Actions 自动发布镜像
- `deploy/synology-compose.yml`：Synology Container Manager 部署示例
- `DEPLOY_NAS.md`：NAS 部署说明

## Docker 运行

```powershell
docker build -t school-matcher .
docker run --rm -p 8000:8000 -e BASIC_AUTH_USERNAME=family -e BASIC_AUTH_PASSWORD=your-password school-matcher
```

如果不设置 `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD`，本地运行时不会启用访问密码。

## GitHub + NAS 自动更新

本项目已包含 GitHub Actions 配置。推送到 GitHub `main` 分支后，会自动发布 Docker 镜像到 GitHub Container Registry。

当前仓库：

```text
https://github.com/hanke1219/school-matcher
```

镜像地址：

```text
ghcr.io/hanke1219/school-matcher:latest
```

Synology NAS 部署和 Watchtower 自动更新步骤见：

```text
DEPLOY_NAS.md
```

## 评分规则

总分最高 100 分：

- 偏差值：最高 30 分。孩子偏差值在学校偏差值 `[-3, +5]` 区间内最优。
- 通勤：最高 25 分。30 分钟内满分，超过后按 5 分钟梯度扣分，超过 90 分钟大幅扣分。
- 需求标签：每个重合标签加 20 分，上限 30 分。
- 学校类型：符合期望加 10 分，不限时默认加 10 分。

## 入試日程设计

学校数据中每所学校都有 `exam_sessions`，适合从偏差值表格导入：

```python
{
    "id": "sakae-higashi-dec10-am",
    "name": "東大・難関大クラス 12月入試",
    "exam_date": "2026-12-10",
    "slot": "AM",
    "hensachi": 54,
    "application_start": "2026-11-10",
    "application_end": "2026-12-03",
}
```

`slot` 使用 `AM`、`PM`、`FULL`。冲突规则是：同一天同一时段冲突；`FULL` 与同一天任何时段冲突。

## 学校照片与主页

每条学校数据现在包含：

- `description`：卡片简介
- `homepage_url`：学校官网
- `photo_url`：卡片照片

当前照片 URL 指向各学校官网公开图片。正式发布前仍建议确认学校官网的图片使用条件，或替换为学校授权图片/自有实拍图。

## 分享到微信、Line、小红书

当前 `localhost` 只适合自己电脑本地测试。要让别人手机点链接直接使用，需要把这个项目部署到公网，例如：

- Render
- Railway
- Fly.io
- 自己的云服务器

部署后，页面右上角分享按钮会分享当前公网 URL。
