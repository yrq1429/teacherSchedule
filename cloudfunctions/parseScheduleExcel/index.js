// parseScheduleExcel 云函数：解析排课 Excel，自动兼容两类格式
// 格式A（机构总表）：列头 周一~周日，格子含多位老师，按姓名筛选；无日期 → 周重复课程
// 格式B（个人分周课表）：多 sheet（每周一个），列头 星期X，其下一行是具体日期，
//   A 列是每行时间段，所有格子都是本人的课 → 按日期的一次性课程
// 依赖 exceljs，部署时选「云端安装依赖」
// 调用：{ fileID, keyword, defaultSubject }
const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const SUBJECTS = ['英语', '物理', '数学', '语文', '化学', '生物', '历史', '地理', '政治', '美术', '音乐', '体育'];
const WEEK_WORDS = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
const NOTE_WORDS = ['上班', '下班', '值班', '备注', '教材', '进度'];

function pad(n) { return String(n).padStart(2, '0'); }

function to24h(prefix, h) {
  h = Number(h);
  if ((prefix === '下午' || prefix === '晚上' || prefix === '晚') && h < 12) return h + 12;
  // 无前缀但小时在 1-6 点：培训场景不可能是凌晨课，判定为下午/晚上
  if (!prefix && h >= 1 && h < 7) return h + 12;
  return h;
}

// 从文本提取时间段，支持 上午/下午/晚上 前缀
function timeInText(text) {
  const m = String(text).match(/(上午|下午|晚上|中午|晚)?\s*(\d{1,2})[:：.](\d{2})\s*[-–—~到至]\s*(上午|下午|晚上|中午|晚)?\s*(\d{1,2})[:：.](\d{2})/);
  if (!m) return null;
  const sh = to24h(m[1], m[2]);
  const eh = to24h(m[4] || m[1], m[5]);
  const start = `${pad(sh)}:${m[3]}`;
  const end = `${pad(eh)}:${m[6]}`;
  if (start >= end) return null;
  return { start, end };
}

// 解析日期单元格：'9月4号' / '9.11' / Excel 序列号(如 46289) / Date 对象
function parseDateCell(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && v > 40000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (v instanceof Date) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  const s = String(v).trim();
  const year = new Date().getFullYear();
  let m = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]?/);
  if (m) return `${year}-${pad(m[1])}-${pad(m[2])}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})$/);
  if (m) return `${year}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}

function inferSubject(name, fallback) {
  if (/雅思|托福|英语|词汇|听力|阅读|写作|口语|PET|DSE|IG/i.test(name)) return '英语';
  for (const s of SUBJECTS) {
    if (name.includes(s)) return s;
  }
  return fallback || '其他';
}

// 清洗课程名：去掉老师称呼、时间、尾部空括号，学员分隔统一为「、」
function cleanName(text, keywords) {
  let name = String(text);
  keywords.forEach(k => { name = name.split(k).join(''); });
  const isDaike = /代课/.test(name);
  name = name.replace(/代课/g, '');
  name = name.replace(/(上午|下午|晚上|中午|晚)?\s*\d{1,2}[:：.]\d{2}\s*[-–—~到至]\s*(上午|下午|晚上|中午|晚)?\s*\d{1,2}[:：.]\d{2}/g, '');
  name = name.replace(/\d{1,2}[:：]\d{2}/g, '');
  name = name.replace(/（\s*）|\(\s*\)/g, '');
  name = name.replace(/[，,;；]/g, '、').replace(/\s+/g, ' ').trim();
  if (name.length > 20) name = name.slice(0, 20);
  if (isDaike) name += '（代课）';
  return name || '未命名课程';
}

function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.richText) return v.richText.map(r => r.text).join('');
  return String(v).trim();
}

// 从前几行文本中提取周起始日期（如标题 '2026星东辰秋季课表2026.10.12-10.18'）
function extractWeekStart(ws) {
  for (let r = 1; r <= Math.min(3, ws.rowCount); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = cellText(row.getCell(c));
      if (!v) continue;
      // 2026.10.12-10.18 / 2026年10月12日-10月18日 / 10.12-10.18
      let m = v.match(/(\d{4})[.年](\d{1,2})[.月](\d{1,2})\s*[日号]?\s*[-~到至]\s*(\d{1,2})[.月](\d{1,2})/);
      if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      }
      m = v.match(/(?<![\d.])(\d{1,2})[.月](\d{1,2})\s*[日号]?\s*[-~到至]\s*(\d{1,2})[.月](\d{1,2})(?![\d.])/);
      if (m) {
        return new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]));
      }
    }
  }
  return null;
}

// 解析单个 sheet。forceMode: 'keyword' | 'personal' | ''(自动)
function parseSheet(ws, keywords, defaultSubject, forceMode) {
  // 1. 找星期表头行
  let colWeekday = {};
  let headerRow = 0;
  ws.eachRow((row, rowNum) => {
    row.eachCell((cell, colNum) => {
      const v = cellText(cell).replace(/\s/g, '');
      const m = v.match(/^(周|星期)([一二三四五六日天])$/);
      if (m) {
        colWeekday[colNum] = WEEK_WORDS[m[2]];
        headerRow = Math.max(headerRow, rowNum);
      }
    });
  });
  if (Object.keys(colWeekday).length === 0) return { courses: [], keywordMode: false };

  const weekdayCols = Object.keys(colWeekday).map(Number);
  const firstCol = Math.min(...weekdayCols);

  // 2. 表头下一行可能是日期行，建立 列 -> 日期 映射
  const colDate = {};
  const dateRow = ws.getRow(headerRow + 1);
  weekdayCols.forEach(c => {
    const d = parseDateCell(dateRow.getCell(c).value);
    if (d) colDate[c] = d;
  });
  let hasDates = Object.keys(colDate).length > 0;

  // 2b. 没有日期行时，尝试从标题提取周起始日期（机构总表标题常含 2026.10.12-10.18）
  if (!hasDates) {
    const weekStart = extractWeekStart(ws);
    if (weekStart) {
      weekdayCols.forEach(c => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + (colWeekday[c] - 1)); // 周一为起始日
        colDate[c] = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      });
      hasDates = true;
    }
  }
  const dataStartRow = headerRow + (Object.keys(colDate).length > 0 && ws.getRow(headerRow + 1) && weekdayCols.some(c => parseDateCell(dateRow.getCell(c).value)) ? 2 : 1);

  // 3. 收集候选格子
  const candidates = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum < dataStartRow) return;
    row.eachCell((cell, colNum) => {
      const wd = colWeekday[colNum];
      if (!wd) return;
      const text = cellText(cell);
      if (!text || text.length < 2) return;
      if (NOTE_WORDS.some(w => text.includes(w))) return;
      candidates.push({ rowNum, wd, text, date: colDate[colNum] || null });
    });
  });

  // 4. 模式：用户显式指定优先；否则有格子命中姓名 → 机构总表模式，无命中 → 个人课表全收
  let keywordMode;
  if (forceMode === 'keyword') keywordMode = true;
  else if (forceMode === 'personal') keywordMode = false;
  else {
    keywordMode = keywords.length > 0 &&
      candidates.some(c => keywords.some(k => c.text.includes(k)));
  }
  const picked = keywordMode
    ? candidates.filter(c => keywords.some(k => c.text.includes(k)))
    : candidates;

  // 5. 时间：格子内显式 > 同行左侧时间标签 > 上方时间块
  // 注意：左侧标签可能是「周末时间/平日时间」双时段（且常因合并单元格每行都有），
  // 要按平日/周末选对应那段，不能直接取第一个
  function pickRanges(v, isWeekend) {
    const parts = [];
    const re = /(\d{1,2})[:：](\d{2})\s*[-–—]\s*(\d{1,2})[:：](\d{2})/g;
    let m;
    while ((m = re.exec(v)) !== null) {
      parts.push({ start: `${pad(m[1])}:${m[2]}`, end: `${pad(m[3])}:${m[4]}` });
    }
    if (parts.length === 0) return null;
    return isWeekend ? parts[0] : (parts[1] || parts[0]);
  }

  function rowTime(rowNum, isWeekend) {
    const row = ws.getRow(rowNum);
    for (let c = 1; c < firstCol; c++) {
      const v = cellText(row.getCell(c));
      if (!v || !/\d{1,2}[:：]\d{2}\s*[-–—]/.test(v)) continue;
      const t = pickRanges(v, isWeekend);
      if (t) return t;
    }
    return null;
  }

  function blockTime(rowNum, isWeekend) {
    for (let r = rowNum; r >= 1; r--) {
      const row = ws.getRow(r);
      for (let c = 1; c < firstCol; c++) {
        const v = cellText(row.getCell(c));
        if (v && /\d{1,2}[:：]\d{2}\s*[-–—]/.test(v)) {
          const t = pickRanges(v, isWeekend);
          if (t) return t;
        }
      }
    }
    return null;
  }

  const courses = [];
  const seen = new Set();
  for (const c of picked) {
    const t = timeInText(c.text) || rowTime(c.rowNum, c.wd >= 6) || blockTime(c.rowNum, c.wd >= 6);
    if (!t) continue;
    const name = cleanName(c.text, keywordMode ? keywords : []);
    const key = `${c.date || 'w' + c.wd}-${t.start}-${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const course = {
      name,
      subject: inferSubject(name, defaultSubject),
      weekday: c.wd,
      startTime: t.start,
      endTime: t.end,
      location: ''
    };
    if (c.date) course.date = c.date; // 有日期 = 一次性课程
    courses.push(course);
  }
  return { courses, keywordMode };
}

exports.main = async (event) => {
  if (!event.fileID) return { courses: [], error: 'NO_FILE' };
  const keywords = (event.keyword || '').split(/[,，、\s]+/).filter(Boolean);
  keywords.sort((a, b) => b.length - a.length);
  const defaultSubject = event.defaultSubject || '';
  const forceMode = event.format || ''; // 'keyword' | 'personal' | ''

  const file = await cloud.downloadFile({ fileID: event.fileID });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.fileContent);

  // 遍历所有 sheet（个人课表常按周分 sheet）
  let all = [];
  let anyKeywordMode = false;
  for (const ws of wb.worksheets) {
    const r = parseSheet(ws, keywords, defaultSubject, forceMode);
    all = all.concat(r.courses);
    if (r.keywordMode) anyKeywordMode = true;
  }

  if (all.length === 0) {
    return { courses: [], error: 'NO_COURSES', message: '没解析出课程，确认表头是星期格式' };
  }

  all.sort((a, b) =>
    (a.date || '9999').localeCompare(b.date || '9999') ||
    a.weekday - b.weekday ||
    a.startTime.localeCompare(b.startTime)
  );
  return {
    courses: all,
    count: all.length,
    mode: anyKeywordMode ? 'keyword' : 'personal',
    dated: all.filter(c => c.date).length
  };
};
