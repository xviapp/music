# 音乐 Android 应用

独立 Android 音乐应用，首页以推荐为主。界面参照 chase、moment：浅色使用纸白背景与暖赭棕主色，深色使用暖灰黑背景与柔和琥珀色主色。播放状态由 AndroidX Media3 的独立 `MediaSessionService` 持有。

源码、界面资源和构建配置均在本目录维护；安装、测试与构建不依赖工作区其他项目或归档源码。

## 最新更新

### 2026-10-07

#### 优化

- 桌面图标更换为戴琥珀色耳机的蓝灰色猫背影，并适配圆形等桌面图标裁切。
- 首页入口和歌单布局更紧凑，推荐内容更早可见；搜索、音乐库及歌单详情会保留浏览位置和已有内容。
- 播放器补充循环、随机、定时和歌词跟随状态反馈，歌词支持手动浏览后回到当前句。

#### 修复

- 冷启动先应用已保存的主题，再显示首页，避免首页从默认浅色跳变到深色；启动背景同步适配深色模式。
- 播放器在总时长暂不可用时不再把进度条误显示到末尾，并会回退使用歌曲元数据时长。
- 刷新、分页和网络失败时保留已显示内容，补充封面失败、空列表和错误重试反馈。

完整历史见[更新记录](docs/releases/release-notes.md)。

## 构建与安装

需要 JDK 21 和 Android SDK 36，仓库已包含 Gradle wrapper。配置 `JAVA_HOME` 和 `ANDROID_HOME`，或在不纳入 Git 的 `local.properties` 中设置 `sdk.dir`：

```sh
pnpm build:android
```

该命令调用仓库内的 Gradle wrapper，构建 Android 调试 APK，不自动安装到设备。也可以直接运行 `./gradlew :app:assembleDebug`。

构建 release APK：

```sh
pnpm build:android:release
```

release 使用本机 `.signing/release.properties` 中配置的 PKCS12 密钥，产物位于 `app/build/outputs/apk/release/app-release.apk`。未配置签名时 release 构建会报错，不会自动降级为 unsigned 或 debug 签名。

首次配置本机签名（已有密钥时应恢复备份，不要生成新密钥）：

```sh
pnpm signing:init
```

该命令生成 RSA 3072 位签名密钥和随机密码，拒绝覆盖已有文件。`.signing/music-release.p12` 与 `.signing/release.properties` 均不进入 Git，文件仅允许当前用户读写。请将整个 `.signing` 目录安全备份；后续版本必须继续使用同一密钥，丢失密钥可能导致无法升级已安装的应用。不要在日志或聊天中公开密码文件。

release 签名与 debug 签名不同，不能直接覆盖已安装的 debug 包。卸载旧包会清除本机数据，操作前请备份。

APK 位于 `app/build/outputs/apk/debug/app-debug.apk`。真实接口的 Android 测试是只读的，扫码登录测试只申请二维码密钥，不会自动登录：

```sh
npm test
./gradlew :app:testDebugUnitTest :app:lintDebug
./gradlew :app:assembleDebugAndroidTest
```

连接设备后，明确选择运行联网测试：

```sh
adb shell am instrument -w \
  -e class app.xvi.music.DirectApiTest \
  app.xvi.music.test/androidx.test.runner.AndroidJUnitRunner
```

## 已实现

- 推荐首页、精选歌单、每日推荐、新歌速递、私人 FM、搜索、歌单详情、音乐库、云盘和最近播放。
- 优先打开网易云官方网页登录，扫码登录作为备用；账号 Cookie 在 Android Keystore 保护的 AES-GCM 密文中保存，界面脚本无法直接读取。
- 客户端内置 `api-enhanced` 所需的 weapi/eapi 请求协议和固定路由白名单，不要求另行部署 Node API 服务，也不接受界面提供任意服务地址。
- Media3 ExoPlayer、播放队列、播放/暂停、上一首/下一首、进度、歌词、循环、随机、喜欢、音质和定时关闭。
- 歌单详情支持收藏／取消收藏，成功后更新音乐库；自己创建的歌单不显示收藏按钮，请求失败保留原状态。
- 歌曲详情及播放页支持点击歌手；歌手页提供热门歌曲、全部歌曲、专辑、简介。歌手与专辑支持收藏／取消收藏，音乐库提供各自的收藏列表。
- 首页提供排行榜入口；榜单、歌曲和最近播放点击只查看内容，明确点击播放按钮才切换歌曲。歌曲详情支持追加到队列，不中断当前播放。
- 歌曲详情与播放页提供只读评论入口，展示热门评论、最新评论、引用回复，并支持分页。
- 搜索输入提供防抖建议，支持中文输入法；选择建议后搜索，旧请求不会覆盖新关键词。
- `MediaSessionService`、系统 MediaStyle 通知、锁屏/耳机媒体按键和切后台继续播放。后台播放设置关闭后，移除任务会暂停并停止服务。
- 服务端返回的试听、无权限、失效地址和网络错误会在播放器中给出可操作的中文错误，不把“拿到 URL”视为一定可播放。

## 目录

项目根目录为 `music/`，可直接在本目录执行构建和测试。

- `references/`：YesPlayMusic、WyPlayer、api-enhanced、musicbox 等本地参考项目，各自保留独立 Git 仓库。
- `prototype/`：交互原型。
- `app/src/main/java/app/xvi/music/MainActivity.java`：WebView UI 容器、Native bridge 和页面播放器控制。
- `app/src/main/java/app/xvi/music/PlaybackService.java`：后台播放、媒体会话、通知、队列恢复、FM 补充和定时关闭。
- `app/src/main/java/app/xvi/music/MusicApi.java`、`ApiCrypto.java`、`ApiRoutes.java`：api-enhanced 的客户端协议移植和接口白名单。
- `app/src/main/assets/ui/`：按原型整理的页面、样式和只处理展示的 JS；不直接访问网络。
- `app/src/test/`、`tests/`：加密向量、路由安全、歌词解析、展示数据归一化测试。

## 后台播放边界

音频播放不依赖 WebView 存活。页面退出后，Service、Player 和 MediaSession 仍持有队列；系统通知及锁屏控制通过 MediaSession 进入同一 Player。音频地址只在播放器需要时解析并短时缓存，播放地址过期会重新请求。真实设备上仍需按目标厂商测试省电策略、网络切换、蓝牙/耳机、音频焦点中断、服务被系统回收后的恢复和会员歌曲权限。

## 来源与许可

接口协议与路由组织参考 NeteaseCloudMusicApiEnhanced，功能结构参考 YesPlayMusic。参考项目不属于本仓库，构建不依赖这些项目。对应 MIT 文本见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES)。应用不复制 YesPlayMusic 的前端代码。
