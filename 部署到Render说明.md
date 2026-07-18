# 部署到 Render

这份项目已经整理成适合部署到 Render 的状态，适合让其他人稳定访问。

## 已准备好的内容

- 后端支持 `PORT` 环境变量
- 数据目录支持 `DB_DIR` 环境变量
- 根目录已提供 `render.yaml`
- 根目录已提供 `.node-version`
- 后端已提供 `server/requirements.txt`
- Render 配置里已挂载持久磁盘

## 为什么推荐 Render

- 有稳定的公网网址
- 支持 Node.js Web Service
- 支持持久磁盘，适合当前 `SQLite`
- 部署完成后别人可直接访问，无需你的电脑开机

## 最短上线步骤

1. 把当前项目上传到 GitHub 仓库
2. 登录 Render
3. 点击 `New +`
4. 选择 `Blueprint`
5. 连接你的 GitHub 仓库
6. 让 Render 读取根目录的 `render.yaml`
7. 确认创建服务
8. 等待部署完成
9. 打开 Render 分配的公开网址

## 关键说明

- 当前数据库使用 `SQLite`
- 数据库存储目录在 Render 上会挂到 `/var/data`
- 微信账单 Excel 导入依赖 Python `openpyxl`
- 构建时会执行：

```bash
python -m pip install --user -r server/requirements.txt
npm install --prefix server
```

## 部署后结果

部署成功后，其他人可以直接通过 Render 网址访问你的项目。

## 后续升级建议

- 数据库从 `SQLite` 升级到 `PostgreSQL`
- 给项目绑定自定义域名
- 把账单解析逐步迁移成纯 Node 方案
