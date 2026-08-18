const { request, showToast } = require('../../utils/request')
const voiceConsent = require('../../utils/voiceConsent')
const share = require('../../utils/share')
const app = getApp()

const DEFAULT_AVATAR = '../../img/streamer1.jpg'
const TIMBRE_TYPE_LABELS = {
  male: '男声',
  female: '女声',
  original: '原声'
}
const API_ORIGIN =  getApp().globalData.domain
const VOICE_CONVERT_UPLOAD_URL = API_ORIGIN+'/api/v1/user/voice-conversion'
const VOICE_CONVERT_POLL_INTERVAL = 1500
const VOICE_CONVERT_MAX_POLLS = 200

Page({
  data: {
    voiceAuthVisible: false,
    timbres: [],
    selectedTimbreId: 0,
    emptyText: '音色加载中...',
    bgmSetPop: false,
    bgmList: {},
    selectedBgm: {},
    bgmSetDetail: {},
    speed: 1,
    speedDisplay: '1.0',
    volume: 2,
    volumeDisplay: '2.0',
    recording: false,
    uploading: false,
    pendingUpload: null
  },

  onLoad() {
    this.pageActive = true
    this.createVoicePreviewAudio()
    this.setupRecorder()
    return this.loadTimbres()
  },

  onHide() {
    this.stopVoicePreview()
  },

  onUnload() {
    this.pageActive = false
    this.destroyVoicePreviewAudio()
    this.cancelPolling()
    if (this.data.recording && this.recorder) this.recorder.stop()
    if (this.uploadTask && this.uploadTask.abort) this.uploadTask.abort()
    if (this.data.uploading) wx.hideLoading()
    if (!this.recorder) return
    if (this.recorder.offStart) this.recorder.offStart(this.onRecorderStart)
    if (this.recorder.offStop) this.recorder.offStop(this.onRecorderStop)
    if (this.recorder.offError) this.recorder.offError(this.onRecorderError)
    this.recorder = null
  },

  setupRecorder() {
    if (typeof wx.getRecorderManager !== 'function') return
    this.recorder = wx.getRecorderManager()
    this.onRecorderStart = () => {
      if (this.pageActive) this.setData({ recording: true })
    }
    this.onRecorderStop = (result) => {
      if (!this.pageActive) return
      this.setData({ recording: false })
      if (result && result.tempFilePath) {
        this.prepareUpload(result)
        return
      }
      if (this.data.uploading) this.finishUpload()
      showToast('none', '未获取到录音文件')
    }
    this.onRecorderError = (error) => {
      if (!this.pageActive) return
      console.error('音色转化录音失败:', error)
      this.setData({ recording: false })
      if (this.data.uploading) this.finishUpload()
      showToast('none', '录音失败，请重试')
    }
    this.recorder.onStart(this.onRecorderStart)
    this.recorder.onStop(this.onRecorderStop)
    this.recorder.onError(this.onRecorderError)
  },

  async loadTimbres() {
    try {
      const res = await request({
        url: '/voice-timbre/',
        method: 'GET',
        data: { page: 1, page_size: 100 },
        needAuth: false
      })
      if (Number(res.code) !== 200) {
        throw new Error(res.message || 'Voice timbre request failed')
      }
      if (!this.pageActive) return

      const timbres = (Array.isArray(res.data) ? res.data : []).map((item) => ({
        ...item,
        displayAvatar: typeof item.avatar_url === 'string' && item.avatar_url.trim()
          ? item.avatar_url
          : DEFAULT_AVATAR,
        typeLabel: TIMBRE_TYPE_LABELS[item.timbre_type] || item.timbre_type || '其他'
      }))
      this.setData({
        timbres,
        selectedTimbreId: timbres[0] ? timbres[0].id : 0,
        emptyText: timbres.length ? '' : '暂无音色'
      })
    } catch (error) {
      if (!this.pageActive) return
      console.error('获取音色列表失败:', error)
      this.setData({ timbres: [], selectedTimbreId: 0, emptyText: '音色加载失败' })
      showToast('none', '音色列表加载失败')
    }
  },

  selectTimbre(e) {
    const selectedTimbreId = Number(e.currentTarget.dataset.id)
    const timbre = this.data.timbres.find((item) => item.id == selectedTimbreId)
    if (!timbre) return
    this.setData({ selectedTimbreId })
    this.playVoicePreview(timbre)
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

  playVoicePreview(timbre) {
    this.stopVoicePreview()
    if (!timbre || !timbre.audio_url || !this.voicePreviewAudioContext) return
    this.voicePreviewAudioContext.src = this.normalizeAudioUrl(timbre.audio_url)
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

  bgmPop() {
    if (this.data.recording || this.data.uploading) return
    this.setData({ bgmSetPop: !this.data.bgmSetPop })
  },

  showBgmList() {
    if (this.data.recording || this.data.uploading) return
    wx.navigateTo({
      url: '../bgmSelect/bgmSelect',
      events: {
        bgmSelected: (bgm) => this.setData({ selectedBgm: bgm || {} })
      },
      success: (res) => {
        res.eventChannel.emit('initBgmSelect', {
          bgmList: this.data.bgmList,
          activeBgmId: this.data.selectedBgm.id || 0
        })
      }
    })
  },

  openBgmSelect() {
    this.showBgmList()
  },

  resetBgm() {
    this.setData({
      selectedBgm: {},
      bgmSetDetail: {}
    })
  },

  bmgSetConfirm(e) {
    this.setData({
      bgmSetDetail: { ...e.detail },
      bgmSetPop: false
    })
  },

  changeSpeed(e) {
    const speed = Number(Number(e.detail.value).toFixed(1))
    this.setData({ speed, speedDisplay: speed.toFixed(1) })
  },

  changeVolume(e) {
    const v = Number(Number(e.detail.value).toFixed(1))
    this.setData({ volume: v ,volumeDisplay:v.toFixed(1) })
  },

  startRecording() {
    if (this.data.uploading || this.data.recording) return
    if (!this.data.selectedTimbreId) {
      showToast('none', '请先选择音色')
      return
    }
    if (!this.recorder) {
      showToast('none', '当前设备不支持录音')
      return
    }
    if (this.data.voiceAuthVisible) return
    // **声纹授权要问在开麦前面。** 这一页是音色转换——把用户的录音换成别的
    // 音色，处理的正是审核所说的「声纹」，所以跟首页录音一样要过这道闸门。
    // 见 utils/voiceConsent.js。
    if (!voiceConsent.granted()) {
      this.setData({ voiceAuthVisible: true })
      return
    }
    this.beginRecordingNow()
  },

  /** 拿到声纹授权之后的那一段。 */
  beginRecordingNow() {
    this.stopVoicePreview()
    this.recorder.start({
      duration: 180000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 96000,
      format: 'mp3'
    })
  },

  onVoiceAuthAgree() {
    this.setData({ voiceAuthVisible: false })
    // **直接开录，不要再回头调 startRecording()。** 授权是弹窗组件写进存储的，
    // 这儿再查一遍 granted() 看着更严谨，其实是个死循环隐患：存储写失败时
    // granted() 仍是 false，于是弹窗→同意→弹窗→同意，用户永远录不上。
    // 同上，见 components/recorder/recorder.js。
    this.beginRecordingNow()
  },

  onVoiceAuthReject() {
    // 不同意就到此为止，麦克风一次都没开过
    this.setData({ voiceAuthVisible: false })
  },

  stopRecording() {
    if (!this.recorder || !this.data.recording || this.data.uploading) return
    this.beginUpload()
    this.recorder.stop()
  },

  beginUpload() {
    if (this.data.uploading) return
    this.setData({ uploading: true })
    wx.showLoading({ title: '转换中...', mask: true })
  },

  prepareUpload(recordResult) {
    const timbre = this.data.timbres.find((item) => item.id == this.data.selectedTimbreId)
    if (!timbre) {
      showToast('none', '请选择有效音色')
      return
    }
    const bgmSetDetail = this.data.bgmSetDetail || {}
    const bgmId = bgmSetDetail.bgm_id !== undefined
      ? bgmSetDetail.bgm_id
      : this.data.selectedBgm.id
    const formData = {
      voice_timbre_id: timbre.id,
      speed: this.data.speed,
      volume: this.data.volume
    }
    if (bgmId !== undefined && Number(bgmId) !== 0) {
      Object.assign(formData, bgmSetDetail, { bgm_id: bgmId })
    }
    const payload = {
      filePath: recordResult.tempFilePath,
      name: 'audio_file',
      duration: recordResult.duration || 0,
      fileSize: recordResult.fileSize || 0,
      formData
    }
    this.setData({ pendingUpload: payload })
    this.beginUpload()
    this.uploadRecording(payload)
  },

  async uploadRecording(payload) {
    let conversionResult
    try {
      const taskId = await this.createConversionTask(payload)
      conversionResult = await this.pollConversionTask(taskId)
    } catch (error) {
      if (this.pageActive) {
        console.error('音色转化失败:', error)
        this.finishUpload()
        // showToast('none', error.message || '音色转换失败')
        showToast('none', '音色转换失败')
      }
    } finally {
      if (this.pageActive) this.finishUpload()
    }

    if (!conversionResult || !this.pageActive) return
    console.log("conversionResult...",conversionResult)
    app.globalData.generate = {
      ...(app.globalData.generate || {}),
      audio_url: conversionResult.audio_url,
      file_name: (conversionResult.audio_url || '').split(/[?#]/)[0].split('/').pop() || '',
    }
    wx.navigateTo({ url: '../generate/generate' })
  },

  createConversionTask(payload) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('auth_token')
      this.uploadTask = wx.uploadFile({
        url: VOICE_CONVERT_UPLOAD_URL,
        filePath: payload.filePath,
        name: payload.name,
        formData: payload.formData,
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success: (response) => {
          this.uploadTask = null
          try {
            const result = typeof response.data === 'string'
              ? JSON.parse(response.data)
              : response.data
            if (response.statusCode < 200 || response.statusCode >= 300) {
              throw new Error((result && result.message) || '创建转换任务失败')
            }
            if (Number(result && result.code) !== 200) {
              throw new Error((result && result.message) || '创建转换任务失败')
            }
            const taskId = result && result.data && result.data.task_id
            if (!taskId) throw new Error('创建转换任务失败')
            resolve(taskId)
          } catch (error) {
            reject(error)
          }
        },
        fail: (error) => {
          this.uploadTask = null
          reject(new Error(error.errMsg || error.message || '创建转换任务失败'))
        }
      })
    })
  },

  async pollConversionTask(taskId) {
    for (let attempt = 0; attempt < VOICE_CONVERT_MAX_POLLS; attempt += 1) {
      if (!this.pageActive) throw new Error('页面已关闭')
      const response = await request({
        url: `/user/voice-conversion/${taskId}`,
        method: 'GET',
        needAuth: true
      })
      if (Number(response.code) !== 200) {
        throw new Error(response.message || '查询转换任务失败')
      }

      const detail = response.data || {}
      const status = String(detail.status || '').toLowerCase()
      if (['failed', 'error', 'cancelled'].includes(status)) {
        throw new Error(detail.error_message || response.message || '音色转换失败')
      }
      if (detail.audio_url) return detail
      if (['success', 'completed'].includes(status)) {
        throw new Error('转换结果缺少音频地址')
      }
      await this.waitForNextPoll()
    }
    throw new Error('音色转换超时，请稍后重试')
  },

  waitForNextPoll() {
    return new Promise((resolve) => {
      this.pollResolve = resolve
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null
        this.pollResolve = null
        resolve()
      }, VOICE_CONVERT_POLL_INTERVAL)
    })
  },

  cancelPolling() {
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = null
    if (this.pollResolve) this.pollResolve()
    this.pollResolve = null
  },

  finishUpload() {
    this.uploadTask = null
    if (!this.data.uploading) return
    this.setData({ uploading: false })
    wx.hideLoading()
  },

  onShareAppMessage() {
    return share.toPage('把自己的录音换成别的声音', '/pages/voiceConvert/voiceConvert')
  },

  onShareTimeline() {
    return share.timeline('把自己的录音换成别的声音')
  }
})
