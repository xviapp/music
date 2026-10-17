# 贡献指南

## 开发环境

- JDK 21
- Android SDK 36
- Node.js 20 或更高版本

本项目使用仓库内的 Gradle Wrapper。不要提交 `local.properties`、`.signing/`、构建产物、账号 Cookie 或任何本机缓存。

## 本地验证

```sh
npm test
JAVA_HOME=/path/to/jdk-21 ./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

真实联网测试默认不运行，因为它依赖第三方服务并可能修改 WebView 会话。需要手动验证时，参见 README 中的显式联网测试命令。

## 提交变更

1. 先说明用户可观察到的问题或行为变化。
2. 为修复或新行为补充能捕获回归的测试。
3. 运行 Node 测试、Debug 单测、lint 和 Debug 构建。
4. 保持提交范围集中，不提交本地签名文件或生成目录。

界面、隐私、登录和网络协议相关变更需要在 PR 描述中说明测试环境和已知限制。
