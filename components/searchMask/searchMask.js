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
            this.setData({loading: true}) //这里替代showLoading
            this.setData({searchDev:[],devIndex: -1})
            // this.triggerEvent('refresh')
            app.bletool.BLE_start();
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
            let did = searchDev[devIndex].deviceId
            this.setData({did: did});
            app.globalData.did = did;
            app.globalData.deviceInfo = searchDev[devIndex]
            // 创建连接
            app.bletool.BLE_connect(did)
            // 协商MTU(放在BLE_connect成功回调中处理)
            // await app.bletool.negotiateMTU()
            //关闭弹窗
            this.triggerEvent('ConClose',11)      
        },
    }
})
