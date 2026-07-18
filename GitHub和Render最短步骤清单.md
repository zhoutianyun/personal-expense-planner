# GitHub 和 Render 最短步骤清单

## GitHub

1. 在 GitHub 新建一个空仓库
2. 打开项目根目录终端
3. 依次执行：

```bash
git add .
git commit -m "init: personal expense planner"
git branch -M main
git remote add origin 你的仓库地址
git push -u origin main
```

## Render

1. 登录 Render
2. 点击 `New +`
3. 选择 `Blueprint`
4. 连接 GitHub 仓库
5. 选择当前项目仓库
6. Render 自动读取根目录 `render.yaml`
7. 确认创建服务
8. 等待部署完成
9. 打开生成的公网网址

## 上线后检查

1. 打开首页是否正常
2. 注册和登录是否正常
3. 保存账单是否成功
4. 导入微信账单是否成功
5. 图表和预算是否正常
6. 重启服务后数据是否还在
