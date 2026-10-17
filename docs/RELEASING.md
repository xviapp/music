# 发布流程

1. 更新 `app/build.gradle` 的 `versionCode` 和 `versionName`，同步更新 `package.json`、README 最新更新和 `docs/releases/release-notes.md`。
2. 运行 `npm test`、Debug 单测、lint 和 `:app:assembleRelease`。
3. release 签名只从本机 `.signing/release.properties` 或受保护的 CI Secret 读取。不要把密钥、密码或签名配置提交到 Git。
4. 计算 APK 的 SHA-256，并在 GitHub Release 中附上版本、变更记录和校验值。
5. 创建带版本号的 Git tag，例如 `v0.2.0`，再发布构建产物。

签名密钥是应用升级身份的一部分。它应单独备份，丢失或泄露时不能通过重新生成密钥恢复已安装应用的升级链。
