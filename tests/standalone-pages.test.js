const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const projectRoot = path.resolve(__dirname, '..')
const nameFilter = process.argv[2] || ''
const tests = []

function test(name, run) {
  if (!nameFilter || name.toLowerCase().includes(nameFilter.toLowerCase())) {
    tests.push({ name, run })
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

async function waitFor(check, timeoutMs = 3000) {
  const startedAt = Date.now()
  while (!check()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Condition was not met within ${timeoutMs}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function createEventChannel() {
  const handlers = {}
  const emitted = []

  return {
    emitted,
    on(name, handler) {
      handlers[name] = handler
    },
    emit(name, payload) {
      emitted.push({ name, payload })
      if (handlers[name]) handlers[name](payload)
    }
  }
}

function createVoiceCatalog() {
  const home = [1, 2, 3, 4].map((id) => ({
    id,
    voice_id: `voice-${id}`,
    voice_name: `Voice ${id}`,
    audio_path: `media.local/voice-${id}.mp3`
  }))
  return { home, categories: [{ key: 'home', name: 'Home' }], voices: { home } }
}

function createPage(config, extra = {}) {
  return {
    ...config,
    ...extra,
    data: JSON.parse(JSON.stringify(config.data || {})),
    setData(values) {
      Object.assign(this.data, values)
    }
  }
}

function loadPage(relativePath, options = {}) {
  let pageConfig
  const app = options.app || { globalData: { deviceInfo: {} } }
  const eventChannel = options.eventChannel || createEventChannel()
  const navigationCalls = []
  const toastCalls = []
  const loadingCalls = []
  const uiCalls = []
  const audio = options.audio || createAudioDouble()
  let audioContextCount = 0
  const wx = {
    createInnerAudioContext: () => {
      audioContextCount += 1
      return audioContextCount === 1 ? audio : createAudioDouble()
    },
    getStorageSync: () => '',
    setStorageSync: () => {},
    hideLoading: () => {
      loadingCalls.push({ type: 'hide' })
      uiCalls.push('hideLoading')
    },
    navigateBack: () => navigationCalls.push({ type: 'back' }),
    navigateTo(navigationOptions) {
      const childChannel = createEventChannel()
      const call = { type: 'to', options: navigationOptions, eventChannel: childChannel }
      navigationCalls.push(call)
      if (navigationOptions.success) {
        navigationOptions.success({ eventChannel: childChannel })
      }
    },
    redirectTo(navigationOptions) {
      navigationCalls.push({ type: 'redirect', options: navigationOptions })
    },
    showLoading: (loadingOptions) => {
      loadingCalls.push({ type: 'show', options: loadingOptions })
      uiCalls.push('showLoading')
    },
    showToast: (toastOptions) => {
      toastCalls.push(toastOptions)
      uiCalls.push('showToast')
    },
    uploadFile: options.uploadFile || (() => {}),
    ...options.wx
  }

  const requestModule = {
    request: options.request || (async () => ({ code: 200, data: {} })),
    wechatLogin: async () => ({}),
    checkLoginStatus: () => true,
    logout: () => {},
    checkLogin: () => {},
    showToast: (icon, title) => {
      toastCalls.push({ icon, title })
      uiCalls.push('showToast')
    }
  }

  const consent = options.consent || createVoiceConsentDouble()
  const resolveShared = createModuleResolver(consent)

  const source = read(relativePath).replace(/^import .*$/gm, '')
  vm.runInNewContext(source, {
    Page(config) {
      pageConfig = config
    },
    clearTimeout,
    console: { log() {}, error() {} },
    Date,
    getApp: () => app,
    require(modulePath) {
      if (modulePath.endsWith('/utils/request') || modulePath.endsWith('utils/request')) {
        return requestModule
      }
      if (modulePath.endsWith('/utils/http_request') || modulePath.endsWith('utils/http_request')) {
        return { httpReq: {} }
      }
      const resolved = resolveShared(modulePath)
      if (resolved) return resolved
      throw new Error(`Unexpected module: ${modulePath}`)
    },
    setTimeout,
    wx
  }, { filename: relativePath })

  assert.ok(pageConfig, `${relativePath} did not call Page()`)
  const page = createPage(pageConfig, {
    getOpenerEventChannel: () => eventChannel,
    selectComponent: options.selectComponent || (() => ({ setData() {} }))
  })

  return { app, audio, consent, eventChannel, loadingCalls, navigationCalls, page, toastCalls, uiCalls, wx }
}

/**
 * 声纹授权状态的替身。
 *
 * 真模块要读 wx.setStorageSync，而这两个 load* 沙箱里的 wx 是各用例自己拼的，
 * 塞进去会让「录音闸门有没有拦住」的用例变成在测存储。
 * 所以调用点用替身测**时序**（授权问没问在开麦前面），
 * 存储语义另有一条用例直接跑真模块（见 'voice consent survives...'）。
 *
 * 默认 granted = true：老的那几条麦克风权限用例测的是麦克风流程，
 * 不该因为多了一道闸门就得改写。不给授权的路径另写用例。
 */
function createVoiceConsentDouble(granted = true) {
  const real = require('../utils/voiceConsent')
  const state = { granted, at: granted ? '2026-08-14 10:00:00' : '', grants: 0, revokes: 0 }
  return {
    state,
    module: {
      STORAGE_KEY: real.STORAGE_KEY,
      VERSION: real.VERSION,
      AGREEMENT: real.AGREEMENT,
      PAGE_PATH: real.PAGE_PATH,
      granted: () => state.granted,
      grant(at) {
        state.granted = true
        state.at = at || ''
        state.grants += 1
        return true
      },
      revoke() {
        state.granted = false
        state.at = ''
        state.revokes += 1
        return true
      },
      grantedAt: () => state.at
    }
  }
}

function createModuleResolver(consentDouble) {
  return function resolve(modulePath) {
    // 声纹授权：用替身，理由见 createVoiceConsentDouble
    if (modulePath.endsWith('utils/voiceConsent')) return consentDouble.module
    // 转发卡。用真模块而不是打桩——它是纯函数、不碰 wx，
    // 而且「转发落到哪个页面」正是这套用例该守住的东西，桩掉就测不到了。
    if (modulePath.endsWith('utils/share')) return require('../utils/share')
    return null
  }
}

function loadComponent(relativePath, wx, options = {}) {
  let componentConfig
  const source = read(relativePath)
  const consent = options.consent || createVoiceConsentDouble()
  const resolve = createModuleResolver(consent)
  vm.runInNewContext(source, {
    Component(config) {
      componentConfig = config
    },
    console: { log() {}, error() {} },
    Date,
    // 组件也会 require（比如 recorder 要拿声纹授权状态）。
    // 这个壳一开始是没有的，加 require 的那天三条用例会一起变红——
    // 这个仓库已经在「沙箱 require 白名单漏了新模块」上栽过两次了。
    require(modulePath) {
      const resolved = resolve(modulePath)
      if (resolved) return resolved
      throw new Error(`Unexpected module: ${modulePath}`)
    },
    wx
  }, { filename: relativePath })

  assert.ok(componentConfig, `${relativePath} did not call Component()`)
  const component = {
    consent,
    ...componentConfig.methods,
    data: JSON.parse(JSON.stringify(componentConfig.data || {})),
    properties: {},
    setData(values) {
      Object.assign(this.data, values)
    },
    triggerEvent() {}
  }
  return { component, componentConfig }
}

function createAudioDouble() {
  const handlers = {}
  return {
    destroyed: false,
    paused: false,
    playCount: 0,
    stopped: false,
    stopCount: 0,
    src: '',
    destroy() {
      this.destroyed = true
    },
    onEnded(handler) {
      handlers.ended = handler
    },
    onError(handler) {
      handlers.error = handler
    },
    onPause(handler) {
      handlers.pause = handler
    },
    onPlay(handler) {
      handlers.play = handler
    },
    pause() {
      this.paused = true
      if (handlers.pause) handlers.pause()
    },
    play() {
      this.playCount += 1
      if (handlers.play) handlers.play()
    },
    stop() {
      this.stopped = true
      this.stopCount += 1
    },
    trigger(name, payload) {
      if (handlers[name]) handlers[name](payload)
    }
  }
}

function createRecorderDouble(stopResult, beforeStop = () => {}) {
  const handlers = {}
  const recorder = {
    startOptions: null,
    stopped: false,
    onStart(handler) { handlers.start = handler },
    onStop(handler) { handlers.stop = handler },
    onError(handler) { handlers.error = handler },
    offStart(handler) { this.startRemoved = handler === handlers.start },
    offStop(handler) { this.stopRemoved = handler === handlers.stop },
    offError(handler) { this.errorRemoved = handler === handlers.error },
    start(options) {
      this.startOptions = options
      handlers.start()
    },
    stop() {
      this.stopped = true
      beforeStop()
      handlers.stop(stopResult)
    }
  }
  return { handlers, recorder }
}

test('home registers all standalone pages', () => {
  const appConfig = JSON.parse(read('app.json'))
  const expectedPages = [
    'pages/voiceSelect/voiceSelect',
    'pages/recorder/recorder',
    'pages/bgmSelect/bgmSelect'
  ]

  expectedPages.forEach((pagePath) => {
    assert.ok(appConfig.pages.includes(pagePath), `${pagePath} is not registered`)
  })
})

test('every page disables pull-down refresh and page scrolling', () => {
  const pendingDirectories = [path.join(projectRoot, 'pages')]
  const pageConfigPaths = []

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop()
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath)
      } else if (entry.name.endsWith('.json')) {
        pageConfigPaths.push(entryPath)
      }
    })
  }

  assert.ok(pageConfigPaths.length > 0, 'no page JSON configurations found')
  pageConfigPaths.forEach((configPath) => {
    const relativePath = path.relative(projectRoot, configPath)
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    assert.equal(config.enablePullDownRefresh, false, `${relativePath} enables pull-down refresh`)
    assert.equal(config.disableScroll, true, `${relativePath} does not disable page scrolling`)
  })
})

test('shared bottom navigation renders four tabs and redirects between pages', () => {
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, `components/bottomNav/bottomNav.${extension}`)),
      true
    )
  }

  const navigationCalls = []
  const { component, componentConfig } = loadComponent('components/bottomNav/bottomNav.js', {
    redirectTo(options) {
      navigationCalls.push(options)
    }
  })
  component.properties.active = 'voice'

  component.changeTab({ currentTarget: { dataset: { tab: 'device' } } })
  component.changeTab({ currentTarget: { dataset: { tab: 'advanced' } } })
  component.changeTab({ currentTarget: { dataset: { tab: 'mine' } } })
  component.changeTab({ currentTarget: { dataset: { tab: 'voice' } } })

  assert.deepEqual(
    navigationCalls.map((call) => call.url),
    [
      '/pages/device/device',
      '/pages/advanced/advanced',
      '/pages/mine/mine'
    ]
  )
  assert.equal(componentConfig.properties.active.value, 'voice')

  const config = JSON.parse(read('components/bottomNav/bottomNav.json'))
  const markup = read('components/bottomNav/bottomNav.wxml')
  const styles = read('components/bottomNav/bottomNav.wxss').replace(/\s+/g, '')
  assert.equal(config.component, true)
  assert.equal(config.usingComponents['van-icon'], '@vant/weapp/icon/index')
  assert.equal(markup.includes('wx:for="{{navItems}}"'), true)
  assert.equal(markup.includes('data-tab="{{item.key}}"'), true)
  assert.equal(styles.includes('grid-template-columns:repeat(4,minmax(0,1fr))'), true)
  assert.equal(styles.includes('env(safe-area-inset-bottom)'), true)
})

test('four primary pages use the shared bottom navigation component', () => {
  const pages = [
    ['index/index', 'voice'],
    ['device/device', 'device'],
    ['advanced/advanced', 'advanced'],
    ['mine/mine', 'mine']
  ]

  pages.forEach(([pagePath, active]) => {
    const config = JSON.parse(read(`pages/${pagePath}.json`))
    const markup = read(`pages/${pagePath}.wxml`)
    assert.equal(
      config.usingComponents['bottom-nav'],
      '../../components/bottomNav/bottomNav'
    )
    assert.equal(markup.includes(`<bottom-nav active="${active}" />`), true)
    assert.equal((markup.match(/<bottom-nav/g) || []).length, 1)
  })
})

test('advanced page renders six reference features and keeps its bottom navigation usable', () => {
  const { navigationCalls, page, toastCalls } = loadPage('pages/advanced/advanced.js')
  const titles = Array.from(page.data.featureItems, (item) => item.title)

  assert.deepEqual(titles, [
    '网红主播',
    '广告词制作',
    '音色转化',
    '对话配音',
    '长文本配音',
    '视频提取'
  ])

  page.openFeature({ currentTarget: { dataset: { key: 'video-extract' } } })
  assert.equal(navigationCalls.at(-1).type, 'to')
  assert.equal(navigationCalls.at(-1).options.url, '../videoExtract/videoExtract')

  page.openFeature({ currentTarget: { dataset: { key: 'dialogue' } } })
  assert.equal(toastCalls.at(-1).title, '该高级功能正在开发中')

  const markup = read('pages/advanced/advanced.wxml')
  const styles = read('pages/advanced/advanced.wxss').replace(/\s+/g, '')
  const config = JSON.parse(read('pages/advanced/advanced.json'))
  assert.equal(markup.includes('wx:for="{{featureItems}}"'), true)
  assert.equal(markup.includes('class="advancedBadge"'), true)
  assert.equal(markup.includes('<bottom-nav active="advanced" />'), true)
  assert.equal(styles.includes('.featureCard{'), true)
  assert.equal(styles.includes('.advancedTabBar{'), false)
  assert.equal(config.navigationBarTitleText, '高级功能')
  assert.equal(config.usingComponents['van-icon'], '@vant/weapp/icon/index')
})

test('advanced ad copy opens a registered four-page workflow', () => {
  const appConfig = JSON.parse(read('app.json'))
  const workflowPages = [
    'pages/adCopy/adCopy',
    'pages/adCopyCategory/adCopyCategory',
    'pages/adCopyStyle/adCopyStyle',
    'pages/adCopyResult/adCopyResult'
  ]
  workflowPages.forEach((pagePath) => {
    assert.equal(appConfig.pages.includes(pagePath), true, `${pagePath} is not registered`)
  })

  const { navigationCalls, page } = loadPage('pages/advanced/advanced.js')
  page.openFeature({ currentTarget: { dataset: { key: 'ad-copy' } } })
  assert.equal(navigationCalls.at(-1).type, 'to')
  assert.equal(navigationCalls.at(-1).options.url, '../adCopy/adCopy')
})

test('advanced video extraction opens a registered dedicated page', () => {
  const appConfig = JSON.parse(read('app.json'))
  assert.equal(appConfig.pages.includes('pages/videoExtract/videoExtract'), true)

  const { navigationCalls, page } = loadPage('pages/advanced/advanced.js')
  page.openFeature({ currentTarget: { dataset: { key: 'video-extract' } } })

  assert.equal(navigationCalls.at(-1).type, 'to')
  assert.equal(navigationCalls.at(-1).options.url, '../videoExtract/videoExtract')
})

test('advanced voice conversion opens a registered dedicated page', () => {
  const appConfig = JSON.parse(read('app.json'))
  assert.equal(appConfig.pages.includes('pages/voiceConvert/voiceConvert'), true)

  const { navigationCalls, page } = loadPage('pages/advanced/advanced.js')
  page.openFeature({ currentTarget: { dataset: { key: 'voice-convert' } } })

  assert.equal(navigationCalls.at(-1).type, 'to')
  assert.equal(navigationCalls.at(-1).options.url, '../voiceConvert/voiceConvert')
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, `pages/voiceConvert/voiceConvert.${extension}`)),
      true
    )
  }
})

test('advanced dialogue dubbing opens a registered dedicated page', () => {
  const appConfig = JSON.parse(read('app.json'))
  assert.equal(appConfig.pages.includes('pages/dialogueDubbing/dialogueDubbing'), true)

  const { navigationCalls, page } = loadPage('pages/advanced/advanced.js')
  page.openFeature({ currentTarget: { dataset: { key: 'dialogue' } } })

  assert.equal(navigationCalls.at(-1).type, 'to')
  assert.equal(navigationCalls.at(-1).options.url, '../dialogueDubbing/dialogueDubbing')
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, `pages/dialogueDubbing/dialogueDubbing.${extension}`)),
      true
    )
  }
})

test('dialogue dubbing saves backdrop edits and imports template pauses', () => {
  const { navigationCalls, page } = loadPage('pages/dialogueDubbing/dialogueDubbing.js')
  assert.equal(typeof page.openTextEditor, 'function')

  page.openTextEditor()
  assert.equal(page.data.textEditorVisible, true)
  page.onTextDraftInput({ detail: { value: 'ABCD', cursor: 2 } })
  page.closeTextEditor()
  assert.equal(page.data.textEditorVisible, false)
  assert.equal(page.data.inputText, 'ABCD')

  page.openTemplate()
  const templateCall = navigationCalls.at(-1)
  assert.equal(templateCall.options.url, '../commonTemplate/commonTemplate')
  templateCall.options.events.templateSelected({ content: 'Template copy' })
  assert.equal(page.data.inputText, 'Template copy')
  assert.equal(page.data.textDraft, 'Template copy')

  page.setData({ inputText: 'ABCD', textDraft: 'ABCD', cursorPosition: 2 })
  page.stopSet()
  page.stopSliderChange({ detail: { value: 1.5 } })
  page.stopPopConfirm()
  assert.equal(page.data.inputText, 'AB[\u505c\u987f1500ms]CD')
  assert.equal(
    page.convertPauseToBreak(page.data.inputText),
    'AB<break time="1.5s"></break>CD'
  )

  const markup = read('pages/dialogueDubbing/dialogueDubbing.wxml')
  assert.equal(markup.includes('bindtap="openTextEditor"'), true)
  assert.equal(markup.includes('bindtap="closeTextEditor"'), true)
  assert.equal(markup.includes('catchtap="noop"'), true)
  assert.equal(markup.includes('bindtap="openTemplate"'), true)
  assert.equal(markup.includes('bindtap="stopSet"'), true)
})

test('dialogue text editor stays above the iOS keyboard', () => {
  const { page } = loadPage('pages/dialogueDubbing/dialogueDubbing.js')

  assert.equal(page.data.editorKeyboardHeight, 0)
  page.openTextEditor()
  page.onTextDraftInput({ detail: { value: '\u7c98'.repeat(320), cursor: 320 } })
  assert.equal(page.data.textDraft.length, 299)
  assert.equal(page.data.cursorPosition, 299)
  page.onEditorKeyboardHeightChange({ detail: { height: 312 } })
  assert.equal(page.data.editorKeyboardHeight, 312)
  page.closeTextEditor()
  assert.equal(page.data.editorKeyboardHeight, 0)

  const markup = read('pages/dialogueDubbing/dialogueDubbing.wxml')
  assert.equal(markup.includes('bottom: {{editorKeyboardHeight}}px'), true)
  assert.equal(markup.includes('fixed="{{true}}"'), true)
  assert.equal(markup.includes('adjust-position="{{false}}"'), true)
  assert.equal(markup.includes('bindkeyboardheightchange="onEditorKeyboardHeightChange"'), true)
  assert.equal(markup.includes('maxlength="299"'), true)
  assert.equal(markup.includes('{{textDraft.length}}/299'), true)
})

test('dialogue dubbing reuses home voice effect and BGM settings', async () => {
  const requestCalls = []
  const { audio, navigationCalls, page } = loadPage('pages/dialogueDubbing/dialogueDubbing.js', {
    request: async (options) => {
      requestCalls.push(options)
      if (options.url === '/user/voices/categories') {
        return { code: 200, data: createVoiceCatalog() }
      }
      if (options.url === '/user/bgms/categories') {
        return { code: 200, data: { categories: [], bgms: {} } }
      }
      throw new Error(`Unexpected request: ${options.url}`)
    }
  })
  assert.equal(typeof page.moreVoice, 'function')

  await page.onLoad()
  assert.equal(requestCalls.some((call) => call.url === '/user/voices/categories'), true)
  assert.equal(requestCalls.some((call) => call.url === '/user/bgms/categories'), true)
  assert.equal(page.data.voiceList.length, 4)

  page.changeStreamer({ currentTarget: { id: 1 } })
  assert.equal(page.data.voiceIndex, 1)
  assert.equal(page.data.voiceCheckInfo.voice_id, page.data.voiceList[1].voice_id)
  page.moreVoice()
  const voiceCall = navigationCalls.at(-1)
  assert.equal(voiceCall.options.url, '../voiceSelect/voiceSelect')
  voiceCall.options.events.voiceSelected({ id: 88, voice_id: 'voice-88', voice_name: 'Voice 88' })
  assert.equal(page.data.voiceIndex, -1)
  assert.equal(page.data.voiceCheckInfo.voice_id, 'voice-88')

  page.musicSet()
  page.musicSliderChange({ detail: { value: 1.3 } })
  page.voiceSliderChange({ detail: { value: 1.7 } })
  assert.equal(page.data.speed, 1.3)
  assert.equal(page.data.yxVoice, 1.7)
  page.musicPopReset()
  assert.equal(page.data.speed, 1)
  assert.equal(page.data.yxVoice, 2)
  assert.equal(page.data.musicSetShow, true)
  page.musicPopConfirm()
  assert.equal(page.data.musicSetShow, false)

  page.bgmPop()
  page.showBgmList()
  const bgmCall = navigationCalls.at(-1)
  bgmCall.options.events.bgmSelected({ id: 42, name: 'BGM 42' })
  page.bmgSetConfirm({ detail: { bgm_id: 42, bgm_volume: 0.4 } })
  assert.equal(page.data.activeBgmInfo.id, 42)
  assert.equal(page.data.bgmSetDetail.bgm_volume, 0.4)
  assert.equal(page.data.bgmSetPop, false)
  page.resetBgm()
  assert.equal(Object.keys(page.data.activeBgmInfo).length, 0)
  assert.equal(Object.keys(page.data.bgmSetDetail).length, 0)

  page.onUnload()
  assert.equal(audio.destroyed, true)

  const markup = read('pages/dialogueDubbing/dialogueDubbing.wxml')
  assert.equal(markup.includes('bindtap="moreVoice"'), true)
  assert.equal(markup.includes('bindtap="musicSet"'), true)
  assert.equal(markup.includes('bindtap="bgmPop"'), true)
  assert.equal(markup.includes('<bgmset'), true)
  assert.equal(markup.includes('value="{{yxVoice}}"'), true)
  assert.equal(markup.includes('bindchange="voiceSliderChange"'), true)
  assert.equal(markup.includes('bindtap="musicPopReset"'), true)
  assert.equal(markup.includes('>还原</button>'), true)
  assert.equal(
    /<slider[\s\S]*?min="0\.5"[\s\S]*?max="2(?:\.0)?"[\s\S]*?value="{{yxVoice}}"/.test(markup),
    true
  )
})

test('dialogue and long text dubbing reuse cached catalogs and fetch missing catalogs', async () => {
  const voiceCatalog = {
    home: [{ id: 7, voice_id: 'cached-voice', voice_name: 'Cached voice' }],
    categories: [{ key: 'home', name: 'Home' }],
    voices: { home: [] }
  }
  const bgmCatalog = {
    categories: [{ key: 'music', name: 'Music' }],
    bgms: { music: [{ id: 9, name: 'Cached BGM' }] }
  }

  for (const pagePath of [
    'pages/dialogueDubbing/dialogueDubbing.js',
    'pages/longTextDubbing/longTextDubbing.js'
  ]) {
    const requestCalls = []
    const { page } = loadPage(pagePath, {
      request: async (options) => {
        requestCalls.push(options)
        throw new Error(`Unexpected request: ${options.url}`)
      },
      wx: {
        getStorageSync(key) {
          if (key === 'voiceList') return voiceCatalog
          if (key === 'bgmList') return bgmCatalog
          return ''
        }
      }
    })

    await page.onLoad()
    assert.equal(requestCalls.length, 0)
    assert.equal(page.data.voiceList[0].voice_id, 'cached-voice')
    assert.equal(page.data.voiceCheckInfo.id, 7)
    assert.equal(page.data.voiceMoreList.categories[0].key, 'home')
    assert.equal(page.data.bgmList.bgms.music[0].id, 9)
    page.onUnload()
  }

  for (const pagePath of [
    'pages/dialogueDubbing/dialogueDubbing.js',
    'pages/longTextDubbing/longTextDubbing.js'
  ]) {
    const requestCalls = []
    const storedCatalogs = {}
    const { page } = loadPage(pagePath, {
      request: async (options) => {
        requestCalls.push(options.url)
        if (options.url === '/user/voices/categories') {
          return { code: 200, data: voiceCatalog }
        }
        if (options.url === '/user/bgms/categories') {
          return { code: 200, data: bgmCatalog }
        }
        throw new Error(`Unexpected request: ${options.url}`)
      },
      wx: {
        getStorageSync: () => '',
        setStorageSync(key, value) {
          storedCatalogs[key] = value
        }
      }
    })

    await page.onLoad()
    assert.deepEqual(requestCalls.sort(), [
      '/user/bgms/categories',
      '/user/voices/categories'
    ])
    assert.equal(storedCatalogs.voiceList.home[0].id, 7)
    assert.equal(storedCatalogs.bgmList.bgms.music[0].id, 9)
    page.onUnload()
  }
})

test('home and dubbing voice cards stop the previous preview before playing the next one', () => {
  const pages = [
    ['pages/index/index.js', 'pages/index/index.wxml'],
    ['pages/dialogueDubbing/dialogueDubbing.js', 'pages/dialogueDubbing/dialogueDubbing.wxml'],
    ['pages/longTextDubbing/longTextDubbing.js', 'pages/longTextDubbing/longTextDubbing.wxml']
  ]

  for (const [pagePath, markupPath] of pages) {
    const { audio, page } = loadPage(pagePath)
    page.pageActive = true
    page.createVoicePreviewAudio()
    page.setData({
      voiceList: [
        { id: 1, audio_path: 'media.local/voice-a.mp3' },
        { id: 2, audio_path: '' },
        { id: 3, audio_path: 'http://media.local/voice-c.mp3' }
      ]
    })

    page.changeStreamer({ currentTarget: { id: '0' } })
    assert.equal(audio.stopCount, 1)
    assert.equal(audio.playCount, 1)
    assert.equal(audio.src, 'https://media.local/voice-a.mp3')

    page.changeStreamer({ currentTarget: { id: '1' } })
    assert.equal(audio.stopCount, 2)
    assert.equal(audio.playCount, 1)

    page.changeStreamer({ currentTarget: { id: '2' } })
    assert.equal(audio.stopCount, 3)
    assert.equal(audio.playCount, 2)
    assert.equal(audio.src, 'http://media.local/voice-c.mp3')

    page.onHide()
    assert.equal(audio.stopCount, 4)
    page.destroyVoicePreviewAudio()
    assert.equal(audio.destroyed, true)
    assert.equal(read(markupPath).includes('bindtap="changeStreamer"'), true)
  }
})

test('dialogue dubbing generates playable segments and enforces list movement bounds', async () => {
  const requestCalls = []
  const { audio, loadingCalls, page } = loadPage('pages/dialogueDubbing/dialogueDubbing.js', {
    request: async (options) => {
      requestCalls.push(options)
      if (options.url === '/user/voices/categories') {
        return { code: 200, data: createVoiceCatalog() }
      }
      if (options.url === '/user/bgms/categories') {
        return { code: 200, data: { categories: [], bgms: {} } }
      }
      if (options.url === '/user/tts/synthesize') {
        return {
          code: 200,
          data: {
            audio_url: 'https://media.local/segment-a.mp3',
            file_name: 'segment-a.mp3',
            file_size: 1024,
            text: options.data.text,
            voice_id: options.data.voice_id,
            duration: 2.5
          }
        }
      }
      throw new Error(`Unexpected request: ${options.url}`)
    }
  })
  assert.equal(typeof page.generateDialogue, 'function')

  await page.onLoad()
  page.setData({
    inputText: 'Hello[\u505c\u987f1000ms]world',
    speed: 1.2,
    yxVoice: 1.6,
    bgmSetDetail: { bgm_id: 42, bgm_volume: 0.4 }
  })
  await page.generateDialogue()

  const synthesizeCall = requestCalls.find((call) => call.url === '/user/tts/synthesize')
  assert.equal(synthesizeCall.method, 'POST')
  assert.equal(synthesizeCall.needAuth, true)
  assert.equal(
    synthesizeCall.data.text,
    '<speak>Hello<break time="1.0s"></break>world</speak>'
  )
  assert.equal(synthesizeCall.data.voice_id, page.data.voiceList[0].voice_id)
  assert.equal(synthesizeCall.data.speed_ratio, 1.2)
  assert.equal(synthesizeCall.data.volume_ratio, 1.6)
  assert.equal(synthesizeCall.data.pitch_ratio, 1)
  assert.equal(synthesizeCall.data.bgm_id, 42)
  assert.equal(synthesizeCall.data.bgm_volume, 0.4)
  assert.equal(page.data.dialogueList.length, 1)
  assert.equal(page.data.dialogueList[0].text, 'Hello[\u505c\u987f1000ms]world')
  assert.equal(page.data.dialogueList[0].audio_url, 'https://media.local/segment-a.mp3')
  assert.equal(page.data.dialogueList[0].voiceName, page.data.voiceList[0].voice_name)
  assert.equal(page.data.dialogueList[0].avatar, '/img/streamer1.jpg')
  assert.equal(loadingCalls.at(-2).type, 'show')
  assert.equal(loadingCalls.at(-1).type, 'hide')

  const generated = page.data.dialogueList[0]
  page.playDialogue({ currentTarget: { dataset: { id: generated.localId } } })
  assert.equal(audio.src, generated.audio_url)
  assert.equal(page.data.playingDialogueId, generated.localId)
  page.playDialogue({ currentTarget: { dataset: { id: generated.localId } } })
  assert.equal(audio.paused, true)

  page.setData({
    dialogueList: [
      { localId: 'a', audio_url: 'https://media.local/a.mp3' },
      { localId: 'b', audio_url: 'https://media.local/b.mp3' },
      { localId: 'c', audio_url: 'https://media.local/c.mp3' }
    ]
  })
  page.moveDialogue({ currentTarget: { dataset: { index: 0, direction: -1 } } })
  assert.deepEqual(Array.from(page.data.dialogueList, (item) => item.localId), ['a', 'b', 'c'])
  page.moveDialogue({ currentTarget: { dataset: { index: 0, direction: 1 } } })
  assert.deepEqual(Array.from(page.data.dialogueList, (item) => item.localId), ['b', 'a', 'c'])
  page.moveDialogue({ currentTarget: { dataset: { index: 2, direction: 1 } } })
  assert.deepEqual(Array.from(page.data.dialogueList, (item) => item.localId), ['b', 'a', 'c'])
  page.deleteDialogue({ currentTarget: { dataset: { index: 1 } } })
  assert.deepEqual(Array.from(page.data.dialogueList, (item) => item.localId), ['b', 'c'])
  page.onUnload()

  const markup = read('pages/dialogueDubbing/dialogueDubbing.wxml')
  assert.equal(markup.includes('bindtap="playDialogue"'), true)
  assert.equal(markup.includes('bindtap="deleteDialogue"'), true)
  assert.equal(markup.includes('index > 0'), true)
  assert.equal(markup.includes('index < dialogueList.length - 1'), true)
  assert.equal(markup.includes('data-direction="-1"'), true)
  assert.equal(markup.includes('data-direction="1"'), true)
})

test('dialogue page only pauses audio while a segment is playing', () => {
  const { audio, page } = loadPage('pages/dialogueDubbing/dialogueDubbing.js')

  page.onLoad()
  page.onHide()
  assert.equal(audio.paused, false)

  page.setData({ playingDialogueId: 'segment-a' })
  page.onHide()
  assert.equal(audio.paused, true)
  page.onUnload()
})

test('dialogue audio errors are only reported during active playback', () => {
  const { audio, page, toastCalls } = loadPage('pages/dialogueDubbing/dialogueDubbing.js')

  page.onLoad()
  audio.trigger('error', new Error('idle context interrupted'))
  assert.equal(toastCalls.length, 0)

  page.setData({ playingDialogueId: 'segment-a' })
  audio.trigger('error', new Error('active playback failed'))
  assert.equal(toastCalls.at(-1).title, '对话音频播放失败')

  page.onUnload()
  assert.doesNotThrow(() => audio.trigger('error', new Error('late destroy callback')))
  assert.equal(toastCalls.length, 1)
})

test('dialogue dubbing merges ordered downloaded audio files and opens the result', async () => {
  const app = { globalData: {} }
  const downloadedUrls = []
  let mergeCall
  const { loadingCalls, navigationCalls, page } = loadPage(
    'pages/dialogueDubbing/dialogueDubbing.js',
    {
      app,
      request: async (options) => {
        if (options.url === '/user/voices/categories') {
          return { code: 200, data: createVoiceCatalog() }
        }
        if (options.url === '/user/bgms/categories') {
          return { code: 200, data: { categories: [], bgms: {} } }
        }
        if (options.url === '/user/tts/merge-audio') {
          mergeCall = options
          return {
            code: 200,
            data: {
              audio_url: 'https://media.local/merged.mp3',
              file_name: 'merged.mp3',
              file_size: 4096,
              duration: 5.5
            }
          }
        }
        throw new Error(`Unexpected request: ${options.url}`)
      },
      wx: {
        downloadFile(options) {
          downloadedUrls.push(options.url)
          const index = downloadedUrls.length
          options.success({ statusCode: 200, tempFilePath: `wxfile://segment-${index}.mp3` })
          return { abort() {} }
        },
        getFileSystemManager() {
          return {
            readFile(options) {
              const index = options.filePath.includes('segment-1') ? 1 : 2
              options.success({ data: Uint8Array.from([index, index + 10]).buffer })
            }
          }
        }
      }
    }
  )
  assert.equal(typeof page.mergeDialogues, 'function')

  await page.onLoad()
  page.setData({
    dialogueList: [
      { localId: 'a', audio_url: 'https://media.local/a.mp3' },
      { localId: 'b', audio_url: 'https://media.local/b.mp3' }
    ],
    speed: 1.4,
    bgmSetDetail: {
      bgm_id: 42,
      bgm_volume: 0.35,
      bgm_ducking: 'reduce',
      voice_delay: 2,
      bgm_tail: 3
    }
  })
  await page.mergeDialogues()

  assert.deepEqual(downloadedUrls, [
    'https://media.local/a.mp3',
    'https://media.local/b.mp3'
  ])
  assert.equal(mergeCall.method, 'POST')
  assert.equal(mergeCall.url, '/user/tts/merge-audio')
  assert.equal(mergeCall.needAuth, true)
  assert.equal(mergeCall.header['Content-Type'].startsWith('multipart/form-data; boundary='), true)
  const bodyText = Buffer.from(mergeCall.data).toString('latin1')
  assert.equal((bodyText.match(/name="audio_files"/g) || []).length, 2)
  assert.equal(bodyText.includes('filename="dialogue-1.mp3"'), true)
  assert.equal(bodyText.includes('filename="dialogue-2.mp3"'), true)
  assert.equal(bodyText.includes('name="speed_ratio"\r\n\r\n1'), true)
  assert.equal(bodyText.includes('name="speed_ratio"\r\n\r\n1.4'), false)
  assert.equal(bodyText.includes('name="bgm_id"\r\n\r\n42'), true)
  assert.equal(bodyText.includes('name="bgm_volume"\r\n\r\n0.35'), true)
  assert.equal(bodyText.includes('name="bgm_ducking"\r\n\r\nreduce'), true)
  assert.equal(app.globalData.generate.audio_url, 'https://media.local/merged.mp3')
  assert.equal(navigationCalls.at(-1).options.url, '../generate/generate')
  assert.equal(loadingCalls.at(-2).type, 'show')
  assert.equal(loadingCalls.at(-1).type, 'hide')
  page.onUnload()
})

test('dialogue dubbing shows usage steps while the dialogue list is empty', () => {
  const markup = read('pages/dialogueDubbing/dialogueDubbing.wxml')
  const styles = read('pages/dialogueDubbing/dialogueDubbing.wxss')

  assert.equal(markup.includes('<view class="usageGuide" wx:else>'), true)
  assert.equal(markup.includes('\u4f7f\u7528\u6b65\u9aa4'), true)
  assert.equal(markup.includes('1. \u8f93\u5165\u6587\u5b57'), true)
  assert.equal(markup.includes('2. \u9009\u62e9\u4e3b\u64ad'), true)
  assert.equal(markup.includes('3. \u70b9\u51fb\u53d1\u9001'), true)
  assert.equal(markup.includes('4. \u70b9\u51fb\u5408\u6210'), true)
  assert.equal(markup.includes('5. \u4f7f\u7528\u7bad\u5934'), true)
  assert.equal(markup.includes('\u6682\u65e0\u5bf9\u8bdd'), false)
  assert.equal(styles.includes('.usageGuide'), true)
})

test('voice conversion loads timbres with mapped types and a default avatar', async () => {
  const requestCalls = []
  const { audio, page } = loadPage('pages/voiceConvert/voiceConvert.js', {
    request: async (options) => {
      requestCalls.push(options)
      return {
        code: 200,
        data: [
          { id: 1, name: 'Voice A', timbre_type: 'male', avatar_url: '', audio_url: '' },
          { id: 2, name: 'Voice B', timbre_type: 'female', avatar_url: 'https://media.local/b.jpg', audio_url: 'media.local/b.mp3' },
          { id: 3, name: 'Voice C', timbre_type: 'original', avatar_url: null, audio_url: 'http://media.local/c.mp3' }
        ]
      }
    }
  })

  assert.equal(typeof page.onLoad, 'function')
  await page.onLoad()

  assert.equal(requestCalls[0].url, '/voice-timbre/')
  assert.equal(requestCalls[0].method, 'GET')
  assert.equal(requestCalls[0].data.page, 1)
  assert.equal(requestCalls[0].data.page_size, 100)
  assert.equal(requestCalls[0].needAuth, false)
  assert.deepEqual(Array.from(page.data.timbres, (item) => item.typeLabel), [
    '\u7537\u58f0',
    '\u5973\u58f0',
    '\u539f\u58f0'
  ])
  assert.equal(page.data.timbres[0].displayAvatar, '../../img/streamer1.jpg')
  assert.equal(page.data.timbres[1].displayAvatar, 'https://media.local/b.jpg')
  assert.equal(page.data.timbres[2].displayAvatar, '../../img/streamer1.jpg')
  assert.equal(page.data.selectedTimbreId, 1)
  page.selectTimbre({ currentTarget: { dataset: { id: 2 } } })
  assert.equal(page.data.selectedTimbreId, 2)
  assert.equal(audio.stopCount, 1)
  assert.equal(audio.playCount, 1)
  assert.equal(audio.src, 'https://media.local/b.mp3')
  page.selectTimbre({ currentTarget: { dataset: { id: 3 } } })
  assert.equal(audio.stopCount, 2)
  assert.equal(audio.playCount, 2)
  assert.equal(audio.src, 'http://media.local/c.mp3')
  page.selectTimbre({ currentTarget: { dataset: { id: 1 } } })
  assert.equal(audio.stopCount, 3)
  assert.equal(audio.playCount, 2)
  page.onHide()
  assert.equal(audio.stopCount, 4)

  const markup = read('pages/voiceConvert/voiceConvert.wxml')
  assert.equal(markup.includes('wx:for="{{timbres}}"'), true)
  assert.equal(markup.includes('bindtap="selectTimbre"'), true)
  assert.equal(markup.includes('src="{{item.displayAvatar}}"'), true)
  assert.equal(markup.includes('{{item.name}}'), true)
  assert.equal(markup.includes('{{item.typeLabel}}'), true)
  page.onUnload()
  assert.equal(audio.destroyed, true)
})

test('voice conversion uploads recording, polls the task, and opens generate', async () => {
  const app = { globalData: { generate: { source: 'voice-convert' } } }
  const lifecycle = []
  let uploadOptions
  let pollCount = 0
  const { recorder } = createRecorderDouble({
    tempFilePath: 'wxfile://voice-convert.mp3',
    duration: 11000,
    fileSize: 4096
  }, () => lifecycle.push('recorder-stop'))
  const { navigationCalls, page } = loadPage(
    'pages/voiceConvert/voiceConvert.js',
    {
      app,
      request: async (options) => {
        if (options.url === '/voice-timbre/') {
          return {
            code: 200,
            data: [{ id: 7, name: 'Voice A', timbre_type: 'male', avatar_url: '' }]
          }
        }
        if (options.url === '/user/voice-conversion/81') {
          pollCount += 1
          return pollCount === 1
            ? { code: 200, data: { task_id: 81, status: 'processing', progress: 45 } }
            : {
                code: 200,
                data: {
                  task_id: 81,
                  status: 'success',
                  progress: 100,
                  audio_url: 'https://media.local/converted.mp3'
                }
              }
        }
        throw new Error(`Unexpected request: ${options.url}`)
      },
      uploadFile(options) {
        uploadOptions = options
        return { abort() { lifecycle.push('upload-abort') } }
      },
      wx: {
        getRecorderManager: () => recorder,
        getStorageSync: () => 'voice-convert-token',
        showLoading() { lifecycle.push('show-loading') },
        hideLoading() { lifecycle.push('hide-loading') }
      }
    }
  )
  page.waitForNextPoll = async () => {}

  assert.equal(typeof page.startRecording, 'function')
  await page.onLoad()
  page.openBgmSelect()
  const bgmNavigation = navigationCalls.at(-1)
  assert.equal(bgmNavigation.options.url, '../bgmSelect/bgmSelect')
  bgmNavigation.options.events.bgmSelected({ id: 9, name: 'Soft music' })
  page.bmgSetConfirm({
    detail: {
      bgm_id: 9,
      bgm_volume: 0.4,
      bgm_ducking: 'reduce',
      voice_delay: 2,
      bgm_tail: 3
    }
  })
  page.changeSpeed({ detail: { value: 1.2 } })
  page.changeVolume({ detail: { value: 1.4 } })

  page.startRecording()
  assert.equal(page.data.recording, true)
  assert.equal(recorder.startOptions.duration, 180000)
  assert.equal(recorder.startOptions.format, 'mp3')
  page.stopRecording()

  assert.equal(recorder.stopped, true)
  assert.deepEqual(lifecycle.slice(0, 2), ['show-loading', 'recorder-stop'])
  assert.equal(page.data.recording, false)
  assert.equal(page.data.pendingUpload.filePath, 'wxfile://voice-convert.mp3')
  assert.equal(page.data.pendingUpload.name, 'audio_file')
  assert.equal(page.data.pendingUpload.duration, 11000)
  assert.equal(page.data.pendingUpload.fileSize, 4096)
  assert.equal(uploadOptions.url, 'http://192.168.5.245:9000/api/v1/user/voice-conversion')
  assert.equal(uploadOptions.filePath, 'wxfile://voice-convert.mp3')
  assert.equal(uploadOptions.name, 'audio_file')
  assert.equal(uploadOptions.formData.voice_timbre_id, 7)
  assert.equal(uploadOptions.formData.timbre_id, undefined)
  assert.equal(uploadOptions.formData.speed, 1.2)
  assert.equal(uploadOptions.formData.volume, 1.4)
  assert.equal(uploadOptions.formData.bgm_id, 9)
  assert.equal(uploadOptions.formData.bgm_volume, 0.4)
  assert.equal(uploadOptions.header.Authorization.startsWith('Bearer '), true)

  uploadOptions.success({
    statusCode: 200,
    data: JSON.stringify({ code: 200, data: { task_id: 81, status: 'pending' } })
  })
  await waitFor(() => navigationCalls.some((call) => call.options.url === '../generate/generate'))

  assert.equal(pollCount, 2)
  assert.equal(app.globalData.generate.source, 'voice-convert')
  assert.equal(app.globalData.generate.audio_url, 'https://media.local/converted.mp3')
  assert.equal(page.data.uploading, false)
  assert.equal(lifecycle.at(-1), 'hide-loading')

  page.onUnload()
  assert.equal(recorder.startRemoved, true)
  assert.equal(recorder.stopRemoved, true)
  assert.equal(recorder.errorRemoved, true)

  const markup = read('pages/voiceConvert/voiceConvert.wxml')
  assert.equal(markup.includes('bindtap="startRecording"'), true)
  assert.equal(markup.includes('bindtap="stopRecording"'), true)
  assert.equal(markup.includes('bindchange="changeSpeed"'), true)
  assert.equal(markup.includes('bindchange="changeVolume"'), true)
  assert.equal(markup.includes('/img/recorder.gif'), true)
})

test('voice conversion reports task creation failure and hides loading', async () => {
  let uploadOptions
  const lifecycle = []
  const { recorder } = createRecorderDouble({ tempFilePath: 'wxfile://failed.mp3' })
  const { page, toastCalls } = loadPage('pages/voiceConvert/voiceConvert.js', {
    request: async () => ({
      code: 200,
      data: [{ id: 7, name: 'Voice A', timbre_type: 'male', avatar_url: '' }]
    }),
    uploadFile(options) {
      uploadOptions = options
      return { abort() {} }
    },
    wx: {
      getRecorderManager: () => recorder,
      showLoading() { lifecycle.push('show') },
      hideLoading() { lifecycle.push('hide') }
    }
  })

  await page.onLoad()
  page.startRecording()
  page.stopRecording()
  uploadOptions.success({
    statusCode: 200,
    data: JSON.stringify({ code: 400, message: '创建转换任务失败', data: null })
  })
  await waitFor(() => toastCalls.length > 0)

  assert.equal(toastCalls.at(-1).title, '创建转换任务失败')
  assert.equal(page.data.uploading, false)
  assert.equal(lifecycle.at(-1), 'hide')
  page.onUnload()
})

test('voice conversion reports a failed polled task and hides loading', async () => {
  let uploadOptions
  const lifecycle = []
  const { recorder } = createRecorderDouble({ tempFilePath: 'wxfile://poll-failed.mp3' })
  const { navigationCalls, page, toastCalls } = loadPage('pages/voiceConvert/voiceConvert.js', {
    request: async (options) => {
      if (options.url === '/voice-timbre/') {
        return {
          code: 200,
          data: [{ id: 7, name: 'Voice A', timbre_type: 'male', avatar_url: '' }]
        }
      }
      if (options.url === '/user/voice-conversion/82') {
        return {
          code: 200,
          data: { task_id: 82, status: 'failed', progress: 60, error_message: '转换服务处理失败' }
        }
      }
      throw new Error(`Unexpected request: ${options.url}`)
    },
    uploadFile(options) {
      uploadOptions = options
      return { abort() {} }
    },
    wx: {
      getRecorderManager: () => recorder,
      showLoading() { lifecycle.push('show') },
      hideLoading() { lifecycle.push('hide') }
    }
  })

  await page.onLoad()
  page.startRecording()
  page.stopRecording()
  uploadOptions.success({
    statusCode: 200,
    data: JSON.stringify({ code: 200, data: { task_id: 82, status: 'pending' } })
  })
  await waitFor(() => toastCalls.length > 0)

  assert.equal(toastCalls.at(-1).title, '转换服务处理失败')
  assert.equal(navigationCalls.some((call) => call.options.url === '../generate/generate'), false)
  assert.equal(page.data.uploading, false)
  assert.equal(lifecycle.at(-1), 'hide')
  page.onUnload()
})

test('voice conversion sliders use the required ranges and speed precision', () => {
  const { page } = loadPage('pages/voiceConvert/voiceConvert.js')
  assert.equal(page.data.speedDisplay, '1.0')

  page.changeSpeed({ detail: { value: 1.26 } })
  assert.equal(page.data.speed, 1.3)
  assert.equal(page.data.speedDisplay, '1.3')
  page.changeSpeed({ detail: { value: 0.5 } })
  assert.equal(page.data.speedDisplay, '0.5')

  const markup = read('pages/voiceConvert/voiceConvert.wxml')
  const speedSlider = markup.match(/<slider[\s\S]*?bindchange="changeSpeed"[\s\S]*?\/>/)[0]
  const volumeSlider = markup.match(/<slider[\s\S]*?bindchange="changeVolume"[\s\S]*?\/>/)[0]
  assert.equal(speedSlider.includes('min="0.5"'), true)
  assert.equal(speedSlider.includes('max="2"'), true)
  assert.equal(speedSlider.includes('step="0.1"'), true)
  assert.equal(volumeSlider.includes('min="0.5"'), true)
  assert.equal(volumeSlider.includes('max="2"'), true)
  assert.equal(volumeSlider.includes('step="0.1"'), true)
})

test('voice conversion uses the same BGM settings flow as home', async () => {
  const { navigationCalls, page } = loadPage('pages/voiceConvert/voiceConvert.js', {
    request: async () => ({
      code: 200,
      data: [{ id: 7, name: 'Voice A', timbre_type: 'male', avatar_url: '' }]
    })
  })

  assert.equal(typeof page.bgmPop, 'function')
  await page.onLoad()
  page.bgmPop()
  assert.equal(page.data.bgmSetPop, true)

  page.showBgmList()
  const bgmCall = navigationCalls.at(-1)
  assert.equal(bgmCall.options.url, '../bgmSelect/bgmSelect')
  assert.equal(bgmCall.eventChannel.emitted[0].payload.activeBgmId, 0)
  bgmCall.options.events.bgmSelected({ id: 9, name: 'Soft music' })
  assert.equal(page.data.selectedBgm.id, 9)

  page.bmgSetConfirm({
    detail: {
      bgm_id: 9,
      bgm_volume: 0.4,
      bgm_ducking: 'reduce',
      voice_delay: 2,
      bgm_tail: 3
    }
  })
  assert.equal(page.data.bgmSetPop, false)
  assert.equal(page.data.bgmSetDetail.bgm_volume, 0.4)

  page.prepareUpload({ tempFilePath: 'wxfile://voice.mp3' })
  assert.equal(page.data.pendingUpload.formData.bgm_id, 9)
  assert.equal(page.data.pendingUpload.formData.bgm_volume, 0.4)
  assert.equal(page.data.pendingUpload.formData.bgm_ducking, 'reduce')
  assert.equal(page.data.pendingUpload.formData.voice_delay, 2)
  assert.equal(page.data.pendingUpload.formData.bgm_tail, 3)

  page.resetBgm()
  assert.equal(Object.keys(page.data.selectedBgm).length, 0)
  assert.equal(Object.keys(page.data.bgmSetDetail).length, 0)
  page.onUnload()

  const markup = read('pages/voiceConvert/voiceConvert.wxml')
  const config = JSON.parse(read('pages/voiceConvert/voiceConvert.json'))
  assert.equal(markup.includes('bindtap="bgmPop"'), true)
  assert.equal(markup.includes('<bgmset'), true)
  assert.equal(markup.includes('bind:showBgmList="showBgmList"'), true)
  assert.equal(markup.includes('bind:resetBgm="resetBgm"'), true)
  assert.equal(markup.includes('bind:bmgSetConfirm="bmgSetConfirm"'), true)
  assert.equal(config.usingComponents.bgmset, '../../components/bgmSet/bgmSet')
  assert.equal(config.usingComponents['van-popup'], '@vant/weapp/popup/index')
})

test('video extraction uploads a chat video and opens generate with the converted audio', async () => {
  const app = { globalData: { generate: { source: 'video' } } }
  let chooseOptions
  let uploadEntry
  const { navigationCalls, page } = loadPage('pages/videoExtract/videoExtract.js', {
    app,
    uploadFile(options) {
      uploadEntry = { options, progressHandler: null, aborted: false }
      return {
        abort() {
          uploadEntry.aborted = true
        },
        onProgressUpdate(handler) {
          uploadEntry.progressHandler = handler
        }
      }
    },
    wx: {
      chooseMessageFile(options) {
        chooseOptions = options
        options.success({
          tempFiles: [{ name: 'Promotion.mp4', path: 'wxfile://promotion.mp4', size: 4096 }]
        })
      }
    }
  })

  assert.equal(typeof page.extractVideo, 'function')
  page.onLoad()
  const extractionPromise = page.extractVideo()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(chooseOptions.count, 1)
  assert.equal(chooseOptions.type, 'video')
  assert.equal(uploadEntry.options.url, 'http://192.168.5.245:9000/api/v1/video2mp3')
  assert.equal(uploadEntry.options.filePath, 'wxfile://promotion.mp4')
  assert.equal(uploadEntry.options.name, 'file')
  assert.equal(page.data.processing, true)

  uploadEntry.progressHandler({ progress: 46 })
  assert.equal(page.data.progress, 46)
  uploadEntry.options.success({
    statusCode: 200,
    data: JSON.stringify({
      code: 200,
      data: { download_path: '/downloads/promotion.mp3' }
    })
  })
  await extractionPromise

  assert.equal(app.globalData.generate.audio_url, 'http://192.168.5.245:9000/downloads/promotion.mp3')
  assert.equal(app.globalData.generate.file_name, 'promotion.mp3')
  assert.equal(navigationCalls.at(-1).type, 'redirect')
  assert.equal(navigationCalls.at(-1).options.url, '../generate/generate')

  const markup = read('pages/videoExtract/videoExtract.wxml')
  const styles = read('pages/videoExtract/videoExtract.wxss').replace(/\s+/g, '')
  assert.equal(markup.includes('bindtap="extractVideo"'), true)
  assert.equal(markup.includes('name="video-o"'), true)
  assert.equal(markup.includes('使用步骤'), true)
  assert.equal(markup.includes('{{progress}}%'), true)
  assert.equal(styles.includes('linear-gradient('), true)
})

test('video extraction ignores the chat timestamp and reads the real video duration', async () => {
  let uploadCalls = 0
  let videoInfoOptions
  const app = { globalData: { generate: {} } }
  const { navigationCalls, page, toastCalls } = loadPage('pages/videoExtract/videoExtract.js', {
    app,
    uploadFile(options) {
      uploadCalls += 1
      options.success({
        statusCode: 200,
        data: JSON.stringify({ code: 200, data: { download_path: '/downloads/short.mp3' } })
      })
      return { abort() {}, onProgressUpdate() {} }
    },
    wx: {
      chooseMessageFile(options) {
        options.success({
          tempFiles: [{ name: 'Short.mp4', path: 'wxfile://short.mp4', time: 1720000000000 }]
        })
      },
      getVideoInfo(options) {
        videoInfoOptions = options
        options.success({ duration: 11 })
      }
    }
  })

  page.onLoad()
  await page.extractVideo()

  assert.equal(uploadCalls, 1)
  assert.equal(videoInfoOptions.src, 'wxfile://short.mp4')
  assert.equal(toastCalls.some((item) => item.title === '视频时长不能超过6分钟'), false)
  assert.equal(navigationCalls.at(-1).options.url, '../generate/generate')
})

test('ad copy category and style pages load all pages and return a selection', async () => {
  const definitions = [
    {
      pagePath: 'pages/adCopyCategory/adCopyCategory.js',
      apiPath: '/ad-categories',
      eventName: 'adCategorySelected',
      markupPath: 'pages/adCopyCategory/adCopyCategory.wxml'
    },
    {
      pagePath: 'pages/adCopyStyle/adCopyStyle.js',
      apiPath: '/ad-styles',
      eventName: 'adStyleSelected',
      markupPath: 'pages/adCopyStyle/adCopyStyle.wxml'
    }
  ]

  for (const definition of definitions) {
    const requestCalls = []
    const { eventChannel, navigationCalls, page } = loadPage(definition.pagePath, {
      request: async (options) => {
        requestCalls.push(options)
        const pageNumber = options.data.page
        return {
          code: pageNumber === 1 ? '200' : 200,
          data: [{ id: pageNumber, name: `Option ${pageNumber}`, description: `Description ${pageNumber}` }],
          total_pages: 2
        }
      }
    })

    await page.onLoad()
    assert.deepEqual(Array.from(requestCalls, (call) => call.url), [definition.apiPath, definition.apiPath])
    assert.deepEqual(Array.from(requestCalls, (call) => call.data.page), [1, 2])
    assert.equal(requestCalls.every((call) => call.data.page_size === 100), true)
    assert.equal(requestCalls.every((call) => call.needAuth === false), true)
    assert.equal(page.data.options.length, 2)

    page.selectOption({ currentTarget: { dataset: { id: 2 } } })
    assert.equal(eventChannel.emitted.at(-1).name, definition.eventName)
    assert.equal(eventChannel.emitted.at(-1).payload.id, 2)
    assert.equal(navigationCalls.at(-1).type, 'back')

    const markup = read(definition.markupPath)
    assert.equal(markup.includes('wx:for="{{options}}"'), true)
    assert.equal(markup.includes('{{item.description}}'), true)
  }
})

test('ad copy form collects valid generation parameters', async () => {
  const requestCalls = []
  const { navigationCalls, page, toastCalls } = loadPage('pages/adCopy/adCopy.js', {
    request: async (options) => {
      requestCalls.push(options)
      return {
        code: '200',
        data: [
          { label: '中文（接口）', value: 'zh' },
          { label: '英文（接口）', value: 'en' }
        ]
      }
    },
    wx: {
      getClipboardData(options) {
        options.success({ data: 'Clipboard keywords' })
      }
    }
  })

  await page.onLoad()
  assert.equal(requestCalls[0].url, '/ad-languages')
  assert.equal(requestCalls[0].method, 'GET')
  assert.equal(requestCalls[0].needAuth, false)
  assert.equal(page.data.languageOptions[1].label, '英文（接口）')
  assert.equal(page.data.languageName, '中文（接口）')
  page.generateCopy()
  assert.equal(toastCalls.at(-1).title, '请输入关键词描述')

  await page.pasteKeywords()
  assert.equal(page.data.keywords, 'Clipboard keywords')

  page.openCategory()
  const categoryCall = navigationCalls.at(-1)
  assert.equal(categoryCall.options.url, '../adCopyCategory/adCopyCategory')
  categoryCall.options.events.adCategorySelected({ id: 11, name: 'Food' })
  assert.equal(page.data.categoryId, 11)
  assert.equal(page.data.categoryName, 'Food')

  page.openStyle()
  const styleCall = navigationCalls.at(-1)
  assert.equal(styleCall.options.url, '../adCopyStyle/adCopyStyle')
  styleCall.options.events.adStyleSelected({ id: 22, name: 'Promotion' })
  assert.equal(page.data.styleId, 22)
  assert.equal(page.data.styleName, 'Promotion')

  page.openWordPopup()
  assert.equal(page.data.wordPopupVisible, true)
  page.selectWordCount({ currentTarget: { dataset: { value: 300 } } })
  assert.equal(page.data.maxWords, 300)
  assert.equal(page.data.wordPopupVisible, false)

  page.openLanguagePopup()
  page.selectLanguage({ currentTarget: { dataset: { value: 'en' } } })
  assert.equal(page.data.language, 'en')
  assert.equal(page.data.languageName, '英文（接口）')

  page.generateCopy()
  const resultCall = navigationCalls.at(-1)
  assert.equal(resultCall.options.url, '../adCopyResult/adCopyResult')
  assert.equal(resultCall.eventChannel.emitted.at(-1).name, 'initAdCopyResult')
  assert.deepEqual({ ...resultCall.eventChannel.emitted.at(-1).payload.params }, {
    category_id: 11,
    style_id: 22,
    keywords: 'Clipboard keywords',
    language: 'en',
    max_words: 300
  })

  page.clearKeywords()
  page.resetOptions()
  assert.equal(page.data.keywords, '')
  assert.equal(page.data.categoryId, 0)
  assert.equal(page.data.styleId, 0)
  assert.equal(page.data.maxWords, 100)
  assert.equal(page.data.language, 'zh')

  const markup = read('pages/adCopy/adCopy.wxml')
  assert.equal(markup.includes('bindtap="openCategory"'), true)
  assert.equal(markup.includes('bindtap="openStyle"'), true)
  assert.equal(markup.includes('show="{{wordPopupVisible}}"'), true)
  assert.equal(markup.includes('show="{{languagePopupVisible}}"'), true)
  assert.equal(markup.includes('bindtap="generateCopy"'), true)
})

test('ad copy result accepts a completed event-stream response from the ordinary request', () => {
  const { page } = loadPage('pages/adCopyResult/adCopyResult.js')
  const response = [
    'event: meta',
    'data: {"ad_create_id":7,"created_at":"2026-08-07T07:26:33","language":"zh","max_words":10}',
    '',
    'event: delta',
    'data: {"text":"限时抢购"}',
    '',
    'event: delta',
    'data: {"text":"，低至五折！"}',
    '',
    'event: done',
    'data: {"ad_create_id":7,"actual_words":10,"over_limit":false,"full_content":"限时抢购，低至五折！"}',
    ''
  ].join('\n')

  assert.deepEqual({ ...page.parseAdCopyResponse(response) }, {
    content: '限时抢购，低至五折！',
    actualWords: 10
  })
})

test('ad copy result uses a complete JSON response and supports regenerate copy save and voice-home actions', async () => {
  const app = { globalData: { deviceInfo: {} } }
  const clipboardCalls = []
  const reLaunchCalls = []
  const requestCalls = []
  let generation = 0
  const params = {
    category_id: 11,
    style_id: 22,
    keywords: 'Summer sale',
    language: 'en',
    max_words: 100
  }
  const { eventChannel, navigationCalls, page, toastCalls } = loadPage(
    'pages/adCopyResult/adCopyResult.js',
    {
      app,
      request: async (options) => {
        requestCalls.push(options)
        if (options.url === '/user/ad-create') {
          generation += 1
          const content = generation === 1 ? 'Generated copy' : 'Regenerated copy'
          return {
            code: '200',
            data: {
              full_content: content,
              actual_words: content.length
            }
          }
        }
        if (options.url === '/user/my-templates') {
          return { code: '200', data: { id: 31, content: options.data.content } }
        }
        throw new Error(`Unexpected request: ${options.url}`)
      },
      wx: {
        setClipboardData(options) {
          clipboardCalls.push(options.data)
          options.success()
        },
        reLaunch(options) {
          reLaunchCalls.push(options)
        }
      }
    }
  )

  page.onLoad()
  eventChannel.emit('initAdCopyResult', { params })
  await waitFor(() => page.data.generating === false)

  assert.equal(requestCalls.length, 1)
  const createCall = requestCalls[0]
  assert.equal(createCall.url, '/user/ad-create')
  assert.equal(createCall.method, 'POST')
  assert.equal(createCall.needAuth, true)
  assert.deepEqual({ ...createCall.data }, params)
  assert.equal(page.data.content, 'Generated copy')
  assert.equal(page.data.actualWords, 14)

  await page.regenerate()
  assert.equal(page.data.content, 'Regenerated copy')
  page.changeFontSize({ currentTarget: { dataset: { size: 'large' } } })
  assert.equal(page.data.fontSize, 'large')

  await page.copyResult()
  assert.equal(clipboardCalls.at(-1), 'Regenerated copy')
  assert.equal(toastCalls.at(-1).title, '复制成功')

  await page.saveToTemplates()
  const saveCall = requestCalls.at(-1)
  assert.equal(saveCall.url, '/user/my-templates')
  assert.equal(saveCall.method, 'POST')
  assert.equal(saveCall.needAuth, true)
  assert.equal(saveCall.data.content, 'Regenerated copy')
  assert.equal(navigationCalls.at(-1).type, 'redirect')
  assert.equal(navigationCalls.at(-1).options.url, '../commonTemplate/commonTemplate?category=mine')

  page.copyToVoiceHome()
  assert.equal(app.globalData.pendingVoiceText, 'Regenerated copy')
  assert.equal(reLaunchCalls.at(-1).url, '../index/index')

  const markup = read('pages/adCopyResult/adCopyResult.wxml')
  assert.equal(markup.includes('wx:if="{{generating && !content}}"'), true)
  assert.equal(markup.includes('bindtap="regenerate"'), true)
  assert.equal(markup.includes('bindtap="copyResult"'), true)
  assert.equal(markup.includes('bindtap="copyToVoiceHome"'), true)
  assert.equal(markup.includes('bindtap="saveToTemplates"'), true)
})

test('saved ad copy opens my templates and voice-home copy fills the text input', async () => {
  const template = { id: 41, content: 'Saved ad copy' }
  const app = { globalData: { deviceInfo: {} } }
  const reLaunchCalls = []
  const { navigationCalls, page: templatePage } = loadPage('pages/commonTemplate/commonTemplate.js', {
    app,
    eventChannel: {},
    request: async (options) => ({
      code: 200,
      data: options.url === '/user/my-templates' ? [template] : [],
      total_pages: 1
    }),
    wx: {
      reLaunch(options) {
        reLaunchCalls.push(options)
      }
    }
  })
  await templatePage.onLoad({ category: 'mine' })
  assert.equal(templatePage.data.activeCategoryKey, 'mine')
  assert.equal(templatePage.data.currentTemplates[0].content, 'Saved ad copy')
  templatePage.useTemplate({ currentTarget: { dataset: { id: 41, source: 'mine' } } })
  assert.equal(app.globalData.pendingVoiceText, 'Saved ad copy')
  assert.equal(reLaunchCalls.at(-1).url, '../index/index')
  assert.equal(navigationCalls.some((call) => call.type === 'back'), false)
  templatePage.onUnload()

  const { page: homePage } = loadPage('pages/index/index.js', { app })
  homePage.onLoad()
  assert.equal(homePage.data.inputText, 'Saved ad copy')
  assert.equal(app.globalData.pendingVoiceText, '')
})

test('home routes voice, BGM, and recorder actions through EventChannel', () => {
  const { navigationCalls, page } = loadPage('pages/index/index.js')
  page.data.voiceMoreList = { categories: [{ key: 'all' }], voices: { all: [] } }
  page.data.voiceCheckInfo = { id: 12, voice_name: '主播 A' }
  page.data.bgmList = { categories: [{ key: 'all' }], bgms: { all: [] } }
  page.data.activeBgmInfo = { id: 22, name: '背景音乐 A' }
  page.data.bgmSetDetail = { bgm_id: 22, bgm_volume: 0.8 }

  page.moreVoice()
  const voiceCall = navigationCalls.at(-1)
  assert.equal(voiceCall.options.url, '../voiceSelect/voiceSelect')
  assert.equal(voiceCall.eventChannel.emitted[0].name, 'initVoiceSelect')
  assert.equal(voiceCall.eventChannel.emitted[0].payload.activeVoiceId, 12)
  voiceCall.options.events.voiceSelected({ id: 13, voice_name: '主播 B' })
  assert.equal(page.data.voiceCheckInfo.id, 13)
  assert.equal(page.data.voiceIndex, -1)

  page.showBgmList()
  const bgmCall = navigationCalls.at(-1)
  assert.equal(bgmCall.options.url, '../bgmSelect/bgmSelect')
  assert.equal(bgmCall.eventChannel.emitted[0].name, 'initBgmSelect')
  assert.equal(bgmCall.eventChannel.emitted[0].payload.activeBgmId, 22)
  bgmCall.options.events.bgmSelected({ id: 23, name: '背景音乐 B' })
  assert.equal(page.data.activeBgmInfo.id, 23)

  page.showRecorderPop()
  const recorderCall = navigationCalls.at(-1)
  assert.equal(recorderCall.options.url, '../recorder/recorder')
  assert.equal(recorderCall.eventChannel.emitted[0].name, 'initRecorder')
  recorderCall.options.events.bgmStateChanged({
    activeBgmInfo: { id: 24, name: '背景音乐 C' },
    bgmSetDetail: { bgm_id: 24, bgm_volume: 1 }
  })
  assert.equal(page.data.activeBgmInfo.id, 24)
  assert.equal(page.data.bgmSetDetail.bgm_id, 24)
})

test('home removes old full-screen popups and keeps BGM settings', () => {
  const markup = read('pages/index/index.wxml')
  const pageConfig = JSON.parse(read('pages/index/index.json'))

  assert.equal(markup.includes('<voicelist'), false)
  assert.equal(markup.includes('<bgmlist'), false)
  assert.equal(markup.includes('<recorder'), false)
  assert.equal(markup.includes('<bgmset'), true)
  assert.equal(markup.includes('bgmSetDetail="{{bgmSetDetail}}"'), true)
  assert.equal(read('pages/recorder/recorder.wxml').includes('bgmSetDetail="{{bgmSetDetail}}"'), true)
  assert.equal('voicelist' in pageConfig.usingComponents, false)
  assert.equal('bgmlist' in pageConfig.usingComponents, false)
  assert.equal('recorder' in pageConfig.usingComponents, false)
  assert.equal('bgmset' in pageConfig.usingComponents, true)
})

test('home BGM reset clears both selection and confirmed settings', () => {
  const { page } = loadPage('pages/index/index.js')
  page.data.activeBgmInfo = { id: 51, name: '背景音乐 A' }
  page.data.bgmSetDetail = { bgm_id: 51, bgm_volume: 0.7 }

  page.resetBgm()

  assert.equal(Object.keys(page.data.activeBgmInfo).length, 0)
  assert.equal(Object.keys(page.data.bgmSetDetail).length, 0)
})

test('home converts every ding-dong marker to a sound event', () => {
  const { page } = loadPage('pages/index/index.js')
  const soundEvent = '<soundEvent src="http://192.168.5.245:9000/static/miniprogram/wav/ding_dong.wav"/>'

  assert.equal(
    page.convertDingDong('开场[叮咚]正文[叮咚]结束'),
    `开场${soundEvent}正文${soundEvent}结束`
  )
})

test('home keeps pause and ding-dong insertions within 299 characters', async () => {
  const { page, toastCalls } = loadPage('pages/index/index.js')

  page.onTextInput({ detail: { value: '\u7c98'.repeat(320), cursor: 320 } })
  assert.equal(page.data.inputText.length, 299)
  assert.equal(page.data.cursorPosition, 299)

  page.setData({ inputText: 'a'.repeat(295), cursorPosition: 295 })
  page.insertDD()
  await waitFor(() => page.data.inputText.length === 299)
  assert.equal(page.data.inputText.endsWith('[\u53ee\u549a]'), true)

  const overLimitText = 'b'.repeat(296)
  page.setData({ inputText: overLimitText, cursorPosition: 296 })
  page.insertDD()
  assert.equal(page.data.inputText, overLimitText)
  assert.equal(toastCalls.at(-1).title, '\u6700\u591a\u8f93\u5165299\u4e2a\u5b57\u7b26')

  page.setData({ inputText: 'c'.repeat(290), cursorPosition: 290, stopVal: 1, stopShow: false })
  page.stopSet()
  assert.equal(page.data.stopShow, true)
  page.stopPopConfirm()
  assert.equal(page.data.inputText.length, 299)
  assert.equal(page.data.inputText.endsWith('[\u505c1000ms]'), true)

  const pauseOverLimitText = 'd'.repeat(290)
  page.setData({ inputText: pauseOverLimitText, cursorPosition: 290, stopVal: 10, stopShow: false })
  page.stopSet()
  assert.equal(page.data.stopShow, false)
  assert.equal(page.data.inputText, pauseOverLimitText)

  page.setData({ inputText: pauseOverLimitText, cursorPosition: 290, stopVal: 1, stopShow: false })
  page.stopSet()
  page.setData({ stopVal: 10 })
  page.stopPopConfirm()
  assert.equal(page.data.stopShow, true)
  assert.equal(page.data.inputText, pauseOverLimitText)
  assert.equal(toastCalls.at(-1).title, '\u6700\u591a\u8f93\u5165299\u4e2a\u5b57\u7b26')
})

test('standalone pages keep an unconditional safe-area navigation bar', () => {
  const pages = [
    ['pages/voiceSelect/voiceSelect', '<voicelist'],
    ['pages/bgmSelect/bgmSelect', '<bgmlist'],
    ['pages/recorder/recorder', '<recorder']
  ]

  pages.forEach(([pagePath, contentTag]) => {
    const config = JSON.parse(read(`${pagePath}.json`))
    const markup = read(`${pagePath}.wxml`)
    const navigationIndex = markup.indexOf('<navigation-bar')
    const contentIndex = markup.indexOf(contentTag)

    assert.equal(config.navigationStyle, 'custom')
    assert.equal(
      config.usingComponents['navigation-bar'],
      '../../components/navigation-bar/navigation-bar'
    )
    assert.ok(navigationIndex >= 0, `${pagePath} has no navigation bar`)
    assert.ok(navigationIndex < contentIndex, `${pagePath} navigation is not unconditional`)
    assert.ok(markup.includes('showBack="{{false}}"'))
  })
})

test('BGM settings component hydrates confirmed values from its caller', () => {
  const { component, componentConfig } = loadComponent('components/bgmSet/bgmSet.js', {})
  const confirmed = {
    bgm_id: 61,
    bgm_volume: 0.4,
    bgm_ducking: 'mute',
    voice_delay: 5,
    bgm_tail: 8
  }

  componentConfig.observers.bgmSetDetail.call(component, confirmed)

  assert.equal(component.data.bgm.bgm_id, 61)
  assert.equal(component.data.bgm.bgm_volume, 0.4)
  assert.equal(component.data.bgm.bgm_ducking, 'mute')
  assert.equal(component.data.bgm.voice_delay, 5)
  assert.equal(component.data.bgm.bgm_tail, 8)
})

test('voice selection page initializes, selects, previews, and releases audio', () => {
  const componentUpdates = []
  const { audio, eventChannel, navigationCalls, page } = loadPage(
    'pages/voiceSelect/voiceSelect.js',
    {
      selectComponent: () => ({
        setData(values) {
          componentUpdates.push(values)
        }
      })
    }
  )
  const voice = {
    id: 7,
    voice_name: '主播 A',
    audio_path: 'https://cdn.example.com/voice-a.mp3'
  }
  const voiceList = {
    categories: [{ key: 'all', name: '全部' }],
    voices: { all: [voice] }
  }

  page.onLoad()
  eventChannel.emit('initVoiceSelect', { voiceList, activeVoiceId: 7 })
  assert.equal(page.data.hasVoiceList, true)
  assert.equal(page.data.activeVoiceId, 7)

  page.playVoice({ detail: { id: 7 } })
  assert.equal(audio.src, 'https://cdn.example.com/voice-a.mp3')
  assert.equal(page.data.playingId, 7)

  audio.trigger('ended')
  assert.equal(page.data.playingId, 0)
  assert.equal(componentUpdates.at(-1).palyId, 0)

  page.playVoice({ detail: { id: 7 } })
  audio.trigger('error', new Error('preview failed'))
  assert.equal(audio.stopped, true)

  page.chooseVoice({ detail: { id: 7 } })
  const selected = eventChannel.emitted.find((event) => event.name === 'voiceSelected')
  assert.equal(selected.payload.id, 7)
  assert.equal(navigationCalls.at(-1).type, 'back')

  page.onHide()
  assert.equal(audio.paused, true)
  page.onUnload()
  assert.equal(audio.destroyed, true)
})

test('voice selection fallback accepts a string success code', async () => {
  const voiceList = {
    categories: [{ key: 'all', name: '全部' }],
    voices: { all: [] }
  }
  const { page } = loadPage('pages/voiceSelect/voiceSelect.js', {
    request: async () => ({ code: '200', data: voiceList })
  })

  page.onLoad()
  await page.getVoiceList()

  assert.equal(page.data.hasVoiceList, true)
})

test('voice selection maps levels and renders compact description badges', () => {
  const { eventChannel, page } = loadPage('pages/voiceSelect/voiceSelect.js')
  page.onLoad()
  eventChannel.emit('initVoiceSelect', {
    voiceList: {
      categories: [{ key: 'all', name: 'All' }],
      voices: {
        all: [
          { id: 81, voice_name: 'Gold', description: 'Gold voice', level: 1 },
          { id: 82, voice_name: 'Silver', description: 'Silver voice', level: 'silver' },
          { id: 83, voice_name: 'Bronze', description: 'Bronze voice', level: 3 },
          { id: 84, voice_name: 'Normal', description: 'Normal voice', level: 'normal' },
          { id: 85, voice_name: 'Plain', description: '', level: 'unknown' }
        ]
      }
    }
  })

  const voices = page.data.voiceList.voices.all
  assert.deepEqual(Array.from(voices, (voice) => voice.levelLabel), [
    '\u91d1\u724c',
    '\u94f6\u724c',
    '\u94dc\u724c',
    '\u666e\u901a',
    ''
  ])
  assert.deepEqual(Array.from(voices, (voice) => voice.levelClass), [
    'voiceLevel--gold',
    'voiceLevel--silver',
    'voiceLevel--bronze',
    'voiceLevel--normal',
    ''
  ])

  const markup = read('components/voiceList/voiceList.wxml')
  const styles = read('components/voiceList/voiceList.wxss')
  assert.equal(markup.includes('class="voiceTitleRow"'), true)
  assert.equal(markup.includes('class="voiceLevel {{item.levelClass}}"'), true)
  assert.equal(markup.includes('wx:if="{{item.levelLabel}}"'), true)
  assert.equal(markup.includes('class="voiceDescription"'), true)
  assert.equal(markup.includes('wx:if="{{item.description}}"'), true)
  assert.equal(styles.includes('.voiceLevel--gold'), true)
  assert.equal(styles.includes('.voiceLevel--normal'), true)
  const compactStyles = styles.replace(/\s+/g, '')
  assert.equal(
    compactStyles.includes('.voiceLevel--normal{color:#ff6f7e;background:#fff7f8;}'),
    true
  )
  assert.equal(styles.includes('.voiceDescription'), true)
  assert.equal(styles.includes('-webkit-line-clamp: 2'), true)
})

test('voice favorites load into the first category and decorate regular voices', async () => {
  const favorite = { id: 72, voice_name: 'Favorite voice', audio_path: 'favorite.mp3' }
  const regular = { id: 71, voice_name: 'Regular voice', audio_path: 'regular.mp3' }
  const requestCalls = []
  const { eventChannel, page } = loadPage('pages/voiceSelect/voiceSelect.js', {
    request: async (options) => {
      requestCalls.push(options)
      return { code: '200', data: [favorite] }
    }
  })

  page.onLoad()
  eventChannel.emit('initVoiceSelect', {
    voiceList: {
      categories: [{ key: 'popular', name: 'Popular' }],
      voices: { popular: [regular, favorite] }
    }
  })
  await page.getFavoriteList()

  assert.equal(requestCalls[0].url, '/user/voices/favorites/list')
  assert.equal(requestCalls[0].method, 'GET')
  assert.equal(requestCalls[0].needAuth, true)
  assert.equal(page.data.voiceList.categories[0].key, 'favorites')
  assert.equal(page.data.voiceList.categories[0].name, '我的收藏')
  assert.equal(page.data.voiceList.categories[1].key, 'popular')
  assert.equal(page.data.voiceList.voices.favorites[0].isFavorite, true)
  assert.equal(page.data.voiceList.voices.popular[0].isFavorite, false)
  assert.equal(page.data.voiceList.voices.popular[1].isFavorite, true)
})

test('voice favorites wait for confirmed add and remove responses', async () => {
  const voice = { id: 73, voice_name: 'Toggle voice', audio_path: 'toggle.mp3' }
  const requestCalls = []
  const mutationResolvers = []
  const { eventChannel, page } = loadPage('pages/voiceSelect/voiceSelect.js', {
    request(options) {
      requestCalls.push(options)
      if (options.method === 'GET') {
        return Promise.resolve({ code: 200, data: [] })
      }
      return new Promise((resolve) => mutationResolvers.push(resolve))
    }
  })

  page.onLoad()
  eventChannel.emit('initVoiceSelect', {
    voiceList: {
      categories: [{ key: 'popular', name: 'Popular' }],
      voices: { popular: [voice] }
    }
  })
  await page.getFavoriteList()

  const addPromise = page.toggleFavorite({ detail: { id: 73 } })
  const duplicatePromise = page.toggleFavorite({ detail: { id: 73 } })
  assert.equal(requestCalls.filter((call) => call.method === 'POST').length, 1)
  assert.equal(page.data.voiceList.voices.popular[0].isFavorite, false)
  assert.equal(page.data.voiceList.voices.popular[0].favoritePending, true)
  assert.equal(requestCalls.at(-1).url, '/user/voices/favorite')
  assert.equal(requestCalls.at(-1).data.id, 73)
  assert.equal(requestCalls.at(-1).needAuth, true)

  mutationResolvers[0]({ code: '200' })
  await Promise.all([addPromise, duplicatePromise])
  assert.equal(page.data.voiceList.voices.popular[0].isFavorite, true)
  assert.equal(page.data.voiceList.voices.favorites.length, 1)

  const removePromise = page.toggleFavorite({ detail: { id: 73 } })
  assert.equal(requestCalls.at(-1).method, 'DELETE')
  assert.equal(page.data.voiceList.voices.popular[0].isFavorite, true)
  mutationResolvers[1]({ code: 200 })
  await removePromise

  assert.equal(page.data.voiceList.voices.popular[0].isFavorite, false)
  assert.equal(page.data.voiceList.voices.favorites.length, 0)
})

test('voice favorites block toggles until the initial favorite list settles', async () => {
  const voice = { id: 77, voice_name: 'Loading voice', audio_path: 'loading.mp3' }
  const requestCalls = []
  let resolveFavorites
  const { eventChannel, page } = loadPage('pages/voiceSelect/voiceSelect.js', {
    request(options) {
      requestCalls.push(options)
      if (options.method === 'GET') {
        return new Promise((resolve) => { resolveFavorites = resolve })
      }
      return Promise.resolve({ code: 200 })
    }
  })

  page.onLoad()
  eventChannel.emit('initVoiceSelect', {
    voiceList: {
      categories: [{ key: 'popular', name: 'Popular' }],
      voices: { popular: [voice] }
    }
  })
  const favoriteListPromise = page.getFavoriteList()
  await page.toggleFavorite({ detail: { id: 77 } })

  assert.equal(requestCalls.filter((call) => call.method === 'POST').length, 0)
  assert.equal(page.data.voiceList.voices.popular[0].isFavorite, false)

  resolveFavorites({ code: 200, data: [] })
  await favoriteListPromise
  assert.equal(page.data.voiceList.voices.popular[0].favoritePending, false)
})

test('voice favorites ignore late favorite responses after page unload', async () => {
  let rejectFavorites
  let setDataAfterUnload = 0
  const { eventChannel, page, toastCalls } = loadPage('pages/voiceSelect/voiceSelect.js', {
    request: () => new Promise((resolve, reject) => { rejectFavorites = reject })
  })
  const originalSetData = page.setData
  page.setData = function (values) {
    if (this.pageActive === false) setDataAfterUnload += 1
    originalSetData.call(this, values)
  }

  page.onLoad()
  eventChannel.emit('initVoiceSelect', {
    voiceList: {
      categories: [{ key: 'popular', name: 'Popular' }],
      voices: { popular: [{ id: 78, voice_name: 'Late voice' }] }
    }
  })
  const favoriteListPromise = page.getFavoriteList()
  page.onUnload()
  rejectFavorites(new Error('late failure'))
  await favoriteListPromise

  assert.equal(setDataAfterUnload, 0)
  assert.equal(toastCalls.length, 0)
})

test('voice favorites failure keeps regular voices available and unchanged', async () => {
  const voice = { id: 74, voice_name: 'Available voice', audio_path: 'available.mp3' }
  let rejectFavorites = true
  const { eventChannel, page, toastCalls } = loadPage('pages/voiceSelect/voiceSelect.js', {
    request: async (options) => {
      if (options.method === 'GET' && rejectFavorites) {
        rejectFavorites = false
        throw new Error('favorites unavailable')
      }
      return { code: 500, message: 'mutation failed' }
    }
  })

  page.onLoad()
  eventChannel.emit('initVoiceSelect', {
    voiceList: {
      categories: [{ key: 'popular', name: 'Popular' }],
      voices: { popular: [voice] }
    }
  })
  await page.getFavoriteList()

  assert.equal(page.data.hasVoiceList, true)
  assert.equal(page.data.voiceList.categories[1].key, 'popular')
  assert.equal(page.data.voiceList.voices.popular[0].isFavorite, false)
  assert.equal(toastCalls.at(-1).title, '收藏列表加载失败')

  await page.toggleFavorite({ detail: { id: 74 } })
  assert.equal(page.data.voiceList.voices.popular[0].isFavorite, false)
  assert.equal(page.data.voiceList.voices.popular[0].favoritePending, false)
})

test('favorite star emits a toggle and exposes confirmed colors in markup', () => {
  const emitted = []
  const { component } = loadComponent('components/voiceList/voiceList.js', {})
  component.data.currentVoices = [
    { id: 75, isFavorite: false, favoritePending: false },
    { id: 76, isFavorite: true, favoritePending: true }
  ]
  component.triggerEvent = (name, detail) => emitted.push({ name, detail })

  component.toggleFavorite({ currentTarget: { dataset: { id: 75 } } })
  component.toggleFavorite({ currentTarget: { dataset: { id: 76 } } })

  assert.equal(component.data.activeKey, 1)
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].name, 'favoriteVoice')
  assert.equal(emitted[0].detail.id, 75)

  const componentMarkup = read('components/voiceList/voiceList.wxml')
  const pageMarkup = read('pages/voiceSelect/voiceSelect.wxml')
  assert.equal(componentMarkup.includes('name="star"'), true)
  assert.equal(componentMarkup.includes("#C0392B"), true)
  assert.equal(componentMarkup.includes("#D8D8D8"), true)
  assert.equal(pageMarkup.includes('bind:favoriteVoice="toggleFavorite"'), true)

  const componentStyles = read('components/voiceList/voiceList.wxss')
  assert.equal(componentStyles.includes('width: 88rpx'), true)
  assert.equal(componentStyles.includes('height: 88rpx'), true)
})

test('favorite star keeps the first regular category selected when it arrives later', () => {
  const { component, componentConfig } = loadComponent('components/voiceList/voiceList.js', {})
  const favoritesOnly = {
    categories: [{ key: 'favorites', name: 'Favorites' }],
    voices: { favorites: [{ id: 79 }] }
  }
  const completeList = {
    categories: [
      { key: 'favorites', name: 'Favorites' },
      { key: 'popular', name: 'Popular' }
    ],
    voices: {
      favorites: [{ id: 79 }],
      popular: [{ id: 80 }]
    }
  }

  componentConfig.observers.voiceList.call(component, favoritesOnly)
  assert.equal(component.data.activeKey, 0)
  componentConfig.observers.voiceList.call(component, completeList)

  assert.equal(component.data.activeKey, 1)
  assert.equal(component.data.currentVoices[0].id, 80)
})

test('BGM selection page initializes, selects, previews, and releases audio', () => {
  const componentUpdates = []
  const { audio, eventChannel, navigationCalls, page, toastCalls } = loadPage(
    'pages/bgmSelect/bgmSelect.js',
    {
      selectComponent: () => ({
        setData(values) {
          componentUpdates.push(values)
        }
      })
    }
  )
  const bgm = {
    id: 31,
    name: '背景音乐 A',
    audio_path: 'cdn.example.com/bgm-a.mp3'
  }
  const bgmList = {
    categories: [{ key: 'all', name: '全部' }],
    bgms: { all: [bgm] }
  }

  page.onLoad()
  eventChannel.emit('initBgmSelect', { bgmList, activeBgmId: 31 })
  assert.equal(page.data.hasBgmList, true)
  assert.equal(page.data.activeBgmId, 31)

  page.playBgm({ detail: { id: 31 } })
  assert.equal(audio.src, 'https://cdn.example.com/bgm-a.mp3')
  assert.equal(page.data.playingId, 31)

  audio.trigger('error', new Error('preview failed'))
  assert.equal(audio.stopped, true)
  assert.equal(page.data.playingId, 0)
  assert.equal(componentUpdates.at(-1).palyId, 0)
  assert.equal(toastCalls.at(-1).title, '背景音乐试听失败')

  page.chooseBgm({ detail: { id: 31 } })
  const selected = eventChannel.emitted.find((event) => event.name === 'bgmSelected')
  assert.equal(selected.payload.id, 31)
  assert.equal(navigationCalls.at(-1).type, 'back')

  page.onHide()
  assert.equal(audio.paused, true)
  page.onUnload()
  assert.equal(audio.destroyed, true)
})

test('BGM selection keeps the second playing icon stable through an iOS source-switch pause', () => {
  const componentUpdates = []
  const audio = createAudioDouble()
  audio.play = function () {
    this.played = true
  }
  const { eventChannel, page } = loadPage('pages/bgmSelect/bgmSelect.js', {
    audio,
    selectComponent: () => ({
      setData(values) {
        componentUpdates.push(values)
      }
    })
  })
  const firstBgm = { id: 41, name: 'BGM A', audio_path: 'cdn.example.com/a.mp3' }
  const secondBgm = { id: 42, name: 'BGM B', audio_path: 'cdn.example.com/b.mp3' }

  page.onLoad()
  eventChannel.emit('initBgmSelect', {
    bgmList: {
      categories: [{ key: 'all', name: '全部' }],
      bgms: { all: [firstBgm, secondBgm] }
    }
  })

  page.playBgm({ detail: { id: 41, source: 'regular' } })
  audio.trigger('play')
  page.playBgm({ detail: { id: 42, source: 'regular' } })
  const updatesBeforeSourceSwitchPause = componentUpdates.length
  audio.trigger('pause')

  assert.equal(page.data.playingId, 42)
  assert.equal(componentUpdates.length, updatesBeforeSourceSwitchPause)

  audio.trigger('play')

  assert.equal(page.data.playingId, 42)
  assert.equal(componentUpdates.at(-1).palyId, 42)
  assert.equal(componentUpdates.at(-1).palySource, 'regular')
  page.onUnload()
})

test('BGM selection fallback accepts a string success code', async () => {
  const bgmList = {
    categories: [{ key: 'all', name: '全部' }],
    bgms: { all: [] }
  }
  const { page } = loadPage('pages/bgmSelect/bgmSelect.js', {
    request: async () => ({ code: '200', data: bgmList })
  })

  page.onLoad()
  await page.getBgmList()

  assert.equal(page.data.hasBgmList, true)
})

test('BGM audio errors stay silent when no preview is active', () => {
  const { audio, page, toastCalls } = loadPage('pages/bgmSelect/bgmSelect.js')

  page.onLoad()
  audio.trigger('error', new Error('context interrupted by file picker'))

  assert.equal(page.data.playingId, 0)
  assert.equal(toastCalls.length, 0)
  page.onUnload()
})

test('BGM favorites and custom uploads are merged ahead of regular categories', async () => {
  const regular = { id: 81, name: 'Regular BGM', audio_path: 'regular.mp3' }
  const custom = { id: 81, name: 'Uploaded BGM', audio_path: 'uploaded.mp3' }
  const requestCalls = []
  const { eventChannel, page } = loadPage('pages/bgmSelect/bgmSelect.js', {
    request: async (options) => {
      requestCalls.push(options)
      if (options.url === '/user/bgms/favorites/list') {
        return { code: 200, data: [regular] }
      }
      if (options.url === '/user/bgms/custom/list') {
        return { code: '200', data: [custom] }
      }
      if (options.url === '/user/bgms/favorite') {
        return { code: 200, data: {} }
      }
      throw new Error(`Unexpected request: ${options.method} ${options.url}`)
    }
  })

  page.onLoad()
  eventChannel.emit('initBgmSelect', {
    bgmList: {
      categories: [{ key: 'popular', name: '热门' }],
      bgms: { popular: [regular] }
    }
  })
  await Promise.all([page.getFavoriteList(), page.getCustomBgmList()])

  assert.equal(page.data.bgmList.categories[0].key, 'favorites')
  assert.equal(page.data.bgmList.categories[0].name, '我的收藏')
  assert.equal(page.data.bgmList.categories[1].key, 'uploads')
  assert.equal(page.data.bgmList.categories[1].name, '我的上传')
  assert.equal(page.data.bgmList.categories[2].key, 'popular')
  assert.equal(page.data.bgmList.bgms.popular[0].isFavorite, true)
  assert.equal(page.data.bgmList.bgms.popular[0].source, 'regular')
  assert.equal(page.data.bgmList.bgms.favorites[0].showFavorite, true)
  assert.equal(page.data.bgmList.bgms.uploads[0].showFavorite, false)
  assert.equal(page.data.bgmList.bgms.uploads[0].showDelete, true)
  assert.equal(requestCalls.every((call) => call.needAuth === true), true)

  await page.toggleFavorite({ detail: { id: 81 } })
  assert.equal(requestCalls.at(-1).method, 'DELETE')
  assert.equal(requestCalls.at(-1).data.id, 81)
  assert.equal(page.data.bgmList.bgms.favorites.length, 0)
  assert.equal(page.data.bgmList.bgms.popular[0].isFavorite, false)

  await page.toggleFavorite({ detail: { id: 81 } })
  assert.equal(requestCalls.at(-1).method, 'POST')
  assert.equal(page.data.bgmList.bgms.favorites.length, 1)

  const uploaded = page.findBgmById(81, 'upload')
  assert.equal(uploaded.name, 'Uploaded BGM')
  page.onUnload()
})

test('BGM list emits favorite and delete actions with confirmed icon colors', () => {
  const emitted = []
  const { component } = loadComponent('components/bgmList/bgmList.js', {})
  component.data.currentBgms = [
    { id: 82, isFavorite: false, favoritePending: false, showFavorite: true },
    { id: 83, deletePending: false, showDelete: true }
  ]
  component.triggerEvent = (name, detail) => emitted.push({ name, detail })

  component.toggleFavorite({ currentTarget: { dataset: { id: 82 } } })
  component.deleteBgm({ currentTarget: { dataset: { id: 83 } } })

  component.data.palyId = 82
  component.data.palySource = 'regular'
  component.bgmPlay({ currentTarget: { dataset: { id: 82, source: 'upload' } } })

  assert.equal(emitted[0].name, 'favoriteBgm')
  assert.equal(emitted[0].detail.id, 82)
  assert.equal(emitted[1].name, 'deleteBgm')
  assert.equal(emitted[1].detail.id, 83)
  assert.equal(emitted[2].name, 'playBgm')
  assert.equal(emitted[2].detail.source, 'upload')
  assert.equal(component.data.palySource, 'upload')

  const componentMarkup = read('components/bgmList/bgmList.wxml')
  const pageMarkup = read('pages/bgmSelect/bgmSelect.wxml')
  assert.equal(componentMarkup.includes('name="star"'), true)
  assert.equal(componentMarkup.includes("'#C0392B'"), true)
  assert.equal(componentMarkup.includes("'#D8D8D8'"), true)
  assert.equal(componentMarkup.includes('name="delete-o"'), true)
  assert.equal(pageMarkup.includes('bindtap="importMusic"'), true)
  assert.equal(pageMarkup.includes('bindtap="extractVideoMusic"'), true)
  assert.equal(pageMarkup.includes('bind:favoriteBgm="toggleFavorite"'), true)
  assert.equal(pageMarkup.includes('bind:deleteBgm="deleteCustomBgm"'), true)
})

test('BGM MP3 import selects a chat file and uploads it into my uploads', async () => {
  let chooseOptions
  let shownCategory = ''
  const uploadCalls = []
  const uploaded = { id: 84, name: 'Chat song', audio_path: 'chat-song.mp3' }
  const { page, toastCalls } = loadPage('pages/bgmSelect/bgmSelect.js', {
    request: async (options) => { throw new Error(`Unexpected request: ${options.url}`) },
    selectComponent: () => ({
      showCategory(key) {
        shownCategory = key
      },
      setData() {}
    }),
    uploadFile(options) {
      uploadCalls.push(options)
      options.success({
        statusCode: 200,
        data: JSON.stringify({ code: 200, data: uploaded })
      })
      return { abort() {} }
    },
    wx: {
      chooseMessageFile(options) {
        chooseOptions = options
        options.success({
          tempFiles: [{ name: 'Chat song.MP3', path: 'wxfile://chat-song.mp3', size: 1024 }]
        })
      },
      getStorageSync(key) {
        return key === 'auth_token' ? 'test-token' : ''
      }
    }
  })

  page.onLoad()
  await page.importMusic()

  assert.equal(chooseOptions.count, 1)
  assert.equal(chooseOptions.type, 'file')
  assert.equal(chooseOptions.extension.includes('mp3'), true)
  assert.equal(uploadCalls.length, 1)
  assert.equal(uploadCalls[0].url.endsWith('/user/bgms/custom/upload'), true)
  assert.equal(uploadCalls[0].filePath, 'wxfile://chat-song.mp3')
  assert.equal(uploadCalls[0].name, 'audio')
  assert.equal(uploadCalls[0].formData.name, 'Chat song')
  assert.equal(uploadCalls[0].header.Authorization, 'Bearer test-token')
  assert.equal(page.data.bgmList.bgms.uploads[0].id, 84)
  assert.equal(shownCategory, 'uploads')
  assert.equal(toastCalls.at(-1).title, '导入成功')
  page.onUnload()
})

test('BGM MP3 import animates progress when WeChat only reports 100 percent', async () => {
  let progressHandler
  let uploadOptions
  const uploaded = { id: 87, name: 'Progress song', audio_path: 'progress.mp3' }
  const { page } = loadPage('pages/bgmSelect/bgmSelect.js', {
    uploadFile(options) {
      uploadOptions = options
      return {
        abort() {},
        onProgressUpdate(handler) {
          progressHandler = handler
        }
      }
    },
    wx: {
      chooseMessageFile(options) {
        options.success({
          tempFiles: [{ name: 'Progress song.mp3', path: 'wxfile://progress.mp3', size: 1024 }]
        })
      },
      getStorageSync: () => 'test-token'
    }
  })

  page.onLoad()
  const importPromise = page.importMusic()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(page.data.importing, true)
  assert.equal(page.data.uploadProgress, 0)
  progressHandler({ progress: 100 })
  assert.equal(page.data.uploadProgress < 100, true)
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(page.data.uploadProgress > 0, true)
  assert.equal(page.data.uploadProgress < 100, true)
  await waitFor(() => page.data.uploadProgress >= 99)
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(page.data.uploadProgress, 99)

  uploadOptions.success({
    statusCode: 200,
    data: JSON.stringify({ code: 200, data: uploaded })
  })
  await importPromise

  assert.equal(page.data.importing, false)
  assert.equal(page.data.uploadProgress, 100)
  const markup = read('pages/bgmSelect/bgmSelect.wxml')
  assert.equal(markup.includes('style="width: {{uploadProgress}}%;"'), true)
  assert.equal(markup.includes('{{uploadProgress}}%'), true)
  assert.equal(markup.includes('<progress'), false)
  page.onUnload()
})

test('BGM import rejects a non-MP3 chat file before upload', async () => {
  let uploadCalls = 0
  const { page, toastCalls } = loadPage('pages/bgmSelect/bgmSelect.js', {
    uploadFile() {
      uploadCalls += 1
    },
    wx: {
      chooseMessageFile(options) {
        options.success({
          tempFiles: [{ name: 'Wrong format.wav', path: 'wxfile://wrong.wav', size: 1024 }]
        })
      }
    }
  })

  page.onLoad()
  await page.importMusic()

  assert.equal(uploadCalls, 0)
  assert.equal(toastCalls.at(-1).title, '请选择 MP3 格式文件')
  page.onUnload()
})

test('BGM video extraction converts, downloads, then uploads an MP3', async () => {
  let chooseOptions
  let downloadOptions
  const uploadCalls = []
  const uploaded = { id: 85, name: 'Video track', audio_path: 'video-track.mp3' }
  const { page, toastCalls } = loadPage('pages/bgmSelect/bgmSelect.js', {
    request: async (options) => {
      if (options.url === '/user/bgms/custom/list') {
        return { code: 200, data: [uploaded] }
      }
      throw new Error(`Unexpected request: ${options.url}`)
    },
    uploadFile(options) {
      uploadCalls.push(options)
      if (options.url.endsWith('/video2mp3')) {
        options.success({
          statusCode: 200,
          data: JSON.stringify({
            code: 200,
            data: { download_path: '/downloads/video-track.mp3' }
          })
        })
      } else {
        options.success({
          statusCode: 200,
          data: JSON.stringify({ code: 200, data: uploaded })
        })
      }
      return { abort() {} }
    },
    wx: {
      chooseMessageFile(options) {
        chooseOptions = options
        options.success({
          tempFiles: [{ name: 'Video track.mp4', path: 'wxfile://video.mp4', size: 4096 }]
        })
      },
      downloadFile(options) {
        downloadOptions = options
        options.success({ statusCode: 200, tempFilePath: 'wxfile://converted.mp3' })
        return { abort() {} }
      },
      getStorageSync: () => 'test-token'
    }
  })

  page.onLoad()
  await page.extractVideoMusic()

  assert.equal(chooseOptions.type, 'video')
  assert.equal(uploadCalls[0].url.endsWith('/video2mp3'), true)
  assert.equal(uploadCalls[0].name, 'file')
  assert.equal(uploadCalls[0].filePath, 'wxfile://video.mp4')
  assert.equal(downloadOptions.url, 'http://192.168.5.245:9000/downloads/video-track.mp3')
  assert.equal(uploadCalls[1].url.endsWith('/user/bgms/custom/upload'), true)
  assert.equal(uploadCalls[1].filePath, 'wxfile://converted.mp3')
  assert.equal(uploadCalls[1].name, 'audio')
  assert.equal(uploadCalls[1].formData.name, 'Video track')
  assert.equal(toastCalls.at(-1).title, '提取成功')
  page.onUnload()
})

test('BGM video extraction maps progress across all three stages', async () => {
  const uploadEntries = []
  let downloadEntry
  const uploaded = { id: 88, name: 'Mapped progress', audio_path: 'mapped.mp3' }
  const { page } = loadPage('pages/bgmSelect/bgmSelect.js', {
    uploadFile(options) {
      const entry = { options, progressHandler: null }
      uploadEntries.push(entry)
      return {
        abort() {},
        onProgressUpdate(handler) {
          entry.progressHandler = handler
        }
      }
    },
    wx: {
      chooseMessageFile(options) {
        options.success({
          tempFiles: [{ name: 'Mapped progress.mp4', path: 'wxfile://mapped.mp4', size: 4096 }]
        })
      },
      downloadFile(options) {
        downloadEntry = { options, progressHandler: null }
        return {
          abort() {},
          onProgressUpdate(handler) {
            downloadEntry.progressHandler = handler
          }
        }
      },
      getStorageSync: () => 'test-token'
    }
  })

  page.onLoad()
  const extractionPromise = page.extractVideoMusic()
  await new Promise((resolve) => setImmediate(resolve))

  uploadEntries[0].progressHandler({ progress: 50 })
  await waitFor(() => page.data.uploadProgress === 23)
  assert.equal(page.data.uploadProgress, 23)
  uploadEntries[0].options.success({
    statusCode: 200,
    data: JSON.stringify({ code: 200, data: { download_path: '/mapped.mp3' } })
  })
  await new Promise((resolve) => setImmediate(resolve))

  downloadEntry.progressHandler({ progress: 50 })
  await waitFor(() => page.data.uploadProgress === 55)
  assert.equal(page.data.uploadProgress, 55)
  downloadEntry.options.success({ statusCode: 200, tempFilePath: 'wxfile://mapped.mp3' })
  await new Promise((resolve) => setImmediate(resolve))

  uploadEntries[1].progressHandler({ progress: 50 })
  await waitFor(() => page.data.uploadProgress === 83)
  assert.equal(page.data.uploadProgress, 83)
  uploadEntries[1].options.success({
    statusCode: 200,
    data: JSON.stringify({ code: 200, data: uploaded })
  })
  await extractionPromise

  assert.equal(page.data.uploadProgress, 100)
  page.onUnload()
})

test('BGM custom upload deletion requires confirmation', async () => {
  const requestCalls = []
  const customBgms = [{ id: 86, name: 'Delete me', audio_path: 'delete.mp3' }]
  const { page } = loadPage('pages/bgmSelect/bgmSelect.js', {
    request: async (options) => {
      requestCalls.push(options)
      if (options.url === '/user/bgms/custom/list') {
        return { code: 200, data: customBgms.map((item) => ({ ...item })) }
      }
      if (options.url === '/user/bgms/custom' && options.method === 'DELETE') {
        customBgms.splice(0, 1)
        return { code: 200, data: {} }
      }
      throw new Error(`Unexpected request: ${options.method} ${options.url}`)
    },
    wx: {
      showModal(options) {
        assert.equal(options.content, '确定删除该上传音乐吗？')
        options.success({ confirm: true, cancel: false })
      }
    }
  })

  page.onLoad()
  await page.getCustomBgmList()
  await page.deleteCustomBgm({ detail: { id: 86 } })

  const deleteCall = requestCalls.find((call) => call.method === 'DELETE')
  assert.equal(deleteCall.url, '/user/bgms/custom')
  assert.equal(deleteCall.data.id, 86)
  assert.equal(deleteCall.needAuth, true)
  assert.equal(page.data.bgmList.bgms.uploads.length, 0)
  page.onUnload()
})

test('recorder page synchronizes BGM state and uploads with confirmed settings', () => {
  let uploadOptions
  const app = { globalData: {} }
  const { eventChannel, loadingCalls, navigationCalls, page } = loadPage(
    'pages/recorder/recorder.js',
    {
      app,
      uploadFile(options) {
        uploadOptions = options
      }
    }
  )
  const bgmList = {
    categories: [{ key: 'all', name: '全部' }],
    bgms: { all: [{ id: 41, name: '背景音乐 A' }, { id: 42, name: '背景音乐 B' }] }
  }

  page.onLoad()
  eventChannel.emit('initRecorder', {
    bgmList,
    activeBgmInfo: { id: 41, name: '背景音乐 A' },
    bgmSetDetail: { bgm_id: 41, bgm_volume: 0.5 }
  })
  assert.equal(page.data.activeBgmInfo.id, 41)
  assert.equal(page.data.bgmSetDetail.bgm_volume, 0.5)

  page.showBgmList()
  const bgmCall = navigationCalls.at(-1)
  assert.equal(bgmCall.options.url, '../bgmSelect/bgmSelect')
  assert.equal(bgmCall.eventChannel.emitted[0].payload.activeBgmId, 41)
  bgmCall.options.events.bgmSelected({ id: 42, name: '背景音乐 B' })
  assert.equal(page.data.activeBgmInfo.id, 42)

  page.bmgSetConfirm({
    detail: {
      bgm_id: 42,
      bgm_volume: 0.8,
      bgm_ducking: 'reduce',
      voice_delay: 1,
      bgm_tail: 2
    }
  })
  const synchronized = eventChannel.emitted.filter((event) => event.name === 'bgmStateChanged').at(-1)
  assert.equal(synchronized.payload.activeBgmInfo.id, 42)
  assert.equal(synchronized.payload.bgmSetDetail.bgm_id, 42)

  page.handleRecorder({
    detail: {
      audioPath: 'wxfile://recording.mp3',
      speed: 1.3,
      volume: 1.7
    }
  })
  assert.equal(uploadOptions.filePath, 'wxfile://recording.mp3')
  assert.equal(uploadOptions.formData.speed_ratio, 1.3)
  assert.equal(uploadOptions.formData.volume_ratio, 1.7)
  assert.equal(uploadOptions.formData.bgm_id, 42)
  assert.equal(uploadOptions.formData.bgm_volume, 0.8)

  uploadOptions.success({
    data: JSON.stringify({ code: '200', data: { audio_url: 'result.example.com/audio.mp3' } })
  })
  assert.equal(app.globalData.generate.audio_url, 'result.example.com/audio.mp3')
  assert.equal(navigationCalls.at(-1).type, 'redirect')
  assert.equal(navigationCalls.at(-1).options.url, '../generate/generate')
  assert.equal(loadingCalls.at(-1).type, 'hide')

  page.resetBgm()
  assert.equal(Object.keys(page.data.activeBgmInfo).length, 0)
  assert.equal(Object.keys(page.data.bgmSetDetail).length, 0)
})

test('recorder page hides loading and stays put when upload fails', () => {
  let uploadOptions
  const { loadingCalls, navigationCalls, page, toastCalls } = loadPage(
    'pages/recorder/recorder.js',
    {
      uploadFile(options) {
        uploadOptions = options
      }
    }
  )
  page.onLoad()
  page.handleRecorder({ detail: { audioPath: 'wxfile://recording.mp3' } })
  uploadOptions.fail(new Error('network failed'))

  assert.equal(loadingCalls.at(-1).type, 'hide')
  assert.equal(toastCalls.at(-1).title, '录音上传失败')
  assert.equal(navigationCalls.some((call) => call.type === 'redirect'), false)
})

test('recorder page aborts upload and ignores stale callbacks after unload', () => {
  let abortCalls = 0
  let uploadOptions
  const app = { globalData: {} }
  const { loadingCalls, navigationCalls, page } = loadPage('pages/recorder/recorder.js', {
    app,
    uploadFile(options) {
      uploadOptions = options
      return {
        abort() {
          abortCalls += 1
        }
      }
    }
  })

  page.onLoad()
  page.handleRecorder({ detail: { audioPath: 'wxfile://recording.mp3' } })
  assert.equal(page.data.uploading, true)
  assert.equal(loadingCalls[0].options.mask, true)

  page.onUnload()
  assert.equal(abortCalls, 1)
  assert.equal(loadingCalls.at(-1).type, 'hide')

  uploadOptions.success({
    data: JSON.stringify({ code: 200, data: { audio_url: 'late.example.com/audio.mp3' } })
  })
  assert.equal(app.globalData.generate, undefined)
  assert.equal(navigationCalls.some((call) => call.type === 'redirect'), false)
})

test('recorder page prevents duplicate uploads', () => {
  let uploadCalls = 0
  const { page, toastCalls } = loadPage('pages/recorder/recorder.js', {
    uploadFile() {
      uploadCalls += 1
      return { abort() {} }
    }
  })

  page.onLoad()
  page.handleRecorder({ detail: { audioPath: 'wxfile://recording-a.mp3' } })
  page.handleRecorder({ detail: { audioPath: 'wxfile://recording-b.mp3' } })

  assert.equal(uploadCalls, 1)
  assert.equal(toastCalls.at(-1).title, '录音正在上传中')
})

test('recorder component stops and releases listeners when detached', () => {
  const callbacks = {}
  const released = []
  let stopCalls = 0
  const recorder = {
    offError(handler) { released.push(['error', handler]) },
    offStart(handler) { released.push(['start', handler]) },
    offStop(handler) { released.push(['stop', handler]) },
    onError(handler) { callbacks.error = handler },
    onStart(handler) { callbacks.start = handler },
    onStop(handler) { callbacks.stop = handler },
    start() {},
    stop() { stopCalls += 1 }
  }
  const { component, componentConfig } = loadComponent('components/recorder/recorder.js', {
    getRecorderManager: () => recorder,
    showToast() {}
  })

  componentConfig.lifetimes.attached.call(component)
  assert.equal(component.recorder, recorder)
  assert.equal(component.data.recorder, undefined)
  component.setData({ recorderMask: true })
  componentConfig.lifetimes.detached.call(component)

  assert.equal(stopCalls, 1)
  assert.equal(released.length, 3)
  callbacks.stop({ tempFilePath: 'wxfile://detached.mp3' })
  assert.equal(component.data.audioPath, '')
})

test('recorder component exposes speed and volume controls in its upload event', () => {
  const emitted = []
  const { component } = loadComponent('components/recorder/recorder.js', {
    getRecorderManager() {
      return {
        onStart() {},
        onStop() {},
        onError() {}
      }
    },
    showToast() {}
  })
  component.triggerEvent = (name, detail) => emitted.push({ name, detail })

  component.changeSpeed({ detail: { value: 1.26 } })
  component.changeVolume({ detail: { value: 1.74 } })
  component.setData({ audioPath: 'wxfile://settings.mp3' })
  component.handleRecorder()

  assert.equal(component.data.speedDisplay, '1.3')
  assert.equal(component.data.volumeDisplay, '1.7')
  assert.equal(emitted[0].name, 'handleRecorder')
  assert.equal(emitted[0].detail.audioPath, 'wxfile://settings.mp3')
  assert.equal(emitted[0].detail.speed, 1.3)
  assert.equal(emitted[0].detail.volume, 1.7)

  const markup = read('components/recorder/recorder.wxml')
  assert.equal(markup.includes('bindchange="changeSpeed"'), true)
  assert.equal(markup.includes('bindchange="changeVolume"'), true)
})

test('recorder component asks for microphone permission before its first recording', () => {
  let authorizeOptions
  let startOptions
  const recorder = {
    onStart() {},
    onStop() {},
    onError() {},
    start(options) { startOptions = options }
  }
  const { component, componentConfig } = loadComponent('components/recorder/recorder.js', {
    getRecorderManager: () => recorder,
    getSetting(options) {
      options.success({ authSetting: {} })
    },
    authorize(options) {
      authorizeOptions = options
      options.success()
      options.complete()
    },
    showToast() {}
  })

  componentConfig.lifetimes.attached.call(component)
  component.startRecorder()
  assert.equal(component.data.recordPermissionVisible, true)
  component.confirmRecordPermission()

  assert.equal(authorizeOptions.scope, 'scope.record')
  assert.equal(startOptions.duration, 180000)
  assert.equal(component.data.recorderMask, true)
  assert.equal(read('components/recorder/recorder.wxml').includes('同意并开始录制'), true)
})

test('recorder component starts immediately when microphone permission exists', () => {
  let authorizeCalls = 0
  let modalCalls = 0
  let startCalls = 0
  const recorder = {
    onStart() {},
    onStop() {},
    onError() {},
    start() { startCalls += 1 }
  }
  const { component, componentConfig } = loadComponent('components/recorder/recorder.js', {
    getRecorderManager: () => recorder,
    getSetting(options) {
      options.success({ authSetting: { 'scope.record': true } })
    },
    showModal() { modalCalls += 1 },
    authorize() { authorizeCalls += 1 },
    showToast() {}
  })

  componentConfig.lifetimes.attached.call(component)
  component.startRecorder()

  assert.equal(modalCalls, 0)
  assert.equal(authorizeCalls, 0)
  assert.equal(startCalls, 1)
})

test('recorder component opens settings after microphone permission is denied', () => {
  let modalCalls = 0
  let openSettingCalls = 0
  let startCalls = 0
  const recorder = {
    onStart() {},
    onStop() {},
    onError() {},
    start() { startCalls += 1 }
  }
  const { component, componentConfig } = loadComponent('components/recorder/recorder.js', {
    getRecorderManager: () => recorder,
    getSetting(options) {
      options.success({ authSetting: {} })
    },
    showModal(options) {
      modalCalls += 1
      options.success({ confirm: true, cancel: false })
      if (options.complete) options.complete()
    },
    authorize(options) {
      options.fail()
      options.complete()
    },
    openSetting(options) {
      openSettingCalls += 1
      options.success({ authSetting: { 'scope.record': true } })
    },
    showToast() {}
  })

  componentConfig.lifetimes.attached.call(component)
  component.startRecorder()
  component.confirmRecordPermission()

  assert.equal(modalCalls, 1)
  assert.equal(openSettingCalls, 1)
  assert.equal(startCalls, 1)
})

test('home banner uses a three-image native carousel', () => {
  const { page } = loadPage('pages/index/index.js')
  const markup = read('pages/index/index.wxml')
  const styles = read('pages/index/index.wxss').replace(/\s+/g, '')

  assert.deepEqual(page.data.bannerImages, [
    '/img/yinxiang.png',
    '/img/yinxiang1.png',
    '/img/yinxiang2.png'
  ])
  assert.equal(markup.includes('<swiper class="bannerSwiper" autoplay="{{true}}" circular="{{true}}" interval="3000" duration="500">'), true)
  assert.equal(markup.includes('<swiper-item wx:for="{{bannerImages}}" wx:key="*this">'), true)
  assert.equal(markup.includes('<image class="bannerImg" src="{{item}}" mode="aspectFit">'), true)
  assert.equal(markup.includes('indicator-dots'), false)
  assert.equal(styles.includes('.bannerView{width:700rpx;height:350rpx;margin:0auto;}'), true)
  assert.equal(styles.includes('.bannerSwiper,.bannerImg{width:100%;height:100%;}'), true)
})

test('common templates page registers and returns selected copy to home', () => {
  const appConfig = JSON.parse(read('app.json'))
  assert.equal(appConfig.pages.includes('pages/commonTemplate/commonTemplate'), true)

  const { navigationCalls, page } = loadPage('pages/index/index.js')
  page.openTemp()

  const navigationCall = navigationCalls.at(-1)
  assert.equal(navigationCall.options.url, '../commonTemplate/commonTemplate')
  navigationCall.options.events.templateSelected({ content: 'Selected copy' })
  assert.equal(page.data.inputText, 'Selected copy')
})

test('advertising templates derive categories, expand, and return content', async () => {
  const requestCalls = []
  const templates = [
    { id: 1, name: 'Food A', category: '美味小吃', content: 'Copy A', sort: 1 },
    { id: 2, name: 'Mall A', category: '商场百货', content: 'Copy B', sort: 2 }
  ]
  const { audio, eventChannel, navigationCalls, page } = loadPage(
    'pages/commonTemplate/commonTemplate.js',
    {
      request: async (options) => {
        requestCalls.push(options)
        return { code: '200', data: templates, total_pages: 1 }
      }
    }
  )

  await page.onLoad()

  assert.equal(requestCalls[0].url, '/ad-templates/')
  assert.equal(requestCalls[0].method, 'GET')
  assert.equal(requestCalls[0].data.page_size, 100)
  assert.equal(requestCalls[0].needAuth, false)
  assert.deepEqual(Array.from(page.data.templateCategories, (item) => item.name), [
    '添加模板',
    '我的模板',
    '美味小吃',
    '商场百货'
  ])
  assert.equal(page.data.activeCategoryKey, 'category:美味小吃')
  assert.equal(page.data.currentTemplates[0].content, 'Copy A')
  assert.equal(page.data.currentTemplates[0].expanded, false)

  page.toggleTemplate({ currentTarget: { dataset: { id: 1 } } })
  assert.equal(page.data.currentTemplates[0].expanded, true)
  page.toggleTemplate({ currentTarget: { dataset: { id: 1 } } })
  assert.equal(page.data.currentTemplates[0].expanded, false)

  page.selectCategory({ currentTarget: { dataset: { key: 'add' } } })
  assert.equal(page.data.currentTemplates.length, 0)
  assert.equal(page.data.templateEmptyText, '暂无内容')
  page.selectCategory({ currentTarget: { dataset: { key: 'mine' } } })
  assert.equal(page.data.currentTemplates.length, 0)
  assert.equal(page.data.templateEmptyText, '暂无内容')
  page.selectCategory({ currentTarget: { dataset: { key: 'category:商场百货' } } })
  assert.equal(page.data.currentTemplates[0].content, 'Copy B')

  page.useTemplate({ currentTarget: { dataset: { id: 2 } } })
  const selected = eventChannel.emitted.find((event) => event.name === 'templateSelected')
  assert.equal(selected.payload.content, 'Copy B')
  assert.equal(navigationCalls.at(-1).type, 'back')

  const markup = read('pages/commonTemplate/commonTemplate.wxml')
  const styles = read('pages/commonTemplate/commonTemplate.wxss')
  const compactStyles = styles.replace(/\s+/g, '')
  const config = JSON.parse(read('pages/commonTemplate/commonTemplate.json'))
  assert.equal(markup.includes('广告模板'), true)
  assert.equal(markup.includes('通用语音'), true)
  assert.equal(markup.includes("item.expanded ? 'arrow-up' : 'arrow-down'"), true)
  assert.equal(markup.includes("{{item.expanded ? 'templateItem--expanded' : ''}}"), true)
  assert.equal(styles.includes('-webkit-line-clamp: 3'), true)
  assert.match(compactStyles, /\.templateItem\{[^}]*height:220rpx;/)
  assert.match(compactStyles, /\.templateItem--expanded\{[^}]*height:auto;/)
  assert.equal(config.usingComponents['van-icon'], '@vant/weapp/icon/index')

  page.onUnload()
  assert.equal(audio.destroyed, true)
})

test('advertising templates combine paginated responses', async () => {
  const requestedPages = []
  const { page } = loadPage('pages/commonTemplate/commonTemplate.js', {
    request: async (options) => {
      requestedPages.push(options.data.page)
      if (options.data.page === 1) {
        return {
          code: 200,
          data: [{ id: 3, category: '餐饮', content: 'Page one' }],
          total_pages: 2
        }
      }
      return {
        code: 200,
        data: [{ id: 4, category: '餐饮', content: 'Page two' }],
        total_pages: 2
      }
    }
  })

  await page.onLoad()

  assert.deepEqual(requestedPages, [1, 2])
  assert.equal(page.data.currentTemplates.length, 2)
  page.onUnload()
})

test('my templates can be created, edited, used, and deleted', async () => {
  const requestCalls = []
  const myTemplates = []
  const modalCalls = []
  const { eventChannel, navigationCalls, page } = loadPage(
    'pages/commonTemplate/commonTemplate.js',
    {
      request: async (options) => {
        requestCalls.push(options)
        if (options.url === '/ad-templates/') {
          return { code: 200, data: [], total_pages: 1 }
        }
        if (options.url === '/user/my-templates' && options.method === 'GET') {
          return { code: 200, data: myTemplates.map((item) => ({ ...item })), total_pages: 1 }
        }
        if (options.url === '/user/my-templates' && options.method === 'POST') {
          myTemplates.unshift({ id: 21, content: options.data.content })
          return { code: 200, data: { ...myTemplates[0] } }
        }
        if (options.url === '/user/my-templates/21' && options.method === 'PUT') {
          myTemplates[0].content = options.data.content
          return { code: 200, data: { ...myTemplates[0] } }
        }
        if (options.url === '/user/my-templates/21' && options.method === 'DELETE') {
          myTemplates.splice(0, 1)
          return { code: 200, data: {} }
        }
        throw new Error(`Unexpected request: ${options.method} ${options.url}`)
      },
      wx: {
        showModal(options) {
          modalCalls.push(options)
          options.success({ confirm: true, cancel: false })
        }
      }
    }
  )

  await page.onLoad()
  page.selectCategory({ currentTarget: { dataset: { key: 'add' } } })
  assert.equal(page.data.templateDialogVisible, true)
  assert.equal(page.data.templateDialogMode, 'create')
  assert.equal(page.data.templateDraft, '')

  page.onTemplateInput({ detail: { value: '  New personal copy  ' } })
  await page.submitTemplate()
  const createCall = requestCalls.find((call) => call.method === 'POST')
  assert.equal(createCall.url, '/user/my-templates')
  assert.equal(createCall.data.content, 'New personal copy')
  assert.equal(createCall.needAuth, true)
  assert.equal(page.data.templateDialogVisible, false)
  assert.equal(page.data.activeCategoryKey, 'mine')
  assert.equal(page.data.currentTemplates[0].content, 'New personal copy')
  const listCall = requestCalls.find((call) => call.url === '/user/my-templates' && call.method === 'GET')
  assert.equal(listCall.data.page, 1)
  assert.equal(listCall.data.page_size, 100)
  assert.equal(listCall.needAuth, true)

  page.openEditTemplate({ currentTarget: { dataset: { id: 21 } } })
  assert.equal(page.data.templateDialogVisible, true)
  assert.equal(page.data.templateDialogMode, 'edit')
  assert.equal(page.data.templateDraft, 'New personal copy')
  page.onTemplateInput({ detail: { value: 'Edited personal copy' } })
  await page.submitTemplate()
  const updateCall = requestCalls.find((call) => call.method === 'PUT')
  assert.equal(updateCall.url, '/user/my-templates/21')
  assert.equal(updateCall.data.content, 'Edited personal copy')
  assert.equal(updateCall.needAuth, true)
  assert.equal(page.data.currentTemplates[0].content, 'Edited personal copy')

  page.useTemplate({ currentTarget: { dataset: { id: 21, source: 'mine' } } })
  assert.equal(eventChannel.emitted.at(-1).name, 'templateSelected')
  assert.equal(eventChannel.emitted.at(-1).payload.content, 'Edited personal copy')
  assert.equal(navigationCalls.at(-1).type, 'back')

  await page.deleteTemplate({ currentTarget: { dataset: { id: 21 } } })
  assert.equal(modalCalls.at(-1).title, '删除模板')
  assert.equal(modalCalls.at(-1).content, '确定删除该模板吗？')
  const deleteCall = requestCalls.find((call) => call.method === 'DELETE')
  assert.equal(deleteCall.url, '/user/my-templates/21')
  assert.equal(deleteCall.needAuth, true)
  assert.equal(page.data.currentTemplates.length, 0)
  page.onUnload()
})

test('my template dialog validates content and deletion can be cancelled', async () => {
  const requestCalls = []
  const { page, toastCalls } = loadPage('pages/commonTemplate/commonTemplate.js', {
    request: async (options) => {
      requestCalls.push(options)
      if (options.url === '/ad-templates/') {
        return { code: 200, data: [], total_pages: 1 }
      }
      if (options.url === '/user/my-templates') {
        return {
          code: 200,
          data: [{ id: 22, content: 'Keep this copy' }],
          total_pages: 1
        }
      }
      throw new Error('Delete should not be requested')
    },
    wx: {
      showModal(options) {
        options.success({ confirm: false, cancel: true })
      }
    }
  })

  await page.onLoad()
  page.selectCategory({ currentTarget: { dataset: { key: 'add' } } })
  page.onTemplateInput({ detail: { value: '   ' } })
  await page.submitTemplate()
  assert.equal(toastCalls.at(-1).title, '请输入模板内容')
  assert.equal(requestCalls.some((call) => call.method === 'POST'), false)

  await page.selectCategory({ currentTarget: { dataset: { key: 'mine' } } })
  await page.deleteTemplate({ currentTarget: { dataset: { id: 22 } } })
  assert.equal(requestCalls.some((call) => call.method === 'DELETE'), false)
  assert.equal(page.data.currentTemplates.length, 1)

  const markup = read('pages/commonTemplate/commonTemplate.wxml')
  assert.equal(markup.includes('maxlength="2000"'), true)
  assert.equal(markup.includes('bindtap="openEditTemplate"'), true)
  assert.equal(markup.includes('bindtap="deleteTemplate"'), true)
  assert.equal(markup.includes('bindtap="submitTemplate"'), true)
  page.onUnload()
})

test('advertising templates retain empty directories when loading fails', async () => {
  const { page, toastCalls } = loadPage('pages/commonTemplate/commonTemplate.js', {
    request: async () => { throw new Error('database unavailable') }
  })

  await page.onLoad()

  assert.deepEqual(Array.from(page.data.templateCategories, (item) => item.name), [
    '添加模板',
    '我的模板'
  ])
  assert.equal(page.data.currentTemplates.length, 0)
  assert.equal(page.data.templateEmptyText, '模板加载失败')
  assert.equal(toastCalls.at(-1).title, '广告模板加载失败')
  page.onUnload()
})

test('generic voice tab loads lazily and controls one audio context', async () => {
  const requestCalls = []
  const voices = [
    { id: 10, name: '报警声', music_file: 'http://media.local/alarm.mp3' },
    { id: 11, name: '叮咚', music_file: 'media.local/chime.mp3' }
  ]
  const { audio, page, toastCalls } = loadPage('pages/commonTemplate/commonTemplate.js', {
    request: async (options) => {
      requestCalls.push(options)
      if (options.url === '/generic-voices') {
        return { code: '200', data: voices, total_pages: 1 }
      }
      return { code: 200, data: [], total_pages: 1 }
    }
  })

  await page.onLoad()
  assert.equal(requestCalls.some((call) => call.url === '/generic-voices'), false)

  await page.switchTab({ currentTarget: { dataset: { tab: 'generic' } } })
  const genericCall = requestCalls.find((call) => call.url === '/generic-voices')
  assert.equal(genericCall.method, 'GET')
  assert.equal(genericCall.data.page_size, 100)
  assert.equal(genericCall.needAuth, false)
  assert.equal(page.data.genericVoices.length, 2)
  assert.equal(page.normalizeAudioUrl('HTTPS://media.local/voice.mp3'), 'HTTPS://media.local/voice.mp3')

  page.playGeneric({ currentTarget: { dataset: { id: 10 } } })
  assert.equal(audio.src, 'http://media.local/alarm.mp3')
  assert.equal(page.data.playingId, 10)
  page.playGeneric({ currentTarget: { dataset: { id: 10 } } })
  assert.equal(audio.paused, true)
  assert.equal(page.data.playingId, 0)

  page.playGeneric({ currentTarget: { dataset: { id: 11 } } })
  assert.equal(audio.src, 'https://media.local/chime.mp3')
  assert.equal(page.data.playingId, 11)
  audio.trigger('ended')
  assert.equal(page.data.playingId, 0)
  page.playGeneric({ currentTarget: { dataset: { id: 11 } } })
  audio.trigger('error', new Error('preview failed'))
  assert.equal(audio.stopped, true)
  assert.equal(page.data.playingId, 0)
  assert.equal(toastCalls.at(-1).title, '通用语音播放失败')

  await page.switchTab({ currentTarget: { dataset: { tab: 'templates' } } })
  await page.switchTab({ currentTarget: { dataset: { tab: 'generic' } } })
  assert.equal(requestCalls.filter((call) => call.url === '/generic-voices').length, 1)

  page.onHide()
  assert.equal(audio.paused, true)
  page.onUnload()
  assert.equal(audio.destroyed, true)

  const markup = read('pages/commonTemplate/commonTemplate.wxml')
  assert.equal(markup.includes('bindtap="switchTab"'), true)
  assert.equal(markup.includes("item.id === playingId ? 'pause-circle' : 'play-circle'"), true)
  assert.equal(markup.includes('bindtap="sendGeneric"'), true)
})

test('generic voice send stores the audio URL and opens generate page', async () => {
  const app = { globalData: { generate: {} } }
  const voice = { id: 12, name: '报警声', music_file: 'http://media.local/alarm.mp3' }
  const { navigationCalls, page } = loadPage('pages/commonTemplate/commonTemplate.js', {
    app,
    request: async (options) => ({
      code: 200,
      data: options.url === '/generic-voices' ? [voice] : [],
      total_pages: 1
    })
  })

  await page.onLoad()
  await page.switchTab({ currentTarget: { dataset: { tab: 'generic' } } })
  page.sendGeneric({ currentTarget: { dataset: { id: 12 } } })

  assert.equal(app.globalData.generate.audio_url, 'http://media.local/alarm.mp3')
  assert.equal(app.globalData.generate.file_name, 'alarm.mp3')
  assert.equal(navigationCalls.at(-1).options.url, '../generate/generate')
  page.onUnload()
})

test('generic voice URLs remain valid in generate page', () => {
  const loadGenerateUrl = (audioUrl) => {
    const app = {
      globalData: { generate: { audio_url: audioUrl } },
      bletool: { setCurPage() {} },
      hextool: { setCurPage() {} }
    }
    const { page } = loadPage('pages/generate/generate.js', { app })
    page.onLoad()
    const normalizedUrl = page.data.generate.audio_url
    page.onUnload()
    return { app, normalizedUrl }
  }

  const httpResult = loadGenerateUrl('http://media.local/a.mp3')
  assert.equal(httpResult.normalizedUrl, 'http://media.local/a.mp3')
  assert.equal(httpResult.app.globalData.generate.audio_url, 'http://media.local/a.mp3')
  assert.equal(loadGenerateUrl('https://media.local/b.mp3').normalizedUrl, 'https://media.local/b.mp3')
  assert.equal(loadGenerateUrl('HTTPS://media.local/b.mp3').normalizedUrl, 'HTTPS://media.local/b.mp3')
  assert.equal(loadGenerateUrl('media.local/c.mp3').normalizedUrl, 'https://media.local/c.mp3')
})

test('generate waveform animates only while audio is playing', () => {
  const app = {
    globalData: { generate: { audio_url: 'https://media.local/preview.mp3' } },
    bletool: { setCurPage() {} },
    hextool: { setCurPage() {} }
  }
  const { audio, page } = loadPage('pages/generate/generate.js', { app })

  page.onLoad()
  const initialWaveData = JSON.parse(JSON.stringify(page.data.waveData))
  assert.equal(initialWaveData.length, 60)
  assert.equal(initialWaveData.every((bar) => bar.height >= 20 && bar.height <= 100), true)

  page.playAudio()
  assert.equal(page.data.isPlaying, true)
  assert.equal(JSON.stringify(page.data.waveData), JSON.stringify(initialWaveData))

  audio.trigger('pause')
  assert.equal(page.data.isPlaying, false)
  assert.equal(JSON.stringify(page.data.waveData), JSON.stringify(initialWaveData))

  page.playAudio()
  audio.trigger('ended')
  assert.equal(page.data.isPlaying, false)

  page.playAudio()
  audio.trigger('error')
  assert.equal(page.data.isPlaying, false)

  const markup = read('pages/generate/generate.wxml')
  const styles = read('pages/generate/generate.wxss')
  assert.equal(markup.includes("isPlaying ? 'wave-bar-playing' : ''"), true)
  assert.equal(styles.includes('@keyframes wavePlaying'), true)
  page.onUnload()
})

test('advanced long text dubbing opens a registered dedicated page', () => {
  const appConfig = JSON.parse(read('app.json'))
  assert.equal(appConfig.pages.includes('pages/longTextDubbing/longTextDubbing'), true)

  const { navigationCalls, page } = loadPage('pages/advanced/advanced.js')
  page.openFeature({ currentTarget: { dataset: { key: 'long-text' } } })

  assert.equal(navigationCalls.at(-1).type, 'to')
  assert.equal(navigationCalls.at(-1).options.url, '../longTextDubbing/longTextDubbing')
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, `pages/longTextDubbing/longTextDubbing.${extension}`)),
      true
    )
  }
})

test('long text dubbing keeps its editing and voice effect controls', async () => {
  const requestCalls = []
  const { navigationCalls, page } = loadPage('pages/longTextDubbing/longTextDubbing.js', {
    request: async (options) => {
      requestCalls.push(options)
      if (options.url === '/user/voices/categories') {
        return { code: 200, data: createVoiceCatalog() }
      }
      if (options.url === '/user/bgms/categories') {
        return { code: 200, data: { categories: [], bgms: {} } }
      }
      throw new Error(`Unexpected request: ${options.url}`)
    }
  })

  await page.onLoad()
  assert.deepEqual(requestCalls.map((call) => call.url), [
    '/user/voices/categories',
    '/user/bgms/categories'
  ])

  page.onTextInput({ detail: { value: 'ABCD', cursor: 2 } })
  page.stopSet()
  page.stopSliderChange({ detail: { value: 1.5 } })
  page.stopPopConfirm()
  assert.equal(page.data.inputText, 'AB[\u505c\u987f1500ms]CD')
  assert.equal(page.data.stopShow, false)

  page.openTemplate()
  const templateCall = navigationCalls.at(-1)
  assert.equal(templateCall.options.url, '../commonTemplate/commonTemplate')
  templateCall.options.events.templateSelected({ content: 'Template copy' })
  assert.equal(page.data.inputText, 'Template copy')

  page.musicSet()
  page.musicSliderChange({ detail: { value: 1.3 } })
  page.voiceSliderChange({ detail: { value: 1.7 } })
  assert.equal(page.data.speed, 1.3)
  assert.equal(page.data.yxVoice, 1.7)
  page.musicPopReset()
  assert.equal(page.data.speed, 1)
  assert.equal(page.data.yxVoice, 2)
  assert.equal(page.data.musicSetShow, true)
  page.musicPopConfirm()
  assert.equal(page.data.musicSetShow, false)

  page.showBgmList()
  assert.equal(navigationCalls.at(-1).options.url, '../bgmSelect/bgmSelect')
  assert.equal(typeof page.convertToSpeech, 'function')

  const markup = read('pages/longTextDubbing/longTextDubbing.wxml')
  const styles = read('pages/longTextDubbing/longTextDubbing.wxss')
  const config = JSON.parse(read('pages/longTextDubbing/longTextDubbing.json'))
  assert.equal(markup.includes('maxlength="2000"'), true)
  assert.equal(markup.includes('bindtap="stopSet"'), true)
  assert.equal(markup.includes('bindtap="musicSet"'), true)
  assert.equal(markup.includes('bindtap="openTemplate"'), true)
  assert.equal(markup.includes('bindtap="moreVoice"'), true)
  assert.equal(markup.includes('bindtap="bgmPop"'), true)
  assert.equal(markup.includes('bindtap="convertToSpeech"'), true)
  assert.equal(markup.includes('value="{{yxVoice}}"'), true)
  assert.equal(markup.includes('bindchange="voiceSliderChange"'), true)
  assert.equal(markup.includes('bindtap="musicPopReset"'), true)
  assert.equal(markup.includes('>还原</button>'), true)
  assert.equal(markup.includes('<bgmset'), true)
  assert.equal(styles.includes('.heroSection'), true)
  assert.equal(styles.includes('.textPanel'), true)
  assert.equal(config.navigationBarTitleText, '\u957f\u6587\u672c\u914d\u97f3')
})

test('long text dubbing submits, polls, and opens the generated audio', async () => {
  const app = { globalData: { generate: { source: 'long-text' } } }
  const requestCalls = []
  let queryCount = 0
  const taskId = 'long-text-task-12345678901234567890'
  const { loadingCalls, navigationCalls, page } = loadPage(
    'pages/longTextDubbing/longTextDubbing.js',
    {
      app,
      request: async (options) => {
        requestCalls.push(options)
        if (options.url === '/user/voices/categories') {
          return { code: 200, data: createVoiceCatalog() }
        }
        if (options.url === '/user/bgms/categories') {
          return { code: 200, data: { categories: [], bgms: {} } }
        }
        if (options.url === '/user/tts/long-text/submit') {
          return { code: 200, data: { task_id: taskId, status: 'running', req_text_length: 18 } }
        }
        if (options.url === '/user/tts/long-text/query') {
          queryCount += 1
          return queryCount === 1
            ? { code: 200, data: { task_id: taskId, status: 'processing', req_text_length: 18 } }
            : {
                code: 200,
                data: {
                  task_id: taskId,
                  status: 'success',
                  req_text_length: 18,
                  audio_url: 'https://media.local/long-text.mp3'
                }
              }
        }
        throw new Error(`Unexpected request: ${options.url}`)
      }
    }
  )
  page.waitForNextPoll = async () => {}

  await page.onLoad()
  page.setData({
    inputText: 'AB[\u505c\u987f1000ms]CD',
    speed: 1.3,
    yxVoice: 1.7,
    bgmSetDetail: {
      bgm_id: 42,
      bgm_volume: 0.4,
      bgm_ducking: 'reduce',
      voice_delay: 2,
      bgm_tail: 3
    }
  })
  await page.convertToSpeech()

  const submitCall = requestCalls.find((call) => call.url === '/user/tts/long-text/submit')
  assert.equal(submitCall.method, 'POST')
  assert.equal(submitCall.needAuth, true)
  assert.equal(submitCall.data.text, '<speak>AB<break time="1.0s"></break>CD</speak>')
  assert.equal(submitCall.data.voice_id, page.data.voiceList[0].voice_id)
  assert.equal(submitCall.data.speed_ratio, 1.3)
  assert.equal(submitCall.data.volume_ratio, 1.7)
  assert.equal(submitCall.data.pitch_ratio, 1)
  assert.equal(submitCall.data.bgm_id, 42)
  assert.equal(submitCall.data.bgm_volume, 0.4)

  const queryCalls = requestCalls.filter((call) => call.url === '/user/tts/long-text/query')
  assert.equal(queryCalls.length, 2)
  assert.equal(queryCalls[0].method, 'POST')
  assert.deepEqual({ ...queryCalls[0].data }, { task_id: taskId })
  assert.equal(queryCalls[0].needAuth, true)
  assert.equal(app.globalData.generate.source, 'long-text')
  assert.equal(app.globalData.generate.audio_url, 'https://media.local/long-text.mp3')
  assert.equal(navigationCalls.at(-1).options.url, '../generate/generate')
  assert.equal(loadingCalls.at(-2).type, 'show')
  assert.equal(loadingCalls.at(-2).options.mask, true)
  assert.equal(loadingCalls.at(-1).type, 'hide')
  assert.equal(page.data.synthesizing, false)
  page.onUnload()
})

test('long text dubbing blocks pause insertion beyond 2000 characters', () => {
  const { page, toastCalls } = loadPage('pages/longTextDubbing/longTextDubbing.js')

  page.setData({ inputText: 'a'.repeat(1990), cursorPosition: 1990, stopVal: 1, stopShow: false })
  page.stopSet()
  assert.equal(page.data.stopShow, true)
  page.stopPopConfirm()
  assert.equal(page.data.inputText.length, 2000)
  assert.equal(page.data.inputText.endsWith('[\u505c\u987f1000ms]'), true)

  const overLimitText = 'b'.repeat(1991)
  page.setData({ inputText: overLimitText, cursorPosition: 1991, stopVal: 1, stopShow: false })
  page.stopSet()
  assert.equal(page.data.stopShow, false)
  assert.equal(page.data.inputText, overLimitText)
  assert.equal(toastCalls.at(-1).title, '\u6700\u591a\u8f93\u51652000\u4e2a\u5b57\u7b26')

  page.setData({ inputText: 'c'.repeat(1990), cursorPosition: 1990, stopVal: 1, stopShow: false })
  page.stopSet()
  page.setData({ stopVal: 10 })
  page.stopPopConfirm()
  assert.equal(page.data.stopShow, true)
  assert.equal(page.data.inputText, 'c'.repeat(1990))
  assert.equal(toastCalls.at(-1).title, '\u6700\u591a\u8f93\u51652000\u4e2a\u5b57\u7b26')
})

test('long text dubbing reports submit failure and hides loading', async () => {
  const { loadingCalls, navigationCalls, page, toastCalls } = loadPage(
    'pages/longTextDubbing/longTextDubbing.js',
    {
      request: async (options) => {
        if (options.url === '/user/tts/long-text/submit') {
          return { code: 500, message: '长文本任务提交失败', data: null }
        }
        return { code: 200, data: {} }
      }
    }
  )
  page.pageActive = true
  page.setData({ inputText: '需要合成的长文本内容' })

  await page.convertToSpeech()

  assert.equal(toastCalls.at(-1).title, '长文本任务提交失败')
  assert.equal(navigationCalls.length, 0)
  assert.equal(loadingCalls.at(-2).type, 'show')
  assert.equal(loadingCalls.at(-1).type, 'hide')
  assert.equal(page.data.synthesizing, false)
})

test('long text dubbing reports failed polling and hides loading', async () => {
  const taskId = 'long-text-task-12345678901234567890'
  const { loadingCalls, navigationCalls, page, toastCalls } = loadPage(
    'pages/longTextDubbing/longTextDubbing.js',
    {
      request: async (options) => {
        if (options.url === '/user/tts/long-text/submit') {
          return { code: 200, data: { task_id: taskId, status: 'running', req_text_length: 20 } }
        }
        if (options.url === '/user/tts/long-text/query') {
          return {
            code: 200,
            data: {
              task_id: taskId,
              status: 'processing_failed',
              req_text_length: 20,
              error_message: '长文本合成服务失败'
            }
          }
        }
        return { code: 200, data: {} }
      }
    }
  )
  page.pageActive = true
  page.setData({ inputText: '需要轮询失败的长文本内容' })

  await page.convertToSpeech()

  assert.equal(toastCalls.at(-1).title, '长文本合成服务失败')
  assert.equal(navigationCalls.length, 0)
  assert.equal(loadingCalls.at(-2).type, 'show')
  assert.equal(loadingCalls.at(-1).type, 'hide')
  assert.equal(page.data.synthesizing, false)
})

test('long text dubbing stops after 40 polls and reports synthesis failure', async () => {
  const taskId = 'long-text-task-poll-limit'
  let queryCount = 0
  let waitCount = 0
  const { loadingCalls, navigationCalls, page, toastCalls, uiCalls } = loadPage(
    'pages/longTextDubbing/longTextDubbing.js',
    {
      request: async (options) => {
        if (options.url === '/user/tts/long-text/submit') {
          return { code: 200, data: { task_id: taskId, status: 'running' } }
        }
        if (options.url === '/user/tts/long-text/query') {
          queryCount += 1
          return { code: 200, data: { task_id: taskId, status: 'processing' } }
        }
        return { code: 200, data: {} }
      }
    }
  )
  page.pageActive = true
  page.waitForNextPoll = async () => {
    waitCount += 1
  }
  page.setData({ inputText: '需要测试轮询次数上限的长文本内容' })

  await page.convertToSpeech()

  assert.equal(queryCount, 40)
  assert.equal(waitCount, 39)
  assert.equal(toastCalls.at(-1).title, '合成失败')
  assert.deepEqual(uiCalls.slice(-2), ['hideLoading', 'showToast'])
  assert.equal(navigationCalls.length, 0)
  assert.equal(loadingCalls.at(-1).type, 'hide')
  assert.equal(page.data.synthesizing, false)
})

test('mine pages are registered', () => {
  const appConfig = JSON.parse(read('app.json'))
  assert.equal(appConfig.pages.includes('pages/mine/mine'), true)

  for (const pageName of [
    'mine/mine',
    'faq/faq',
    'faqDetail/faqDetail',
    'feedback/feedback'
  ]) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.equal(fs.existsSync(path.join(projectRoot, `pages/${pageName}.${extension}`)), true)
    }
  }

})

test('mine page carries no user-authored profile at all', () => {
  // 2026-08 审核打回：「存在信息安全风险，请尽快完善内容机制：确保已接入
  // 内容安全API并要求所调用API可在小程序内任意发布的场景生效」，指的就是
  // 原来的头像上传 + 昵称编辑。这个小程序不靠用户身份做事，所以整套删了。
  //
  // 这条用例守的是**别加回来**：任何让用户填字、传图的入口，
  // 都会把那条审核意见原样带回来，而那要接一整条 imgSecCheck/msgSecCheck 链路。
  const appConfig = JSON.parse(read('app.json'))
  assert.equal(appConfig.pages.includes('pages/profile/profile'), false)
  assert.equal(fs.existsSync(path.join(projectRoot, 'pages/profile')), false)

  const markup = read('pages/mine/mine.wxml')
  const script = read('pages/mine/mine.js')
  for (const banned of ['openProfile', 'chooseAvatar', 'avatarUrl', 'nickname']) {
    assert.equal(markup.includes(banned), false)
  }
  // 注释里会提到「昵称/头像」解释为什么没有，所以只查可执行的部分——
  // 这个仓库已经被「断言撞上自己的注释」坑过四次了。
  const code = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const banned of ['profile', 'avatar', 'nickname']) {
    assert.equal(code.includes(banned), false)
  }
  // 首页不该再去拉 /user/profile
  assert.equal(code.includes('/user/profile'), false)

  const { navigationCalls, page } = loadPage('pages/mine/mine.js')
  page.openFaq()
  page.openFeedback()
  page.openContact()
  page.openAbout()
  assert.deepEqual(
    navigationCalls.map((call) => call.options.url),
    ['../faq/faq', '../feedback/feedback', '../contact/contact', '../about/about']
  )
})

test('contact and about pages are registered and open from mine settings', () => {
  const appConfig = JSON.parse(read('app.json'))
  assert.equal(appConfig.pages.includes('pages/contact/contact'), true)
  assert.equal(appConfig.pages.includes('pages/about/about'), true)

  for (const pageName of ['contact/contact', 'about/about']) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.equal(fs.existsSync(path.join(projectRoot, `pages/${pageName}.${extension}`)), true)
    }
  }

  const { navigationCalls, page } = loadPage('pages/mine/mine.js')
  page.openContact()
  page.openAbout()
  assert.deepEqual(
    navigationCalls.map((call) => call.options.url),
    ['../contact/contact', '../about/about']
  )

  const markup = read('pages/mine/mine.wxml')
  assert.equal(markup.includes('bindtap="openContact"'), true)
  assert.equal(markup.includes('bindtap="openAbout"'), true)
})

test('mine opens FAQ and feedback pages from its settings list', () => {
  const { navigationCalls, page } = loadPage('pages/mine/mine.js')

  page.openFaq()
  page.openFeedback()

  assert.deepEqual(
    navigationCalls.map((call) => call.options.url),
    ['../faq/faq', '../feedback/feedback']
  )

  const markup = read('pages/mine/mine.wxml')
  assert.equal(markup.includes('bindtap="openFaq"'), true)
  assert.equal(markup.includes('bindtap="openFeedback"'), true)
  assert.equal(markup.includes('常见问题'), true)
  assert.equal(markup.includes('意见反馈'), true)
})

test('feedback submits a trimmed category payload and prevents duplicate requests', async () => {
  const requestCalls = []
  let finishRequest
  const { page, toastCalls } = loadPage('pages/feedback/feedback.js', {
    request: (options) => {
      requestCalls.push(options)
      return new Promise((resolve) => {
        finishRequest = () => resolve({ code: 200, data: { id: 61 } })
      })
    }
  })

  page.selectCategory({ currentTarget: { dataset: { value: 'bug' } } })
  page.onContentInput({ detail: { value: '  播放时偶尔没有声音  ' } })
  const submitPromise = page.submitFeedback()
  page.submitFeedback()

  assert.equal(requestCalls.length, 1)
  assert.equal(requestCalls[0].url, '/user/feedback')
  assert.equal(requestCalls[0].method, 'POST')
  assert.equal(requestCalls[0].needAuth, true)
  assert.equal(requestCalls[0].data.category, 'bug')
  assert.equal(requestCalls[0].data.content, '播放时偶尔没有声音')
  assert.equal(page.data.submitting, true)

  finishRequest()
  await submitPromise

  assert.equal(page.data.submitting, false)
  assert.equal(page.data.content, '')
  assert.equal(toastCalls.at(-1).title, '提交成功')
})

test('FAQ list paginates and opens the selected detail page', async () => {
  const requestCalls = []
  const { navigationCalls, page } = loadPage('pages/faq/faq.js', {
    request: async (options) => {
      requestCalls.push(options)
      const pageNumber = options.data.page
      return {
        code: 200,
        data: pageNumber === 1
          ? [{ id: 11, title: '如何生成配音？', category: 'usage' }]
          : [{ id: 12, title: '为什么无法播放？', category: 'troubleshooting' }],
        page: pageNumber,
        page_size: 20,
        total: 2,
        total_pages: 2
      }
    }
  })

  await page.onLoad()
  assert.equal(requestCalls[0].url, '/faqs')
  assert.equal(requestCalls[0].needAuth, false)
  assert.equal(page.data.faqs[0].categoryLabel, '使用帮助')

  await page.loadMore()
  assert.equal(page.data.faqs.length, 2)
  assert.equal(page.data.faqs[1].categoryLabel, '故障排查')

  page.openDetail({ currentTarget: { dataset: { id: 12 } } })
  assert.equal(navigationCalls.at(-1).options.url, '../faqDetail/faqDetail?id=12')
  page.onUnload()
})

test('FAQ detail loads sanitized HTML for rich-text rendering', async () => {
  const requestCalls = []
  const { page } = loadPage('pages/faqDetail/faqDetail.js', {
    request: async (options) => {
      requestCalls.push(options)
      return {
        code: 200,
        data: {
          title: '如何连接设备？',
          category: 'usage',
          detail: '<p>请先打开蓝牙，再选择需要连接的设备。</p>'
        }
      }
    }
  })

  await page.onLoad({ id: '23' })

  assert.equal(requestCalls[0].url, '/faqs/23')
  assert.equal(requestCalls[0].method, 'GET')
  assert.equal(requestCalls[0].needAuth, false)
  assert.equal(page.data.title, '如何连接设备？')
  assert.equal(page.data.categoryLabel, '使用帮助')
  assert.equal(page.data.detail, '<p>请先打开蓝牙，再选择需要连接的设备。</p>')
  assert.equal(read('pages/faqDetail/faqDetail.wxml').includes('<rich-text'), true)
  page.onUnload()
})

test('contact page copies WeChat and calls the service phone number', () => {
  const clipboardCalls = []
  const phoneCalls = []
  const { page } = loadPage('pages/contact/contact.js', {
    wx: {
      setClipboardData(options) {
        clipboardCalls.push(options)
      },
      makePhoneCall(options) {
        phoneCalls.push(options)
      }
    }
  })

  page.copyWechat()
  page.callService()

  assert.equal(clipboardCalls[0].data, 'Darhopyb')
  assert.equal(phoneCalls[0].phoneNumber, '15381715397')

  const markup = read('pages/contact/contact.wxml')
  assert.equal(markup.includes('Darhopyb'), true)
  assert.equal(markup.includes('15381715397'), true)
  assert.equal(markup.includes('9:00-18:00(\u5468\u4e00\u81f3\u5468\u516d)'), true)
  assert.equal(markup.includes('bindtap="copyWechat"'), true)
  assert.equal(markup.includes('bindtap="callService"'), true)
})

test('about page follows the reference copy and uses an existing product image', () => {
  const config = JSON.parse(read('pages/about/about.json'))
  const markup = read('pages/about/about.wxml')
  const styles = read('pages/about/about.wxss')

  assert.equal(config.navigationBarTitleText, '\u5173\u4e8e\u6211\u4eec')
  assert.equal(markup.includes('\u5927\u6d2a\u914d\u97f3\u5c0f\u7a0b\u5e8f'), true)
  assert.equal(markup.includes('\u4e00\u7ad9\u5f0f\u97f3\u89c6\u9891\u5236\u4f5c'), true)
  assert.equal(markup.includes('src="/img/yinxiang1.png"'), true)
  assert.equal(styles.includes('linear-gradient'), true)
})

test('every AI generation page carries a visible AI-generated notice', () => {
  // 2026-08 审核：「你的小程序涉及提供文本深度合成技术（如：AI创作）等相关服务，
  // 请补充选择：深度合成-AI创作类目，并在AI生成页面增加显著说明
  // "AI生成、人工智能生成"或同等含义字样。」
  //
  // 上一轮只把「(AI生成)」塞进了 navigationBarTitleText，然后又被打回了——
  // 导航栏标题不算显著。所以现在是页面里的一条实体说明，跟内容挨着放。
  //
  // 清单的判断标准：**产出物不是用户自己写的/录的，就得标**。
  const pages = [
    'adCopy/adCopy',            // 文案生成入口（审核点名的那条）
    'adCopyResult/adCopyResult', // 生成出来的文案就显示在这儿
    'index/index',              // 首页「合成配音」
    'generate/generate',        // 合成结果
    'longTextDubbing/longTextDubbing',
    'dialogueDubbing/dialogueDubbing',
    'voiceConvert/voiceConvert'
  ]

  for (const pagePath of pages) {
    const config = JSON.parse(read(`pages/${pagePath}.json`))
    assert.equal(
      config.usingComponents['ai-notice'],
      '../../components/aiNotice/aiNotice',
      `${pagePath} 没注册 ai-notice`
    )
    const markup = read(`pages/${pagePath}.wxml`).replace(/<!--[\s\S]*?-->/g, '')
    assert.equal(markup.includes('<ai-notice'), true, `${pagePath} 没挂 ai-notice`)
  }

  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, `components/aiNotice/aiNotice.${extension}`)),
      true
    )
  }

  // 字样必须真的出现在渲染出来的东西里，不能只活在注释或文件名中
  const componentMarkup = read('components/aiNotice/aiNotice.wxml')
  assert.equal(componentMarkup.includes('AI生成'), true)
  const componentScript = read('components/aiNotice/aiNotice.js')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  assert.match(componentScript, /人工智能生成/)
})

// ---------------------------------------------------------------- 蓝牙权限检查
//
// 移植自福宝拼豆（E:\mini\福宝拼豆图纸制作-…）的 pages/bluetooth-permission。
// 界面照搬，检测逻辑改了三处——下面每一处都单独有一条用例守着，
// 因为它们全都是「不改也能跑、改错了只会误导用户」的那种，光看代码看不出来。

function loadBluetoothPermissionPage(overrides = {}) {
  const opened = []
  const wx = {
    getSystemInfoSync: () => ({ platform: overrides.platform === undefined ? 'ios' : overrides.platform }),
    getSystemSetting: () => overrides.system || { bluetoothEnabled: true, locationEnabled: true },
    getAppAuthorizeSetting: () => overrides.appAuthorize || {
      bluetoothAuthorized: 'authorized',
      locationAuthorized: 'authorized'
    },
    getSetting: ({ success }) => success({ authSetting: overrides.authSetting || {} }),
    openBluetoothAdapter: (options) => {
      if (overrides.adapterFail) {
        options.fail(overrides.adapterFail)
        return
      }
      options.success({})
    },
    getBluetoothAdapterState: ({ success }) =>
      success({ available: overrides.adapterAvailable !== false }),
    authorize: ({ success }) => success({}),
    openSetting: (options) => {
      opened.push('openSetting')
      if (options && options.complete) options.complete()
    },
    openAppAuthorizeSetting: (options) => {
      opened.push('openAppAuthorizeSetting')
      if (options && options.complete) options.complete()
    },
    showModal: (options) => {
      opened.push('showModal:' + options.title)
    }
  }
  const loaded = loadPage('pages/bluetoothPermission/bluetoothPermission.js', { wx })
  return { ...loaded, opened }
}

function itemOf(page, key) {
  return page.data.items.find((entry) => entry.key === key)
}

test('bluetooth permission page is registered and reachable from the mine tab', () => {
  const appConfig = JSON.parse(read('app.json'))
  assert.equal(appConfig.pages.includes('pages/bluetoothPermission/bluetoothPermission'), true)

  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'pages/bluetoothPermission/bluetoothPermission.' + extension)),
      true
    )
  }

  const pageConfig = JSON.parse(read('pages/bluetoothPermission/bluetoothPermission.json'))
  assert.equal(pageConfig.navigationBarTitleText, '蓝牙权限检查')

  // 入口在「我的」，而且排在「常见问题」前面——连不上是最常见的求助，
  // 这一页要比 FAQ 更好找。
  const markup = read('pages/mine/mine.wxml')
  assert.equal(markup.includes('bindtap="openBluetoothPermission"'), true)
  assert.equal(markup.includes('蓝牙权限检查'), true)
  // 先剥注释再比位置。上面那段注释里就写着「常见问题」四个字，
  // 不剥的话断言撞上的是注释而不是界面——这个仓库已经栽在这上面五次了。
  const rows = markup.replace(/<!--[\s\S]*?-->/g, '')
  assert.ok(
    rows.indexOf('蓝牙权限检查') < rows.indexOf('常见问题'),
    '蓝牙权限检查要排在常见问题前面'
  )

  const { navigationCalls, page } = loadPage('pages/mine/mine.js')
  page.openBluetoothPermission()
  assert.equal(navigationCalls.at(-1).options.url, '../bluetoothPermission/bluetoothPermission')
})

test('the mine list icon is visible against a white row, and the AI bubble clears the banner', () => {
  // 两个都是「代码没错、看着不对」的毛病，只有把约束写成断言才拦得住。

  // 一、bluetooth.png 是纯白图标（原本贴在 generate 页那个 #9E9E9E 灰圆上），
  //     放进白色设置列表里就是隐形的——那一行会只剩文字。用重新上色的红版。
  const mineMarkup = read('pages/mine/mine.wxml').replace(/<!--[\s\S]*?-->/g, '')
  assert.equal(mineMarkup.includes('/img/bluetooth_red.png'), true)
  assert.equal(mineMarkup.includes('/img/bluetooth.png'), false, '白图标在白底上是隐形的')
  assert.equal(fs.existsSync(path.join(projectRoot, 'img/bluetooth_red.png')), true)

  // 二、「AI 创作」悬浮球是 absolute + 负 top，靠 .textView 的上边距才躲得开
  //     横幅右下角那颗「进入」按钮。这段边距没了，两个按钮就重叠。
  const homeStyles = read('pages/index/index.wxss').replace(/\/\*[\s\S]*?\*\//g, '')
  const textView = homeStyles.match(/\.textView\s*\{[^}]*\}/)
  assert.ok(textView, '.textView 规则不见了')
  const marginTop = textView[0].match(/margin-top:\s*(\d+)rpx/)
  assert.ok(marginTop, '.textView 少了 margin-top，AI 创作会压住横幅的「进入」')
  assert.ok(Number(marginTop[1]) >= 40, '缝小于 40rpx 就躲不开，实测过')
})

test('bluetooth permission page lights up all six layers when everything is granted', async () => {
  const { page } = loadBluetoothPermissionPage()
  await page.runCheck()

  // 页面跑在 vm 沙箱里，它造的数组跟这边的 Array 不是同一个原型，
  // deepStrictEqual 会因为「结构一样但引用不等」挂掉。比字符串就没这问题。
  assert.equal(
    page.data.items.map((item) => item.key).join(','),
    'systemBluetooth,systemLocation,wechatBluetooth,wechatLocation,miniBluetooth,miniLocation'
  )
  assert.equal(page.data.okCount, 6)
  assert.equal(page.data.problemCount, 0)
  assert.equal(page.data.hasProblem, false)
  assert.equal(page.data.showSettingButton, false)
  assert.equal(page.data.summaryText, '全部就绪')
  // 系统开关说「已打开」，授权类说「已授权」——两种东西别混着说
  assert.equal(itemOf(page, 'systemBluetooth').status, '已打开')
  assert.equal(itemOf(page, 'miniBluetooth').status, '已授权')
})

test('bluetooth permission page treats location as optional on iOS but required on Android', async () => {
  // 移植时改的第一处：原版对定位一视同仁，于是 iPhone 上永远显示「有问题」，
  // 用户照着修还修不好——iOS 搜蓝牙压根不需要定位。
  const locationOff = { bluetoothEnabled: true, locationEnabled: false }

  const ios = loadBluetoothPermissionPage({ platform: 'ios', system: locationOff })
  await ios.page.runCheck()
  assert.equal(itemOf(ios.page, 'systemLocation').ok, false)
  assert.equal(itemOf(ios.page, 'systemLocation').optional, true)
  assert.equal(itemOf(ios.page, 'systemLocation').level, 'warn', '可选项没开是橙灯，不是红灯')
  assert.equal(ios.page.data.problemCount, 0, 'iOS 上定位没开不算拦路虎')
  assert.equal(ios.page.data.summaryText, '全部就绪')

  const android = loadBluetoothPermissionPage({ platform: 'android', system: locationOff })
  await android.page.runCheck()
  assert.equal(itemOf(android.page, 'systemLocation').optional, false)
  assert.equal(itemOf(android.page, 'systemLocation').level, 'bad')
  assert.equal(android.page.data.problemCount, 1)
  assert.equal(android.page.data.summaryText, '待处理 1 项')

  // 拿不到平台按「需要定位」处理：多报一项待办，好过漏掉安卓上真正的拦路虎
  const unknown = loadBluetoothPermissionPage({ platform: '', system: locationOff })
  await unknown.page.runCheck()
  assert.equal(itemOf(unknown.page, 'systemLocation').optional, false)
})

test('bluetooth permission page rechecks adapter state instead of trusting a cached open', async () => {
  // 移植时改的第二处：openBluetoothAdapter 打开过一次后会走缓存直接 success，
  // 用户中途关掉系统蓝牙它照样成功。只信 success 的话，「重新检查权限」
  // 对这一项就是个假绿灯——正好是这一页最不该出错的地方。
  const source = read('pages/bluetoothPermission/bluetoothPermission.js')
  assert.equal(source.includes('getBluetoothAdapterState'), true)

  // 适配器 open 成功、但实时状态是不可用：不能算就绪
  const { page } = loadBluetoothPermissionPage({
    platform: 'android',
    system: {},                 // 旧基础库拿不到 bluetoothEnabled
    adapterAvailable: false
  })
  await page.runCheck()
  assert.equal(itemOf(page, 'systemBluetooth').ok, false, 'open 成功但适配器不可用，仍要报出来')
})

test('bluetooth permission page blames the system switch, not the mini program, on errCode 10001', async () => {
  // 移植时改的第三处：原版把「适配器打不开」一律算成小程序没授权。
  // 但 10001 是系统蓝牙没开，那是第一项的事——归错了用户会去点小程序设置，
  // 在那儿翻半天也修不好。
  const { page } = loadBluetoothPermissionPage({
    platform: 'android',
    system: {},
    adapterFail: { errCode: 10001, errMsg: 'openBluetoothAdapter:fail not available' }
  })
  await page.runCheck()

  assert.equal(itemOf(page, 'systemBluetooth').ok, false, '系统蓝牙这一项要报红')
  assert.equal(itemOf(page, 'miniBluetooth').ok, true, '小程序授权没问题，别跟着一起报红')

  // 反过来：确实是被拒，就该算在小程序头上
  const denied = loadBluetoothPermissionPage({
    platform: 'android',
    system: { bluetoothEnabled: true, locationEnabled: true },
    adapterFail: { errMsg: 'openBluetoothAdapter:fail auth denied' }
  })
  await denied.page.runCheck()
  assert.equal(itemOf(denied.page, 'miniBluetooth').ok, false)
  assert.equal(itemOf(denied.page, 'systemBluetooth').ok, true)
})

test('bluetooth permission page refuses to fake a result inside devtools', async () => {
  // 工具里蓝牙是停用的，原版会老老实实报出六个「未打开」，看着像一堆真问题。
  const { page } = loadBluetoothPermissionPage({ platform: 'devtools' })
  await page.runCheck()

  assert.equal(page.data.runtimeSupported, false)
  assert.equal(page.data.items.length, 0)
  assert.equal(page.data.problemCount, 0, '不许在工具里报假问题')
  assert.match(page.data.runtimeReason, /真机/)

  const markup = read('pages/bluetoothPermission/bluetoothPermission.wxml')
  assert.equal(markup.includes('wx:if="{{!runtimeSupported}}"'), true)
})

test('bluetooth permission page never reports a missing field as a problem', async () => {
  // 旧基础库拿不到的字段是 undefined。拿不到 ≠ 没开——
  // 误报一次用户就不信这一页了，而这一页的全部价值就是「可信」。
  const { page } = loadBluetoothPermissionPage({
    platform: 'ios',
    system: {},
    appAuthorize: {},
    authSetting: {}
  })
  await page.runCheck()
  assert.equal(page.data.problemCount, 0)
  assert.equal(page.data.okCount, 6)
})

test('bluetooth permission rows route to the setting page that can actually fix them', async () => {
  const { page, opened } = loadBluetoothPermissionPage({
    platform: 'android',
    system: { bluetoothEnabled: false, locationEnabled: true },
    appAuthorize: { bluetoothAuthorized: 'denied', locationAuthorized: 'authorized' },
    authSetting: { 'scope.userLocation': false }
  })
  await page.runCheck()

  // 已就绪的行点了不该有任何反应
  page.fixItem({ currentTarget: { dataset: { key: 'wechatLocation' } } })
  assert.equal(opened.length, 0)

  // 小程序自己的授权 → 小程序设置页
  page.fixItem({ currentTarget: { dataset: { key: 'miniLocation' } } })
  assert.equal(opened.at(-1), 'openSetting')

  // 微信这个 App 在系统里的权限 → 系统应用设置页
  page.fixItem({ currentTarget: { dataset: { key: 'wechatBluetooth' } } })
  assert.equal(opened.at(-1), 'openAppAuthorizeSetting')

  // 系统总开关小程序打不开，只能告诉他去哪儿点
  page.fixItem({ currentTarget: { dataset: { key: 'systemBluetooth' } } })
  assert.equal(opened.at(-1), 'showModal:系统蓝牙开关')
})

// ---------------------------------------------------------------- 声纹授权
// 2026-08 审核第三次打回：「你的小程序涉及收集、使用和存储用户声纹录取，
// 需增加独立的《声纹授权协议》，明确告知收集用户个人信息的使用目的、方式和用途，
// 并取得用户授权同意后，才能获取用户个人声纹信息。」
//
// 下面这几条守的是那句「**才能**」——顺序反了就等于先开麦再补协议。

function loadRealVoiceConsent(initialStorage = {}) {
  const store = { ...initialStorage }
  const wx = {
    getStorageSync: (key) => (key in store ? store[key] : ''),
    setStorageSync: (key, value) => { store[key] = value },
    removeStorageSync: (key) => { delete store[key] }
  }
  const moduleShim = { exports: {} }
  vm.runInNewContext(read('utils/voiceConsent.js'), {
    module: moduleShim,
    exports: moduleShim.exports,
    wx
  }, { filename: 'utils/voiceConsent.js' })
  return { store, wx, consent: moduleShim.exports }
}

test('the standalone voiceprint agreement page exists and states purpose, method and use', () => {
  const appConfig = JSON.parse(read('app.json'))
  assert.equal(appConfig.pages.includes('pages/voiceAuth/voiceAuth'), true)
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, `pages/voiceAuth/voiceAuth.${extension}`)),
      true
    )
  }

  const { consent } = loadRealVoiceConsent()
  const agreement = consent.AGREEMENT
  assert.equal(agreement.title, '声纹授权协议')

  // 审核点名要有的三样。标题里就得能看见，别让审核去正文里找。
  const headings = agreement.sections.map((section) => section.heading).join('')
  assert.match(headings, /方式/, '要写清收集方式')
  assert.match(headings, /目的/, '要写清使用目的')
  assert.match(headings, /用途/, '要写清用途')

  // 《个人信息保护法》要求同意可撤回，撤回入口必须真的在页面上
  const markup = read('pages/voiceAuth/voiceAuth.wxml')
  assert.equal(markup.includes('bindtap="revoke"'), true, '协议页要有撤回入口')

  // 正文是从 utils/voiceConsent 取的，不许在页面里另抄一份——
  // 弹窗摘要和协议正文说法不一致，本身就是个合规问题
  const script = read('pages/voiceAuth/voiceAuth.js')
  assert.equal(script.includes("require('../../utils/voiceConsent')"), true)
  assert.equal(markup.includes('wx:for="{{sections}}"'), true)
})

test('recording is refused until the voiceprint agreement is accepted', () => {
  const calls = { getSetting: 0, authorize: 0, start: 0 }
  const recorder = {
    onStart() {}, onStop() {}, onError() {},
    start() { calls.start += 1 }
  }
  const consent = createVoiceConsentDouble(false)
  const { component, componentConfig } = loadComponent('components/recorder/recorder.js', {
    getRecorderManager: () => recorder,
    getSetting(options) { calls.getSetting += 1; options.success({ authSetting: {} }) },
    authorize(options) { calls.authorize += 1; options.success(); options.complete() },
    showToast() {}
  }, { consent })

  componentConfig.lifetimes.attached.call(component)
  component.startRecorder()

  // 弹的是协议，不是麦克风权限
  assert.equal(component.data.voiceAuthVisible, true)
  assert.equal(component.data.recordPermissionVisible, false)
  // **这三个 0 是这条用例的全部意义**：授权拿到之前，麦克风一步都没往前走
  assert.equal(calls.getSetting, 0, '声纹授权没拿到就不该去碰麦克风权限')
  assert.equal(calls.authorize, 0, '声纹授权没拿到就不该申请 scope.record')
  assert.equal(calls.start, 0, '声纹授权没拿到就绝不能开麦')

  // 不同意 = 到此为止，麦克风依旧一次没开
  component.onVoiceAuthReject()
  assert.equal(component.data.voiceAuthVisible, false)
  assert.equal(consent.state.granted, false)
  assert.equal(calls.getSetting + calls.authorize + calls.start, 0)

  // 同意：照真实顺序走一遍——弹窗组件先记下授权，再通知父级
  component.startRecorder()
  const { component: popup } = loadComponent('components/voiceAuth/voiceAuth.js', {}, { consent })
  const popupEvents = []
  popup.triggerEvent = (name) => popupEvents.push(name)
  popup.agree()
  assert.deepEqual(popupEvents, ['agree'], '弹窗要在记下授权后才通知父级')
  assert.equal(consent.state.granted, true)
  assert.equal(consent.state.grants, 1)
  assert.match(consent.state.at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, '要记下授权时间')

  // 同意声纹协议之后接的是**麦克风权限**，不是直接开录——
  // 两道闸门是分开的：给过微信麦克风权限不等于同意收集声纹，反过来也一样
  component.onVoiceAuthAgree()
  assert.equal(calls.getSetting, 1)
  assert.equal(component.data.recordPermissionVisible, true, '这台机器还没给麦克风权限')
  assert.equal(calls.start, 0, '麦克风权限还没拿到，仍然不能开麦')

  component.confirmRecordPermission()
  assert.equal(calls.authorize, 1)
  assert.equal(calls.start, 1)

  // 存储写不进去时（配额满、隐私模式）不能变成弹窗→同意→弹窗的死循环：
  // 用户点过「同意」，这一次就该录得上
  const stubborn = createVoiceConsentDouble(false)
  stubborn.module.grant = () => false
  const { component: looped, componentConfig: loopedConfig } = loadComponent(
    'components/recorder/recorder.js',
    {
      getRecorderManager: () => recorder,
      getSetting(options) { options.success({ authSetting: { 'scope.record': true } }) },
      showToast() {}
    },
    { consent: stubborn }
  )
  loopedConfig.lifetimes.attached.call(looped)
  looped.startRecorder()
  assert.equal(looped.data.voiceAuthVisible, true)
  const before = calls.start
  looped.onVoiceAuthAgree()
  assert.equal(looped.data.voiceAuthVisible, false)
  assert.equal(calls.start, before + 1, '同意过了就该录得上，不许再弹一次')
})

test('voice conversion also gates recording behind the agreement', () => {
  let startCalls = 0
  const recorder = {
    onStart() {}, onStop() {}, onError() {},
    start() { startCalls += 1 }
  }
  const consent = createVoiceConsentDouble(false)
  const { page } = loadPage('pages/voiceConvert/voiceConvert.js', {
    consent,
    wx: { getRecorderManager: () => recorder }
  })

  page.setupRecorder()
  page.setData({ timbres: [{ id: 7 }], selectedTimbreId: 7 })

  page.startRecording()
  assert.equal(page.data.voiceAuthVisible, true)
  assert.equal(startCalls, 0, '音色转换处理的正是声纹，同样不许先开麦')

  page.onVoiceAuthReject()
  assert.equal(startCalls, 0)

  page.startRecording()
  page.onVoiceAuthAgree()
  assert.equal(startCalls, 1)

  // 授权由弹窗组件记，父级只管往下走——两处共用同一个弹窗
  const { component: popup } = loadComponent('components/voiceAuth/voiceAuth.js', {}, { consent })
  popup.triggerEvent = () => {}
  popup.agree()
  assert.equal(consent.state.granted, true)
})

test('every place that opens the microphone checks the agreement first', () => {
  // 新加录音入口时这条会红。别改断言——去给新入口加闸门。
  const sources = [
    ['components/recorder/recorder.js', 'startRecorder'],
    ['pages/voiceConvert/voiceConvert.js', 'startRecording']
  ]

  for (const [file] of sources) {
    const code = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    const gate = code.indexOf('voiceConsent.granted()')
    assert.ok(gate > -1, `${file} 没有声纹授权闸门`)
    // 闸门必须在开麦动作**前面**出现
    for (const opener of ['recorder.start(', 'wx.authorize(', 'wx.getSetting(']) {
      const at = code.indexOf(opener)
      if (at === -1) continue
      assert.ok(gate < at, `${file}：${opener} 出现在声纹授权闸门之前，顺序反了`)
    }
  }

  // 会开麦的文件就这两个。多出来的必须一并加闸门。
  const openers = []
  for (const dir of ['pages', 'components']) {
    const walk = (current) => {
      for (const entry of fs.readdirSync(path.join(projectRoot, current))) {
        const next = `${current}/${entry}`
        if (fs.statSync(path.join(projectRoot, next)).isDirectory()) { walk(next); continue }
        if (!entry.endsWith('.js')) continue
        if (/\.start\(\{/.test(read(next))) openers.push(next)
      }
    }
    walk(dir)
  }
  assert.deepEqual(openers.sort(), sources.map(([file]) => file).sort())
})

test('voice consent survives a restart, and revoking it really takes the grant away', () => {
  const first = loadRealVoiceConsent()
  assert.equal(first.consent.granted(), false, '没授权过就该是 false')

  first.consent.grant('2026-08-14 12:00:00')
  assert.equal(first.consent.granted(), true)
  assert.equal(first.consent.grantedAt(), '2026-08-14 12:00:00')

  // 换个「进程」，存储原样带过去——重启后不该再问一遍
  const restarted = loadRealVoiceConsent(first.store)
  assert.equal(restarted.consent.granted(), true)

  restarted.consent.revoke()
  assert.equal(restarted.consent.granted(), false)
  assert.equal(restarted.consent.grantedAt(), '')

  // 协议实质改版后，老授权作废，要重新问
  const stale = loadRealVoiceConsent({
    [first.consent.STORAGE_KEY]: { granted: true, version: 0, at: '2025-01-01 00:00:00' }
  })
  assert.equal(stale.consent.granted(), false, '旧版协议的授权不该继续算数')

  // 存储读不出来时按「没授权」处理：宁可多问一次，也不能默认放行
  const broken = loadRealVoiceConsent()
  broken.wx.getStorageSync = () => { throw new Error('storage exploded') }
  const reloaded = { exports: {} }
  vm.runInNewContext(read('utils/voiceConsent.js'), {
    module: reloaded, exports: reloaded.exports, wx: broken.wx
  }, { filename: 'utils/voiceConsent.js' })
  assert.equal(reloaded.exports.granted(), false)
})

test('the agreement is reachable and revocable from the mine tab', () => {
  const { navigationCalls, page } = loadPage('pages/mine/mine.js')
  page.openVoiceAuth()
  assert.equal(navigationCalls.at(-1).options.url, '../voiceAuth/voiceAuth')

  const markup = read('pages/mine/mine.wxml').replace(/<!--[\s\S]*?-->/g, '')
  assert.equal(markup.includes('bindtap="openVoiceAuth"'), true)
  assert.equal(markup.includes('声纹授权协议'), true)

  // 撤回：走的是二次确认，别让人一不小心点掉
  const consent = createVoiceConsentDouble(true)
  let modalCalls = 0
  const { page: authPage } = loadPage('pages/voiceAuth/voiceAuth.js', {
    consent,
    wx: {
      showModal(options) { modalCalls += 1; options.success({ confirm: true }) }
    }
  })
  authPage.onShow()
  assert.equal(authPage.data.granted, true)
  authPage.revoke()
  assert.equal(modalCalls, 1, '撤回要二次确认')
  assert.equal(consent.state.revokes, 1)
  assert.equal(authPage.data.granted, false)
})

test('the consent popup and the full agreement cannot drift apart', () => {
  // 弹窗摘要和协议正文都从 utils/voiceConsent 取。
  // 谁把文案硬编码回 wxml，这条就红。
  const popup = read('components/voiceAuth/voiceAuth.js')
  assert.equal(popup.includes("require('../../utils/voiceConsent')"), true)
  assert.equal(popup.includes('voiceConsent.AGREEMENT.summary'), true)

  const popupMarkup = read('components/voiceAuth/voiceAuth.wxml')
  assert.equal(popupMarkup.includes('wx:for="{{summary}}"'), true)
  assert.equal(popupMarkup.includes('bindtap="openAgreement"'), true, '弹窗要能看完整协议')
  assert.equal(popupMarkup.includes('bindtap="agree"'), true)
  assert.equal(popupMarkup.includes('bindtap="reject"'), true)

  // 两个入口挂的是同一个组件——同一件事在两处说法不同也是合规问题
  for (const [config, markup] of [
    ['components/recorder/recorder.json', 'components/recorder/recorder.wxml'],
    ['pages/voiceConvert/voiceConvert.json', 'pages/voiceConvert/voiceConvert.wxml']
  ]) {
    assert.ok(JSON.parse(read(config)).usingComponents['voice-auth'], `${config} 没注册 voice-auth`)
    assert.equal(read(markup).includes('<voice-auth'), true, `${markup} 没挂 voice-auth`)
  }

  // 点遮罩不能关掉：同意与否必须是个明确动作
  const styles = read('components/voiceAuth/voiceAuth.wxss')
  assert.equal(styles.includes('.vaMask'), true)
  assert.equal(popupMarkup.includes('bindtap="close"'), false, '不许点遮罩溜过去')
})

async function main() {
  let failures = 0

  for (const item of tests) {
    try {
      await item.run()
      console.log(`PASS ${item.name}`)
    } catch (error) {
      failures += 1
      console.error(`FAIL ${item.name}`)
      console.error(error.stack || error)
    }
  }

  if (failures) {
    process.exitCode = 1
  } else {
    console.log(`PASS ${tests.length} tests`)
  }
}

main()
