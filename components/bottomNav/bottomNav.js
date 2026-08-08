Component({
  properties: {
    active: {
      type: String,
      value: 'voice'
    }
  },

  data: {
    navItems: [
      { key: 'voice', label: '配音', icon: 'audio', url: '/pages/index/index' },
      { key: 'device', label: '设备', icon: 'desktop-o', url: '/pages/device/device' },
      { key: 'advanced', label: '高级', icon: 'cluster', url: '/pages/advanced/advanced' },
      { key: 'mine', label: '我的', icon: 'manager', url: '/pages/mine/mine' }
    ]
  },

  methods: {
    changeTab(e) {
      const tab = e.currentTarget.dataset.tab
      if (!tab || tab === this.properties.active) return

      const target = this.data.navItems.find((item) => item.key === tab)
      if (!target) return

      wx.redirectTo({ url: target.url })
    }
  }
})
