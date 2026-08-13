// components/recorder/recorder.js
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
        console.log("录音开始");
      }
      this._onStop = (res) => {
        if (this._isDetached) return
        this.setData({recorderMask: false})
        console.log("录音结束", res);
        this.setData({
          audioPath: res.tempFilePath
        });
        this.handleRecorder()
      }
      this._onError = (err) => {
        if (this._isDetached) return
        this.setData({recorderMask: false})
        console.log("录音错误:", err);
        wx.showToast({ icon: 'none', title: '录音失败，请重试' })
      }
      recorder.onStart(this._onStart)
      recorder.onStop(this._onStop)
      recorder.onError(this._onError)
    },
    detached() {
      this._isDetached = true
      const recorder = this.recorder
      if (!recorder) return
      if (this.data.recorderMask) recorder.stop()
      if (recorder.offStart) recorder.offStart(this._onStart)
      if (recorder.offStop) recorder.offStop(this._onStop)
      if (recorder.offError) recorder.offError(this._onError)
      this.setData({ recorderMask: false })
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    audioPath: '',
    recorderMask: false,
    recordPermissionVisible: false,
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
        duration: 180000,
        sampleRate: 8000,
        numberOfChannels: 2,
        encodeBitRate: 48000,
        format: "mp3"
      });
    },
    recorderStop(){
      if (this.recorder) this.recorder.stop()
    },
    handleRecorder(){
      const { audioPath, speed, volume } = this.data
      this.triggerEvent('handleRecorder', { audioPath, speed, volume })
    },
  }
})
