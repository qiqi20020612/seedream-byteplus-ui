# Seedream 5.0 Pro BytePlus Frontend

一个本地运行的 Seedream-5.0-pro 生图前端，支持文生图、单图/多参考图图生图，以及常用输出参数调整。

## 启动

1. 复制 `.env.example` 为 `.env`，填入 `ARK_API_KEY`；如需使用其他模型，修改 `ARK_MODEL_ID`。
2. 运行：

```powershell
npm start
```

3. 打开终端输出里的本地地址，默认是 `http://127.0.0.1:8787`。

也可以不写 `.env`，直接在页面里临时输入 BytePlus API Key。

生成期间，结果网格中会显示带提示词、已耗时和取消按钮的任务卡片。可以连续提交多个并发任务，完成后各任务卡片会原位替换为新图片，并保留之前的结果。图片会自动保存到项目的 `generated` 目录；可通过 `.env` 中的 `OUTPUT_DIR` 修改保存位置。

## 支持参数

- 模型：通过 `.env` 中的 `ARK_MODEL_ID` 配置，默认 `dola-seedream-5-0-pro-260628`
- 区域/Base URL：`ap-southeast-1`、`eu-west-1` 或自定义
- 模式：文生图、图生图
- 任务：支持并发生成和逐任务取消
- 参考图：图片 URL 或本地图片转 data URL，最多 10 张
- 尺寸：`1K`、`2K` 或自定义 `widthxheight`
- 输出：`png`、`jpeg`
- 返回：`url`、`b64_json`
- 自动保存：支持 URL 和 Base64 返回，默认保存到 `generated`
- 水印：开/关
- 高级 JSON：用于透传文档新增参数，核心字段会由界面设置覆盖

> 如果你的 BytePlus 账号或接口策略不接受 data URL 形式的本地图片，请改用可访问的图片 URL。
