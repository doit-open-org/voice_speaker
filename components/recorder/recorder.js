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
    recorderMask: false
  },

  /**
   * 组件的方法列表
   */
  methods: {
    backIndex(){
      this.triggerEvent('showRecorderPop')
    },
    showBgm(){
      this.triggerEvent('bgmPop')
    },
    startRecorder(){
      if (this.data.disabled) {
        wx.showToast({ icon: 'none', title: '录音正在上传中' })
        return
      }
      if (!this.recorder) return
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
      let audioPath = this.data.audioPath
      this.triggerEvent('handleRecorder',{audioPath})
    },
  }
})
