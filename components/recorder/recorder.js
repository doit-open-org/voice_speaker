// components/recorder/recorder.js
const voiceConsent = require('../../utils/voiceConsent')
const RECORDING_MAX_DURATION = 180000
const RECORDING_COUNTDOWN_SECONDS = RECORDING_MAX_DURATION / 1000

function formatRecordingCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    showBack: {
      type: Boolean,
      value: true
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },

  lifetimes:{
    attached(){
      this._isDetached = false
      const recorder = wx.getRecorderManager()
      this.recorder = recorder
      this._onStart = () => {
        if (this._isDetached) return
        this.startRecordingCountdown()
        console.log("录音开始");
      }
      this._onStop = (res) => {
        if (this._isDetached) return
        this.clearRecordingCountdown()
        this.setData({
          recorderMask: false,
          recordingCountdown: formatRecordingCountdown(RECORDING_COUNTDOWN_SECONDS)
        })
        console.log("录音结束", res);
        this.setData({
          audioPath: res.tempFilePath
        });
        this.handleRecorder()
      }
      this._onError = (err) => {
        if (this._isDetached) return
        this.clearRecordingCountdown()
        this.setData({
          recorderMask: false,
          recordingCountdown: formatRecordingCountdown(RECORDING_COUNTDOWN_SECONDS)
        })
        console.log("录音错误:", err);
        wx.showToast({ icon: 'none', title: '录音失败，请重试' })
      }
      recorder.onStart(this._onStart)
      recorder.onStop(this._onStop)
      recorder.onError(this._onError)
    },
    detached() {
      this._isDetached = true
      this.clearRecordingCountdown()
      const recorder = this.recorder
      if (!recorder) return
      if (this.data.recorderMask) recorder.stop()
      if (recorder.offStart) recorder.offStart(this._onStart)
      if (recorder.offStop) recorder.offStop(this._onStop)
      if (recorder.offError) recorder.offError(this._onError)
      this.setData({
        recorderMask: false,
        recordingCountdown: formatRecordingCountdown(RECORDING_COUNTDOWN_SECONDS)
      })
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    audioPath: '',
    recorderMask: false,
    recordingCountdown: formatRecordingCountdown(RECORDING_COUNTDOWN_SECONDS),
    recordPermissionVisible: false,
    voiceAuthVisible: false,
    speed: 1,
    speedDisplay: '1.0',
    volume: 2,
    volumeDisplay: '2.0'
  },

  /**
   * 组件的方法列表
   */
  methods: {
    preventTouchMove(){},
    backIndex(){
      this.triggerEvent('showRecorderPop')
    },
    showBgm(){
      this.triggerEvent('bgmPop')
    },
    changeSpeed(e) {
      const speed = Number(Number(e.detail.value).toFixed(1))
      this.setData({ speed, speedDisplay: speed.toFixed(1) })
    },
    changeVolume(e) {
      const volume = Number(Number(e.detail.value).toFixed(1))
      this.setData({ volume, volumeDisplay: volume.toFixed(1) })
    },
    startRecorder(){
      if (this.data.disabled) {
        wx.showToast({ icon: 'none', title: '录音正在上传中' })
        return
      }
      if (!this.recorder || this._requestingRecordPermission || this.data.recordPermissionVisible) return
      if (this.data.voiceAuthVisible) return
      // **声纹授权要问在麦克风权限前面。** 顺序反了就是「先开麦再补协议」，
      // 正是 2026-08 审核打回的那件事。而且两者不能互相代替：用户早就给过
      // 微信麦克风权限（别的小程序给的），不等于同意我们收集声纹。
      if (!voiceConsent.granted()) {
        this.setData({ voiceAuthVisible: true })
        return
      }
      this.requestMicrophoneAndRecord()
    },
    /** 拿到声纹授权之后的那一段：申请麦克风权限，然后开录。 */
    requestMicrophoneAndRecord(){
      wx.getSetting({
        success: (res) => {
          if (this._isDetached) return
          if (res.authSetting && res.authSetting['scope.record']) {
            this.beginRecording()
            return
          }
          this.showRecordPermissionPrompt()
        },
        fail: () => {
          if (!this._isDetached) this.showRecordPermissionPrompt()
        }
      })
    },
    onVoiceAuthAgree(){
      this.setData({ voiceAuthVisible: false })
      // **直接进麦克风流程，不要再回头调 startRecorder()。**
      // 授权是弹窗组件写进存储的，这儿再查一遍 granted() 看着更严谨，
      // 其实是个死循环隐患：存储写失败（配额满、隐私模式）时 granted() 仍是
      // false，于是弹窗→同意→弹窗→同意，用户永远录不上音也退不出去。
      // 用户点了「同意并授权」，这一次的同意就已经成立，不需要再问存储确认。
      // 存储真没写上，无非下次再问一遍——那个方向是安全的。
      this.requestMicrophoneAndRecord()
    },
    onVoiceAuthReject(){
      // 不同意就到此为止，麦克风一次都没开过
      this.setData({ voiceAuthVisible: false })
    },
    showRecordPermissionPrompt(){
      if (this._requestingRecordPermission || this.data.recordPermissionVisible) return
      this.setData({ recordPermissionVisible: true })
    },
    cancelRecordPermission(){
      this.setData({ recordPermissionVisible: false })
    },
    confirmRecordPermission(){
      if (this._requestingRecordPermission) return
      this.setData({ recordPermissionVisible: false })
      this._requestingRecordPermission = true
      wx.authorize({
        scope: 'scope.record',
        success: () => {
          if (!this._isDetached) this.beginRecording()
        },
        fail: () => {
          if (!this._isDetached) this.showRecordSettingPrompt()
        },
        complete: () => {
          this._requestingRecordPermission = false
        }
      })
    },
    showRecordSettingPrompt(){
      wx.showModal({
        title: '麦克风权限未开启',
        content: '请在微信设置中允许使用麦克风，开启后即可开始录音。',
        confirmText: '去设置',
        cancelText: '取消',
        success: (res) => {
          if (!res.confirm || this._isDetached) return
          wx.openSetting({
            success: (settingRes) => {
              if (!this._isDetached && settingRes.authSetting && settingRes.authSetting['scope.record']) {
                this.beginRecording()
              }
            }
          })
        }
      })
    },
    beginRecording(){
      if (!this.recorder || this.data.disabled || this.data.recorderMask) return
      this.setData({recorderMask: true})
      // 最长录3分钟
      this.recorder.start({
        duration: RECORDING_MAX_DURATION,
        sampleRate: 8000,
        numberOfChannels: 2,
        encodeBitRate: 48000,
        format: "mp3"
      });
    },
    recorderStop(){
      if (!this.recorder || !this.data.recorderMask) return
      this.clearRecordingCountdown()
      this.recorder.stop()
    },
    startRecordingCountdown(){
      this.clearRecordingCountdown()
      this.recordingDeadline = Date.now() + RECORDING_MAX_DURATION
      this.setData({
        recordingCountdown: formatRecordingCountdown(RECORDING_COUNTDOWN_SECONDS)
      })
      this.scheduleRecordingCountdownTick()
    },
    scheduleRecordingCountdownTick(){
      this.recordingCountdownTimer = setTimeout(() => {
        this.recordingCountdownTimer = null
        this.updateRecordingCountdown()
      }, 1000)
    },
    updateRecordingCountdown(){
      if (!this.data.recorderMask || !this.recordingDeadline) {
        this.clearRecordingCountdown()
        return
      }

      const secondsLeft = Math.max(
        0,
        Math.ceil((this.recordingDeadline - Date.now()) / 1000)
      )
      this.setData({ recordingCountdown: formatRecordingCountdown(secondsLeft) })

      if (secondsLeft === 0) {
        this.clearRecordingCountdown()
        this.recorderStop()
        return
      }
      this.scheduleRecordingCountdownTick()
    },
    clearRecordingCountdown(){
      if (this.recordingCountdownTimer) clearTimeout(this.recordingCountdownTimer)
      this.recordingCountdownTimer = null
      this.recordingDeadline = null
    },
    handleRecorder(){
      const { audioPath, speed, volume } = this.data
      this.triggerEvent('handleRecorder', { audioPath, speed, volume })
    },
  }
})
