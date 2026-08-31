// import * as ble from '../../utils/ble'
let app = getApp()
Component({
    /**
     * 组件的属性列表
     */
    properties: {
        searchShow:{
            type: Boolean,
            value: false
        }
    },
    observers: {
        'searchShow'(val) {
            console.log('当前显示状态:', val)
            this.setData({loading: false})
            if(!val && this._scanLoadingTimer){
              clearTimeout(this._scanLoadingTimer)
              this._scanLoadingTimer = null
            }
          }
    },
    options:{
        addGlobalClass: true
    },
    /**
     * 组件的初始数据
     */
    data: {
        searchDev: [
            // {"deviceId":'AC:bC:05:35:S5',"name":'智能设备'},
            // {"deviceId":'AC:bC:05:35:S5',"name":'智能设备'},
            // {"deviceId":'AC:bC:05:35:S5',"name":'智能设备'},
            // {"deviceId":'AC:bC:05:35:S5',"name":'智能设备'},
        ],
        devIndex: -1,
        loading: false
    },

    /**
     * 组件的方法列表
     */
    methods: {
        //刷新
        refresh(){
            // 客户要求这里不要重叠loading BLE_start 后的hideLoading 先不管
            // wx.showLoading({title: 'loading...',mask:true})
            this.setData({loading: true, searchDev:[], devIndex: -1}) //这里替代showLoading
            if(this._scanLoadingTimer) clearTimeout(this._scanLoadingTimer)
            this._scanLoadingTimer = setTimeout(() => {
              this._scanLoadingTimer = null
              this.setData({loading: false})
              wx.stopBluetoothDevicesDiscovery()
              wx.offBluetoothDeviceFound()
            }, this.scanLoadingTimeout || 12000)
            // this.triggerEvent('refresh')
            const scanResult = app.bletool.BLE_scanAvailableDevices()
            if(scanResult && typeof scanResult.catch === 'function'){
              scanResult.catch(() => {
                if(this._scanLoadingTimer) clearTimeout(this._scanLoadingTimer)
                this._scanLoadingTimer = null
                this.setData({loading: false})
              })
            }
        },
        // 按设备 ID 去重更新，保留最新信号并按 RSSI 从强到弱排列
        upsertSearchDevice(device){
            if(!device || !device.deviceId) return

            const currentDevices = this.data.searchDev.slice()
            const selectedDevice = this.data.devIndex > 0
                ? currentDevices[this.data.devIndex - 1]
                : null
            const selectedDeviceId = selectedDevice && selectedDevice.deviceId
            const rssi = Number(device.RSSI)
            const displayDevice = Object.assign({}, device, {
                mac: device.deviceId,
                displayRSSI: Number.isFinite(rssi) ? rssi : '--'
            })
            const existingIndex = currentDevices.findIndex((item) => item.deviceId === device.deviceId)

            if(existingIndex === -1){
                currentDevices.push(displayDevice)
            }else{
                currentDevices[existingIndex] = displayDevice
            }

            currentDevices.sort((left, right) => {
                const leftRSSI = Number(left.RSSI)
                const rightRSSI = Number(right.RSSI)
                const safeLeftRSSI = Number.isFinite(leftRSSI) ? leftRSSI : Number.NEGATIVE_INFINITY
                const safeRightRSSI = Number.isFinite(rightRSSI) ? rightRSSI : Number.NEGATIVE_INFINITY
                return safeRightRSSI - safeLeftRSSI
            })

            const selectedIndex = selectedDeviceId
                ? currentDevices.findIndex((item) => item.deviceId === selectedDeviceId)
                : -1
            this.setData({
                searchDev: currentDevices,
                devIndex: selectedIndex === -1 ? -1 : selectedIndex + 1
            })
        },
        maskClick(){
        },
        // 选择设备
        chooseDev(e){
            let n = e.currentTarget.dataset.n;
            this.setData({ devIndex: n })
        },
        async confirmDev(){
            //停止搜索蓝牙设备
            wx.stopBluetoothDevicesDiscovery()
            wx.offBluetoothDeviceFound()
            if(this._scanLoadingTimer){
              clearTimeout(this._scanLoadingTimer)
              this._scanLoadingTimer = null
            }
            let devIndex = this.data.devIndex;
            if(devIndex == -1){
              wx.showToast({
                title: '未选择设备',
                icon: 'error'
              })
              return;
            }
            console.log("confirmDev.......");
            //提示
            devIndex = devIndex - 1
            let searchDev = this.data.searchDev;
            const device = searchDev[devIndex]
            this.setData({did: device.deviceId});
            this.triggerEvent('connectDevice', device)
        },
    }
})
