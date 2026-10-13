App({
  globalData: {
    openid: '',
    envId: 'cloud1-d3gm6iv459656b794'
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: this.globalData.envId,
      traceUser: true
    });
    this.login();
  },

  login() {
    wx.cloud.callFunction({ name: 'login' }).then(res => {
      this.globalData.openid = res.result.openid;
    }).catch(() => {
      // login 云函数未部署时不阻塞页面，数据库查询会自动按 openid 过滤
    });
  }
});
