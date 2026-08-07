const { request, showToast } = require('../../utils/request')

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
    voiceList: DEFAULT_VOICES,
    voiceIndex: 0,
    voiceCheckInfo: DEFAULT_VOICES[0],
    voiceMoreList: {},
    speed: 1,
    musicSetShow: false,
    stopShow: false,
    stopVal: '1.0',
    bgmSetPop: false,
    bgmList: {},
    activeBgmInfo: {},
    bgmSetDetail: {}
  },

  onLoad() {
    this.pageActive = true
    return Promise.all([this.getVoiceList(), this.getBgmList()])
  },

  onUnload() {
    this.pageActive = false
  },

  async getVoiceList() {
    try {
      const res = await request({
        url: '/user/voices/categories',
        method: 'GET',
        needAuth: true
      })
      if (Number(res.code) === 200 && this.pageActive) {
        this.setData({ voiceMoreList: res.data || {} })
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
        this.setData({ bgmList: res.data || {} })
      }
    } catch (error) {
      if (!this.pageActive) return
      console.error('获取背景音乐列表失败:', error)
      showToast('none', '背景音乐加载失败')
    }
  },

  onTextInput(e) {
    const inputText = String(e.detail.value || '').slice(0, 2000)
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
          const inputText = String(content).slice(0, 2000)
          this.setData({ inputText, cursorPosition: inputText.length })
        }
      }
    })
  },

  stopSet() {
    this.setData({ stopShow: !this.data.stopShow })
  },

  stopSliderChange(e) {
    this.setData({ stopVal: Number(e.detail.value).toFixed(1) })
  },

  stopPopConfirm() {
    const inputText = this.data.inputText || ''
    const cursor = Math.max(0, Math.min(Number(this.data.cursorPosition) || 0, inputText.length))
    const pauseMs = Math.round(Number(this.data.stopVal) * 1000)
    const pauseText = `[停顿${pauseMs}ms]`
    const nextText = `${inputText.slice(0, cursor)}${pauseText}${inputText.slice(cursor)}`.slice(0, 2000)
    this.setData({
      inputText: nextText,
      cursorPosition: Math.min(cursor + pauseText.length, nextText.length),
      stopShow: false
    })
  },

  musicSet() {
    this.setData({ musicSetShow: !this.data.musicSetShow })
  },

  musicSliderChange(e) {
    this.setData({ speed: Number(Number(e.detail.value).toFixed(1)) })
  },

  musicPopConfirm() {
    this.setData({ musicSetShow: false })
  },

  changeStreamer(e) {
    const voiceIndex = Number(e.currentTarget.id)
    const voiceCheckInfo = this.data.voiceList[voiceIndex]
    if (!voiceCheckInfo) return
    this.setData({ voiceIndex, voiceCheckInfo })
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
  }
})
