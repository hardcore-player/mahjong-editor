# 每日高难关卡编辑器（普通牌 + 暗牌）

保留旧版 `/editor/` 三栏布局，产品范围限定为：**普通牌、暗牌、L0～L30、31 种正式牌面**。

## 启动

```bash
cd mj-editor
node serve.js
```

- 旧版：`/editor/`
- **每日编辑器**：`/daily-editor/`

## 构建牌面

```bash
node daily-editor/build-assets.cjs
```

## 测试

```bash
node daily-editor/test-phase1.cjs
node daily-editor/test-browser-phase1.cjs
node daily-editor/test-static-deploy.cjs
node daily-editor/test-daily-release.cjs
```

校验在浏览器端执行（`lib/validation.js`），Cloudflare Pages 静态部署不依赖 Node API。

## 产品范围

**支持**：普通牌、暗牌、L0～L30、31 张正式牌面、JSON 导入/导出、校验、统计、草稿

**不支持（导入即拒绝）**：吐牌机 / spitterOrder、discs / 盖子、rotation、其他 specialTiles 类型

**暂未实现**：求解、回放、写入工程目录
