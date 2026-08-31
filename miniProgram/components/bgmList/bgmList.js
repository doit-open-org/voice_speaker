Component({
  /**
   * 组件的属性列表
   */
  properties: {
    bgmList:{
      type: Object,
      value: {}
    },
    activeId: {
      type: null,
      value: 0
    },
    activeSource: {
      type: String,
      value: 'regular'
    },
    showBack: {
      type: Boolean,
      value: true
    }
  },
  
  observers: {
    'bgmList': function (val) {
      const categories = Array.isArray(val && val.categories) ? val.categories : []
      const firstRegularIndex = categories.findIndex((category) => (
        category.key !== 'favorites' && category.key !== 'uploads'
      ))
      const shouldSelectFirstRegular = !this.hasSeenRegularCategory && firstRegularIndex >= 0
      if (firstRegularIndex >= 0) this.hasSeenRegularCategory = true
      this.updateCurrentBgms(
        val,
        shouldSelectFirstRegular ? firstRegularIndex : this.data.activeKey
      )
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    activeKey: 2, //侧边导航栏选中
    currentBgms: [],
    palyId: 0, //播放id
    palySource: '',
  },

  /**
   * 组件的方法列表
   */
  methods: {
    onChange(event) {
      const index = event.detail
      this.updateCurrentBgms(this.data.bgmList, index)
    },
    updateCurrentBgms(bgmList, requestedIndex) {
      const categories = Array.isArray(bgmList && bgmList.categories)
        ? bgmList.categories
        : []
      const activeKey = categories[requestedIndex] ? requestedIndex : 0
      const category = categories[activeKey]
      const bgms = bgmList && bgmList.bgms ? bgmList.bgms : {}
      const currentBgms = category && Array.isArray(bgms[category.key])
        ? bgms[category.key]
        : []
      this.setData({ activeKey, currentBgms })
    },
    showCategory(categoryKey) {
      const categories = Array.isArray(this.data.bgmList && this.data.bgmList.categories)
        ? this.data.bgmList.categories
        : []
      const index = categories.findIndex((category) => category.key === categoryKey)
      if (index >= 0) this.updateCurrentBgms(this.data.bgmList, index)
    },
    backIndex(){
      this.triggerEvent('showBgmList')
    },
    bgmPlay(e){
      const id = e.currentTarget.dataset.id
      const source = e.currentTarget.dataset.source || 'regular'
      // 暂停
      if (id == this.data.palyId && source === this.data.palySource) {
        this.triggerEvent('pauseMusic')
        return
      }
      this.setData({ palyId: id, palySource: source })
      this.triggerEvent('playBgm',{ id, source })
    },
    chooseBgm(e){
      const id = e.currentTarget.dataset.id
      const source = e.currentTarget.dataset.source || 'regular'
      this.setData({ activeId: id, activeSource: source })
      this.triggerEvent('chooseBgm',{ id, source })
    },
    toggleFavorite(e) {
      const id = e.currentTarget.dataset.id
      const bgm = this.data.currentBgms.find((item) => String(item.id) === String(id))
      if (!bgm || bgm.favoritePending) return
      this.triggerEvent('favoriteBgm', { id: bgm.id })
    },
    deleteBgm(e) {
      const id = e.currentTarget.dataset.id
      const bgm = this.data.currentBgms.find((item) => String(item.id) === String(id))
      if (!bgm || bgm.deletePending) return
      this.triggerEvent('deleteBgm', { id: bgm.id })
    }
  }
})
