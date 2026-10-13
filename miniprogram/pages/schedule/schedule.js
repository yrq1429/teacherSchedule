const util = require('../../utils/util.js');

const { summarizeDay } = require('../../utils/agenda.js');

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

Page({
  data: {
    weekDates: [],        // 当前展示的 7 天 [{day, dayNum, label, full, isToday}]
    selectedDate: '',     // YYYY-MM-DD
    selectedWeekday: 1,
    weekOffset: 0,
    courses: [],          // 选中日期的课程（带打卡状态）
    loading: true,
    greeting: '',
    totalInDb: 0,
    dateTitle: '',
    weekRange: '',
    doneCount: 0, plannedHours: 0, progress: 0, focus: null, focusLabel: '',
    displayMonth: '', displayDay: '', loadError: false
  },

  onShow() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
    this.setData({ greeting });
    if (!this.data.selectedDate) {
      this.setData({ selectedDate: util.formatDate(now) });
    }
    this.buildWeek();
    this.loadData();
    clearInterval(this.clockTimer);
    this.clockTimer = setInterval(() => { if (!this.data.loading && !this.data.loadError) this.filterDay(); }, 60000);
  },

  onHide() { clearInterval(this.clockTimer); },
  onUnload() { clearInterval(this.clockTimer); },

  // 生成当前周（含偏移）的 7 天
  buildWeek() {
    const now = new Date();
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1 + this.data.weekOffset * 7);

    const todayStr = util.formatDate(now);
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const full = util.formatDate(d);
      weekDates.push({
        day: i + 1,
        dayNum: d.getDate(),
        label: WEEK_LABELS[i],
        full,
        isToday: full === todayStr
      });
    }
    const first = weekDates[0], last = weekDates[6];
    this.setData({
      weekDates,
      weekRange: `${first.dayNum}日 - ${last.dayNum}日`,
      selectedWeekday: this.weekdayOf(this.data.selectedDate)
    });
  },

  weekdayOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    return day === 0 ? 7 : day;
  },

  async loadData() {
    const requestedDate = this.data.selectedDate;
    const requestId = this.loadRequestId = (this.loadRequestId || 0) + 1;
    this.setData({ loading: true, loadError: false, focus: null,
      displayMonth: requestedDate.slice(5, 7), displayDay: requestedDate.slice(8, 10) });
    try {
      const [allCourses, logRes] = await Promise.all([
        util.fetchAll('courses'),
        util.fetchAll('logs', { date: requestedDate })
      ]);
      if (requestId !== this.loadRequestId || requestedDate !== this.data.selectedDate) return;
      this.allCourses = allCourses;
      this.doneIds = logRes.map(l => l.courseId + l.date);
      console.log('[课表] 拉到课程数:', allCourses.length, '今天选中日期:', this.data.selectedDate);
      this.filterDay();
    } catch (e) {
      if (requestId !== this.loadRequestId || requestedDate !== this.data.selectedDate) return;
      console.error('加载失败', e);
      this.allCourses = this.allCourses || [];
      this.doneIds = this.doneIds || [];
      this.setData({ loading: false, loadError: true, focus: null, courses: [] });
      // 失败要报出来，不要沉默地显示空页面
      wx.showModal({
        title: '课表加载失败',
        content: String((e && (e.errMsg || e.message)) || e).slice(0, 200),
        showCancel: false
      });
    }
  },

  filterDay() {
    const weekday = this.data.selectedWeekday;
    const dateStr = this.data.selectedDate;
    const list = (this.allCourses || [])
      // 周重复课程按星期匹配；一次性课程按具体日期匹配
      .filter(c => c.date ? c.date === dateStr : c.weekday === weekday)
      .sort((a, b) => util.timeToMinutes(a.startTime) - util.timeToMinutes(b.startTime))
      .map(c => ({
        ...c,
        color: util.getSubjectColor(c.subject),
        done: (this.doneIds || []).includes(c._id + dateStr)
      }));
    const sel = this.data.weekDates.find(w => w.full === this.data.selectedDate);
    const isToday = sel && sel.isToday;
    this.setData({
      courses: list,
      ...summarizeDay(list, dateStr),
      displayMonth: dateStr.slice(5, 7), displayDay: dateStr.slice(8, 10),
      loading: false,
      totalInDb: (this.allCourses || []).length,
      dateTitle: isToday ? '今天' : `周${WEEK_LABELS[weekday - 1]}`
    });
  },

  onDateTap(e) {
    const full = e.currentTarget.dataset.full;
    this.setData({ selectedDate: full, selectedWeekday: this.weekdayOf(full) });
    this.loadData();
  },

  shiftWeek(offset) {
    const date = new Date(this.data.selectedDate + 'T00:00:00');
    date.setDate(date.getDate() + offset * 7);
    this.setData({ weekOffset: this.data.weekOffset + offset, selectedDate: util.formatDate(date) });
    this.buildWeek();
    this.loadData();
  },
  prevWeek() { this.shiftWeek(-1); },
  nextWeek() { this.shiftWeek(1); },
  retryLoad() { this.loadData(); },

  backToday() {
    const todayStr = util.formatDate(new Date());
    this.setData({ weekOffset: 0, selectedDate: todayStr });
    this.buildWeek();
    this.loadData();
  },

  onTouchStart(e) {
    this.touchX = e.touches[0].clientX;
  },

  onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - this.touchX;
    if (dx > 60) this.prevWeek();
    else if (dx < -60) this.nextWeek();
  },

  // 打卡 / 取消打卡
  async onCheckin(e) {
    const course = e.currentTarget.dataset.course;
    const db = wx.cloud.database();
    const key = course._id + this.data.selectedDate;
    if (course.done) {
      try {
        const res = await db.collection('logs')
          .where({ courseId: course._id, date: this.data.selectedDate })
          .get();
        for (const item of res.data) {
          await db.collection('logs').doc(item._id).remove();
        }
        this.doneIds = this.doneIds.filter(k => k !== key);
        this.filterDay();
      } catch (err) {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
      return;
    }
    try {
      await db.collection('logs').add({
        data: {
          courseId: course._id,
          courseName: course.name,
          subject: course.subject,
          date: this.data.selectedDate,
          hours: util.courseHours(course.startTime, course.endTime),
          createdAt: new Date()
        }
      });
      this.doneIds = [...this.doneIds, key];
      this.filterDay();
      wx.showToast({ title: '打卡成功 🎉', icon: 'none' });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '打卡失败', icon: 'none' });
    }
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/course-add/course-add' });
  },

  goImport() {
    wx.navigateTo({ url: '/pages/course-import/course-import' });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/course-detail/course-detail?id=' + id });
  }
});
