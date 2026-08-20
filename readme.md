**简体中文** | [English](./README_EN.md)

# 四博配音宝微信小程序

四博配音宝是一款面向配音制作与配套蓝牙音箱管理的微信小程序。用户可以完成文字转语音、长文本配音、多人对话配音、录音/音色转换、视频音频提取、广告文案生成和背景音乐配置，并可通过 BLE 将生成或本地选择的 MP3 文件传输到“配音宝”设备。

## 主要功能

- **普通配音**：输入不超过 299 个字符的文本，选择音色、语速、音量、停顿、提示音和背景音乐后生成音频。
- **长文本配音**：支持不超过 2000 个字符的文本，采用异步任务提交和轮询方式生成音频。
- **对话配音**：为多段对话分别设置音色，合成后合并为完整音频。
- **音色转换与录音**：录制或选择音频，上传后执行音色转换，并支持背景音乐设置。
- **视频提取**：从微信聊天文件中选择视频并提取音频，当前限制视频时长不超过 6 分钟。
- **广告词创作**：按语言、行业分类和文案风格生成广告词，可保存到个人模板。
- **音色与背景音乐**：支持分类浏览、试听、收藏音色和背景音乐，以及上传自定义背景音乐。
- **作品管理**：查看、播放、重命名和删除已生成的作品。
- **BLE 设备管理**：搜索、连接、重连和解绑配音宝设备；查看设备容量及设备内音乐。
- **设备音乐管理**：向设备导入 MP3，播放、重命名和删除设备中的音乐。
- **用户服务**：个人资料、头像与昵称、常见问题、意见反馈、联系方式和关于页面。

## 技术栈

- 原生微信小程序：JavaScript、WXML、WXSS、JSON
- 微信小程序基础库：`3.11.0`
- 组件框架：`glass-easel`
- UI 组件库：`@vant/weapp ^1.11.7`
- 测试：Node.js 内置 `assert`，通过自定义微信 API mock 运行页面测试

## 项目结构

```text
voiceSpeaker_new/
|-- app.js                       # 全局状态、后端域名、BLE/协议工具注册
|-- app.json                     # 页面注册、全局窗口和权限配置
|-- app.wxss                     # 全局样式
|-- project.config.json          # 微信开发者工具项目配置
|-- package.json                 # npm 依赖与测试脚本
|-- components/
|   |-- bgmList/                 # 背景音乐列表
|   |-- bgmSet/                  # 背景音乐参数设置
|   |-- bottomNav/               # 配音、设备、高级、我的底部导航
|   |-- navigation-bar/          # 自定义导航栏
|   |-- recorder/                # 录音组件
|   |-- searchMask/              # BLE 设备搜索弹层
|   `-- voiceList/               # 音色分类与列表
|-- pages/
|   |-- index/                   # 普通配音首页
|   |-- advanced/                # 高级功能入口
|   |-- device/                  # BLE 设备连接与管理
|   |-- generate/                # 音频生成结果、播放与设备传输
|   |-- myWorks/                 # 我的作品
|   `-- ...                      # 其他业务与用户服务页面
|-- utils/
|   |-- request.js               # API 请求、微信登录与 Token 管理
|   |-- bletool.js               # BLE 搜索、连接、通知与写入
|   |-- hextool.js               # 设备通信协议封包和响应分发
|   |-- operationFile.js         # 音频文件分片、CRC 与设备音乐指令
|   |-- http_request.js          # 简单请求封装
|   `-- util.js                  # 通用工具
|-- tests/
|   `-- standalone-pages.test.js # 页面逻辑与配置测试
|-- img/                         # 本地图片资源
`-- docs/                        # 功能设计与实施记录
```

## 页面说明

| 页面 | 路径 | 用途 |
| --- | --- | --- |
| 普通配音 | `pages/index/index` | 短文本配音、音色/BGM/音效参数设置 |
| 音色选择 | `pages/voiceSelect/voiceSelect` | 音色分类、试听与收藏 |
| 背景音乐 | `pages/bgmSelect/bgmSelect` | BGM 分类、试听、收藏和自定义上传 |
| 录音 | `pages/recorder/recorder` | 录制音频并生成作品 |
| 常用模板 | `pages/commonTemplate/commonTemplate` | 公共模板和个人模板管理 |
| 高级功能 | `pages/advanced/advanced` | 广告词、音色转换、对话、长文本和视频提取入口 |
| 长文本配音 | `pages/longTextDubbing/longTextDubbing` | 长文本异步合成 |
| 音色转换 | `pages/voiceConvert/voiceConvert` | 上传/录制音频并转换音色 |
| 对话配音 | `pages/dialogueDubbing/dialogueDubbing` | 多角色分段合成与音频合并 |
| 视频提取 | `pages/videoExtract/videoExtract` | 从视频文件提取音频 |
| 广告词创作 | `pages/adCopy/*` | 参数选择、文案生成和模板保存 |
| 生成结果 | `pages/generate/generate` | 试听、重命名和传输生成音频 |
| 设备 | `pages/device/device` | BLE 搜索、连接、重连和解绑 |
| 设备音乐 | `pages/devMusicList/devMusicList` | 容量查询、MP3 导入、播放、重命名和删除 |
| 我的作品 | `pages/myWorks/myWorks` | 云端作品列表和管理 |
| 我的 | `pages/mine/mine` | 用户资料与服务入口 |

完整页面注册列表以 [`app.json`](./app.json) 为准。

## 开发环境

开始前请准备：

1. 微信开发者工具。
2. Node.js 和 npm。建议使用当前维护中的 Node.js LTS 版本。
3. 可访问的配音宝后端服务。
4. 需要调试录音、文件选择或 BLE 时，准备一台已开启蓝牙的真机；BLE 全流程还需要配音宝硬件。

## 安装与运行

1. 安装 npm 依赖：

   ```bash
   npm install
   ```

2. 打开微信开发者工具，选择“导入项目”，导入当前目录。

3. 确认 `project.config.json` 中的 AppID 是否适用于当前开发账号。若无权限，请改为自己的测试号或小程序 AppID。

4. 在微信开发者工具中执行“工具 -> 构建 npm”，生成 `miniprogram_npm` 依赖目录。

5. 编译项目。普通 UI 和部分页面可使用模拟器预览，登录、录音、聊天文件选择、上传和 BLE 功能应使用真机调试。

## 后端配置

项目当前使用局域网开发服务：

```text
http://192.168.5.245:9000
```

切换开发、测试或生产环境时，需要同步修改以下两处：

- `app.js` 中的 `globalData.domain`：供上传、下载、头像、视频提取等直接拼接完整地址的功能使用。
- `utils/request.js` 中的 `BASE_URL`：供统一 `request()` 封装使用，值需要包含 `/api/v1`。

例如生产环境配置为：

```js
// app.js
domain: 'https://ai-speaker.esp32.cn'

// utils/request.js
const BASE_URL = 'https://ai-speaker.esp32.cn/api/v1'
```

同时需要在微信公众平台的“开发管理 -> 开发设置 -> 服务器域名”中配置后端涉及的合法域名，包括：

- `request` 合法域名
- `uploadFile` 合法域名
- `downloadFile` 合法域名

正式发布环境必须使用已备案且支持 HTTPS 的域名。局域网 HTTP 地址通常只适合开启“不校验合法域名”的本地或真机开发调试。

## 登录与本地缓存

应用通过 `wx.login` 获取临时 code，再调用 `/auth/wechat/login` 换取访问令牌。需要鉴权的接口会携带：

```text
Authorization: Bearer <auth_token>
```

主要缓存键如下：

| Key | 内容 |
| --- | --- |
| `auth_token` | 后端访问令牌 |
| `openid` | 当前微信用户 OpenID |
| `userInfo` | 用户信息 |
| `voiceList` | 音色分类缓存 |
| `bgmList` | 背景音乐分类缓存 |
| `sbpyb2025` | 最近连接的配音宝设备，用于自动重连 |

遇到账号、缓存音色或设备自动重连异常时，可在微信开发者工具中清除 Storage 后重新进入小程序。

## BLE 调试说明

- BLE 搜索只展示符合设备广播规则的配音宝设备；当前代码会校验广播名称、Service UUID 和产品标识 `p49857`。
- 主要 GATT Service UUID 为 `00001910-0000-1000-8000-00805F9B34FB`，读写特征值定义在 `utils/bletool.js`。
- 音频传输使用 MTU 分包、CRC16 校验和设备请求分块机制，协议实现位于 `utils/hextool.js` 与 `utils/operationFile.js`。
- Android 真机扫描 BLE 时通常还需要系统定位服务处于开启状态；页面提示也会要求开启蓝牙和位置信息。
- 模拟器无法完整验证 BLE、录音和文件传输，请以真机测试结果为准。

## 测试

运行全部自动化测试：

```bash
npm test
```

测试脚本会 mock 常用微信 API，覆盖页面注册、跳转、表单交互、接口参数、长文本轮询、文件上传和用户页面等逻辑。BLE 与真实音频录制/播放仍需真机联调。

## 发布前检查

- 将 `app.js` 与 `utils/request.js` 的接口地址切换为生产 HTTPS 地址。
- 检查小程序 AppID、后端微信登录配置和服务器合法域名。
- 在微信开发者工具中重新构建 npm，并确认 Vant 组件可正常加载。
- 检查录音授权文案以及录音拒绝后的引导流程。
- 使用 Android 与 iOS 真机验证登录、音频试听、上传、下载和视频提取。
- 使用真实配音宝设备验证首次连接、自动重连、断线提示、音频传输和设备音乐管理。
- 执行 `npm test`，并在上传前完成代码质量与包体积检查。

## 常见问题

### 页面提示网络请求失败

确认手机和后端服务网络互通，并检查两处后端地址是否一致。使用局域网地址时，真机必须与后端处于可互访的网络中。

### Vant 组件找不到

先执行 `npm install`，再在微信开发者工具中执行“构建 npm”。如果仍有问题，删除开发者工具生成的构建缓存后重新构建。

### 无法发现或连接设备

确认手机蓝牙和系统定位服务已开启、设备处于可发现状态且没有被其他手机占用。必要时清除 `sbpyb2025` 缓存，然后重新搜索连接。

### 登录反复失败

确认当前 AppID 与后端配置匹配，后端 `/auth/wechat/login` 接口可用。清除 `auth_token` 和 `openid` 后重新进入小程序，可排除本地过期状态的影响。

### 音频可以生成但无法播放或传输

先确认返回的音频地址可由真机访问；再检查 `downloadFile` 合法域名。传输到设备时还需确认 BLE 连接状态、设备剩余容量和文件格式。

## 联系咨询

邮箱：

📧 lihonggang@doit.am

微信：

![微信联系方式](wx.jpg)