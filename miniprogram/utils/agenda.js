const { formatDate, timeToMinutes } = require('./util');
function summarizeDay(courses, date, now = new Date()) {
  const today = formatDate(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const doneCount = courses.filter(c => c.done).length;
  const focus = date < today ? null : courses.find(c => !c.done &&
    (date > today || timeToMinutes(c.endTime) > minute)) || null;
  const ongoing = focus && date === today && timeToMinutes(focus.startTime) <= minute;
  const minutes = courses.reduce((sum,c) => sum + Math.max(0,timeToMinutes(c.endTime)-timeToMinutes(c.startTime)),0);
  return { doneCount, plannedHours: Math.round(minutes / 60 * 10) / 10,
    progress: courses.length ? Math.round(doneCount / courses.length * 100) : 0,
    focus, focusLabel: ongoing ? '正在进行' : date > today ? '首节安排' : '下一节课' };
}
module.exports = { summarizeDay };
