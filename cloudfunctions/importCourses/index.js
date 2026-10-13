// importCourses 云函数：批量导入课程（云端写入，比前端逐条快几十倍）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const list = event.courses || [];
  if (list.length === 0) return { inserted: 0, skipped: 0 };

  // 云函数端 add 不会自动带 _openid，必须手动写入，否则客户端按权限读不到
  const { OPENID } = cloud.getWXContext();

  // 拉取已有课程做去重（key = 日期或星期 + 开始时间 + 课名）
  const keyOf = c => `${c.date || 'w' + c.weekday}|${c.startTime}|${c.name}`;
  const existing = new Set();
  let skip = 0;
  while (true) {
    const res = await db.collection('courses')
      .where({ _openid: OPENID })
      .skip(skip)
      .limit(100)
      .get();
    res.data.forEach(c => existing.add(keyOf(c)));
    if (res.data.length < 100) break;
    skip += 100;
  }

  const fresh = [];
  const seen = new Set();
  for (const c of list) {
    const k = keyOf(c);
    if (existing.has(k) || seen.has(k)) continue;
    seen.add(k);
    fresh.push(c);
  }

  const tasks = fresh.map(c => db.collection('courses').add({
    data: {
      _openid: OPENID,
      name: c.name,
      subject: c.subject || '其他',
      weekday: c.weekday,
      startTime: c.startTime,
      endTime: c.endTime,
      location: c.location || '',
      date: c.date || null,
      createdAt: db.serverDate()
    }
  }).catch(e => {
    console.error('插入失败', c.name, e);
    return null;
  }));

  const results = await Promise.all(tasks);
  const inserted = results.filter(r => r !== null).length;
  return { inserted, failed: fresh.length - inserted, skipped: list.length - fresh.length };
};
