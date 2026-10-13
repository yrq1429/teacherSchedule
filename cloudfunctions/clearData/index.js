// clearData 云函数：清空当前用户的课程、反馈、打卡记录（云端批量删除）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 分批删除某集合中当前用户的全部记录（含历史遗留的无 _openid 记录）
async function clearCollection(name, openid) {
  let total = 0;
  while (true) {
    const res = await db.collection(name)
      .where(_.or([
        { _openid: openid },
        { _openid: _.exists(false) }
      ]))
      .limit(100)
      .get();
    if (res.data.length === 0) break;
    await db.collection(name)
      .where({ _id: _.in(res.data.map(d => d._id)) })
      .remove();
    total += res.data.length;
  }
  return total;
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const [courses, feedbacks, logs] = await Promise.all([
    clearCollection('courses', OPENID),
    clearCollection('feedbacks', OPENID),
    clearCollection('logs', OPENID)
  ]);
  return { courses, feedbacks, logs };
};
