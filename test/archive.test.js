import assert from 'node:assert/strict';
import test from 'node:test';
import { assemble, cluster, profileSession } from '../dist/analysis.js';
import { sampleArchive } from '../dist/demo.js';
import { fromHTML, fromJSON, fromText } from '../dist/importers.js';

const message = (role, text) => ({
  author: { role },
  content: { parts: [text] },
});
const mapping = {
  root: { id: 'root', children: ['user'] },
  user: {
    id: 'user',
    parent: 'root',
    children: ['visible', 'alternate'],
    message: message('user', '什么是 Duration？'),
  },
  visible: {
    id: 'visible',
    parent: 'user',
    children: [],
    message: message('assistant', '久期衡量利率敏感度。'),
  },
  alternate: {
    id: 'alternate',
    parent: 'user',
    children: [],
    message: message('assistant', '备用分支'),
  },
};
const exporter = [
  {
    id: 'fixture',
    title: '债券久期',
    create_time: 1795507200,
    current_node: 'visible',
    mapping,
  },
];

test('JSON and export HTML use the same active branch and stable ID', () => {
  const json = fromJSON('\uFEFF' + JSON.stringify(exporter));
  const html = fromHTML(
    '<html><script>var jsonData = ' +
      JSON.stringify(exporter) +
      ';</script></html>',
  );
  assert.deepEqual(html, json);
  assert.equal(json[0].id, 'chat-fixture');
  assert.deepEqual(
    json[0].turns.map((turn) => turn.text),
    ['什么是 Duration？', '久期衡量利率敏感度。'],
  );
});

test('pasted Markdown preserves speaker order and explicit session dates', () => {
  const rows = fromText(
    '日期：2026-11-12\n# 久期\n**你**：什么是久期？\n**ChatGPT**：这是债券风险指标。\n---\n# 复盘\n日期：2026-11-14\nYou said:\nHow can I remember duration?\nChatGPT said:\nTry spaced repetition.',
  );
  assert.deepEqual(
    rows.map((row) => row.title),
    ['久期', '复盘'],
  );
  assert.deepEqual(
    rows.map((row) => row.turns.map((turn) => turn.role)),
    [
      ['user', 'assistant'],
      ['user', 'assistant'],
    ],
  );
  assert.ok(rows[0].date < rows[1].date);
});

test('untrusted HTML is reduced to text without executing or resolving resources', () => {
  const [row] = fromHTML(
    '<script>fetch("https://example.test")</script><div data-message-author-role="user">What is Beta? &lt;test&gt;<img src="https://example.test/x"></div><div data-message-author-role="assistant">A measure of systematic risk.</div>',
  );
  assert.equal(row.turns[0].text, 'What is Beta? <test>');
  assert.equal(row.turns[1].role, 'assistant');
});

test('structured-only records have no raw assistant text and still yield topics and entities', () => {
  const [session] = fromJSON(exporter);
  const profile = profileSession(session, false);
  assert.equal(Object.hasOwn(profile, 'turns'), false);
  assert.ok(!JSON.stringify(profile).includes('久期衡量利率敏感度。'));
  const { groups } = cluster([profile]);
  const graph = assemble([profile], groups);
  assert.ok(graph.nodes.some((node) => node.label === 'Duration'));
  assert.ok(graph.edges.some((edge) => edge.type === 'belongs_to'));
});

test('dated follow-ups link related questions and can resolve an earlier task', () => {
  const rows = fromText(
    '日期：2026-11-11\n我：如何比较债券的久期？我之后要完成债券久期比较练习。\nChatGPT：先整理票息和现金流。\n---\n日期：2026-11-13\n我：如何比较债券的久期和收益率？我已经完成债券久期比较练习。',
  );
  const sessions = rows.map((row) => profileSession(row, true));
  const { groups } = cluster(sessions);
  const graph = assemble(sessions, groups);
  assert.ok(graph.edges.some((edge) => edge.type === 'leads_to'));
  assert.equal(graph.nodes.find((node) => node.type === 'loop').resolved, true);
});

test('sample metrics and the full graph reference real sample conversations', () => {
  const { sessions, groups, metrics } = sampleArchive();
  const graph = assemble(sessions, groups);
  assert.equal(sessions.length, 18);
  assert.equal(groups.length, 5);
  assert.equal(metrics.count, 18);
  assert.ok(
    Number.isFinite(metrics.primary) && Number.isFinite(metrics.baseline),
  );
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.ok(graph.edges.every(({ from, to }) => ids.has(from) && ids.has(to)));
  assert.ok(
    graph.nodes.some(
      (node) => node.type === 'question' && node.threadCount > 1,
    ),
  );
});
