// 接口文档地址：https://ai-speaker.esp32.cn/docs#/
// 接口基地址
// const BASE_URL = 'https://ai-speaker.esp32.cn/api/v1'
// const BASE_URL = 'http://192.168.5.245:9000/api/v1'
const BASE_URL = 'https://peiyinbao.esp32.cn/api/v1'

// Token 存储的 key
const TOKEN_KEY = 'auth_token'

/**
 * 封装的网络请求方法
 * @param {Object} options - 请求配置
 * @param {String} options.url - 请求地址（相对路径）
 * @param {String} options.method - 请求方法，默认 GET
 * @param {Object} options.data - 请求数据
 * @param {Object} options.header - 请求头
 * @param {Boolean} options.needAuth - 是否需要 token 认证，默认 false
 * @returns {Promise} 返回 Promise 对象
 */
const request = (options) => {
  return new Promise((resolve, reject) => {
    const {
      url,
      method = 'GET',
      data = {},
      header = {},
      needAuth = false
    } = options

    // 构建完整的请求配置
    const requestConfig = {
      url: BASE_URL + url,
      method: method.toUpperCase(),
      data,
      header: {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        ...header
      },
      success: async (res) => {
        // 请求成功
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401 && needAuth) {
          // Token 过期，自动重新登录
          try {
            await wechatLogin()
            // 重新发起原请求
            const retryRes = await request(options)
            resolve(retryRes)
          } catch (err) {
            reject({
              statusCode: 401,
              message: '登录失败，请重试',
              data: err
            })
          }
        } else {
          // HTTP 错误
          const error = {
            statusCode: res.statusCode,
            message: res.data.message || '请求失败',
            data: res.data
          }
          reject(error)
        }
      },
      fail: (err) => {
        // 网络错误
        const error = {
          statusCode: 0,
          message: err.errMsg || '网络请求失败',
          data: err
        }
        reject(error)
      }
    }

    // 如果需要认证，添加 token
    if (needAuth) {
      const token = wx.getStorageSync(TOKEN_KEY)
      if (token) {
        requestConfig.header['Authorization'] = `Bearer ${token}`
      }
    }

    // 发起请求
    wx.request(requestConfig)
  })
}

/**
 * 微信小程序登录
 * @returns {Promise} 返回登录结果
 */
const wechatLogin = async () => {
  try {
    // 1. 调用 wx.login 获取 code
    const loginRes = await new Promise((resolve, reject) => {
      wx.login({
        success: resolve,
        fail: reject
      })
    })

    if (!loginRes.code) {
      throw new Error('获取微信登录 code 失败')
    }

    console.log('获取到微信 code:', loginRes.code)

    // 2. 将 code 发送到后端接口
    const response = await request({
      url: '/auth/wechat/login',
      method: 'POST',
      data: {
        code: loginRes.code
      }
    })

    console.log('登录成功:', response)
    let token = response.data.access_token
    // 3. 保存 token（如果后端返回了 token）
    if (token) {
      wx.setStorageSync(TOKEN_KEY, token)
    }

    // 4. 保存用户信息（如果有）
    if (response.userInfo) {
      wx.setStorageSync('userInfo', response.userInfo)
    }

    return response
  } catch (error) {
    console.error('微信登录失败:', error)
    throw error
  }
}

/**
 * 检查登录状态
 * @returns {Boolean} 是否已登录
 */
const checkLoginStatus = () => {
  const token = wx.getStorageSync(TOKEN_KEY)
  return !!token
}

/**
 * 退出登录
 */
const logout = () => {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync('userInfo')
}

/**
 * 登录
 */
const checkLogin = async()=>{
  // 检查缓存
  let openid = wx.getStorageSync('openid')
  let auth_token = wx.getStorageSync(TOKEN_KEY)
  if(openid && auth_token){ return }
  wx.showLoading({ title: '登录中...' })
  try {
    const res = await wechatLogin()
    console.log('登录成功:', res)
    wx.setStorageSync('openid', res.data.user.wechat_openid)
    wx.showToast({
      title: '登录成功',
      icon: 'success'
    })
  } catch (err) {
    console.error('登录失败:', err)
    wx.showToast({
      title: err.message || '登录失败',
      icon: 'none'
    })
  } finally {
    wx.hideLoading()
  }
}



const showToast = (icon,txt) => {
  wx.showToast({
    icon: icon,
    title: txt,
  })
}



module.exports = {
  request,
  wechatLogin,
  checkLoginStatus,
  logout,
  checkLogin,
  showToast
}
