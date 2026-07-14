# Seedream 5.0 Pro BytePlus Frontend

一个本地运行的 Seedream-5.0-pro 生图前端，支持文生图、单图/多参考图图生图，以及常用输出参数调整。

## 启动

1. 复制 `.env.example` 为 `.env`，填入 `ARK_API_KEY`。
2. 运行：

```powershell
npm start
```

3. 打开终端输出里的本地地址，默认是 `http://127.0.0.1:8787`。

也可以不写 `.env`，直接在页面里临时输入 BytePlus API Key。

## 支持参数

- 模型：`dola-seedream-5-0-pro-260628`
- 区域/Base URL：`ap-southeast-1`、`eu-west-1` 或自定义
- 模式：文生图、图生图
- 参考图：图片 URL 或本地图片转 data URL，最多 10 张
- 尺寸：`1K`、`2K` 或自定义 `widthxheight`
- 输出：`png`、`jpeg`
- 返回：`url`、`b64_json`
- 水印：开/关
- 高级 JSON：用于透传文档新增参数，核心字段会由界面设置覆盖

> 如果你的 BytePlus 账号或接口策略不接受 data URL 形式的本地图片，请改用可访问的图片 URL。
