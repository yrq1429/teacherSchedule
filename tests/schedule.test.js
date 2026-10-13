const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function page(fetchAll) {
 let config;
 vm.runInNewContext(fs.readFileSync('miniprogram/pages/schedule/schedule.js','utf8'),{
  require: p=>p.includes('agenda') ? require('../miniprogram/utils/agenda') : {...require('../miniprogram/utils/util'), ...(fetchAll ? {fetchAll} : {})},
  wx: { cloud: {database:()=>({})}, showModal:()=>{} },
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

test('selected date is visible immediately while loading hides old focus', async()=>{
 const p=page(()=>Promise.resolve([]));p.data.selectedDate='2026-11-02';p.data.focus={_id:'old'};
 const request=p.loadData();
 assert.equal(p.data.loading,true);assert.equal(p.data.displayMonth,'11');assert.equal(p.data.displayDay,'02');assert.equal(p.data.focus,null);
 await request;assert.equal(p.data.loading,false);
});
test('rapid A-B-A navigation never accepts the older A response', async()=>{
 const waiting=[];const p=page(()=>new Promise(resolve=>waiting.push(resolve)));
 const first=p.loadData();p.data.selectedDate='2026-10-14';const middle=p.loadData();
 p.data.selectedDate='2026-10-13';const latest=p.loadData();
 waiting[4]([{_id:'new',date:'2026-10-13',startTime:'14:00',endTime:'15:00'}]);waiting[5]([]);await latest;
 waiting[0]([{_id:'stale',date:'2026-10-13',startTime:'09:00',endTime:'10:00'}]);waiting[1]([]);await first;
 waiting[2]([]);waiting[3]([]);await middle;
 assert.equal(p.data.courses[0]._id,'new');assert.equal(p.data.loading,false);
});
