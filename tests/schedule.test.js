const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function page() {
 let config;
 vm.runInNewContext(fs.readFileSync('miniprogram/pages/schedule/schedule.js','utf8'),{
  require: p=>require('../miniprogram/utils/'+(p.includes('agenda')?'agenda':'util')),
  Page:p=>config=p,console,setInterval,clearInterval
 });
 config.data={...config.data,selectedDate:'2026-10-13'};
 config.setData=function(update){Object.assign(this.data,update);};
 return config;
}
test('week navigation moves selected date and reloads checkins',()=>{
 const p=page();let loads=0;p.loadData=()=>loads++;
 p.nextWeek();assert.equal(p.data.selectedDate,'2026-10-20');assert.equal(p.data.weekOffset,1);
 p.prevWeek();assert.equal(p.data.selectedDate,'2026-10-13');assert.equal(loads,2);
});
test('date matching keeps weekly and dated courses separate, preserving checkins',()=>{
 const p=page();p.data.selectedWeekday=2;
 p.allCourses=[{_id:'weekly',weekday:2,startTime:'10:00',endTime:'11:00',subject:'英语'},
 {_id:'dated',date:'2026-10-13',weekday:1,startTime:'09:00',endTime:'10:30',subject:'物理'},
 {_id:'other',date:'2026-10-14',weekday:2,startTime:'08:00',endTime:'09:00'}];
 p.doneIds=['dated2026-10-13'];p.filterDay();
 assert.deepEqual(Array.from(p.data.courses,c=>c._id),['dated','weekly']);
 assert.equal(p.data.doneCount,1);assert.equal(p.data.plannedHours,2.5);assert.equal(p.data.progress,50);
});
