// pages/device/device.js
const app = getApp()

const LAST_DEVICE_CACHE_KEY = 'sbpyb2025'
const DEVICE_LIST_CACHE_KEY = 'sbpyb2025_devices'
const DEFAULT_RECONNECT_SCAN_TIMEOUT = 12000
const DEFAULT_CONNECTION_TIMEOUT = 20000

Page({
  data: {
    deviceInfo: [],
    searchShow: false,
    voicePop: false
  },

  onLoad(options = {}) {
    this.pageActive = true
    app.bletool.setCurPage(this)
    app.hextool.setCurPage(this)

    const deviceInfo = this.loadCachedDevices()
    this.setData({ deviceInfo })

    const connectedDevice = app.globalData.deviceInfo || {}
    if (connectedDevice.deviceId && connectedDevice.connState) {
      this.applyConnectedDevice(connectedDevice, false)
      return
    }

    if (options.dev && deviceInfo.length) {
      this.reconnectDevices(deviceInfo, { automatic: true })
    }
  },

  onShow() {
    app.bletool.setCurPage(this)
    app.hextool.setCurPage(this)
    if (!this._reconnectInProgress) this.syncConnectedDevice()
  },

  loadCachedDevices() {
    const cachedList = wx.getStorageSync(DEVICE_LIST_CACHE_KEY)
    const lastDevice = wx.getStorageSync(LAST_DEVICE_CACHE_KEY)
    const currentDevice = app.globalData.deviceInfo || {}
    const reconnectDevice = app.globalData.reConDevInfo || {}
    const sources = [
      currentDevice.connState ? currentDevice : null,
      lastDevice,
      ...(Array.isArray(cachedList) ? cachedList : []),
      reconnectDevice
    ]
    const devices = []
    const seen = new Set()

    sources.forEach((device) => {
      if (!device || !device.deviceId || seen.has(device.deviceId)) return
      seen.add(device.deviceId)
      devices.push(this.createDeviceCard(device, {
        connState: Boolean(currentDevice.connState && currentDevice.deviceId === device.deviceId)
      }))
    })

    this.lastConnectedDeviceId = lastDevice && lastDevice.deviceId
      ? lastDevice.deviceId
      : (devices[0] && devices[0].deviceId) || ''
    return devices
  },

  createDeviceCard(device = {}, state = {}) {
    return {
      ...device,
      name: device.name || '配音宝',
      connState: false,
      reconnecting: false,
      reconnectFailed: false,
      ...state
    }
  },

  toCachedDevice(device = {}) {
    return {
      deviceId: device.deviceId,
      name: device.name || '配音宝',
      localName: device.localName || '',
      RSSI: device.RSSI,
      connState: Boolean(device.connState),
      lastConnectedAt: device.lastConnectedAt || 0
    }
  },

  persistDeviceCache() {
    const cachedDevices = this.data.deviceInfo
      .filter(item => item && item.deviceId)
      .map(item => this.toCachedDevice(item))
    wx.setStorageSync(DEVICE_LIST_CACHE_KEY, cachedDevices)

    const lastDevice = cachedDevices.find(item => item.deviceId === this.lastConnectedDeviceId)
      || cachedDevices[0]
    if (lastDevice) {
      this.lastConnectedDeviceId = lastDevice.deviceId
      app.globalData.reConDevInfo = { ...lastDevice }
      wx.setStorageSync(LAST_DEVICE_CACHE_KEY, lastDevice)
    } else {
      this.lastConnectedDeviceId = ''
      app.globalData.reConDevInfo = {}
      if (typeof wx.removeStorageSync === 'function') {
        wx.removeStorageSync(LAST_DEVICE_CACHE_KEY)
        wx.removeStorageSync(DEVICE_LIST_CACHE_KEY)
      }
    }
  },

  upsertDevice(device, state = {}, moveToFront = false) {
    if (!device || !device.deviceId) return null
    const list = this.data.deviceInfo.slice()
    const index = list.findIndex(item => item.deviceId === device.deviceId)
    const oldDevice = index === -1 ? {} : list[index]
    const nextDevice = this.createDeviceCard({ ...oldDevice, ...device }, {
      reconnecting: Boolean(oldDevice.reconnecting),
      reconnectFailed: Boolean(oldDevice.reconnectFailed),
      ...state
    })
    if (index !== -1) list.splice(index, 1)
    if (moveToFront) list.unshift(nextDevice)
    else if (index === -1) list.push(nextDevice)
    else list.splice(index, 0, nextDevice)
    this.setData({ deviceInfo: list })
    return nextDevice
  },

  updateDeviceState(deviceId, state) {
    this.setData({
      deviceInfo: this.data.deviceInfo.map(item => (
        item.deviceId === deviceId ? { ...item, ...state } : item
      ))
    })
  },

  syncConnectedDevice() {
    const connectedDevice = app.globalData.deviceInfo || {}
    if (!connectedDevice.deviceId) return
    if (connectedDevice.connState) {
      this.applyConnectedDevice(connectedDevice, false)
    } else {
      this.updateDeviceState(connectedDevice.deviceId, { connState: false, reconnecting: false })
    }
  },

  applyConnectedDevice(device, showSuccess = true) {
    if (!device || !device.deviceId) return
    const connectedDevice = {
      ...device,
      name: device.name || '配音宝',
      connState: true,
      reconnecting: false,
      reconnectFailed: false,
      lastConnectedAt: Date.now()
    }
    app.globalData.deviceInfo = connectedDevice
    app.globalData.reConDevInfo = { ...connectedDevice }
    this.lastConnectedDeviceId = connectedDevice.deviceId

    const list = this.data.deviceInfo.map(item => ({
      ...item,
      connState: item.deviceId === connectedDevice.deviceId,
      reconnecting: false
    }))
    const oldIndex = list.findIndex(item => item.deviceId === connectedDevice.deviceId)
    if (oldIndex !== -1) list.splice(oldIndex, 1)
    list.unshift(this.createDeviceCard(connectedDevice, { connState: true }))
    this.setData({ deviceInfo: list })
    this.persistDeviceCache()
    this.finishPendingConnection(null, connectedDevice)

    if (showSuccess && this.pageActive) {
      wx.showToast({ title: '连接成功', icon: 'success' })
    }
  },

  async reconnectDevices(devices, options = {}) {
    if (this._reconnectInProgress) return false
    const candidates = []
    const seen = new Set()
    ;(Array.isArray(devices) ? devices : []).forEach((device) => {
      if (!device || !device.deviceId || seen.has(device.deviceId)) return
      seen.add(device.deviceId)
      candidates.push(device)
    })
    if (!candidates.length) return false

    this._reconnectInProgress = true
    const candidateIds = new Set(candidates.map(item => item.deviceId))
    this.setData({
      deviceInfo: this.data.deviceInfo.map(item => candidateIds.has(item.deviceId)
        ? { ...item, connState: false, reconnecting: true, reconnectFailed: false }
        : item)
    })

    let connected = false
    try {
      await app.bletool.BLE_prepareAdapter()
      if (!this.pageActive) return false
      const foundDevices = await app.bletool.BLE_findKnownDevices(
        candidates,
        this.reconnectScanTimeout || DEFAULT_RECONNECT_SCAN_TIMEOUT
      )
      const foundById = new Map(foundDevices.map(device => [device.deviceId, device]))

      for (const candidate of candidates) {
        if (!this.pageActive) return false
        const foundDevice = foundById.get(candidate.deviceId)
        if (!foundDevice) {
          this.updateDeviceState(candidate.deviceId, { reconnecting: false, reconnectFailed: true })
          continue
        }
        const connectingDevice = {
          ...candidate,
          ...foundDevice,
          name: '配音宝',
          connState: false
        }
        try {
          await this.connectToDevice(connectingDevice)
          connected = true
          break
        } catch (error) {
          console.error('重连设备失败', candidate.deviceId, error)
          this.updateDeviceState(candidate.deviceId, { reconnecting: false, reconnectFailed: true })
          await this.closeConnectionQuietly(candidate.deviceId)
        }
      }
    } catch (error) {
      console.error('扫描缓存设备失败', error)
      candidates.forEach(item => {
        this.updateDeviceState(item.deviceId, { reconnecting: false, reconnectFailed: true })
      })
    } finally {
      this._reconnectInProgress = false
      this.setData({
        deviceInfo: this.data.deviceInfo.map(item => candidateIds.has(item.deviceId)
          ? { ...item, reconnecting: false }
          : item)
      })
      if (!connected) {
        const lastCandidate = candidates[0]
        app.globalData.deviceInfo = lastCandidate
          ? { ...lastCandidate, connState: false }
          : {}
        this.persistDeviceCache()
        if (this.pageActive && options.showToast !== false) {
          wx.showToast({ title: '重连失败', icon: 'none' })
        }
      }
    }
    return connected
  },

  connectToDevice(device) {
    if (!device || !device.deviceId) return Promise.reject(new Error('设备信息无效'))
    if (this._pendingConnection) this.finishPendingConnection(new Error('连接已切换'))

    this.upsertDevice(device, { connState: false, reconnecting: true, reconnectFailed: false })
    app.globalData.deviceInfo = { ...device, connState: false }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.finishPendingConnection(new Error('设备握手超时'))
      }, this.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT)
      this._pendingConnection = { deviceId: device.deviceId, resolve, reject, timer }
      try {
        app.bletool.BLE_connect(device.deviceId)
      } catch (error) {
        this.finishPendingConnection(error)
      }
    })
  },

  finishPendingConnection(error, device) {
    const pending = this._pendingConnection
    if (!pending) return
    this._pendingConnection = null
    clearTimeout(pending.timer)
    if (error) pending.reject(error)
    else pending.resolve(device)
  },

  async closeConnectionQuietly(deviceId) {
    if (!deviceId || !app.bletool || typeof app.bletool.close_ble_connect !== 'function') return
    try {
      await app.bletool.close_ble_connect(deviceId)
    } catch (error) {
      console.error('关闭旧连接失败', error)
    }
  },

  async disconnectCurrentDevice(nextDeviceId = '') {
    const currentDevice = this.data.deviceInfo.find(item => item.connState)
    if (!currentDevice || currentDevice.deviceId === nextDeviceId) return

    this.updateDeviceState(currentDevice.deviceId, { connState: false, reconnecting: false })
    app.globalData.deviceInfo = { ...currentDevice, connState: false }
    try {
      await app.bletool.close_ble_connect(currentDevice.deviceId)
      this.persistDeviceCache()
    } catch (error) {
      const restoredDevice = { ...currentDevice, connState: true }
      app.globalData.deviceInfo = restoredDevice
      this.updateDeviceState(currentDevice.deviceId, { connState: true })
      throw error
    }
  },

  searchShow() {
    const nextSearchShow = !this.data.searchShow
    this.setData({ searchShow: nextSearchShow })
    if (nextSearchShow) {
      setTimeout(() => {
        if (!this.pageActive || !this.data.searchShow) return
        const searchmask = this.selectComponent('#searchmask')
        if (searchmask && typeof searchmask.refresh === 'function') searchmask.refresh()
      }, 0)
    } else {
      wx.stopBluetoothDevicesDiscovery()
      wx.offBluetoothDeviceFound()
    }
  },

  async connectSelectedDevice(e) {
    const selectedDevice = e.detail || {}
    if (!selectedDevice.deviceId || this._reconnectInProgress) return
    this.setData({ searchShow: false })

    const currentDevice = this.data.deviceInfo.find(item => item.connState)
    if (currentDevice && currentDevice.deviceId === selectedDevice.deviceId) return

    const device = { ...selectedDevice, name: '配音宝', connState: false }
    this.upsertDevice(device, { reconnectFailed: false })
    this.persistDeviceCache()

    try {
      await this.disconnectCurrentDevice(device.deviceId)
      await this.connectToDevice(device)
    } catch (error) {
      console.error('切换连接设备失败', error)
      await this.closeConnectionQuietly(device.deviceId)
      this.updateDeviceState(device.deviceId, {
        connState: false,
        reconnecting: false,
        reconnectFailed: true
      })
      this.persistDeviceCache()
      if (this.pageActive) wx.showToast({ title: '连接失败', icon: 'none' })
    }
  },

  async reconnect(e) {
    const deviceId = e.currentTarget.dataset.deviceId
      || (this.data.deviceInfo[0] && this.data.deviceInfo[0].deviceId)
    const device = this.data.deviceInfo.find(item => item.deviceId === deviceId)
    if (!device || this._reconnectInProgress) return
    try {
      await this.disconnectCurrentDevice(device.deviceId)
      await this.reconnectDevices([device])
    } catch (error) {
      console.error('断开当前设备失败', error)
      wx.showToast({ title: '切换设备失败', icon: 'none' })
    }
  },

  async disconnect(e) {
    const deviceId = e.currentTarget.dataset.deviceId
    const item = this.data.deviceInfo.find(device => device.deviceId === deviceId)
    if (!item || !item.connState) return

    this.updateDeviceState(deviceId, { connState: false })
    app.globalData.deviceInfo = { ...item, connState: false }
    wx.showLoading({ title: '断开中...', mask: true })
    try {
      await app.bletool.close_ble_connect(deviceId)
      this.persistDeviceCache()
      wx.showToast({ title: '已断开', icon: 'success' })
    } catch (error) {
      console.error('断开设备失败', error)
      app.globalData.deviceInfo = { ...item, connState: true }
      this.updateDeviceState(deviceId, { connState: true })
      wx.showToast({ title: '断开失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  showVoicePop(e = {}) {
    const currentTarget = e.currentTarget || {}
    const deviceId = (currentTarget.dataset || {}).deviceId
      || (this.data.deviceInfo[0] && this.data.deviceInfo[0].deviceId)
    const item = this.data.deviceInfo.find(device => device.deviceId === deviceId)
    if (!item || !item.connState) return
    wx.navigateTo({ url: '../devMusicList/devMusicList' })
  },

  onDeviceLongPress(e) {
    this.confirmDeleteDevice(e)
  },

  confirmDeleteDevice(e = {}) {
    const currentTarget = e.currentTarget || {}
    const deviceId = (currentTarget.dataset || {}).deviceId || currentTarget.id
    const item = this.data.deviceInfo.find(device => device.deviceId === deviceId)
    if (!item) return
    wx.showModal({
      title: '删除设备',
      content: item.connState ? '将先解绑设备，再删除本地缓存' : '确定删除该设备缓存吗？',
      confirmText: '删除',
      confirmColor: '#D32F2F',
      success: result => {
        if (result.confirm) this.deleteDeviceById(deviceId)
      }
    })
  },

  unBindDev(e) {
    this.confirmDeleteDevice(e)
  },

  async deleteDeviceById(deviceId) {
    const item = this.data.deviceInfo.find(device => device.deviceId === deviceId)
    if (!item) return

    if (item.connState) {
      try {
        app.hextool.sendDatas(app.hextool.unBindDev())
      } catch (error) {
        console.error('发送解绑命令失败', error)
        wx.showToast({ title: '解绑失败', icon: 'none' })
        return
      }
      await new Promise(resolve => setTimeout(resolve, this.unbindDeleteDelay === undefined ? 150 : this.unbindDeleteDelay))
      app.globalData.deviceInfo = { ...item, connState: false }
      await this.closeConnectionQuietly(deviceId)
    }

    const deviceInfo = this.data.deviceInfo.filter(device => device.deviceId !== deviceId)
    this.setData({ deviceInfo })
    if (this.lastConnectedDeviceId === deviceId) {
      this.lastConnectedDeviceId = (deviceInfo[0] && deviceInfo[0].deviceId) || ''
    }
    if (app.globalData.deviceInfo.deviceId === deviceId) app.globalData.deviceInfo = {}
    this.persistDeviceCache()
    wx.showToast({ title: '设备已删除', icon: 'success' })
  },

  unBindDevById(deviceId) {
    return this.deleteDeviceById(deviceId)
  },

  handleReconnectSearchFailure() {
    this.setData({
      deviceInfo: this.data.deviceInfo.map(item => ({
        ...item,
        connState: false,
        reconnecting: false,
        reconnectFailed: true
      }))
    })
  },

  handleDisCon() {
    const deviceId = (app.globalData.deviceInfo || {}).deviceId
    const connectedDevice = this.data.deviceInfo.find(item => item.connState)
    const targetId = deviceId || (connectedDevice && connectedDevice.deviceId)
    if (!targetId) return
    this.updateDeviceState(targetId, {
      connState: false,
      reconnecting: false,
      reconnectFailed: false
    })
    this.persistDeviceCache()
  },

  BLE_event(event, deviceId = '', error) {
    console.log('BLE_event....', event)
    if (event === 0) {
      this.finishPendingConnection(error || new Error('设备连接失败'))
      return true
    }
    if (event === 1) {
      try {
        app.hextool.sendDatas(app.hextool.getCmd0New())
      } catch (sendError) {
        this.finishPendingConnection(sendError)
      }
      return true
    }
    return false
  },

  onBLEnet(datas) {
    console.log('onBLEnet111:', datas)
    if (datas[0] === 0) {
      const mtuBytes = datas.slice(-2)
      if (mtuBytes.length === 2) {
        const mtuHex = Number(mtuBytes[0]).toString(16).padStart(2, '0')
          + Number(mtuBytes[1]).toString(16).padStart(2, '0')
        const mtu = parseInt(mtuHex, 16) - 3
        if (Number.isFinite(mtu) && mtu > 0) app.globalData.mtu = mtu
      }
      const networkData = app.hextool.getNetSetDatasNew()
      app.hextool.sendDatas(networkData[0])
    }

    if (datas[0] === 1) {
      this.applyConnectedDevice(app.globalData.deviceInfo || {}, true)
    }
  },

  onBLEdatas(deviceData) {
    console.log('onBLEdatas.....', deviceData)
  },

  onReady() {},
  onHide() {},

  onUnload() {
    this.pageActive = false
    app.bletool.BLE_stopReconnectSearch()
    this.finishPendingConnection(new Error('页面已关闭'))
  },

  onPullDownRefresh() {},
  onReachBottom() {},
  onShareAppMessage() {}
})
