const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeDay } = require('../miniprogram/utils/agenda');
const courses = [{_id:'a',startTime:'09:00',endTime:'10:00',done:false},{_id:'b',startTime:'14:00',endTime:'15:30',done:false}];
test('today skips elapsed course and selects upcoming one',()=>{
 const s=summarizeDay(courses,'2026-10-13',new Date(2026,9,13,12));
 assert.equal(s.focus._id,'b'); assert.equal(s.focusLabel,'下一节课'); assert.equal(s.plannedHours,2.5);
});
test('ongoing lesson has priority and completed lesson is excluded',()=>{
 assert.equal(summarizeDay(courses,'2026-10-13',new Date(2026,9,13,9,30)).focusLabel,'正在进行');
 const s=summarizeDay(courses.map(c=>({...c,done:true})),'2026-10-13',new Date(2026,9,13,9,30));
 assert.equal(s.focus,null); assert.equal(s.progress,100); assert.equal(s.doneCount,2);
});
test('historical dates have no next lesson; future dates start with first lesson',()=>{
 assert.equal(summarizeDay(courses,'2026-10-12',new Date(2026,9,13)).focus,null);
 assert.equal(summarizeDay(courses,'2026-10-14',new Date(2026,9,13)).focus._id,'a');
});
test('empty day never produces invalid progress',()=>{
 const s=summarizeDay([],'2026-10-13',new Date(2026,9,13));
 assert.equal(s.progress,0);assert.equal(s.focus,null);assert.equal(s.plannedHours,0);
});
