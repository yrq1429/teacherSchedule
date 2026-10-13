// parseScheduleImage 云函数：视觉模型识别课表图片
// 图片识别优先 Kimi，未识别时尝试已配置的 GLM；凭证仅从环境变量读取
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const KIMI_KEY = process.env.KIMI_API_KEY || '';

const PROMPT = `这是一张课程表图片。请提取所有课程，只输出 JSON 数组，不要任何其他文字。
每项格式：{"name":"课程名","subject":"科目","weekday":星期数字(周一=1到周日=7),"startTime":"HH:MM","endTime":"HH:MM","location":"地点"}
subject 只能从 英语/物理/数学/语文/化学/生物/历史/地理/政治/美术/音乐/体育/其他 中选。
没有地点则 location 为空字符串。时间用 24 小时制补零。`;

function callVision({ host, path, apiKey, model, imageUrl }) {
  const body = JSON.stringify({
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: PROMPT }
      ]
    }],
    max_tokens: 2000,
    temperature: 0.1
  });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: host,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 60000
    }, resp => {
      let data = '';
      resp.on('data', c => { data += c; });
      resp.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json.choices && json.choices[0] && json.choices[0].message
            ? json.choices[0].message.content : '';
          const m = text.match(/\[[\s\S]*\]/);
          resolve(m ? JSON.parse(m[0]) : []);
        } catch (e) {
          console.error('解析视觉模型回复失败', e);
          resolve([]);
        }
      });
    });
    req.on('error', e => { console.error(e); resolve([]); });
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(body);
    req.end();
  });
}

exports.main = async (event) => {
  const kimiKey = KIMI_KEY;
  const glmKey = process.env.GLM_API_KEY;
  if (!kimiKey && !glmKey) {
    return { courses: [], error: 'NO_KEY', message: '未配置视觉模型 key' };
  }
  if (!event.fileID) {
    return { courses: [], error: 'NO_FILE', message: '缺少图片' };
  }

  const file = await cloud.downloadFile({ fileID: event.fileID });
  const base64 = file.fileContent.toString('base64');
  const mime = event.fileID.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const imageUrl = `data:${mime};base64,${base64}`;

  let raw = [];
  if (kimiKey) {
    raw = await callVision({
      host: 'api.kimi.com',
      path: '/coding/v1/chat/completions',
      apiKey: kimiKey,
      model: 'k3',
      imageUrl
    });
  }
  if (raw.length === 0 && glmKey) {
    raw = await callVision({
      host: 'open.bigmodel.cn',
      path: '/api/paas/v4/chat/completions',
      apiKey: glmKey,
      model: 'glm-4v-flash',
      imageUrl
    });
  }

  // 清洗校验
  const courses = (raw || []).filter(c =>
    c && c.name && c.weekday >= 1 && c.weekday <= 7 &&
    /^\d{2}:\d{2}$/.test(c.startTime || '') && /^\d{2}:\d{2}$/.test(c.endTime || '') &&
    c.startTime < c.endTime
  ).map(c => ({
    name: String(c.name).slice(0, 20),
    subject: c.subject || '其他',
    weekday: c.weekday,
    startTime: c.startTime,
    endTime: c.endTime,
    location: (c.location || '').slice(0, 20)
  }));

  return { courses, count: courses.length };
};
