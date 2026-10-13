// 日期与课表相关的工具函数

// 返回今天星期几：1=周一 ... 7=周日
function todayWeekday(date) {
  const d = date || new Date();
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

// "09:00" -> 分钟数，用于排序和时长计算
function timeToMinutes(t) {
  const parts = (t || '0:0').split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

// 课程时长（小时，保留 1 位小数）
function courseHours(start, end) {
  const mins = timeToMinutes(end) - timeToMinutes(start);
  return Math.round((mins / 60) * 10) / 10;
}

// 格式化日期为 YYYY-MM-DD
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// 科目配色：每门课一个颜色，让课表更活泼
const SUBJECT_COLORS = {
  '英语': '#92744F',
  '物理': '#666B86',
  '数学': '#5B7882',
  '语文': '#9A4960',
  '化学': '#367F70',
  '生物': '#547D34',
  '历史': '#936329',
  '地理': '#357B5E',
  '政治': '#82588D',
  '美术': '#9D633E',
  '音乐': '#A34774',
  '体育': '#447A37',
  '其他': '#666E60'
};

function getSubjectColor(subject) {
  return SUBJECT_COLORS[subject] || SUBJECT_COLORS['其他'];
}

// 分页拉取整个集合（小程序客户端单次 get 上限 20 条，必须循环拉）
async function fetchAll(colName, where) {
  const db = wx.cloud.database();
  const PAGE = 20; // 客户端硬上限，不能超过
  let all = [];
  let skip = 0;
  while (true) {
    let q = db.collection(colName);
    if (where) q = q.where(where);
    const res = await q.skip(skip).limit(PAGE).get();
    all = all.concat(res.data);
    if (res.data.length < PAGE) break;
    skip += PAGE;
  }
  return all;
}

module.exports = {
  todayWeekday,
  timeToMinutes,
  courseHours,
  formatDate,
  getSubjectColor,
  fetchAll
};
