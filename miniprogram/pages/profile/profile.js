// 「我的」页：提醒授权管理
// TODO: 把 TEMPLATE_ID 替换为小程序后台申请到的订阅消息模板 ID
const TEMPLATE_ID = '3MZ_rIS0Tw_2cOudkIO7x1zlvBesdEpD47f6rfnR7_A';

Page({
  data: {
    quota: 0,
    defaultRole: '英语教师',
    roles: ['英语教师', '物理教师', '数学教师', '语文教师', '通用教师'],
    userId: ''
  },

  onShow() {
    this.loadQuota();
    this.loadUserId();
  },

  // 显示脱敏的用户身份标识，证明每个人的数据空间独立
  async loadUserId() {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' });
      const openid = res.result.openid || '';
      this.setData({ userId: openid ? '···' + openid.slice(-8) : '' });
    } catch (e) {
      console.error(e);
    }
  },

  async loadQuota() {
    try {
      const res = await wx.cloud.database().collection('remind_subs').get();
      const quota = res.data.reduce((sum, item) => sum + (item.quota || 0), 0);
      this.setData({ quota });
    } catch (e) {
      console.error(e);
    }
  },

  // 申请订阅消息授权，一次授权 = 一条推送额度
  onSubscribe() {
    if (TEMPLATE_ID === 'YOUR_SUBSCRIBE_TEMPLATE_ID') {
      wx.showToast({ title: '请先在小程序后台申请订阅消息模板', icon: 'none' });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: async res => {
        if (res[TEMPLATE_ID] === 'accept') {
          try {
            await wx.cloud.database().collection('remind_subs').add({
              data: { quota: 1, createdAt: new Date() }
            });
            wx.showToast({ title: '已开启提醒', icon: 'success' });
            this.loadQuota();
          } catch (e) {
            console.error(e);
          }
        } else {
          wx.showToast({ title: '未授权，无法推送提醒', icon: 'none' });
        }
      },
      fail: err => {
        console.error(err);
        wx.showToast({ title: '授权失败', icon: 'none' });
      }
    });
  }
});
