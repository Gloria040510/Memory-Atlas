import { mountGrowth } from './growth.js';
import { periodRange, searchable, monthsFor } from './growth-core.js';
import { readZip } from './zip.js';
import { assemble, typeLabels } from './analysis.js';
import { sampleArchive } from './demo.js';
import { AtlasGraph } from './graph.js';
import { readArchive, writeArchive } from './store.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const demo = sampleArchive();
const state = {
  dataset: 'sample',
  archive: null,
  period: '30',
  review: '30',
  language: 'zh',
  importance: 'all',
  search: '',
  view: 'map',
  topic: null,
  selected: null,
};
const cache = new WeakMap();
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const shortDate = new Intl.DateTimeFormat('zh-CN', {
  month: 'short',
  day: 'numeric',
});
const dateText = (value, format = dateFormatter) =>
  value ? format.format(new Date(value)) : '日期未知';
const active = () => (state.dataset === 'personal' ? state.archive : demo);
const topicPets = $$('[data-pet-topic]');
let files = [];
let mode = 'file';
let toastTimer;
let importBusy = false;
let lastGraph;
let growth;

function element(tag, text, classes) {
  const result = document.createElement(tag);
  if (text != null) result.textContent = text;
  if (classes) result.className = classes;
  return result;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

function button(text, handler, classes = 'button quiet') {
  const result = element('button', text, classes);
  result.type = 'button';
  result.addEventListener('click', handler);
  return result;
}

function toast(message) {
  const item = $('#toast');
  item.textContent = message;
  item.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    item.hidden = true;
  }, 4400);
}

function getGraph(archive, period) {
  if (!cache.has(archive)) cache.set(archive, new Map());
  const collection = cache.get(archive);
  if (!collection.has(period)) {
    const range = periodRange(archive, period);
    const graph = assemble(range.sessions, archive.groups);
    const edits = archive.edits ?? {};
    for (const node of graph.nodes) {
      const edit = edits[node.id];
      if (!edit) continue;
      node.label = edit.label ?? node.label;
      if (node.type === 'loop' && typeof edit.resolved === 'boolean')
        node.resolved = edit.resolved;
    }
    for (const edge of graph.edges) {
      const id = edge.from.startsWith('loop-') ? edge.from : null;
      if (id && typeof edits[id]?.resolved === 'boolean')
        edge.type = edits[id].resolved ? 'belongs_to' : 'unresolved';
    }
    collection.set(period, {
      ...range,
      ...graph,
      byId: new Map(graph.nodes.map((node) => [node.id, node])),
      sessionsById: new Map(
        range.sessions.map((session) => [session.id, session]),
      ),
    });
  }
  return collection.get(period);
}

function ranked(node) {
  const priority = {
    topic: 12,
    loop: 7,
    project: 6,
    concept: 5,
    question: 3,
    tool: 4,
    person: 4,
    organization: 4,
    book: 4,
    course: 4,
    memory: 2,
  };
  return (
    (priority[node.type] ?? 1) +
    Math.min(9, node.weight) * 0.7 +
    Math.min(4, node.threadCount ?? 0)
  );
}

function filteredGraph(data) {
  const phrase = state.search.normalize('NFKC').toLowerCase().trim();
  const matches = data.nodes
    .filter((node) => {
      if (
        state.topic &&
        !node.topics.includes(state.topic) &&
        node.id !== state.topic
      )
        return false;
      if (
        state.importance === 'open' &&
        (node.type !== 'loop' || node.resolved)
      )
        return false;
      if (
        state.importance === 'core' &&
        node.type !== 'topic' &&
        node.weight < 2 &&
        (node.threadCount ?? 0) < 2
      )
        return false;
      return (
        !phrase ||
        (
          node.label +
          ' ' +
          (node.summary ?? '') +
          ' ' +
          (typeLabels[node.type] ?? '')
        )
          .normalize('NFKC')
          .toLowerCase()
          .includes(phrase)
      );
    })
    .sort((a, b) => ranked(b) - ranked(a) || a.label.localeCompare(b.label));
  const limit = 76;
  let shown = matches.slice(0, limit);
  if (!phrase && state.importance === 'all' && !state.topic) {
    const topics = shown.filter((node) => node.type === 'topic').slice(0, 12);
    const allowed = new Set(topics.map((node) => node.id));
    const perTopic = topics.map((topic) =>
      matches.filter(
        (node) => node.type !== 'topic' && node.topics[0] === topic.id,
      ),
    );
    shown = [...topics];
    for (
      let index = 0;
      shown.length < limit && perTopic.some((list) => list[index]);
      index++
    ) {
      for (const list of perTopic)
        if (list[index] && shown.length < limit) shown.push(list[index]);
    }
    if (topics.length === data.themes.length) {
      const keys = new Set(shown.map((node) => node.id));
      shown.push(
        ...matches
          .filter(
            (node) =>
              !keys.has(node.id) && node.topics.every((id) => allowed.has(id)),
          )
          .slice(0, limit - shown.length),
      );
    }
  }
  if (state.selected && !shown.some((node) => node.id === state.selected)) {
    const selected = matches.find((node) => node.id === state.selected);
    if (selected) shown = [...shown.slice(0, limit - 1), selected];
  }
  const keys = new Set(shown.map((node) => node.id));
  return {
    shown,
    matches,
    edges: data.edges.filter(
      (edge) => keys.has(edge.from) && keys.has(edge.to),
    ),
  };
}

const graph = new AtlasGraph($('#graph'), $('#graph-tip'), (id) =>
  selectNode(id, true),
);

function selectNode(id, scroll) {
  state.selected = id;
  graph.selected = id;
  graph.highlight(null);
  renderIndex(lastGraph);
  if (scroll) revealIndex();
}

function revealIndex() {
  const index = $('#atlas-index');
  index.scrollTop = 0;
  if (matchMedia('(max-width: 740px)').matches)
    index.scrollIntoView({ block: 'nearest' });
}

function exploreTopic(topic) {
  if (!topic) return;
  state.view = 'map';
  state.selected = topic.id;
  state.topic = null;
  state.search = '';
  state.importance = 'all';
  render(true);
  revealIndex();
  if (!matchMedia('(max-width: 740px)').matches)
    $('#atlas').scrollIntoView({ block: 'start' });
  $('#pet-announcement').textContent =
    '已选中「' + topic.label + '」。在节点详情里可以查看来源对话。';
}

function source(session) {
  $('#source-title').textContent = session.title;
  $('#source-date').textContent = dateText(session.date);
  const contents = $('#source-turns');
  contents.replaceChildren();
  if (!session.turns?.length)
    contents.append(element('p', '此对话导入时选择了仅保存结构化内容。'));
  for (const turn of session.turns ?? []) {
    const item = element('section', null, 'transcript-turn');
    item.append(
      element('h3', turn.role === 'user' ? '你' : 'ChatGPT'),
      element('p', turn.text, 'transcript-text'),
    );
    contents.append(item);
  }
  growth?.sourceTools(session);
  $('#source-dialog').showModal();
}

async function editNode(node, change) {
  try {
    const archive = state.archive;
    const edits = {
      ...archive.edits,
      [node.id]: { ...archive.edits?.[node.id], ...change },
    };
    state.archive = await writeArchive({ ...archive, edits }, archive.revision);
    render(false);
    toast('已保存到本地档案');
  } catch (error) {
    toast(error.message);
  }
}

function renderIndex(data) {
  const topics = $('#topics'),
    detail = $('#index-detail');
  const selected = data.byId.get(state.selected);
  topicPets.forEach((pet, index) => {
    const topic = data.themes[index];
    pet.disabled = !topic;
    pet.setAttribute(
      'aria-label',
      topic ? '探索主题 ' + topic.label : '当前日期暂无对应主题',
    );
    pet.setAttribute(
      'aria-pressed',
      Boolean(topic && topic.id === state.selected),
    );
    pet.querySelector('.pet-caption').textContent = topic?.label ?? '';
  });
  $('#index-title').textContent = selected ? '节点详情' : '主题';
  $('#index-count').textContent = selected
    ? ''
    : data.sessions.length + ' 段对话';
  topics.hidden = Boolean(selected);
  detail.hidden = !selected;
  topics.replaceChildren();
  detail.replaceChildren();
  if (!selected) {
    for (const topic of data.themes) {
      const turn = button(
        null,
        () => {
          state.topic = state.topic === topic.id ? null : topic.id;
          state.selected = state.topic;
          render(true);
        },
        'topic-row',
      );
      turn.setAttribute('aria-pressed', state.topic === topic.id);
      const dot = element('i', null, 'topic-dot');
      dot.style.setProperty('--topic', topic.color);
      turn.append(
        dot,
        element('strong', topic.label),
        element('small', String(topic.refs.length)),
      );
      turn.setAttribute(
        'aria-label',
        topic.label + '，' + topic.refs.length + ' 段对话',
      );
      topics.append(turn);
    }
    if (!data.themes.length)
      topics.append(element('p', '此日期范围内没有主题。', 'index-empty'));
    return;
  }
  detail.append(
    button('查看全部主题', () => {
      if (!state.topic) selectNode(null);
      else {
        state.selected = null;
        state.topic = null;
        render(true);
      }
    }),
  );
  detail.append(
    element('h3', selected.label),
    element(
      'p',
      selected.type === 'loop'
        ? selected.resolved
          ? '已完成'
          : '待跟进'
        : (typeLabels[selected.type] ?? selected.type),
      'node-type',
    ),
  );
  if (selected.type === 'topic' && !state.topic)
    detail.append(
      button('仅查看此主题', () => {
        state.topic = selected.id;
        render(true);
      }),
    );
  if (state.dataset === 'personal') {
    detail.append(
      button('重命名', (event) => {
        const form = element('form', null, 'edit-form');
        const input = element('input');
        input.value = selected.label;
        input.required = true;
        input.maxLength = 140;
        input.setAttribute('aria-label', '节点名称');
        const submit = element('button', '保存', 'button primary');
        form.append(input, submit);
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          if (input.value.trim())
            editNode(selected, { label: input.value.trim() });
        });
        event.currentTarget.replaceWith(form);
        input.select();
      }),
    );
    if (selected.type === 'loop')
      detail.append(
        button(selected.resolved ? '重新打开' : '标记为已闭环', () =>
          editNode(selected, { resolved: !selected.resolved }),
        ),
      );
  }
  growth?.nodeTools(selected, detail);
  const linked = (selected.thread ?? [])
    .slice(0, 5)
    .map((id) => data.byId.get(id))
    .filter(Boolean);
  if (linked.length) {
    const threads = element('div', null, 'related-questions');
    threads.append(element('h4', '相关追问'));
    for (const node of linked)
      threads.append(
        button(node.label, () => selectNode(node.id), 'text-button'),
      );
    detail.append(threads);
  }
  const list = element('div', null, 'source-list');
  const refs = selected.refs
    .map((id) => data.sessionsById.get(id))
    .filter(Boolean)
    .reverse();
  list.append(element('h4', '来源对话'));
  for (const session of refs) {
    const row = button(null, () => source(session), 'source-row');
    row.append(
      element('strong', session.title),
      element(
        'small',
        dateText(session.date, shortDate) +
          (session.turns?.length ? '' : ' · 仅索引'),
      ),
      icon('book'),
    );
    row.setAttribute('aria-label', '查看对话：' + session.title);
    list.append(row);
  }
  detail.append(list);
}

function renderTimeline(data, filter) {
  const timeline = $('#timeline');
  timeline.replaceChildren();
  const refs = new Set(filter.matches.flatMap((node) => node.refs));
  for (const session of [...data.sessions].reverse()) {
    if (
      state.search ? !searchable(session, state.search) : !refs.has(session.id)
    )
      continue;
    const item = button(
      null,
      () => {
        selectNode('memory-' + session.id);
        source(session);
      },
      'timeline-row',
    );
    item.append(
      element('time', dateText(session.date)),
      element('strong', session.title),
      icon('book'),
    );
    timeline.append(item);
  }
}

function updateNav() {
  const section = ['#demo-film', '#review', '#study'].includes(location.hash)
    ? location.hash
    : '#atlas';
  for (const link of $$('.nav-link')) {
    const current = link.hash === section;
    link.classList.toggle('active', current);
    if (current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

function rangeText({ start, end }) {
  if (!start || !end) return '暂无日期';
  return dateFormatter.formatRange(start, end);
}

function render(reset) {
  graph.cancelGrowth();
  const archive = active() ?? demo;
  const data = getGraph(archive, state.period);
  lastGraph = data;
  if (!data.byId.has(state.selected)) state.selected = null;
  if (!data.byId.has(state.topic)) state.topic = null;
  const filter = filteredGraph(data);
  const isMap = state.view === 'map';
  $('#sample-label').hidden = Boolean(state.archive);
  $('#toggle-dataset').hidden = !state.archive;
  $('#toggle-dataset').value = state.dataset;
  $('#atlas-date').textContent = rangeText(data);
  $('#graph').toggleAttribute('hidden', !isMap);
  $('#timeline').hidden = isMap;
  $('#plot-actions').hidden = !isMap;
  $('#legend').hidden = !isMap;
  $('#pet-timeline').setAttribute('aria-pressed', !isMap);
  $('#pet-timeline .pet-caption').textContent = isMap ? '时间轴' : '返回星图';
  $$('[data-view]').forEach((item) =>
    item.setAttribute('aria-pressed', item.dataset.view === state.view),
  );
  $('#search').value = state.search;
  $('#search').placeholder = isMap ? '搜主题或关键词' : '搜标题或原文';
  $('#importance').value = state.importance;
  $('#graph-empty').hidden = Boolean(filter.matches.length);
  $('#graph-empty').textContent = data.sessions.length
    ? isMap
      ? '没有匹配的节点'
      : '没有匹配的对话'
    : '此日期范围内没有对话';
  if (isMap)
    graph.render(
      filter.shown,
      filter.edges,
      data.themes,
      state.selected,
      reset,
    );
  else {
    renderTimeline(data, filter);
    $('#graph-empty').hidden = $('#timeline').childElementCount > 0;
  }
  const replayDisabled =
    filter.shown.length < 2 ||
    new Set(filter.shown.filter((node) => node.date).map((node) => node.date))
      .size < 2;
  $('#grow').disabled = replayDisabled;
  $('#pet-replay').disabled = replayDisabled;
  renderIndex(data);
  renderReview();
}

function reviewCard(title, items, formatter, empty) {
  const card = element('section', null, 'review-card');
  card.append(element('h3', title));
  if (!items.length) card.append(element('p', empty, 'muted'));
  const list = element('ul');
  for (const node of items) {
    const row = element('li');
    row.append(
      button(
        formatter(node),
        () => {
          state.period = state.review;
          state.search = '';
          state.importance = 'all';
          state.topic = null;
          state.selected = node.id;
          state.view = 'map';
          render(true);
          location.hash = 'atlas';
          if (matchMedia('(max-width: 740px)').matches)
            $('#atlas-index').scrollIntoView({ block: 'nearest' });
        },
        'review-link',
      ),
    );
    list.append(row);
  }
  card.append(list);
  return card;
}

function renderReview() {
  const archive = active() ?? demo;
  const data = getGraph(archive, state.review);
  const full = getGraph(archive, 'all');
  const english = state.language === 'en';
  $('#review-title').textContent = english ? 'Conversation review' : '对话回顾';
  $('#review-language').textContent = english ? '中文' : 'EN';
  const frequent = [...data.themes]
    .sort((a, b) => b.refs.length - a.refs.length)
    .slice(0, 5);
  const knowledge = data.nodes
    .filter(
      (node) =>
        [
          'concept',
          'tool',
          'book',
          'course',
          'person',
          'organization',
        ].includes(node.type) &&
        full.byId.get(node.id)?.date >= data.start?.toISOString(),
    )
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);
  const seen = new Set();
  const repeats = data.nodes
    .filter((node) => {
      if (node.type !== 'question' || node.threadCount < 2) return false;
      const id = [node.id, ...node.thread].sort()[0];
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => b.threadCount - a.threadCount)
    .slice(0, 4);
  const open = data.nodes
    .filter(
      (node) =>
        node.type === 'loop' &&
        !node.resolved &&
        !full.byId.get(node.id)?.resolved,
    )
    .slice(-5)
    .reverse();
  const count = data.sessions.length;
  const summary = element('div', null, 'review-summary');
  summary.lang = english ? 'en' : 'zh-CN';
  const undated =
    archive.sessions.length -
    full.sessions.filter((session) => session.date).length;
  const range = english
    ? data.start
      ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).formatRange(
          data.start,
          data.end,
        )
      : 'No dates available'
    : rangeText(data);
  const counts = english
    ? count + (count === 1 ? ' conversation' : ' conversations')
    : count + ' 段对话';
  const notes = undated
    ? english
      ? ' · ' + undated + ' undated in All'
      : ' · ' + undated + ' 段无日期对话见「全部」'
    : '';
  summary.append(element('strong', counts), element('span', range + notes));
  const grid = element('div', null, 'review-grid');
  grid.lang = summary.lang;
  const empty = english ? 'None' : '暂无';
  grid.append(
    reviewCard(
      english ? 'Top topics' : '常聊主题',
      frequent,
      (node) => node.label + ' · ' + node.refs.length,
      empty,
    ),
    reviewCard(
      english ? 'New concepts' : '新知识点',
      knowledge,
      (node) => node.label,
      empty,
    ),
    reviewCard(
      english ? 'Revisited questions' : '反复追问',
      repeats,
      (node) => node.label,
      empty,
    ),
    reviewCard(
      english ? 'To follow up' : '待跟进',
      open,
      (node) => node.label,
      empty,
    ),
  );
  $('#review-content').replaceChildren(summary, grid);
  growth?.render();
}

function openDialog(id) {
  if (id === 'privacy-dialog') {
    $('#clear-confirm').hidden = true;
    $('#privacy-message').textContent = '';
    const archive = state.archive;
    $('#privacy-summary').textContent = archive
      ? archive.sessions.length +
        ' 段已导入对话，其中 ' +
        archive.sessions.filter((row) => row.turns).length +
        ' 段保留原文。'
      : '当前设备还没有已导入的对话。';
    $('#clear-data').disabled = !archive;
    const metrics = active()?.metrics;
    const score = (value) => (value == null ? '样本不足' : value.toFixed(3));
    const target = $('#method-details');
    target.replaceChildren(
      element(
        'p',
        metrics
          ? '当前档案取样 ' +
              metrics.count +
              ' 段对话。增强余弦聚类 ' +
              metrics.primaryGroups +
              ' 簇，轮廓系数 ' +
              score(metrics.primary) +
              '。TF-IDF + 球面 K-means ' +
              metrics.baselineGroups +
              ' 簇，轮廓系数 ' +
              score(metrics.baseline) +
              '。'
          : '导入对话后可查看算法对照。',
      ),
      element(
        'p',
        '两种聚类在同一批词向量上比较。轮廓系数只衡量簇间分离程度。',
      ),
    );
  }
  $('#' + id).showModal();
}

function setDataset(which) {
  state.dataset = which;
  state.period =
    which === 'personal'
      ? (monthsFor(active() ?? { sessions: [] })[0] ?? 'all')
      : '30';
  state.review = state.period === 'all' ? '30' : state.period;
  state.topic = null;
  state.selected = null;
  state.importance = 'all';
  state.search = '';
  state.view = 'map';
  render(true);
}

function setFiles(next) {
  files = [...next];
  $('#file-title').textContent = files.length
    ? files.length === 1
      ? files[0].name
      : '已选择 ' + files.length + ' 个文件'
    : '选择文件，或拖到这里';
}

function runImport(inputs, existing, retain) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('分析进程退出。可以分批导入较大的导出文件。'));
    };
    worker.postMessage({ inputs, existing, retain });
  });
}

async function importData(event) {
  event.preventDefault();
  if (importBusy) return;
  const form = event.currentTarget;
  const message = $('#import-message');
  const input = $('#paste-input').value.trim();
  let inputs =
    mode === 'file'
      ? files
      : input
        ? [
            {
              text:
                ($('#paste-date').value
                  ? '日期：' + $('#paste-date').value + '\n'
                  : '') + input,
            },
          ]
        : [];
  if (!inputs.length) {
    message.textContent =
      mode === 'file' ? '请选择要导入的文件。' : '请粘贴对话文本。';
    return;
  }
  importBusy = true;
  const submit = $('#import-submit');
  submit.disabled = true;
  submit.textContent = '正在整理…';
  message.textContent = '正在本地提取主题、知识点和问题线索。';
  try {
    const expanded = [];
    for (const f of inputs) {
      if (/\.zip$/i.test(f.name ?? '')) expanded.push(...(await readZip(f)));
      else {
        if (f.size > 80 * 1024 * 1024)
          throw new Error('文件超过 80 MB，请分批导入。');
        expanded.push(f);
      }
    }
    inputs = expanded;
    const previous = await readArchive();
    const { groups, metrics, sessions, imported, failures, replaced } =
      await runImport(
        inputs,
        previous?.sessions ?? [],
        $('#retain-text').checked,
      );
    const edits = { ...previous?.edits };
    for (const [oldId, newId] of Object.entries(replaced)) {
      if (edits['memory-' + oldId]) {
        edits['memory-' + newId] = edits['memory-' + oldId];
        delete edits['memory-' + oldId];
      }
    }
    state.archive = await writeArchive(
      { ...previous, groups, metrics, sessions, edits },
      previous?.revision ?? null,
    );
    setDataset('personal');
    location.hash = 'atlas';
    if (failures.length)
      message.textContent =
        '已整理 ' +
        imported +
        ' 段对话。以下文件未能读取。\n' +
        failures.join('\n');
    else {
      $('#import-dialog').close();
      form.reset();
      setFiles([]);
      message.textContent = '';
      toast('已在本地整理 ' + imported + ' 段对话');
      if (!$('#grow').disabled) beginGrowth();
    }
  } catch (error) {
    message.textContent = error.message;
  } finally {
    importBusy = false;
    submit.disabled = false;
    submit.textContent = '导入并生成星图';
  }
}

function beginGrowth() {
  const button = $('#grow');
  const label = button.querySelector('span');
  graph.cancelGrowth();
  button.disabled = true;
  $('#pet-replay').disabled = true;
  label.textContent = '点亮中…';
  const date = $('#atlas-date');
  const range = date.textContent;
  graph.grow(
    () => {
      label.textContent = '按时间点亮';
      button.disabled = false;
      $('#pet-replay').disabled = false;
      date.textContent = range;
    },
    (value) => {
      if (value) date.textContent = dateText(value);
    },
  );
}

$('#import-form').addEventListener('submit', importData);
$$('[data-dialog]').forEach((item) =>
  item.addEventListener('click', () => openDialog(item.dataset.dialog)),
);
$$('.close-dialog').forEach((item) =>
  item.addEventListener('click', () => item.closest('dialog').close()),
);
$$('dialog').forEach((dialog) =>
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  }),
);
$$('[data-import-mode]').forEach((item) =>
  item.addEventListener('click', () => {
    mode = item.dataset.importMode;
    $$('[data-import-mode]').forEach((tab) =>
      tab.setAttribute('aria-pressed', tab === item),
    );
    $('#drop-zone').hidden = mode !== 'file';
    $('#paste-zone').hidden = mode !== 'paste';
    $('#paste-date-zone').hidden = mode !== 'paste';
    $('#import-message').textContent = '';
  }),
);
$('#file-input').addEventListener('change', (event) =>
  setFiles(event.currentTarget.files),
);
$('#drop-zone').addEventListener('dragover', (event) => {
  event.preventDefault();
  event.currentTarget.classList.add('dragging');
});
$('#drop-zone').addEventListener('dragleave', (event) =>
  event.currentTarget.classList.remove('dragging'),
);
$('#drop-zone').addEventListener('drop', (event) => {
  event.preventDefault();
  event.currentTarget.classList.remove('dragging');
  setFiles(event.dataTransfer.files);
});
$('#toggle-dataset').addEventListener('change', (event) => {
  setDataset(event.target.value);
});
topicPets.forEach((pet, index) =>
  pet.addEventListener('click', () => exploreTopic(lastGraph?.themes[index])),
);
$('#pet-motion').addEventListener('click', (event) => {
  const paused = $('#pet-field').toggleAttribute('data-paused');
  const label = paused ? '播放桌宠动画' : '暂停桌宠动画';
  const control = event.currentTarget;
  control.setAttribute('aria-label', label);
  control.title = label;
  control
    .querySelector('use')
    .setAttribute('href', paused ? '#i-play' : '#i-pause');
});
$('#pet-timeline').addEventListener('click', () => {
  state.view = state.view === 'map' ? 'timeline' : 'map';
  render(false);
  $('#plot').scrollIntoView({ block: 'nearest' });
});
$('#pet-replay').addEventListener('click', () => {
  if (state.view !== 'map') {
    state.view = 'map';
    render(false);
  }
  $('#plot').scrollIntoView({ block: 'nearest' });
  beginGrowth();
});
$('#clear-data').addEventListener('click', () => {
  $('#clear-confirm').hidden = false;
  $('#confirm-clear').focus();
});
$('#cancel-clear').addEventListener('click', () => {
  $('#clear-confirm').hidden = true;
  $('#clear-data').focus();
});
$('#confirm-clear').addEventListener('click', async (event) => {
  const target = event.currentTarget;
  target.disabled = true;
  try {
    await writeArchive(null, state.archive.revision);
    state.archive = null;
    localStorage.setItem('atlas-sync-enabled', 'false');
    localStorage.removeItem('atlas-sync-time');
    $('#sync-enabled').checked = false;
    setDataset('sample');
    $('#privacy-dialog').close();
    toast('已清除所有本地导入数据');
  } catch (error) {
    $('#privacy-message').textContent = error.message;
  } finally {
    target.disabled = false;
  }
});
$$('[data-view]').forEach((item) =>
  item.addEventListener('click', () => {
    state.view = item.dataset.view;
    graph.cancelGrowth();
    render(false);
  }),
);
$$('[data-zoom]').forEach((item) =>
  item.addEventListener('click', () => graph.moveZoom(item.dataset.zoom)),
);
$('#grow').addEventListener('click', beginGrowth);
$('#search').addEventListener('input', (event) => {
  state.search = event.target.value;
  state.selected = null;
  render(false);
});
$('#importance').addEventListener('change', (event) => {
  state.importance = event.target.value;
  state.selected = null;
  render(false);
});
$('#review-language').addEventListener('click', () => {
  state.language = state.language === 'zh' ? 'en' : 'zh';
  renderReview();
});
addEventListener('hashchange', updateNav);
addEventListener('focus', async () => {
  try {
    const latest = await readArchive();
    if ((latest?.revision ?? null) !== (state.archive?.revision ?? null)) {
      state.archive = latest;
      if (latest) setDataset('personal');
      else setDataset('sample');
    }
  } catch {}
});
updateNav();
growth = mountGrowth({
  active,
  personal: () => state.archive,
  isPersonal: () => state.dataset === 'personal',
  reviewGraph: () => getGraph(active() ?? demo, state.review),
  period: () => state.period,
  reviewPeriod: () => state.review,
  busy: () => importBusy,
  setPeriod: (p) => {
    state.period = p;
    state.selected = null;
    render(true);
  },
  setReviewPeriod: (p) => {
    state.review = p;
    renderReview();
  },
  source,
  toast,
  save: async (archive) => {
    state.archive = await writeArchive(
      archive,
      state.archive?.revision ?? null,
    );
    render(false);
  },
  replace: async (archive) => {
    const prior = await readArchive();
    state.archive = await writeArchive(archive, prior?.revision ?? null);
    setDataset('personal');
  },
  importLive: async (conversation) => {
    if (importBusy) throw new Error('正在导入，请稍后再试');
    importBusy = true;
    try {
      const prior = await readArchive();
      if (prior?.trash?.some((s) => s.id === 'chat-' + conversation.id)) return;
      const result = await runImport(
        [
          {
            name: 'live.json',
            text: JSON.stringify({ ...conversation, source: 'live' }),
          },
        ],
        prior?.sessions ?? [],
        true,
      );
      if (result.failures.length) throw new Error(result.failures.join('；'));
      state.archive = await writeArchive(
        {
          ...prior,
          sessions: result.sessions,
          groups: result.groups,
          metrics: result.metrics,
        },
        prior?.revision ?? null,
      );
      setDataset('personal');
      toast('对话已同步，图谱和回顾已更新');
    } finally {
      importBusy = false;
    }
  },
});
$('#paste-date').value = new Date(
  Date.now() - new Date().getTimezoneOffset() * 60000,
)
  .toISOString()
  .slice(0, 10);
render(true);
try {
  state.archive = await readArchive();
  if (state.archive) setDataset('personal');
} catch (error) {
  toast('无法打开本地存储。' + error.message);
}
