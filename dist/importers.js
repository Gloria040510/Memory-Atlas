const roleNames = new Map([
  ['user', 'user'],
  ['human', 'user'],
  ['you', 'user'],
  ['me', 'user'],
  ['我', 'user'],
  ['你', 'user'],
  ['用户', 'user'],
  ['assistant', 'assistant'],
  ['chatgpt', 'assistant'],
  ['ai', 'assistant'],
  ['助手', 'assistant'],
  ['助理', 'assistant'],
]);

export function dateValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof value !== 'string') return null;
  const day = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  const date = new Date(
    day
      ? [day[1], day[2].padStart(2, '0'), day[3].padStart(2, '0')].join('-') +
        'T12:00:00'
      : value,
  );
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function hash(value) {
  let a = 2166136261;
  let b = 1779033703;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b ^ value.charCodeAt(i), 1597334677);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

const compact = (value) =>
  String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
const excerpt = (value, max = 54) =>
  value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value;

function messageText(value) {
  if (typeof value === 'string') return compact(value);
  if (Array.isArray(value))
    return value.map(messageText).filter(Boolean).join('\n');
  if (value && typeof value === 'object')
    return messageText(
      value.parts ?? value.text ?? value.value ?? value.content,
    );
  return '';
}

function turnOf(item) {
  const role = roleNames.get(
    String(
      item?.author?.role ?? item?.role ?? item?.speaker ?? '',
    ).toLowerCase(),
  );
  const text = messageText(item?.content ?? item?.text ?? item?.parts);
  if (
    !role ||
    !text ||
    item?.metadata?.is_visually_hidden_from_conversation ||
    (item?.recipient && item.recipient !== 'all')
  )
    return null;
  return {
    role,
    text,
    date: dateValue(item.create_time ?? item.date ?? item.timestamp),
    ...(typeof item.id === 'string' ? {id:item.id}:{}),
  };
}

function branch(mapping, current) {
  const nodes = Object.values(mapping).filter((item) => item?.id);
  let last = mapping[current];
  if (!last)
    last = nodes
      .filter((item) => !item.children?.length)
      .sort(
        (a, b) => (b.message?.create_time || 0) - (a.message?.create_time || 0),
      )[0];
  const chain = [];
  const seen = new Set();
  while (last?.id && !seen.has(last.id)) {
    seen.add(last.id);
    if (last.message) chain.push(last.message);
    last = mapping[last.parent];
  }
  return chain.reverse();
}

function session({ id, title, date, turns, source }) {
  if (!turns.length) return null;
  const first = turns.find((t) => t.role === 'user') ?? turns[0];
  const content = turns.map((t) => t.role + '\n' + t.text).join('\n');
  return {
    id: id ? 'chat-' + String(id) : 'text-' + hash(content),
    fingerprint: hash(content),
    ...(source === 'live' ? {source:'live'} : {}),
    title: excerpt(compact(title) || first.text.split('\n')[0]),
    date: dateValue(date) ?? turns.find((t) => t.date)?.date ?? null,
    turns,
  };
}

export function fromJSON(input) {
  const data =
    typeof input === 'string'
      ? JSON.parse(input.replace(/^\uFEFF/, ''))
      : input;
  let chats = Array.isArray(data)
    ? data
    : (data?.conversations ?? data?.chats ?? [data]);
  if (!Array.isArray(chats)) throw new Error('找不到 JSON 中的对话列表。');
  if (chats.length && chats.every((item) => item?.role || item?.speaker))
    chats = [{ messages: chats }];
  const sessions = chats
    .map((chat) => {
      const messages = chat?.mapping
        ? branch(chat.mapping, chat.current_node)
        : (chat?.messages ?? chat?.turns);
      return session({
        id: chat?.conversation_id ?? chat?.id,
        title: chat?.title,
        source: chat?.source,
        date: chat?.create_time ?? chat?.date ?? chat?.created_at,
        turns: Array.isArray(messages)
          ? messages.map(turnOf).filter(Boolean)
          : [],
      });
    })
    .filter(Boolean);
  if (!sessions.length)
    throw new Error(
      '没有找到可读取的对话。请选择 ChatGPT 的 conversations.json 或对话文件。',
    );
  return sessions;
}

const speakerLine =
  /^\s*(?:#{1,6}\s*)?(?:\*{1,2})?(user|you(?: said)?|me|assistant|chatgpt(?: said)?|ai|我|你(?:说)?|用户|助手|助理)(?:\*{1,2})?\s*(?:[:：]\s*(.*)|$)/i;

export function fromText(input) {
  const groups = [];
  const source = compact(input);
  if (!source) throw new Error('请先添加对话文本。');
  let title = '';
  let date = null;
  let turns = [];
  let role = 'user';
  let lines = [];
  let fenced = false;
  function flush() {
    const text = compact(lines.join('\n'));
    if (text) turns.push({ role, text, date: null });
    lines = [];
  }
  function finish() {
    flush();
    const next = session({ title, date, turns });
    if (next) groups.push(next);
    turns = [];
    title = '';
    date = null;
    role = 'user';
  }
  for (const line of source.split('\n')) {
    if (/^\s*(\x60{3,}|~{3,})/.test(line)) {
      fenced = !fenced;
      lines.push(line);
      continue;
    }
    if (fenced) {
      lines.push(line);
      continue;
    }
    const speaker = line.match(speakerLine);
    const heading = line.match(/^#\s+(.+)$/);
    const divider = line.match(
      /^\s*(?:---\s*)?(?:日期|date|日期时间)\s*[:：]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}.*)$/i,
    );
    if (speaker) {
      flush();
      role = roleNames.get(speaker[1].toLowerCase().replace(/ said$|说$/g, ''));
      if (speaker[2]) lines.push(speaker[2]);
    } else if (divider && dateValue(divider[1])) {
      if (turns.length || compact(lines.join('\n'))) finish();
      date = dateValue(divider[1]);
    } else if (
      heading &&
      (role === 'user' || !turns.length) &&
      !lines.some((line) => line.trim())
    ) {
      const priorDate = date;
      if (turns.length) finish();
      else date = priorDate;
      title = heading[1];
    } else if (
      /^\s*---\s*$/.test(line) &&
      turns.length &&
      role === 'assistant'
    ) {
      finish();
    } else {
      lines.push(line);
    }
  }
  finish();
  if (!groups.length) throw new Error('没有可分析的文本。');
  return groups;
}

function decodeEntities(value) {
  const entities = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name.startsWith('#')) {
      const number =
        name[1].toLowerCase() === 'x'
          ? parseInt(name.slice(2), 16)
          : Number(name.slice(1));
      return number > 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : whole;
    }
    return entities[name.toLowerCase()] ?? whole;
  });
}

function htmlText(value) {
  return decodeEntities(
    value
      .replace(/<\s*br\b[^>]*>/gi, '\n')
      .replace(/<\/(?:p|div|li|section|article|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  );
}

export function fromHTML(input) {
  // Official chat.html exports embed their original conversation tree.
  for (const script of input.matchAll(
    /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    const marker = /\b(?:jsonData|conversations)\s*=\s*(?=\[|\{)/.exec(
      script[1],
    );
    if (!marker) continue;
    const body = script[1].slice(marker.index + marker[0].length);
    let depth = 0,
      quoted = false,
      escaped = false;
    for (let index = 0; index < body.length; index++) {
      const ch = body[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === '[' || ch === '{') depth++;
      else if ((ch === ']' || ch === '}') && --depth === 0) {
        try {
          return fromJSON(body.slice(0, index + 1));
        } catch {
          break;
        }
      }
    }
  }
  const safe = input.replace(
    /<!--[\s\S]*?-->|<(script|style|template|head|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    '',
  );
  const roleTags = [
    ...safe.matchAll(
      /<[^>]+\bdata-message-author-role\s*=\s*["'](user|assistant)["'][^>]*>/gi,
    ),
  ];
  if (roleTags.length) {
    return fromText(
      roleTags
        .map((tag, index) => {
          const content = safe.slice(
            tag.index + tag[0].length,
            roleTags[index + 1]?.index ?? safe.length,
          );
          return tag[1] + ':\n' + htmlText(content).trim();
        })
        .join('\n'),
    );
  }
  return fromText(htmlText(safe.replace(/<h1\b[^>]*>/gi, '\n# ')));
}

export function parseInput({ name, text }) {
  const type = name?.split('.').pop()?.toLowerCase();
  if (type === 'json') return fromJSON(text);
  if (type === 'html' || type === 'htm') return fromHTML(text);
  if (!name && /^\s*[\[{]/.test(text)) {
    try {
      return fromJSON(text);
    } catch {
      /* Treat ordinary pasted prose as text. */
    }
  }
  if (!name && /^\s*<(!doctype|html|div|article)\b/i.test(text))
    return fromHTML(text);
  return fromText(text);
}
