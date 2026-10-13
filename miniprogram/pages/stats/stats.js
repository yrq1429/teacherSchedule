const util = require('../../utils/util.js');

Page({
  data: {
    weekCourses: 0,
    weekHours: 0,
    monthClasses: 0,
    monthRealHours: 0,
    feedbackCount: 0
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const db = wx.cloud.database();
      const now = new Date();
      const monthStart = util.formatDate(new Date(now.getFullYear(), now.getMonth(), 1));

      const [courses, monthLogs, fbRes] = await Promise.all([
        util.fetchAll('courses'),
        util.fetchAll('logs', { date: db.command.gte(monthStart) }),
        db.collection('feedbacks').where({ createdAt: db.command.gte(new Date(now.getFullYear(), now.getMonth(), 1)) }).count()
      ]);

      let weekHours = 0;
      let weekCourses = 0;
      courses.forEach(c => {
        if (c.date) return; // 一次性课程不计入每周模板
        weekCourses++;
        weekHours += util.courseHours(c.startTime, c.endTime);
      });

      let monthRealHours = 0;
      monthLogs.forEach(l => {
        monthRealHours += l.hours || 0;
      });

      this.setData({
        weekCourses,
        weekHours,
        monthClasses: monthLogs.length,
        monthRealHours: Math.round(monthRealHours * 10) / 10,
        feedbackCount: fbRes.total
      });
    } catch (e) {
      console.error(e);
    }
  }
});
