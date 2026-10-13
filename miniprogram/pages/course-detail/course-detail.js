const util = require('../../utils/util.js');

Page({
  data: {
    course: null,
    feedbacks: [],
    weekdayText: '',
    hours: 0,
    loading: true
  },

  onLoad(options) {
    this.courseId = options.id;
  },

  onShow() {
    if (this.courseId) this.load();
  },

  async load() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    try {
      const [courseRes, fbRes] = await Promise.all([
        db.collection('courses').doc(this.courseId).get(),
        db.collection('feedbacks')
          .where({ courseId: this.courseId })
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get()
      ]);
      const c = courseRes.data;
      this.setData({
        course: c,
        color: util.getSubjectColor(c.subject),
        feedbacks: fbRes.data,
        weekdayText: '周' + ['一', '二', '三', '四', '五', '六', '日'][c.weekday - 1],
        hours: util.courseHours(c.startTime, c.endTime),
        loading: false
      });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
    }
  },

  goWriteFeedback() {
    wx.navigateTo({
      url: '/pages/feedback-edit/feedback-edit?courseId=' + this.courseId
    });
  },

  goEdit() {
    wx.navigateTo({
      url: '/pages/course-add/course-add?id=' + this.courseId
    });
  },

  copyPolished(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text });
  },

  onDelete() {
    const count = this.data.feedbacks.length;
    wx.showModal({
      title: '删除课程',
      content: count > 0
        ? `该课程下的 ${count} 条反馈也会一起删除，且不可恢复。确定删除？`
        : '确定删除这门课吗？',
      confirmColor: '#E85D26',
      success: async r => {
        if (!r.confirm) return;
        const db = wx.cloud.database();
        try {
          // 先删该课程的所有反馈
          const fbRes = await db.collection('feedbacks')
            .where({ courseId: this.courseId })
            .get();
          for (const fb of fbRes.data) {
            await db.collection('feedbacks').doc(fb._id).remove();
          }
          // 再删打卡记录
          const logRes = await db.collection('logs')
            .where({ courseId: this.courseId })
            .get();
          for (const log of logRes.data) {
            await db.collection('logs').doc(log._id).remove();
          }
          // 最后删课程
          await db.collection('courses').doc(this.courseId).remove();
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 600);
        } catch (e) {
          console.error(e);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  }
});
