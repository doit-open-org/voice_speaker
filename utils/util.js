const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return [year, month, day].map(formatNumber).join('/') + ' ' + [hour, minute, second].map(formatNumber).join(':')
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : '0' + n
}

//校验UUID是否符合规则
function uuidCheck(uuid) {
  if(uuid == undefined){ return }
  let reg = /0000([0-9a-f][0-9a-f][0-9a-f][0-9a-f])-0000-1000-8000-00805f9b34fb/
  return uuid.length > 0 && reg.test(uuid.toLocaleLowerCase())
}

// ArrayBuffer转16进度字符串示例
function ab2hex(buffer) {
  var hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function (bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join('');
}
//byte数组转字符
function Uint8ToStr(arr) {
  for (var i = 0, str = ''; i < arr.length; i++)
    str += String.fromCharCode(arr[i]);
  return str;
}
//获取缓存的设备名称
function getStorageDeviceName(that){
  let app = getApp();
  let dNames = wx.getStorageSync('localNames');
  console.log("dNames...",dNames);
  if(dNames){
    app.globalData.localNames = dNames
  }
}
//获取对应id的设备缓存名称
function getDeviceNameByDid(did){
  let app=getApp();
  let localNames = app.globalData.localNames;
  if(localNames == undefined){ return }
  console.log("getDeviceNameByDid...",localNames);
  let deviceName = ''
  if(localNames.length > 0){         
    localNames.forEach(item => {
      if(item['did'] == did){ deviceName = item['name'] }
    });
  }
  return deviceName;
}
//本地修改蓝牙设备名称初始化
function localDeviceNameInit(that) {
  console.log("localDeviceNameInit....")
  wx.getStorage({
    key: 'localName',
    success(res) {
      console.log("getStorage:",res.data)
      that.setData({
        localDevices: res.data==1?[]:res.data
      })
    }
  })
}
//本地修改蓝牙设备名称初始化Arr
function localDeviceNameInitArray(that) {
  let arr = wx.getStorageSync('localNameArr')
  console.log("localDeviceNameInitArray....",arr)
  that.setData({
    localDevicesArr: arr
  })
}

//存储本地修改蓝牙设备名称
function toSaveLocalDeviceName(device) {
  console.log("toSaveLocalDeviceName....",device)
  // wx.clearStorageSync()
  wx.setStorage({
    key: "localName",
    data: device
  })
}

//存储本地修改蓝牙设备名称Arr
function toSaveLocalDeviceNameArray(device){
 let arr = wx.getStorageSync('localNameArr')
 console.log("device....",device)
 console.log("toSaveLocalDeviceNameArray1....",arr)
 if(arr.length == 0 ){
    arr = []
    // device.forEach((it)=>{ arr.push(it) })
    arr.push(device)
  }else{
    let f = true;
    arr.forEach((item,inx)=>{
      // device.forEach((it,index)=>{
        // console.log(item['deviceId']+"::i::"+it['deviceId'])
        if(item['deviceId'] == device['deviceId']){
          f = false
        }
      // })
    })
    if(f){arr.push(device)}
  }
  console.log("arr..",arr);
  wx.setStorageSync('localNameArr', arr);
 
}


//设置上次缓存到本地
function setSetsToLocal(key,datas){
  // wx.clearStorageSync()
  wx.setStorage({
    key: key,
    data: datas
  })
}

//获取上次缓存设置
function getSetsToLocal(key,that) {
  wx.getStorage({
    key: key,
    success(res) {
      console.log("getkey:",res.data)
      if(res.data)that.setData(res.data)
    },
    fail:res=>{
      console.log(res)
    }
  })
}

module.exports = {
  formatTime,
  uuidCheck,
  ab2hex,
  Uint8ToStr,
  localDeviceNameInit,
  getStorageDeviceName,
  getDeviceNameByDid,
  toSaveLocalDeviceName,
  setSetsToLocal,
  getSetsToLocal,
  toSaveLocalDeviceNameArray,
  localDeviceNameInitArray
}