// 封装request函数
const httpReq = async (options) => {
  return await new Promise((resolve, reject) => {
    wx.request({
      ...options,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data);
        } else {
          console.log('请求失败',res);
          wx.showToast({
            title: res.data.message,
            icon:'error'
          })
          reject(new Error(`请求失败，状态码：${res.statusCode}`));
        }
      },
      fail: (err) => {
        console.log('请求失败',err);
        wx.showToast({
          title: '请求失败',
          icon:'error'
        })
        reject(err);
      }
    });
  });
};

module.exports = {
  httpReq
};