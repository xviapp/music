# 音乐 Android 应用

独立 Android 音乐客户端，直接连接网易云音乐，支持推荐、搜索、音乐库和后台播放。

[隐私说明](PRIVACY.md) · [免责声明](DISCLAIMER.md) · [贡献指南](CONTRIBUTING.md) · [安全策略](SECURITY.md)

## 功能

- 推荐首页、精选歌单、每日推荐、新歌速递、排行榜和私人 FM。
- 搜索建议、热搜、本机搜索历史，歌曲、歌单、歌手和专辑详情，以及只读评论。
- 音乐库、云盘、最近播放，歌曲喜欢和歌单、歌手、专辑收藏。
- 官方网页登录和备用扫码登录，账号 Cookie 加密保存在本机。
- 播放队列、歌词及翻译、循环与随机播放、音质选择、定时关闭和音频缓存。
- 后台播放、系统通知、锁屏和耳机媒体按键控制。

## 构建

需要 JDK 21、Android SDK 36 和 Node.js 20 或更高版本。仓库已包含 Gradle Wrapper。配置 `JAVA_HOME` 和 `ANDROID_HOME`，或在不纳入 Git 的 `local.properties` 中设置 `sdk.dir`。

构建调试 APK：

```sh
npm run build:android
```

也可以直接运行 `./gradlew :app:assembleDebug`。产物位于 `app/build/outputs/apk/debug/app-debug.apk`。

首次构建 release APK 前，初始化本机签名：

```sh
npm run signing:init
```

签名配置保存在 `.signing/release.properties`，初始化命令拒绝覆盖已有文件。请备份整个 `.signing/` 目录，不要提交或公开密钥和密码。

构建 release APK：

```sh
npm run build:android:release
```

产物位于 `app/build/outputs/apk/release/app-release.apk`。本地验证和设备测试见 [贡献指南](CONTRIBUTING.md#本地验证)。

## 目录

- `app/src/main/java/app/xvi/music/`：Android 代码。`MainActivity` 承载 WebView 和 Native bridge，`PlaybackService` 管理播放，`MusicApi`、`ApiCrypto` 和 `ApiRoutes` 处理协议请求、加密和路由白名单。
- `app/src/main/assets/ui/`：页面、样式和界面脚本，通过 Native bridge 请求数据和控制播放。
- `app/src/test/`、`tests/`：Java 单元测试和 Node.js 界面测试。
- `app/src/androidTest/`：Android 设备测试。

## 后台播放边界

播放由 AndroidX Media3 的独立 `MediaSessionService` 管理，不依赖 WebView 存活。关闭后台播放后，移除任务会暂停播放并停止服务。音频按歌曲和音质缓存在本机，最多 512 MB；播放权限由音乐服务决定。

## 来源与许可

本项目代码以 [MIT License](LICENSE) 发布。`ApiCrypto` 和 `ApiRoutes` 的协议实现移植自 NeteaseCloudMusicApiEnhanced，相关归属、许可文本和其他依赖声明见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)。
