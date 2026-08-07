// components/bgmSet.js
const DEFAULT_BGM = {
  bgm_id: 0,
  bgm_volume: 1,
  bgm_ducking: 'normal',
  voice_delay: 2,
  bgm_tail: 3
}

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    activeBgmInfo:{
      type: Object,
      value: {}
    },
    bgmSetDetail: {
      type: Object,
      value: {}
    }
  },

  observers: {
    bgmSetDetail(value) {
      const detail = value && typeof value === 'object' ? value : {}
      this.setData({
        bgm: Object.keys(detail).length
          ? { ...DEFAULT_BGM, ...detail }
          : { ...DEFAULT_BGM }
      })
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    activeBgmInfo:{},//选中的背景音乐
    bgm: { ...DEFAULT_BGM },
  },

  /**
   * 组件的方法列表
   */
  methods: {
    reset(){
      this.setData({ bgm: { ...DEFAULT_BGM }, activeBgmInfo: {} })
      this.triggerEvent('resetBgm')
      this.triggerEvent('showBgmList')
    },
    changeMusic(){
      this.triggerEvent('showBgmList')
    },
    // 音量滑块变化
    onVolumeChange(e) {
      let val = e.detail.value
      let bgm = this.data.bgm
      bgm.bgm_volume = val/100
      this.setData({ bgm });
    },

    // 设置音量控制模式
    setVolumeControl(e) {
      let bgm = this.data.bgm
      const type = e.currentTarget.dataset.type;
      bgm.bgm_ducking = type
      this.setData({ bgm });
    },

    // 减少延迟时间
    decreaseDelay() {
      let bgm = this.data.bgm
      bgm.voice_delay = (bgm.voice_delay -1) < 0 ? 0 : bgm.voice_delay - 1 
      this.setData({ bgm });
      
    },

    // 增加延迟时间
    increaseDelay() {
      let bgm = this.data.bgm
      bgm.voice_delay = (bgm.voice_delay + 1) > 60 ? 60 : bgm.voice_delay + 1 
      this.setData({ bgm });
    },

    // 减少续播时间
    decreaseContinue() {
      let bgm = this.data.bgm
      bgm.bgm_tail = (bgm.bgm_tail -1) < 0 ? 0 : bgm.bgm_tail - 1 
      this.setData({ bgm });
    },

    // 增加续播时间
    increaseContinue() {
      let bgm = this.data.bgm
      bgm.bgm_tail = (bgm.bgm_tail + 1) > 60 ? 60 : bgm.bgm_tail + 1 
      this.setData({ bgm });
    },
    //确定
    confirm(){
      let activeBgmInfo = this.data.activeBgmInfo
      let bgm = this.data.bgm
      bgm.bgm_id = activeBgmInfo.id
      this.triggerEvent('bmgSetConfirm',bgm)
    }
  }
})
