const { request, showToast } = require('../../utils/request')

const DEFAULT_AVATAR = '../../img/streamer1.jpg'
const TIMBRE_TYPE_LABELS = {
  male: '男声',
  female: '女声',
  original: '原声'
}
const VOICE_CONVERT_UPLOAD_URL = ''

Page({
  data: {
    timbres: [],
    selectedTimbreId: 0,
    emptyText: '音色加载中...',
    bgmSetPop: false,
    bgmList: {},
    selectedBgm: {},
    bgmSetDetail: {},
    speed: 1,
    speedDisplay: '1.0',
    volume: 0,
    recording: false,
    uploading: false,
    pendingUpload: null
  },

  onLoad() {
    this.pageActive = true
    this.setupRecorder()
    return this.loadTimbres()
  },

  onUnload() {
    this.pageActive = false
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
      if (result && result.tempFilePath) this.prepareUpload(result)
    }
    this.onRecorderError = (error) => {
      if (!this.pageActive) return
      console.error('音色转化录音失败:', error)
      this.setData({ recording: false })
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
    this.setData({ selectedTimbreId: Number(e.currentTarget.dataset.id) })
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
    this.setData({ volume: Number(e.detail.value) })
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
    this.recorder.start({
      duration: 180000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 96000,
      format: 'mp3'
    })
  },

  stopRecording() {
    if (this.recorder && this.data.recording) this.recorder.stop()
  },

  prepareUpload(recordResult) {
    const timbre = this.data.timbres.find((item) => item.id == this.data.selectedTimbreId)
    if (!timbre) {
      showToast('none', '请选择有效音色')
      return
    }
    const bgmSetDetail = this.data.bgmSetDetail || {}
    const payload = {
      filePath: recordResult.tempFilePath,
      name: 'audio_file',
      duration: recordResult.duration || 0,
      fileSize: recordResult.fileSize || 0,
      formData: {
        timbre_id: timbre.id,
        timbre_type: timbre.timbre_type,
        speed: this.data.speed,
        volume: this.data.volume,
        ...bgmSetDetail,
        bgm_id: bgmSetDetail.bgm_id !== undefined
          ? bgmSetDetail.bgm_id
          : this.data.selectedBgm.id || 0
      }
    }
    this.setData({ pendingUpload: payload })
    this.uploadRecording(payload)
  },

  uploadRecording(payload) {
    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中...', mask: true })

    if (!VOICE_CONVERT_UPLOAD_URL) {
      this.finishUpload()
      showToast('none', '录音已完成，上传接口待接入')
      return
    }

    const token = wx.getStorageSync('auth_token')
    this.uploadTask = wx.uploadFile({
      url: VOICE_CONVERT_UPLOAD_URL,
      filePath: payload.filePath,
      name: payload.name,
      formData: payload.formData,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        if (!this.pageActive) return
        this.finishUpload()
        try {
          const result = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          showToast(Number(result.code) === 200 ? 'success' : 'none', result.message || '上传完成')
        } catch (error) {
          console.error('音色转化上传响应解析失败:', error)
          showToast('none', '上传失败')
        }
      },
      fail: (error) => {
        if (!this.pageActive) return
        this.finishUpload()
        console.error('音色转化上传失败:', error)
        showToast('none', '上传失败')
      }
    })
  },

  finishUpload() {
    this.uploadTask = null
    this.setData({ uploading: false })
    wx.hideLoading()
  }
})
