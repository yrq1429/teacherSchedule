// scheduleRemind 云函数：每晚 23:00 定时触发，扫描次日课表并推送订阅消息
// 无课日不推送、不扣额度
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// TODO: 替换为小程序后台申请到的订阅消息模板 ID
const TEMPLATE_ID = '3MZ_rIS0Tw_2cOudkIO7x1zlvBesdEpD47f6rfnR7_A';

// 明天星期几：1=周一 ... 7=周日；以及明天的日期串
function tomorrow() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const day = d.getDay();
  const weekday = day === 0 ? 7 : day;
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { weekday, date };
}

exports.main = async () => {
  const { weekday, date } = tomorrow();

  // 查出所有有推送额度的用户
  const subs = await db.collection('remind_subs')
    .where({ quota: db.command.gt(0) })
    .limit(100)
    .get();

  let sent = 0;
  for (const sub of subs.data) {
    // 拉该用户全部课程，本地过滤：周重复按星期匹配，一次性按日期匹配
    const res = await db.collection('courses')
      .where({ _openid: sub._openid })
      .limit(200)
      .get()
      .catch(() => ({ data: [] }));

    const mine = res.data
      .filter(c => c.date ? c.date === date : c.weekday === weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (mine.length === 0) continue; // 无课：跳过，不扣额度

    const first = mine[0];
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: sub._openid,
        templateId: TEMPLATE_ID,
        page: 'pages/schedule/schedule',
        data: {
          // 字段名需与模板一致，以下为常见「上课提醒」模板字段，按实际模板调整
          thing1: { value: first.name.slice(0, 20) },
          time2: { value: `${first.startTime}` },
          thing3: { value: `明天共 ${mine.length} 节课`.slice(0, 20) }
        }
      });
      // 推送成功，扣一次额度
      await db.collection('remind_subs').doc(sub._id).update({
        data: { quota: db.command.inc(-1) }
      });
      sent++;
    } catch (e) {
      // 用户拒收或模板错误，记录日志，额度清零避免反复失败
      console.error('推送失败', sub._openid, e);
      if (e.errCode === 43101) {
        await db.collection('remind_subs').doc(sub._id).update({ data: { quota: 0 } });
      }
    }
  }

  return { weekday, date, sent };
};
