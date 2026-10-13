Page({
  data: {
    courses: [],
    courseIndex: 0,
    roles: ['英语教师', '物理教师'],
    roleIndex: 0,
    providers: ['Kimi', '豆包'],
    providerKeys: ['kimi', 'doubao'],
    providerIndex: 0,
    content: '',
    polished: '',
    polishing: false,
    saving: false,
    classDate: ''
  },

  // 根据课程科目自动匹配教师口吻
  roleForSubject(subject) {
    if (subject === '物理') return 1;
    return 0; // 默认英语教师
  },

  async onLoad(options) {
    // 默认上课日期 = 今天
    const now = new Date();
    const classDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.setData({ classDate });
    try {
      const util = require('../../utils/util.js');
      const courses = await util.fetchAll('courses');
      let courseIndex = 0;
      // 从课程详情页带参进入时，自动选中该课程
      if (options && options.courseId) {
        const idx = courses.findIndex(c => c._id === options.courseId);
        if (idx >= 0) courseIndex = idx;
      }
      const roleIndex = courses.length > 0 ? this.roleForSubject(courses[courseIndex].subject) : 0;
      this.setData({ courses, courseIndex, roleIndex });
    } catch (e) {
      console.error(e);
    }
  },

  onCourseChange(e) {
    const courseIndex = Number(e.detail.value);
    const course = this.data.courses[courseIndex];
    this.setData({
      courseIndex,
      roleIndex: course ? this.roleForSubject(course.subject) : this.data.roleIndex
    });
  },

  onRoleChange(e) {
    this.setData({ roleIndex: Number(e.detail.value) });
    this.autoRepolish();
  },

  onDateChange(e) {
    this.setData({ classDate: e.detail.value });
  },

  onProviderChange(e) {
    this.setData({ providerIndex: Number(e.detail.value) });
    this.autoRepolish();
  },

  // 切换角色/模型后，如果已有润色结果则自动重新润色
  autoRepolish() {
    if (this.data.content.trim() && this.data.polished && !this.data.polishing) {
      this.onPolish();
    }
  },

  onInput(e) {
    this.setData({ content: e.detail.value });
  },

  async onPolish() {
    if (!this.data.content.trim()) {
      wx.showToast({ title: '先写点反馈内容', icon: 'none' });
      return;
    }
    this.setData({ polishing: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'polishFeedback',
        data: {
          content: this.data.content,
          role: this.data.roles[this.data.roleIndex],
          provider: this.data.providerKeys[this.data.providerIndex]
        }
      });
      this.setData({ polished: res.result.polished });
      if (res.result.mode === 'original') {
        const errs = (res.result.errors || []).join('；');
        wx.showModal({
          title: '润色未生效',
          content: errs || '模型调用失败',
          showCancel: false
        });
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '润色失败，请确认云函数已部署', icon: 'none' });
    }
    this.setData({ polishing: false });
  },

  async onSave() {
    const d = this.data;
    if (!d.content.trim()) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    if (d.courses.length === 0) {
      wx.showToast({ title: '请先在课表录入课程', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const course = d.courses[d.courseIndex];
    try {
      await wx.cloud.database().collection('feedbacks').add({
        data: {
          courseId: course._id,
          courseName: course.name,
          role: d.roles[d.roleIndex],
          content: d.content,
          polished: d.polished,
          classDate: d.classDate,
          createdAt: new Date()
        }
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
    this.setData({ saving: false });
  }
});
