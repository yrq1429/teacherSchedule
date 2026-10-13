const util = require('../../utils/util.js');

Page({
  data: {
    feedbacks: [],      // 过滤后展示的
    keyword: '',
    timeFilter: 'all',  // all | week | month
    loading: true
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      this.allFeedbacks = await util.fetchAll('feedbacks');
      this.allFeedbacks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      this.applyFilter();
      this.setData({ loading: false });
    } catch (e) {
      console.error(e);
      this.allFeedbacks = [];
      this.applyFilter();
      this.setData({ loading: false });
    }
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  onClearKeyword() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  onTimeFilter(e) {
    this.setData({ timeFilter: e.currentTarget.dataset.v });
    this.applyFilter();
  },

  // 本周一的日期对象
  weekStart() {
    const now = new Date();
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    monday.setHours(0, 0, 0, 0);
    return monday;
  },

  // 反馈对应的上课日期（优先 classDate，兜底 createdAt）
  feedbackDate(f) {
    if (f.classDate) return new Date(f.classDate + 'T00:00:00');
    return new Date(f.createdAt);
  },

  applyFilter() {
    const kw = this.data.keyword.trim();
    let list = this.allFeedbacks || [];

    // 关键词：匹配课程名（含学员名）和反馈内容
    if (kw) {
      list = list.filter(f =>
        (f.courseName && f.courseName.includes(kw)) ||
        (f.content && f.content.includes(kw)) ||
        (f.polished && f.polished.includes(kw))
      );
    }

    // 时间筛选
    const now = new Date();
    if (this.data.timeFilter === 'week') {
      const start = this.weekStart();
      list = list.filter(f => this.feedbackDate(f) >= start);
    } else if (this.data.timeFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      list = list.filter(f => this.feedbackDate(f) >= start);
    }

    this.setData({ feedbacks: list });
  },

  goWrite() {
    wx.navigateTo({ url: '/pages/feedback-edit/feedback-edit' });
  },

  copyPolished(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text });
  },

  goCourse(e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: '/pages/course-detail/course-detail?id=' + id });
    }
  },

  // 长按删除反馈
  onDeleteFeedback(e) {
    const fid = e.currentTarget.dataset.fid;
    wx.showModal({
      title: '删除反馈',
      content: '确定删除这条反馈吗？不可恢复。',
      confirmColor: '#E85D26',
      success: async r => {
        if (!r.confirm) return;
        try {
          await wx.cloud.database().collection('feedbacks').doc(fid).remove();
          this.allFeedbacks = (this.allFeedbacks || []).filter(f => f._id !== fid);
          this.applyFilter();
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          console.error(err);
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  }
});
