Page({
  data: {
    name: '',
    location: '',
    note: '',
    subjects: ['英语', '物理'],
    subjectIndex: 0,
    weekdays: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    weekdayIndex: 0,
    startTime: '09:00',
    endTime: '10:30',
    saving: false,
    editId: '',       // 非空 = 编辑模式
    courseDate: ''    // 一次性课程的日期（编辑时保留）
  },

  async onLoad(options) {
    if (options && options.id) {
      // 编辑模式：加载已有课程
      try {
        const res = await wx.cloud.database().collection('courses').doc(options.id).get();
        const c = res.data;
        this.setData({
          editId: c._id,
          name: c.name,
          location: c.location || '',
          note: c.note || '',
          subjectIndex: Math.max(0, this.data.subjects.indexOf(c.subject)),
          weekdayIndex: (c.weekday || 1) - 1,
          startTime: c.startTime,
          endTime: c.endTime,
          courseDate: c.date || ''
        });
        wx.setNavigationBarTitle({ title: '编辑课程' });
      } catch (e) {
        console.error(e);
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    }
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onSubjectChange(e) {
    this.setData({ subjectIndex: Number(e.detail.value) });
  },

  onWeekdayChange(e) {
    this.setData({ weekdayIndex: Number(e.detail.value) });
  },

  onTimeChange(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  async onSave() {
    const d = this.data;
    if (!d.name.trim()) {
      wx.showToast({ title: '请填写课程名称', icon: 'none' });
      return;
    }
    if (d.startTime >= d.endTime) {
      wx.showToast({ title: '结束时间需晚于开始时间', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const db = wx.cloud.database();
    const payload = {
      name: d.name.trim(),
      subject: d.subjects[d.subjectIndex],
      weekday: d.weekdayIndex + 1, // 1=周一
      startTime: d.startTime,
      endTime: d.endTime,
      location: d.location.trim(),
      note: d.note.trim()
    };
    try {
      if (d.editId) {
        // 编辑：更新（一次性课程保留原日期）
        if (d.courseDate) payload.date = d.courseDate;
        await db.collection('courses').doc(d.editId).update({ data: payload });
        wx.showToast({ title: '已保存修改', icon: 'success' });
      } else {
        await db.collection('courses').add({
          data: { ...payload, createdAt: new Date() }
        });
        wx.showToast({ title: '已保存', icon: 'success' });
      }
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '保存失败，请检查云环境', icon: 'none' });
    }
    this.setData({ saving: false });
  }
});
