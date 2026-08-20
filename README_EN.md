[简体中文](./readme.md) | **English**

# Sibo Voice Dubbing WeChat Mini Program

Sibo Voice Dubbing is a WeChat Mini Program for voice production and companion Bluetooth speaker management. Users can convert text to speech, create long-form and multi-speaker dialogue dubbing, record or transform voices, extract audio from videos, generate advertising copy, and configure background music. Generated or local MP3 files can also be transferred to a Voice Dubbing device over BLE.

## Key Features

- **Standard dubbing**: Enter up to 299 characters, select a voice, and configure speed, volume, pauses, sound effects, and background music before generating audio.
- **Long-form dubbing**: Generate speech from up to 2,000 characters through asynchronous task submission and status polling.
- **Dialogue dubbing**: Assign voices to individual dialogue segments and merge the generated segments into one audio file.
- **Voice conversion and recording**: Record or select audio, upload it for voice conversion, and optionally add background music.
- **Video audio extraction**: Select a video from WeChat chat files and extract its audio. Videos are currently limited to six minutes.
- **Advertising copy generation**: Generate advertising copy by language, industry category, and writing style, then save it as a personal template.
- **Voices and background music**: Browse by category, preview and favorite voices and background tracks, and upload custom background music.
- **Work management**: View, play, rename, and delete previously generated works.
- **BLE device management**: Discover, connect, reconnect, and unbind Voice Dubbing devices, and inspect device storage and music.
- **On-device music management**: Import MP3 files to a device, then play, rename, or delete them.
- **User services**: Manage the user profile, avatar, and nickname; browse FAQs; submit feedback; and view contact and product information.

## Technology Stack

- Native WeChat Mini Program: JavaScript, WXML, WXSS, and JSON
- WeChat Mini Program base library: `3.11.0`
- Component framework: `glass-easel`
- UI component library: `@vant/weapp ^1.11.7`
- Testing: Node.js built-in `assert` with custom WeChat API mocks for page-level tests

## Project Structure

```text
voiceSpeaker_new/
|-- app.js                       # Global state, backend origin, and BLE/protocol tools
|-- app.json                     # Page registration, global window, and permission settings
|-- app.wxss                     # Global styles
|-- project.config.json          # WeChat DevTools project configuration
|-- package.json                 # npm dependencies and test scripts
|-- components/
|   |-- bgmList/                 # Background music list
|   |-- bgmSet/                  # Background music settings
|   |-- bottomNav/               # Dubbing, device, advanced, and account navigation
|   |-- navigation-bar/          # Custom navigation bar
|   |-- recorder/                # Audio recording component
|   |-- searchMask/              # BLE device discovery overlay
|   `-- voiceList/               # Voice categories and list
|-- pages/
|   |-- index/                   # Standard dubbing home page
|   |-- advanced/                # Advanced feature launcher
|   |-- device/                  # BLE connection and device management
|   |-- generate/                # Generated audio playback and device transfer
|   |-- myWorks/                 # Generated works
|   `-- ...                      # Other business and user-service pages
|-- utils/
|   |-- request.js               # API requests, WeChat login, and token management
|   |-- bletool.js               # BLE discovery, connection, notifications, and writes
|   |-- hextool.js               # Device protocol packets and response dispatching
|   |-- operationFile.js         # Audio chunking, CRC, and device music commands
|   |-- http_request.js          # Lightweight request wrapper
|   `-- util.js                  # General utilities
|-- tests/
|   `-- standalone-pages.test.js # Page logic and configuration tests
|-- img/                         # Local image assets
`-- docs/                        # Feature designs and implementation notes
```

## Pages

| Page | Path | Purpose |
| --- | --- | --- |
| Standard Dubbing | `pages/index/index` | Short text dubbing and voice/BGM/effect settings |
| Voice Selection | `pages/voiceSelect/voiceSelect` | Voice categories, previews, and favorites |
| Background Music | `pages/bgmSelect/bgmSelect` | BGM categories, previews, favorites, and custom uploads |
| Recorder | `pages/recorder/recorder` | Record audio and create a work |
| Common Templates | `pages/commonTemplate/commonTemplate` | Shared and personal template management |
| Advanced Features | `pages/advanced/advanced` | Entry point for copywriting, conversion, dialogue, long-form dubbing, and video extraction |
| Long-form Dubbing | `pages/longTextDubbing/longTextDubbing` | Asynchronous long-form speech synthesis |
| Voice Conversion | `pages/voiceConvert/voiceConvert` | Upload or record audio and convert its voice |
| Dialogue Dubbing | `pages/dialogueDubbing/dialogueDubbing` | Multi-speaker segment synthesis and audio merging |
| Video Extraction | `pages/videoExtract/videoExtract` | Extract audio from video files |
| Advertising Copy | `pages/adCopy/*` | Select parameters, generate copy, and save templates |
| Generated Result | `pages/generate/generate` | Preview, rename, and transfer generated audio |
| Device | `pages/device/device` | BLE discovery, connection, reconnection, and unbinding |
| Device Music | `pages/devMusicList/devMusicList` | Storage inspection, MP3 import, playback, rename, and deletion |
| My Works | `pages/myWorks/myWorks` | Cloud work list and management |
| Account | `pages/mine/mine` | User profile and service links |

See [`app.json`](./app.json) for the complete list of registered pages.

## Development Requirements

Prepare the following before development:

1. WeChat DevTools.
2. Node.js and npm. A currently maintained Node.js LTS release is recommended.
3. Access to a running Voice Dubbing backend service.
4. A phone with Bluetooth enabled for testing recording, file selection, or BLE. The complete BLE workflow also requires a Voice Dubbing hardware device.

## Installation and Startup

1. Install npm dependencies:

   ```bash
   npm install
   ```

2. Open WeChat DevTools, select **Import Project**, and import this directory.

3. Confirm that the AppID in `project.config.json` is available to your development account. If it is not, replace it with your own test or Mini Program AppID.

4. In WeChat DevTools, select **Tools -> Build npm** to generate the `miniprogram_npm` dependency directory.

5. Compile the project. The simulator is sufficient for basic UI and some page previews, but login, recording, chat file selection, uploads, and BLE should be tested on a physical device.

## Backend Configuration

The project currently uses this LAN development service:

```text
http://192.168.5.245:9000
```

When switching between development, staging, or production environments, update both of the following locations:

- `globalData.domain` in `app.js`: used by uploads, downloads, avatars, video extraction, and other features that build absolute URLs.
- `BASE_URL` in `utils/request.js`: used by the shared `request()` wrapper and must include `/api/v1`.

For example, a production configuration would be:

```js
// app.js
domain: 'https://ai-speaker.esp32.cn'

// utils/request.js
const BASE_URL = 'https://ai-speaker.esp32.cn/api/v1'
```

Also configure all backend domains under **Development -> Development Settings -> Server Domains** in the WeChat Mini Program administration console, including:

- Request domain
- Upload domain
- Download domain

Production releases must use a registered domain with HTTPS support. A LAN HTTP address is generally suitable only for local or on-device development with domain validation disabled.

## Login and Local Storage

The application obtains a temporary code through `wx.login`, then exchanges it for an access token through `/auth/wechat/login`. Authenticated requests include:

```text
Authorization: Bearer <auth_token>
```

The main local storage keys are:

| Key | Content |
| --- | --- |
| `auth_token` | Backend access token |
| `openid` | Current user's WeChat OpenID |
| `userInfo` | User information |
| `voiceList` | Cached voice categories |
| `bgmList` | Cached background music categories |
| `sbpyb2025` | Most recently connected Voice Dubbing device, used for automatic reconnection |

If account state, cached voices, or automatic device reconnection behaves unexpectedly, clear Storage in WeChat DevTools and reopen the Mini Program.

## BLE Debugging

- BLE discovery displays only devices that match the Voice Dubbing advertising rules. The current implementation validates the advertised name, Service UUID, and product identifier `p49857`.
- The primary GATT Service UUID is `00001910-0000-1000-8000-00805F9B34FB`. Read and write characteristics are defined in `utils/bletool.js`.
- Audio transfer uses MTU-based packets, CRC16 validation, and device-requested chunks. The protocol is implemented in `utils/hextool.js` and `utils/operationFile.js`.
- Android BLE discovery usually also requires system location services to be enabled. The application prompts users to enable both Bluetooth and location.
- The simulator cannot fully test BLE, recording, or file transfers. Use physical-device results as the source of truth.

## Testing

Run the complete automated test suite:

```bash
npm test
```

The test script mocks commonly used WeChat APIs and covers page registration, navigation, form interactions, API parameters, long-form task polling, file uploads, and user pages. BLE and real audio recording or playback still require on-device integration testing.

## Pre-release Checklist

- Change the API addresses in both `app.js` and `utils/request.js` to the production HTTPS service.
- Verify the Mini Program AppID, backend WeChat login configuration, and allowed server domains.
- Rebuild npm dependencies in WeChat DevTools and confirm that Vant components load correctly.
- Review the recording permission description and the recovery flow after a user denies access.
- Test login, audio preview, uploads, downloads, and video extraction on both Android and iOS devices.
- Test initial connection, automatic reconnection, disconnect prompts, audio transfer, and on-device music management with real Voice Dubbing hardware.
- Run `npm test`, then complete code quality and package-size checks before uploading.

## Troubleshooting

### Network request failed

Confirm that the phone can reach the backend and that both backend configuration values are consistent. When using a LAN address, the phone and backend must be on mutually reachable networks.

### Vant components cannot be found

Run `npm install`, then select **Build npm** in WeChat DevTools. If the issue persists, clear generated build caches in DevTools and rebuild.

### No device can be discovered or connected

Confirm that Bluetooth and system location services are enabled, the hardware is discoverable, and no other phone is connected to it. If needed, clear the `sbpyb2025` cache and search again.

### Login repeatedly fails

Confirm that the current AppID matches the backend configuration and that `/auth/wechat/login` is available. Clear `auth_token` and `openid`, then reopen the Mini Program to rule out expired local state.

### Audio is generated but cannot be played or transferred

First confirm that the returned audio URL is reachable from the phone, then check the allowed `downloadFile` domain. Device transfer also requires an active BLE connection, sufficient device storage, and a supported file format.

# Contact

Email：

📧 lihonggang@doit.am

WeChat：

![WeChat](wx.jpg)