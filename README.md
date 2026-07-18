# 个人消费管理与储蓄规划平台

这是一个基于 `HTML + Node.js + SQLite` 的个人消费管理项目，适合课程项目、作品集展示和后续继续接入真实服务器。

## 当前已完成

- 用户注册、登录、退出
- 手动录入收支
- 微信账单 Excel 导入
- 账单自动去重
- 仪表盘统计
- 预算与储蓄规划
- 异常记录
- 图表展示
- 自动同步账单功能骨架
- Render 部署配置

## 项目结构

```text
wangye/
  个人消费管理与储蓄规划平台.html

server/
  index.js
  db.js
  package.json
  requirements.txt
  parse_wechat_xlsx.py
  routes/
  services/
  connectors/
  parsers/
  data/
```

## 本地启动

1. 启动后端

```bash
cd server
npm install
npm start
```

2. 打开网页

直接打开：

```text
wangye/个人消费管理与储蓄规划平台.html
```

如果网页需要请求本地接口，请确保后端已经启动，默认地址为：

```text
http://localhost:3000
```

## 对外稳定访问

推荐使用 Render 部署。项目根目录已经准备好：

- `render.yaml`
- `.node-version`
- `server/requirements.txt`

部署成功后，其他人可以通过公开网址稳定访问，不需要再连你本机。

## 当前技术说明

- 数据库目前是 `SQLite`
- 数据目录支持通过 `DB_DIR` 环境变量切换
- Render 配置里已经挂载持久磁盘，避免重启丢数据
- 微信 Excel 导入当前仍依赖 Python `openpyxl`

## 下一步建议

- 把仓库上传到 GitHub
- 在 Render 创建 Blueprint 服务
- 部署成功后把公开链接发给他人访问
- 后续再把 SQLite 升级为 PostgreSQL，提高多人访问稳定性
