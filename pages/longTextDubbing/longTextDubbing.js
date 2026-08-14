const { request, showToast } = require('../../utils/request')
const app = getApp()

const LONG_TEXT_POLL_INTERVAL = 1500
const LONG_TEXT_MAX_POLLS = 200
const MAX_INPUT_LENGTH = 2000

const DEFAULT_VOICES = [
  { voice_name: '智云', voice_id: 'zh_male_wenrouxiaoge_mars_bigtts', headImg: 'streamer2.jpg' },
  { voice_name: '智聆', voice_id: 'zh_female_shuangkuaisisi_moon_bigtts', headImg: 'streamer1.jpg' },
  { voice_name: '智瑜', voice_id: 'zh_female_linzhiling_mars_bigtts', headImg: 'streamer3.jpg' },
  { voice_name: '知米', voice_id: 'zh_male_hupunan_mars_bigtts', headImg: 'streamer4.jpg' }
]

Page({
  data: {
    inputText: '',
    cursorPosition: 0,
    voiceList: [
      // {
      //   "id": 10,
      //   "voice_id": "en_male_alex_uranus_bigtts",
      //   "voice_name": "Alex",
      //   "icon": "https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_hz_ihsph/ljhwZthlaukjlkulzlp/portal/bigtts/avatar/Alex_en_male_alex_uranus_bigtts.png",
      //   "audio_path": null,
      //   "language": "en-US",
      //   "level": "normal",
      //   "description": "American English male",
      //   "is_favorite": false
      // }
    ],
    voiceIndex: 0,
    voiceCheckInfo: {},
    voiceMoreList: {},
    speed: 1,
    yxVoice: 2,
    musicSetShow: false,
    stopShow: false,
    stopVal: '1.0',
    bgmSetPop: false,
    bgmList: {},
    activeBgmInfo: {},
    bgmSetDetail: {},
    synthesizing: false
  },

  onLoad() {
    this.pageActive = true
    this.createVoicePreviewAudio()
    const requests = []
    const voiceCatalog = wx.getStorageSync('voiceLongList')
    const bgmCatalog = wx.getStorageSync('bgmList')

    if (voiceCatalog && typeof voiceCatalog === 'object') {
      this.handleVoiceList(voiceCatalog)
    } else {
      requests.push(this.getVoiceLongList())
    }
    if (bgmCatalog && typeof bgmCatalog === 'object') {
      this.handleBgmList(bgmCatalog)
    } else {
      requests.push(this.getBgmList())
    }
    return Promise.all(requests)
  },

  onHide() {
    this.stopVoicePreview()
  },

  onUnload() {
    this.pageActive = false
    this.destroyVoicePreviewAudio()
    this.cancelPolling()
    if (this.data.synthesizing) wx.hideLoading()
  },

  async getVoiceLongList() {
    try {
      const res = await request({
        // url: '/user/voices/categories',
        url: '/user/voices/long-text/categories',
        method: 'GET',
        needAuth: true
      })
      if (Number(res.code) === 200 && this.pageActive) {
        this.handleVoiceList(res.data)
        wx.setStorageSync('voiceLongList', res.data)
      }
    } catch (error) {
      if (!this.pageActive) return
      console.error('获取主播列表失败:', error)
      showToast('none', '主播列表加载失败')
    }
  },

  async getBgmList() {
    try {
      const res = await request({
        url: '/user/bgms/categories',
        method: 'GET',
        needAuth: true
      })
      if (Number(res.code) === 200 && this.pageActive) {
        this.handleBgmList(res.data)
        wx.setStorageSync('bgmList', res.data)
      }
    } catch (error) {
      if (!this.pageActive) return
      console.error('获取背景音乐列表失败:', error)
      showToast('none', '背景音乐加载失败')
    }
  },

  handleVoiceList(data) {
    const voiceCatalog = data || {}
    const homeVoices = Array.isArray(voiceCatalog.home) ? voiceCatalog.home : []
    this.setData({
      voiceMoreList: voiceCatalog,
      voiceList: homeVoices,
      voiceCheckInfo: homeVoices[0]
    })
  },

  handleBgmList(data) {
    this.setData({ bgmList: data || {} })
  },

  onTextInput(e) {
    const inputText = String(e.detail.value || '').slice(0, MAX_INPUT_LENGTH)
    const cursorPosition = e.detail.cursor === undefined
      ? inputText.length
      : Math.min(Number(e.detail.cursor) || 0, inputText.length)
    this.setData({ inputText, cursorPosition })
  },

  updateCursor(e) {
    if (e.detail.cursor === undefined) return
    this.setData({ cursorPosition: e.detail.cursor })
  },

  clearText() {
    this.setData({ inputText: '', cursorPosition: 0 })
  },

  openTemplate() {
    wx.navigateTo({
      url: '../commonTemplate/commonTemplate',
      events: {
        templateSelected: ({ content = '' } = {}) => {
          const inputText = String(content).slice(0, MAX_INPUT_LENGTH)
          this.setData({ inputText, cursorPosition: inputText.length })
        }
      }
    })
  },

  stopSet() {
    if (!this.data.stopShow) {
      const pauseText = this.buildPauseText(this.data.stopVal)
      if (!this.canInsertText(pauseText)) return
    }
    this.setData({ stopShow: !this.data.stopShow })
  },

  stopSliderChange(e) {
    this.setData({ stopVal: Number(e.detail.value).toFixed(1) })
  },

  stopPopConfirm() {
    const inputText = this.data.inputText || ''
    const cursor = Math.max(0, Math.min(Number(this.data.cursorPosition) || 0, inputText.length))
    const pauseText = this.buildPauseText(this.data.stopVal)
    if (!this.canInsertText(pauseText)) return
    const nextText = `${inputText.slice(0, cursor)}${pauseText}${inputText.slice(cursor)}`
    this.setData({
      inputText: nextText,
      cursorPosition: cursor + pauseText.length,
      stopShow: false
    })
  },

  buildPauseText(stopVal) {
    const pauseMs = Math.round(Number(stopVal) * 1000)
    return `[停顿${pauseMs}ms]`
  },

  canInsertText(insertText) {
    const inputText = String(this.data.inputText || '')
    if (inputText.length + insertText.length <= MAX_INPUT_LENGTH) return true
    showToast('none', `最多输入${MAX_INPUT_LENGTH}个字符`)
    return false
  },

  musicSet() {
    this.setData({ musicSetShow: !this.data.musicSetShow })
  },

  musicSliderChange(e) {
    this.setData({ speed: Number(Number(e.detail.value).toFixed(1)) })
  },

  voiceSliderChange(e) {
    this.setData({ yxVoice: Number(Number(e.detail.value).toFixed(1)) })
  },

  musicPopConfirm() {
    this.setData({ musicSetShow: false })
  },

  musicPopReset() {
    this.setData({
      speed: 1,
      yxVoice: 2
    })
  },

  changeStreamer(e) {
    const voiceIndex = Number(e.currentTarget.id)
    const voiceCheckInfo = this.data.voiceList[voiceIndex]
    if (!voiceCheckInfo) return
    this.setData({ voiceIndex, voiceCheckInfo })
    this.playVoicePreview(voiceCheckInfo)
  },

  createVoicePreviewAudio() {
    this.voicePreviewAudioContext = wx.createInnerAudioContext()
    this.voicePreviewAudioContext.onError(() => {
      this.stopVoicePreview()
      if (this.pageActive) {
        // showToast('none', '音色试听失败')
      }
    })
  },

  playVoicePreview(voice) {
    this.stopVoicePreview()
    if (!voice || !voice.audio_path || !this.voicePreviewAudioContext) return
    this.voicePreviewAudioContext.src = this.normalizeAudioUrl(voice.audio_path)
    this.voicePreviewAudioContext.play()
  },

  stopVoicePreview() {
    if (this.voicePreviewAudioContext) this.voicePreviewAudioContext.stop()
  },

  destroyVoicePreviewAudio() {
    if (!this.voicePreviewAudioContext) return
    this.voicePreviewAudioContext.stop()
    this.voicePreviewAudioContext.destroy()
    this.voicePreviewAudioContext = null
  },

  normalizeAudioUrl(audioUrl) {
    if (!audioUrl) return ''
    return /^https?:\/\//i.test(audioUrl) ? audioUrl : `https://${audioUrl}`
  },

  moreVoice() {
    wx.navigateTo({
      url: '../voiceSelect/voiceSelect',
      events: {
        voiceSelected: (voice) => this.setData({ voiceIndex: -1, voiceCheckInfo: voice })
      },
      success: (res) => {
        res.eventChannel.emit('initVoiceSelect', {
          voiceList: this.data.voiceMoreList,
          activeVoiceId: this.data.voiceCheckInfo.id || 0
        })
      }
    })
  },

  bgmPop() {
    this.setData({ bgmSetPop: !this.data.bgmSetPop })
  },

  showBgmList() {
    wx.navigateTo({
      url: '../bgmSelect/bgmSelect',
      events: {
        bgmSelected: (bgm) => this.setData({ activeBgmInfo: bgm || {} })
      },
      success: (res) => {
        res.eventChannel.emit('initBgmSelect', {
          bgmList: this.data.bgmList,
          activeBgmId: this.data.activeBgmInfo.id || 0
        })
      }
    })
  },

  resetBgm() {
    this.setData({ activeBgmInfo: {}, bgmSetDetail: {} })
  },

  bmgSetConfirm(e) {
    this.setData({ bgmSetDetail: { ...e.detail }, bgmSetPop: false })
  },

  convertPauseToBreak(text) {
    return String(text || '').replace(/\[停顿(\d+)ms\]/g, (match, ms) => {
      return `<break time="${(Number(ms) / 1000).toFixed(1)}s"></break>`
    })
  },

  async convertToSpeech() {
    if (this.data.synthesizing) return
    const inputText = String(this.data.inputText || '').trim()
    if (!inputText) {
      showToast('none', '请输入文字')
      return
    }

    const voice = this.data.voiceCheckInfo || {}
    this.setData({ synthesizing: true })
    wx.showLoading({ title: '合成中...', mask: true })

    let synthesisResult
    try {
      let data = {
        text: `<speak>${this.convertPauseToBreak(inputText)}</speak>`,
        voice_id: voice.voice_id || null,
        speed_ratio: this.data.speed,
        volume_ratio: this.data.yxVoice,
        pitch_ratio: 1
      }
      const bgmSetDetail = this.data.bgmSetDetail || {}
      const bgmId = bgmSetDetail.bgm_id !== undefined
        ? bgmSetDetail.bgm_id
        : this.data.activeBgmInfo.id
      if (bgmId !== undefined && Number(bgmId) !== 0) {
        data = { ...data, ...bgmSetDetail, bgm_id: bgmId }
      }

      const submitResponse = await request({
        url: '/user/tts/long-text/submit',
        method: 'POST',
        data,
        needAuth: true
      })
      if (Number(submitResponse.code) !== 200) {
        throw new Error(submitResponse.message || '长文本任务提交失败')
      }
      const taskId = submitResponse.data && submitResponse.data.task_id
      if (!taskId) throw new Error('长文本任务提交失败')

      synthesisResult = await this.pollLongTextTask(taskId)
    } catch (error) {
      if (this.pageActive) {
        console.error('长文本配音失败:', error)
        showToast('none', error.message || '长文本配音失败')
      }
    } finally {
      if (this.pageActive) this.finishSynthesis()
    }

    if (!synthesisResult || !this.pageActive) return
    app.globalData.generate = {
      ...(app.globalData.generate || {}),
      audio_url: synthesisResult.audio_url
    }
    wx.navigateTo({ url: '../generate/generate' })
  },

  async pollLongTextTask(taskId) {
    for (let attempt = 0; attempt < LONG_TEXT_MAX_POLLS; attempt += 1) {
      if (!this.pageActive) throw new Error('页面已关闭')
      const response = await request({
        url: '/user/tts/long-text/query',
        method: 'POST',
        data: { task_id: taskId },
        needAuth: true
      })
      if (Number(response.code) !== 200) {
        throw new Error(response.message || '长文本任务查询失败')
      }

      const detail = response.data || {}
      const status = String(detail.status || '').toLowerCase()
      if (['processing_failed', 'failed', 'expired'].includes(status)) {
        throw new Error(detail.error_message || response.message || '长文本配音失败')
      }
      if (status === 'success') {
        if (!detail.audio_url) throw new Error('合成结果缺少音频地址')
        return detail
      }
      await this.waitForNextPoll()
    }
    throw new Error('长文本配音超时，请稍后重试')
  },

  waitForNextPoll() {
    return new Promise((resolve) => {
      this.pollResolve = resolve
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null
        this.pollResolve = null
        resolve()
      }, LONG_TEXT_POLL_INTERVAL)
    })
  },

  cancelPolling() {
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = null
    if (this.pollResolve) this.pollResolve()
    this.pollResolve = null
  },

  finishSynthesis() {
    if (!this.data.synthesizing) return
    this.setData({ synthesizing: false })
    wx.hideLoading()
  }
})
