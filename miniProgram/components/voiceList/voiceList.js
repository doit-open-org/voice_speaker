// components/voiceList/voiceList.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    voiceList:{
      type: Object,
      value: {}
    },
    activeId: {
      type: null,
      value: 0
    },
    showBack: {
      type: Boolean,
      value: true
    }
  },
  
  lifetimes:{
    attached(){
      console.log("a............",this.properties.voiceList)
    }
  },
  observers: {
    'voiceList': function (val) {
      const categories = Array.isArray(val && val.categories) ? val.categories : []
      const firstRegularIndex = categories.findIndex((category) => category.key !== 'favorites')
      const shouldSelectFirstRegular = !this.hasSeenRegularCategory && firstRegularIndex >= 0
      if (firstRegularIndex >= 0) this.hasSeenRegularCategory = true
      this.updateCurrentVoices(
        val,
        shouldSelectFirstRegular ? firstRegularIndex : this.data.activeKey
      )
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    activeKey: 1, //侧边导航栏选中
    currentVoices: [],
    palyId: 0 , //播放id
  },

  /**
   * 组件的方法列表
   */
  methods: {
    onChange(event) {
      const index = event.detail
      console.log("e....",index)
      this.updateCurrentVoices(this.data.voiceList, index)
    },
    updateCurrentVoices(voiceList, requestedIndex) {
      const categories = Array.isArray(voiceList && voiceList.categories)
        ? voiceList.categories
        : []
      const activeKey = categories[requestedIndex] ? requestedIndex : 0
      const category = categories[activeKey]
      const voices = voiceList && voiceList.voices ? voiceList.voices : {}
      const currentVoices = category && Array.isArray(voices[category.key])
        ? voices[category.key]
        : []
      this.setData({ activeKey, currentVoices })
    },
    backIndex(){
      this.triggerEvent('moreVoice')
    },
    voicePlay(e){
      let id = e.currentTarget.id
      // 暂停
      if(id == this.data.palyId){
        this.triggerEvent('pauseMusic')
        return
      }
      console.log('id....',id)
      this.setData({palyId: id})
      this.triggerEvent('playVoice',{ id })
    },
    chooseVoice(e){
      let id = e.currentTarget.id
      console.log('id....',id)
      this.setData({activeId: id})
      this.triggerEvent('chooseVoice',{ id })
    },
    toggleFavorite(e){
      const id = e.currentTarget.dataset.id
      const voice = this.data.currentVoices.find((item) => String(item.id) === String(id))
      if (!voice || voice.favoritePending) return
      this.triggerEvent('favoriteVoice', { id: voice.id })
    }
  }
})
