// 文本批量导入课表：粘贴一段文字，本地解析出课程列表，预览后一键入库
const SUBJECTS = ['英语', '物理', '数学', '语文', '化学', '生物', '历史', '地理', '政治', '美术', '音乐', '体育'];
const WEEKDAY_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };

function pad(n) {
  return String(n).padStart(2, '0');
}

// 解析单行，成功返回课程对象，失败返回 null
function parseLine(line) {
  const text = line.trim();
  if (!text) return null;

  // 星期
  const wm = text.match(/(周|星期|礼拜)([一二三四五六日天])/);
  if (!wm) return null;
  const weekday = WEEKDAY_MAP[wm[2]];

  // 时间段 09:00-10:30 / 9点-10点半 暂只支持冒号格式
  const tm = text.match(/(\d{1,2})[:：.](\d{2})\s*[-~—–到至]\s*(\d{1,2})[:：.](\d{2})/);
  if (!tm) return null;
  const startTime = pad(tm[1]) + ':' + tm[2];
  const endTime = pad(tm[3]) + ':' + tm[4];
  if (startTime >= endTime) return null;

  // 科目
  let subject = '其他';
  for (const s of SUBJECTS) {
    if (text.includes(s)) { subject = s; break; }
  }

  // 课程名：去掉已识别的部分，剩下的作为名称
  let name = text
    .replace(wm[0], '')
    .replace(tm[0], '')
    .replace(/[，,;；、\s]+/g, ' ')
    .trim();
  if (name.length > 20) name = name.slice(0, 20);
  if (!name) name = subject + '课';

  // 地点：X教室 / X校区 / A101
  let location = '';
  const lm = text.match(/([^\s，,;；]{1,8}(教室|校区|室)|[A-Za-z]-?\d{3})/);
  if (lm) location = lm[0];

  return { name, subject, weekday, startTime, endTime, location };
}

Page({
  data: {
    rawText: '',
    parsed: [],
    failed: 0,
    importing: false,
    keyword: '付老师,小付',
    formats: ['机构总表（按名字筛出我的课）', '个人课表（整表都是我的课）'],
    formatKeys: ['keyword', 'personal'],
    formatIndex: 0,
    subjects: ['英语', '物理'],
    subjectIndex: 0,
    example: '周一 09:00-10:30 初二英语提高班 3号教室\n周三 14:00-15:30 物理一对一\n周五 16:00-17:30 英语口语 2号教室'
  },

  onInput(e) {
    this.setData({ rawText: e.detail.value });
  },

  fillExample() {
    this.setData({ rawText: this.data.example });
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onFormatChange(e) {
    this.setData({ formatIndex: Number(e.detail.value) });
  },

  onSubjectChange(e) {
    this.setData({ subjectIndex: Number(e.detail.value) });
  },

  // 从微信聊天文件导入 Excel 课表
  onChooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx'],
      success: async res => {
        const file = res.tempFiles[0];
        wx.showLoading({ title: '解析课表中…', mask: true });
        try {
          const cloudPath = `schedule-excel/${Date.now()}.xlsx`;
          const up = await wx.cloud.uploadFile({ cloudPath, filePath: file.path });
          const r = await wx.cloud.callFunction({
            name: 'parseScheduleExcel',
            data: {
              fileID: up.fileID,
              keyword: this.data.keyword,
              format: this.data.formatKeys[this.data.formatIndex],
              defaultSubject: this.data.subjects[this.data.subjectIndex]
            }
          });
          wx.hideLoading();
          const result = r.result || {};
          if (result.error) {
            wx.showModal({
              title: '解析失败',
              content: result.message || '文件格式不支持（仅支持 .xlsx）',
              showCancel: false
            });
            return;
          }
          if (!result.courses || result.courses.length === 0) {
            wx.showToast({ title: '没找到你的课，检查名字筛选', icon: 'none' });
            return;
          }
          this.setData({
            parsed: [...this.data.parsed, ...result.courses],
            failed: 0
          });
          wx.showToast({ title: `找到 ${result.courses.length} 门课`, icon: 'success' });
        } catch (e) {
          wx.hideLoading();
          console.error(e);
          wx.showToast({ title: '解析失败，请先部署 parseScheduleExcel', icon: 'none' });
        }
      }
    });
  },

  // 拍照/相册识别课表
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async res => {
        const tempPath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '识别中…', mask: true });
        try {
          // 上传云存储
          const cloudPath = `schedule-images/${Date.now()}.jpg`;
          const up = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
          // 调云函数识别
          const r = await wx.cloud.callFunction({
            name: 'parseScheduleImage',
            data: { fileID: up.fileID }
          });
          wx.hideLoading();
          const result = r.result || {};
          if (result.error === 'NO_KEY') {
            wx.showModal({
              title: '还没配置识别模型',
              content: '图片识别需要免费的 GLM_API_KEY，去 open.bigmodel.cn 注册拿到后，在云函数 parseScheduleImage 的环境变量里配置即可',
              showCancel: false
            });
            return;
          }
          if (!result.courses || result.courses.length === 0) {
            wx.showToast({ title: '没识别出课程，换张更清晰的图', icon: 'none' });
            return;
          }
          this.setData({
            parsed: [...this.data.parsed, ...result.courses],
            failed: 0
          });
          wx.showToast({ title: `识别出 ${result.courses.length} 门课`, icon: 'success' });
        } catch (e) {
          wx.hideLoading();
          console.error(e);
          wx.showToast({ title: '识别失败，请先部署 parseScheduleImage', icon: 'none' });
        }
      }
    });
  },

  onParse() {
    const lines = this.data.rawText.split('\n');
    const parsed = [];
    let failed = 0;
    lines.forEach(line => {
      if (!line.trim()) return;
      const course = parseLine(line);
      if (course) parsed.push(course);
      else failed++;
    });
    if (parsed.length === 0) {
      wx.showToast({ title: '没识别出课程，参照示例格式', icon: 'none' });
      return;
    }
    this.setData({ parsed, failed });
  },

  onRemoveRow(e) {
    const idx = e.currentTarget.dataset.idx;
    const parsed = this.data.parsed.filter((_, i) => i !== idx);
    this.setData({ parsed });
  },

  async onImport() {
    const list = this.data.parsed;
    if (list.length === 0) return;
    this.setData({ importing: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'importCourses',
        data: { courses: list }
      });
      const r = res.result || {};
      console.log('[导入] 结果:', JSON.stringify(r));
      wx.showModal({
        title: '导入完成',
        content: `新增 ${r.inserted || 0} 门${r.skipped ? '，跳过重复 ' + r.skipped + ' 门' : ''}${r.failed ? '，失败 ' + r.failed + ' 门' : ''}。去课表页翻到对应日期查看。`,
        showCancel: false,
        success: () => wx.navigateBack()
      });
    } catch (e) {
      console.error('导入失败', e);
      wx.showToast({ title: '导入失败，请先部署 importCourses', icon: 'none' });
    }
    this.setData({ importing: false });
  },

  // 清空全部课程（含其反馈和打卡记录），云端批量删除
  async onClearAll() {
    wx.showModal({
      title: '清空全部课程',
      content: '将删除所有课程及其反馈、打卡记录，不可恢复。确定要清空后重新导入吗？',
      confirmColor: '#E85D26',
      confirmText: '全部删除',
      success: async r => {
        if (!r.confirm) return;
        wx.showLoading({ title: '清空中…', mask: true });
        try {
          const res = await wx.cloud.callFunction({ name: 'clearData' });
          wx.hideLoading();
          this.setData({ parsed: [] });
          const r2 = res.result || {};
          wx.showToast({ title: `已清空 ${r2.courses || 0} 门课`, icon: 'success' });
        } catch (e) {
          wx.hideLoading();
          console.error(e);
          wx.showToast({ title: '清空失败，请先部署 clearData 云函数', icon: 'none' });
        }
      }
    });
  }
});
