const app = getApp()
const { showToast } = require('../../utils/request')
const share = require('../../utils/share')
const API_ORIGIN =  getApp().globalData.domain
const VOICE_CONVERT_UPLOAD_URL = API_ORIGIN+'/api/v1/user/tts/synthesize-audio'
Page({
  data: {
    bgmSetPop: false,
    bgmList: {},
    activeBgmInfo: {},
    bgmSetDetail: {},
    uploading: false
  },

  onLoad() {
    this._isActive = true
    this._uploadId = 0
    this.eventChannel = this.getOpenerEventChannel()
    this.eventChannel.on('initRecorder', ({
      bgmList = {},
      activeBgmInfo = {},
      bgmSetDetail = {}
    } = {}) => {
      this.setData({
        bgmList,
        activeBgmInfo: { ...activeBgmInfo },
        bgmSetDetail: { ...bgmSetDetail }
      })
    })
  },

  onUnload() {
    this._isActive = false
    this._uploadId += 1
    const uploadTask = this.uploadTask
    this.uploadTask = null
    if (uploadTask && uploadTask.abort) uploadTask.abort()
    if (this.data.uploading) wx.hideLoading()
  },

  goBack() {
    wx.navigateBack()
  },

  bgmPop() {
    this.setData({ bgmSetPop: !this.data.bgmSetPop })
  },

  showBgmList() {
    wx.navigateTo({
      url: '../bgmSelect/bgmSelect',
      events: {
        bgmSelected: (bgm) => {
          this.setData({ activeBgmInfo: bgm })
          this.syncBgmState()
        }
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
    this.setData({
      activeBgmInfo: {},
      bgmSetDetail: {}
    })
    this.syncBgmState()
  },

  bmgSetConfirm(e) {
    this.setData({
      bgmSetDetail: { ...e.detail },
      bgmSetPop: false
    })
    this.syncBgmState()
  },

  syncBgmState() {
    this.eventChannel.emit('bgmStateChanged', {
      activeBgmInfo: this.data.activeBgmInfo,
      bgmSetDetail: this.data.bgmSetDetail
    })
  },

  handleRecorder(e) {
    if (this.data.uploading) {
      showToast('none', '录音正在上传中')
      return
    }
    const {
      audioPath,
      speed = 1,
      volume = 2
    } = e.detail
    const token = wx.getStorageSync('auth_token')
    let formData = {
      title: `我的录音${Date.now()}`,
      speed_ratio: speed,
      volume_ratio: volume
    }
    const bgmSetDetail = this.data.bgmSetDetail
    if (bgmSetDetail.bgm_id !== undefined && bgmSetDetail.bgm_id !== 0) {
      formData = { ...formData, ...bgmSetDetail }
    }

    const uploadId = ++this._uploadId
    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中...', mask: true })
    this.uploadTask = wx.uploadFile({
      url: VOICE_CONVERT_UPLOAD_URL,
      filePath: audioPath,
      name: 'audio_file',
      formData,
      header: { Authorization: `Bearer ${token}` },
      success: (res) => {
        if (!this.finishUpload(uploadId)) return
        try {
          const result = JSON.parse(res.data)
          if (Number(result.code) === 200) {
            this.handleSucRec(result.data)
          } else {
            showToast('none', '录音上传失败')
          }
        } catch (error) {
          console.error('录音上传响应解析失败:', error)
          showToast('none', '录音上传失败')
        }
      },
      fail: (error) => {
        if (!this.finishUpload(uploadId)) return
        console.error('录音上传失败:', error)
        showToast('none', '录音上传失败')
      }
    })
  },

  finishUpload(uploadId) {
    if (!this._isActive || uploadId !== this._uploadId) return false
    this.uploadTask = null
    this.setData({ uploading: false })
    wx.hideLoading()
    return true
  },

  handleSucRec(data) {
    app.globalData.generate = data
    wx.redirectTo({ url: '../generate/generate' })
  },

  onShareAppMessage() {
    return share.toPage('录一段，配上背景音乐就是成品', '/pages/recorder/recorder')
  },

  onShareTimeline() {
    return share.timeline('录一段，配上背景音乐就是成品')
  }
})
