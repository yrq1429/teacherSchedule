// polishFeedback 云函数：按教师角色保守润色课后反馈
// 优先使用选中模型，失败尝试其他已配置渠道；全部失败返回原文
// 保守策略：只修错别字、标点和语气，不改原意
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const KIMI_KEY = process.env.KIMI_API_KEY || '';

// 模型渠道配置：key 为空时该渠道不可用
const PROVIDERS = {
  kimi: {
    name: 'Kimi',
    host: 'api.kimi.com',
    path: '/coding/v1/chat/completions',
    model: 'k3',
    getKey: () => KIMI_KEY
  },
  doubao: {
    name: '豆包',
    host: 'ark.cn-beijing.volces.com',
    path: '/api/v3/chat/completions',
    model: process.env.DOUBAO_MODEL || 'ep-20261013133443-8p8p5',
    getKey: () => process.env.DOUBAO_API_KEY || ''
  }
};

const ROLE_STYLE = {
  '英语教师': '请用英语教师的专业口吻，关注语言知识点掌握、听说读写表现与课堂参与度',
  '物理教师': '请用物理教师的专业口吻，关注概念理解、实验操作与解题思路',
  '数学教师': '请用数学教师的专业口吻，关注逻辑推导、计算准确率与思维习惯',
  '语文教师': '请用语文教师的专业口吻，关注阅读理解、写作表达与积累运用',
  '通用教师': '请用教师的专业口吻，关注课堂表现与知识掌握情况'
};

function buildSystemPrompt(role) {
  const style = ROLE_STYLE[role] || ROLE_STYLE['通用教师'];
  return `${style}。你在把老师随手写的课后反馈，润色成可直接发给家长的正式版本。要求：
1. **结构原样保留**：原文的段落、换行、编号、小标题、emoji 分区全部保留，绝不允许合并成一大段；
2. **零语病**：逐句检查语法，主谓搭配、指代、逻辑关系必须通顺正确；错别字和标点全部修正（中文语境用中文标点）；
3. **家长视角的专业表达**：面向家长沟通，语言正式、得体、有温度；使用规范的教学术语（如「题型预判」「精听跟读」「场景词汇积累」），避免口语和网络用语；句子完整清晰，一句话只说一件事；
4. **事实不动**：不得新增原文没有的事实、知识点、作业内容、评价或数据；不得改变评价倾向；学生表现的好坏程度不得夸大或缩小；
5. 直接输出润色后的全文，不要任何解释或前后缀。`;
}

// 通用 OpenAI 兼容接口调用，失败时返回 { error } 便于排查
function callLLM({ host, path, apiKey, model, system, user }) {
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    max_tokens: 800
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
      timeout: 30000
    }, resp => {
      let data = '';
      resp.on('data', c => { data += c; });
      resp.on('end', () => {
        try {
          const json = JSON.parse(data);
          const text = json.choices && json.choices[0] && json.choices[0].message
            ? json.choices[0].message.content.trim() : null;
          if (text) {
            resolve({ text });
          } else {
            console.error(`[${host}] HTTP ${resp.statusCode}:`, data.slice(0, 300));
            resolve({ error: `HTTP ${resp.statusCode}: ${data.slice(0, 150)}` });
          }
        } catch (e) {
          console.error(`[${host}] 解析失败:`, data.slice(0, 300));
          resolve({ error: 'parse_error: ' + data.slice(0, 150) });
        }
      });
    });
    req.on('error', (e) => {
      console.error(`[${host}] 网络错误:`, e.message);
      resolve({ error: 'network: ' + e.message });
    });
    req.on('timeout', () => {
      req.destroy();
      console.error(`[${host}] 超时`);
      resolve({ error: 'timeout' });
    });
    req.write(body);
    req.end();
  });
}

exports.main = async (event) => {
  const { content, role, provider = 'kimi' } = event;
  if (!content || !content.trim()) {
    return { polished: '', error: '内容为空' };
  }
  const system = buildSystemPrompt(role);

  // 选中的渠道优先，失败依次降级到其他已配置渠道
  const order = [provider, ...Object.keys(PROVIDERS).filter(p => p !== provider)];
  const errors = [];
  for (const key of order) {
    const p = PROVIDERS[key];
    const apiKey = p.getKey();
    if (!apiKey) { errors.push(`${p.name}: 无 key`); continue; }
    const r = await callLLM({
      host: p.host,
      path: p.path,
      apiKey,
      model: p.model,
      system,
      user: content
    });
    if (r.text) {
      return { polished: r.text, mode: key, providerName: p.name };
    }
    errors.push(`${p.name}: ${r.error}`);
  }

  // 全部不可用：原样返回，并把失败原因透出去便于排查
  return { polished: content.trim(), mode: 'original', errors };
};
