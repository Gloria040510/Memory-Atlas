import { hash } from './importers.js';

const zh = new Intl.Segmenter('zh', { granularity: 'word' });
const stop = new Set(
  'a an the for to of at in with or from on by is it as can and could about that what why would how me you my i are was were which this do does should will be just into your more some have has not but then need know want understand use using explain again please still like also after before we they their them where when here 可以 怎么 如何 为什么 什么 哪些 这些 一个 这个 那个 有些 我们 你们 自己 现在 最近 还有 然后 还是 需要 可能 已经 一直 能不能 能否 以及 分别 一步 帮我 感觉 觉得 比如 不过 没有 就是 主要 是否 哪个 什么样 一下 继续 对话 使用 之后 关于 想要 时候 这样 那样 已完成'.split(
    ' ',
  ),
);
export const colors = [
  '#607455',
  '#ae8255',
  '#758993',
  '#a16e5f',
  '#868262',
  '#537970',
  '#826e8a',
  '#748354',
];

const themes = [
  [
    'science',
    'AI for Science',
    'scientific ai|ai for science|alphafold|protein|材料发现|科学发现|蛋白质|扩散模型|图神经网络|gnn|文献检索',
  ],
  [
    'finance',
    '金融学习',
    'finance|duration|screening|lbo|bond|beta|macaulay|yield|久期|债券|估值|杠杆收购|利率|金融|逆向选择',
  ],
  [
    'career',
    '职业与面试',
    'career|interview|investment banking|private equity|resume|面试|一级投资|求职|职业|简历|投行|申请|实习',
  ],
  [
    'writing',
    '内容创作',
    'xiaohongshu|storytelling|script|video|小红书|分镜|脚本|短视频|选题|写作|开场|叙事',
  ],
  [
    'reflection',
    '个人知识管理',
    'knowledge management|memory atlas|note-taking|journal|复盘|记忆图谱|第二大脑|知识管理|笔记|注意力|遗忘|学习方法',
  ],
  [
    'engineering',
    '工程与工具',
    'typescript|javascript|react|python|docker|indexeddb|d3.js|github|fastapi|database|api|web worker|代码|数据库|浏览器|前端',
  ],
];
const lexicon = [
  ['AlphaFold', 'tool', 'alphafold'],
  ['RLHF', 'concept', 'rlhf|人类反馈强化学习'],
  ['扩散模型', 'concept', 'diffusion models?|扩散模型'],
  ['图神经网络', 'concept', 'graph neural networks?|gnn|图神经网络'],
  ['文献检索', 'concept', 'literature retrieval|文献检索'],
  ['Screening', 'concept', 'screening|筛选模型'],
  ['Macaulay Duration', 'concept', 'macaulay duration|麦考利久期'],
  ['Duration', 'concept', 'duration|久期'],
  ['LBO', 'concept', 'lbo|leveraged buyout|杠杆收购'],
  ['Beta', 'concept', 'beta|贝塔系数'],
  ['CoSO', 'concept', 'coso'],
  ['Agentic Reasoning', 'concept', 'agentic reasoning|智能体推理'],
  ['逆向选择', 'concept', 'adverse selection|逆向选择'],
  ['STAR 法则', 'concept', 'star 法则|star method'],
  ['一级投资', 'concept', 'private equity|一级投资'],
  ['行为面试', 'concept', 'behavioral interview|行为面试'],
  ['叙事结构', 'concept', 'story structure|叙事结构'],
  ['视觉叙事', 'concept', 'visual storytelling|视觉叙事'],
  ['开场钩子', 'concept', 'opening hook|开场钩子'],
  ['间隔重复', 'concept', 'spaced repetition|间隔重复'],
  ['费曼学习法', 'concept', 'feynman technique|费曼学习法'],
  ['注意力', 'concept', 'attention budget|注意力'],
  ['第二大脑', 'concept', 'second brain|第二大脑'],
  ['Memory Atlas', 'project', 'memory atlas|记忆图谱'],
  ['ChatGPT', 'tool', 'chatgpt'],
  ['IndexedDB', 'tool', 'indexeddb'],
  ['GitHub', 'tool', 'github'],
  ['D3.js', 'tool', 'd3\\.js'],
  ['Python', 'tool', 'python'],
  ['scikit-learn', 'tool', 'scikit-learn'],
  ['TypeScript', 'tool', 'typescript'],
  ['OpenAI', 'organization', 'openai'],
  ['DeepMind', 'organization', 'deepmind'],
  ['Anthropic', 'organization', 'anthropic'],
];

const patterns = new Map();
function matched(pattern, text) {
  if (!patterns.has(pattern))
    patterns.set(
      pattern,
      new RegExp(
        pattern
          .split('|')
          .map((part) =>
            /^[a-z]/i.test(part) ? '\\b(?:' + part + ')\\b' : part,
          )
          .join('|'),
        'i',
      ),
    );
  return patterns.get(pattern).test(text);
}
const preparedThemes = themes.map(([id, label, terms], index) => ({
  id,
  label,
  terms: terms.split('|'),
  color: colors[index],
}));
const key = (text) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
const cut = (text, max) =>
  text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
export const typeLabels = {
  topic: '主题',
  concept: '知识点',
  question: '问题',
  loop: '未闭环',
  memory: '记忆',
  project: '项目',
  person: '人物',
  organization: '机构',
  tool: '工具',
  course: '课程',
  book: '书籍',
};
const plain = (text) =>
  text
    .replace(/https?:\/\/\S+|\x60{3}[\s\S]*?\x60{3}/g, ' ')
    .replace(/(^|\n)\s*[#>*-]+\s*/g, ' ')
    .trim();

function terms(text) {
  const result = [];
  for (const entry of zh.segment(text.normalize('NFKC').toLowerCase())) {
    const value = entry.segment;
    if (
      entry.isWordLike &&
      value.length > 1 &&
      value.length < 33 &&
      !stop.has(value) &&
      /\p{L}/u.test(value)
    )
      result.push(value);
  }
  return result;
}

function bag(text) {
  const values = new Map();
  for (const term of terms(text)) values.set(term, (values.get(term) ?? 0) + 1);
  return values;
}

function normalize(vector) {
  const length =
    Math.sqrt(
      [...vector.values()].reduce((sum, value) => sum + value * value, 0),
    ) || 1;
  for (const [id, value] of vector) vector.set(id, value / length);
  return vector;
}

function cosine(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let value = 0;
  for (const [term, weight] of small) value += weight * (large.get(term) ?? 0);
  return value;
}

function average(vectors) {
  const result = new Map();
  for (const vector of vectors)
    for (const [term, weight] of vector)
      result.set(term, (result.get(term) ?? 0) + weight);
  return normalize(result);
}

function entities(text) {
  const result = new Map();
  function add(label, type) {
    const id = key(label);
    if (id.length >= 2 && !result.has(id)) result.set(id, { label, type });
  }
  for (const [label, type, expression] of lexicon)
    if (matched(expression, text)) add(label, type);
  for (const item of text.matchAll(
    /《([^》\n]{2,48})》|[“「]([^”」\n]{2,25})[”」]|(?:\b[A-Z][A-Z0-9-]{1,11}\b)/gu,
  )) {
    if (item[1]) add(item[1], 'book');
    else if (item[2]) add(item[2], 'concept');
    else if (
      !/^(AI|OK|HTTP|HTTPS|JSON|HTML|URL|I|YOU|ISO)$/.test(item[0]) &&
      !(item[0] === 'STAR' && result.has(key('STAR 法则')))
    )
      add(item[0], 'concept');
  }
  for (const [, label] of text.matchAll(
    /(?:项目|project)\s*[:：]\s*([^\n。！？!?；;]{2,32})/gi,
  ))
    add(label.trim(), 'project');
  for (const [, label] of text.matchAll(
    /(?:课程|course)\s*[:：]\s*([^\n。！？!?；;]{2,32})/gi,
  ))
    add(label.trim(), 'course');
  for (const [, label] of text.matchAll(
    /(?:人物|person)\s*[:：]\s*([^\n。！？!?；;]{2,32})/gi,
  ))
    add(label.trim(), 'person');
  for (const [, label] of text.matchAll(
    /(?:公司|机构|company|organization)\s*[:：]\s*([^\n。！？!?；;]{2,32})/gi,
  ))
    add(label.trim(), 'organization');
  return [...result.values()].slice(0, 28);
}

const openSignal =
  /还没|尚未|没搞懂|之后再|之后要|以后再|后面(?:要|再)|有空(?:再|想)|想继续|还需(?:要)?|下一步(?:想|要|是)|待办|待确认|明天(?:要|再)|\b(?:to[- ]?do|follow up|not yet|still (?:need|have to|don['’]t understand)|need to (?:finish|review|prepare)|come back to|haven['’]t)\b/i;
const closeSignal =
  /已经(?:完成|弄懂|搞懂|做完|提交|看完|确认|解决)|已(?:完成|提交|解决|复盘)|搞定了|看完了|弄懂了|明白了|\b(?:finished|completed|resolved|submitted|figured out|done with)\b/i;
const questionSignal =
  /^(?:请问|能不能|能否|帮我|有没有|该不该|我该|请帮|如何|为什么|怎么|是否|(?:what|why|how|can you|could you|should i|help me|walk me through)\b)/i;

function chunks(turns) {
  const segments = [];
  for (let index = 0; index < turns.length; index++) {
    const turn = turns[index];
    if (turn.role === 'user' || !segments.length) segments.push([]);
    segments.at(-1).push(turn);
  }
  return segments;
}

export function profileSession(session, retain) {
  const weighted = new Map();
  const full = [];
  const questions = new Map();
  const loops = new Map();
  const closed = new Map();
  const segments = chunks(session.turns);
  function collect(target, sentence, value) {
    const label = cut(sentence, 148);
    if (target.size < 24)
      target.set(key(label), { label, date: value ?? session.date });
  }
  function ingest(text, weight) {
    for (const [term, count] of bag(text))
      weighted.set(
        term,
        (weighted.get(term) ?? 0) + weight * Math.min(12, count),
      );
  }
  ingest(session.title, 3);
  for (const segment of segments) {
    for (const turn of segment) {
      const text = plain(turn.text).slice(0, 18000);
      full.push(text);
      ingest(text, turn.role === 'user' ? 2.4 : 1);
      if (turn.role !== 'user') continue;
      for (const raw of text.match(/[^\n。！？!?；;]+[？?]?/gu) ?? []) {
        const sentence = raw.trim();
        if (sentence.length < 4) continue;
        const isQuestion =
          /[？?]$/.test(sentence) || questionSignal.test(sentence);
        if (isQuestion) collect(questions, sentence, turn.date);
        if (closeSignal.test(sentence)) collect(closed, sentence, turn.date);
        else if (
          openSignal.test(sentence) &&
          (!isQuestion || /^(?:我|(?:i|we)\b)/i.test(sentence))
        )
          collect(loops, sentence, turn.date);
      }
    }
  }
  const combined = session.title + '\n' + full.join('\n');
  const signals = preparedThemes.flatMap((theme) => {
    const hits = theme.terms.reduce(
      (count, term) =>
        count +
        Number(matched(term, combined)) +
        2 * Number(matched(term, session.title)),
      0,
    );
    return hits ? [[theme.id, hits]] : [];
  });
  return {
    id: session.id,
    fingerprint: session.fingerprint,
    title: session.title,
    date: session.date,
    ...(retain ? { turns: session.turns } : {}),
    profile: {
      keywords: [...weighted]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 36),
      entities: entities(combined),
      questions: [...questions.values()],
      loops: [...loops.values()],
      closed: [...closed.values()],
      signals,
      segments: segments.length,
    },
  };
}

function vectorsFor(sessions) {
  const df = new Map();
  for (const { profile } of sessions)
    for (const [term] of profile.keywords)
      df.set(term, (df.get(term) ?? 0) + 1);
  const vectors = sessions.map(({ profile }) =>
    normalize(
      new Map(
        profile.keywords.map(([term, count]) => [
          term,
          (1 + Math.log(count)) *
            (1 + Math.log((sessions.length + 1) / (df.get(term) + 1))),
        ]),
      ),
    ),
  );
  const enriched = vectors.map((vector, index) => {
    const result = new Map(vector);
    for (const [id, count] of sessions[index].profile.signals)
      result.set('@' + id, Math.min(0.89, 0.25 + count * 0.12));
    for (const { label } of sessions[index].profile.entities)
      result.set('#' + key(label), 0.21);
    return normalize(result);
  });
  return { vectors, enriched };
}

function compareClustering(vectors, k) {
  if (!vectors.length) return [];
  let centers = [vectors[0]];
  while (centers.length < k) {
    let furthest = 0,
      best = Infinity;
    vectors.forEach((vector, index) => {
      const score = Math.max(
        ...centers.map((center) => cosine(vector, center)),
      );
      if (score < best) {
        best = score;
        furthest = index;
      }
    });
    centers.push(vectors[furthest]);
  }
  let assignments = [];
  for (let step = 0; step < 9; step++) {
    const groups = centers.map(() => []);
    const next = vectors.map((vector) => {
      const scores = centers.map((center) => cosine(vector, center));
      const index = scores.indexOf(Math.max(...scores));
      groups[index].push(vector);
      return index;
    });
    if (next.every((value, index) => value === assignments[index])) break;
    assignments = next;
    centers = groups.map((group, index) =>
      group.length ? average(group) : centers[index],
    );
  }
  return assignments.map(String);
}

function silhouette(vectors, labels) {
  if (new Set(labels).size < 2) return null;
  const scores = vectors.map((vector, index) => {
    const distances = new Map();
    vectors.forEach((other, j) => {
      if (j === index) return;
      const list = distances.get(labels[j]) ?? [0, 0];
      list[0] += 1 - cosine(vector, other);
      list[1]++;
      distances.set(labels[j], list);
    });
    const own = distances.get(labels[index]);
    if (!own) return 0;
    const a = own[0] / own[1];
    const b = Math.min(
      ...[...distances]
        .filter(([id]) => id !== labels[index])
        .map(([, pair]) => pair[0] / pair[1]),
    );
    return (b - a) / (Math.max(a, b) || 1);
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

export function cluster(sessions) {
  const { vectors, enriched } = vectorsFor(sessions);
  const groups = new Map();
  const assignments = [];
  sessions.forEach((session, index) => {
    const strong = [...session.profile.signals].sort((a, b) => b[1] - a[1])[0];
    let id = strong?.[1] >= 2 ? strong[0] : '';
    if (!id) {
      let similarity = 0.24;
      for (const [candidate, group] of groups) {
        const score = cosine(group.center, enriched[index]);
        if (score > similarity) {
          id = candidate;
          similarity = score;
        }
      }
    }
    id ||= 'cluster-' + hash(session.id);
    const group = groups.get(id) ?? {
      id,
      sessions: [],
      center: new Map(),
      samples: [],
      entities: new Map(),
    };
    const vector = enriched[index];
    group.sessions.push(session.id);
    if (group.samples.length < 24) {
      group.samples.push(vector);
      group.center = average(group.samples);
    }
    for (const { label } of session.profile.entities)
      group.entities.set(label, (group.entities.get(label) ?? 0) + 1);
    groups.set(id, group);
    assignments.push(id);
  });
  const ordered = [...groups.values()].sort(
    (a, b) => b.sessions.length - a.sessions.length || a.id.localeCompare(b.id),
  );
  const sampleSize = Math.min(180, sessions.length);
  const sampleIndices = Array.from({ length: sampleSize }, (_, index) =>
    Math.floor((index * sessions.length) / sampleSize),
  );
  const sampleVectors = sampleIndices.map((index) => vectors[index]);
  const sampleLabels = sampleIndices.map((index) => assignments[index]);
  const baseline = compareClustering(
    sampleVectors,
    Math.min(sampleSize, 12, Math.max(1, new Set(sampleLabels).size)),
  );
  return {
    groups: ordered.map((group, index) => {
      const theme = preparedThemes.find((theme) => theme.id === group.id);
      const keywords = [...group.center]
        .filter(([term]) => !/^[@#]/.test(term))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([term]) => term);
      const label =
        theme?.label ??
        [...group.entities].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        (keywords.slice(0, 2).join(' · ') || '其他对话');
      return {
        id: 'topic-' + group.id,
        label,
        color: theme?.color ?? colors[(index + 4) % colors.length],
        keywords,
        refs: group.sessions,
      };
    }),
    metrics: {
      count: sampleSize,
      primary: silhouette(sampleVectors, sampleLabels),
      baseline: silhouette(sampleVectors, baseline),
      primaryGroups: new Set(sampleLabels).size,
      baselineGroups: new Set(baseline).size,
    },
  };
}

function referenceVector(text) {
  const values = bag(text);
  for (const { label } of entities(text)) values.set('#' + key(label), 2);
  return normalize(values);
}

export function assemble(sessions, topics) {
  const nodes = new Map();
  const edges = new Map();
  const topicFor = new Map();
  const themes = [];
  const threads = [];
  const loopNodes = [];
  const ended = [];
  const threadLookup = new Map();
  const chronicle = [...sessions].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? ''),
  );
  function node(fields, session) {
    let item = nodes.get(fields.id);
    if (!item) {
      item = {
        ...fields,
        refs: [],
        topics: [],
        weight: 0,
        date: null,
        lastDate: null,
      };
      nodes.set(item.id, item);
    }
    if (!item.refs.includes(session.id)) item.refs.push(session.id);
    const topic = topicFor.get(session.id);
    if (topic && !item.topics.includes(topic)) item.topics.push(topic);
    const date = fields.occurrence ?? session.date;
    if (date && (!item.date || date < item.date)) item.date = date;
    if (date && (!item.lastDate || date > item.lastDate)) item.lastDate = date;
    item.weight++;
    return item;
  }
  function edge(from, to, type) {
    if (!from || !to || from === to) return;
    const id = from + '/' + to + '/' + type;
    if (!edges.has(id)) edges.set(id, { from, to, type });
  }
  const byId = new Map(sessions.map((session) => [session.id, session]));
  for (const topic of topics) {
    const members = topic.refs.map((id) => byId.get(id)).filter(Boolean);
    if (!members.length) continue;
    for (const session of members) topicFor.set(session.id, topic.id);
    const { id, label, color, keywords } = topic;
    for (const member of members)
      node(
        { id, label, type: 'topic', color, summary: keywords.join(' · ') },
        member,
      );
    themes.push(nodes.get(id));
  }
  for (const session of chronicle) {
    const topic = topicFor.get(session.id);
    const memory = node(
      {
        id: 'memory-' + session.id,
        label: session.title,
        type: 'memory',
        summary: session.profile.keywords
          .slice(0, 4)
          .map(([term]) => term)
          .join(' · '),
      },
      session,
    );
    edge(topic, memory.id, 'revisited_in');
    const candidates = session.profile.entities.length
      ? session.profile.entities
      : session.profile.keywords
          .slice(0, 3)
          .map(([label]) => ({ label, type: 'concept' }));
    let previous;
    for (const { label, type } of candidates) {
      const item = node(
        { id: type + '-' + hash(key(label)), label, type },
        session,
      );
      edge(item.id, topic, 'belongs_to');
      if (previous) edge(previous, item.id, 'related_to');
      previous = item.id;
    }
    for (const item of session.profile.questions) {
      const vector = referenceVector(item.label);
      const recent = new Set(
        [...vector.keys()].flatMap((term) =>
          (threadLookup.get(term) ?? []).slice(-32),
        ),
      );
      let thread;
      let score = 0.47;
      for (const candidate of recent) {
        const elapsed =
          candidate.last.date && item.date
            ? Math.abs(
                Date.parse(item.date) - Date.parse(candidate.last.date),
              ) / 86400000
            : 0;
        const similarity = cosine(vector, candidate.vector);
        const adjusted =
          similarity - (elapsed > 90 ? 0.13 : elapsed > 30 ? 0.06 : 0);
        if (adjusted >= score) {
          score = adjusted;
          thread = candidate;
        }
      }
      const id = 'question-' + hash(key(item.label));
      const question = node(
        { id, label: item.label, type: 'question', occurrence: item.date },
        session,
      );
      edge(id, topic, 'belongs_to');
      if (thread) {
        edge(thread.last.id, id, 'leads_to');
        thread.last = { id, date: item.date };
        thread.items.add(id);
        thread.refs.add(session.id);
      } else {
        thread = {
          last: { id, date: item.date },
          vector,
          items: new Set([id]),
          refs: new Set([session.id]),
        };
        threads.push(thread);
        for (const term of vector.keys()) {
          const entries = threadLookup.get(term) ?? [];
          entries.push(thread);
          threadLookup.set(term, entries);
        }
      }
      question.thread = thread;
    }
    for (const item of session.profile.loops) {
      const id = 'loop-' + hash(key(item.label));
      const loop = node(
        { id, label: item.label, type: 'loop', occurrence: item.date },
        session,
      );
      if (!loopNodes.includes(loop)) loopNodes.push(loop);
    }
    for (const item of session.profile.closed)
      ended.push({ date: item.date, vector: referenceVector(item.label) });
  }
  for (const loop of loopNodes) {
    const vector = referenceVector(loop.label);
    loop.resolved = ended.some(
      (item) =>
        item.date &&
        loop.lastDate &&
        item.date > loop.lastDate &&
        cosine(vector, item.vector) >= 0.58,
    );
    for (const topic of loop.topics)
      edge(loop.id, topic, loop.resolved ? 'belongs_to' : 'unresolved');
  }
  for (const thread of threads)
    for (const id of thread.items) {
      nodes.get(id).thread = [...thread.items].filter((other) => other !== id);
      nodes.get(id).threadCount = thread.refs.size;
    }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    themes,
    topicFor,
  };
}
