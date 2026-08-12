// pages/myWorks/myWorks.js
const app = getApp()
const { request, wechatLogin, checkLoginStatus, logout,checkLogin,showToast } = require('../../utils/request')
let innerAudioContext = ''
const TITLE_DISPLAY_LIMIT = 40
Page({

  /**
   * 页面的初始数据
   */
  data: {
    list:[ ],
    palyId: -1, //播放id
    isPlaying: false, //播放状态
    page: 1, //页数
    page_size: 50, //每页条数
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 拉取所有作品列表
    this.getWorksList()
    this.innerAudioContext = wx.createInnerAudioContext()
    this.innerAudioContext.onPlay(() => {
      console.log("play......")
      this.setData({ isPlaying: true })
    })
    this.innerAudioContext.onPause(() => {
      console.log("onPause......")
      this.setData({ isPlaying: false,palyId: -1 })
    })
    this.innerAudioContext.onEnded(() => {
      console.log("onEnded......")
      this.setData({ isPlaying: false,palyId: -1 })
    })
    this.innerAudioContext.onError((e)=>{
      console.log("onError......",e)
    })
  },
  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
  },
  // 接口文档地址：https://ai-speaker.esp32.cn/docs#/
  async getWorksList(){
    try {
      const res = await request({
        url: `/user/tts/records?page=${this.data.page}&page_size=${this.data.page_size}`,
        method: 'GET',
        needAuth: true
      })
      if(res.code == 200){
        // audio_url: "ai-speaker.tos-cn-beijing.volces.com/tts_audio/2025/11/21/44656c9c59ea4e7e8b3085a3c6bd40b4.mp3"
        // bgm_ducking: null
        // bgm_id: null
        // bgm_tail: null
        // bgm_volume: null
        // created_at: "2025-11-21T11:41:13"
        // duration: null
        // file_name: "5f1b978ed2d24a998cea468933f24785.mp3"
        // file_size: 25920
        // id: 13
        // pitch_ratio: 1
        // speed_ratio: 1
        // text: "<speak>123</speak>"
        // user_bgm_id: null
        // voice_delay: null
        // voice_id: "zh_female_shuangkuaisisi_moon_bigtts"
        // voice_name: "爽快思思/Skye"
        // volume_ratio: 1
        console.log('我的作品:', res.data)
        let data = res.data
        console.log('page...', this.data.page)
        if(!data.length){ return }
        this.data.page += 1 
        data.forEach(item=>{
          item.created_at = item.created_at.replace('T', ' ')
          // 把文件名称后缀去掉
          item.file_new_name = item.file_name.replace(/\.[^/.]+$/, '');
          item.display_title = this.formatWorkTitle(item)
        })
        let list = this.data.list
        list.push(...data)
        this.setData({ list })
        
      }else{
        showToast('error','作品拉取失败')
      }
    } catch (err) {
      console.error('获取失败:', err)
      showToast('error','作品拉取失败')
    }
  },

  formatWorkTitle(item = {}) {
    const title = String(item.title || item.file_new_name || '')
    const characters = Array.from(title)
    return characters.length > TITLE_DISPLAY_LIMIT
      ? `${characters.slice(0, TITLE_DISPLAY_LIMIT).join('')}...`
      : title
  },

  playMusic(e){
    let index = e.currentTarget.id
    let list = this.data.list
    let id = list[index]['id']
    console.log("id....",id)

    if (this.data.isPlaying && this.data.palyId == id) {
      this.innerAudioContext.pause()
    } else {
      this.innerAudioContext.obeyMuteSwitch = false  // 忽略静音开关
      console.log('33...',list[index]['audio_url']);
      this.innerAudioContext.src = list[index]['audio_url']
      this.innerAudioContext.play()
      this.setData({palyId: id })
    }
  },

  onExport(e){
    console.log(e.currentTarget.id)
    this.innerAudioContext.pause()
    let index = e.currentTarget.id
    let list = this.data.list
    // let item = list[index]
    //深拷贝,防止generate页面修改audio_url 地址
    let item = JSON.parse(JSON.stringify(list[index]))
    console.log('item:...', item)
    app.globalData.generate = item
    wx.navigateTo({ url: '../generate/generate' })
  },
  onDelete(e){
    let index = e.currentTarget.id
    wx.showModal({
      title: '提示',
      content: '确定删除吗?',
      complete: (res) => {    
        if (res.confirm) {
          this.delLogByIndex(index)
        }
      }
    })
  },
  async delLogByIndex(index){
    let id = this.data.list[index]['id']
    if(id == this.data.palyId){
      this.innerAudioContext.pause()
    }
    try {
      const res = await request({
        url: '/user/tts/records',
        data:{ "record_id":id},
        method: 'DELETE',
        needAuth: true
      })
      if(res.code == 200){
        console.log('删除作品:', res.data)
        let list = this.data.list
        list.splice(index, 1); 
        this.setData({ list })
      }else{
        showToast('error','删除作品失败')
      }
    } catch (err) {
      console.error('获取失败:', err)
      showToast('error','删除作品失败')
    }
  },

  onEdit(e){
    let index = e.currentTarget.id
    let file_name = this.data.list[index]['file_name']
    file_name = file_name.substr(0,file_name.length-4) //去掉后缀
    wx.showModal({
      title: '修改名称',
      content: file_name,
      editable :true,
      complete: (res) => {    
        if (res.confirm) {
          console.log('编辑:', res.content)
          let newName = res.content+".mp3"
          // list[index]['file_name'] = newName
          this.editFileNameById(index,newName)
        }
      }
    })
  },

  async editFileNameById(index,newName){
    let id = this.data.list[index]['id']
    try {
      const res = await request({
        url: '/user/tts/records/title',
        data:{
          "record_id":id,
          "title": newName
        },
        method: 'PUT',
        needAuth: true
      })
      if(res.code == 200){
        console.log('修改标题:', res.data)
        let list = this.data.list
        list[index]['file_name'] = newName
        list[index]['file_new_name'] = newName.replace(/\.[^/.]+$/, '')
        list[index]['title'] = newName
        list[index]['display_title'] = this.formatWorkTitle(list[index])
        this.setData({ list })
      }else{
        showToast('error','修改标题失败')
      }
    } catch (err) {
      console.error('修改标题失败:', err)
      showToast('error','修改标题失败')
    }
  },  

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    // if (this.innerAudioContext) {
    //   this.innerAudioContext.pause()
    // }
  },



  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    if (this.innerAudioContext) {
      this.innerAudioContext.pause()
      this.innerAudioContext.destroy()
      this.setData({ isPlaying: false,palyId: -1 })
    }
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    //触底拉取列表
    this.getWorksList();
    console.log("触底了！");
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})
