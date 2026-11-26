import {
  backup,
  validateBackup,
  searchable,
  extractTakeaways,
  editSession,
  trashSession,
  restoreSession,
  scheduleReview,
  monthsFor,
} from './growth-core.js';
const $ = (s) => document.querySelector(s);
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const btn = (text, action, cls = 'button quiet') => {
  const b = el('button', text, cls);
  b.type = 'button';
  b.onclick = action;
  return b;
};
function download(content, name, type = 'application/json') {
  const u = URL.createObjectURL(new Blob([content], { type })),
    a = el('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function mountGrowth(api) {
  let search = '',
    page = 0,
    showTrash = false,
    busy = false;
  const safe =
    (fn) =>
    async (...args) => {
      try {
        await fn(...args);
      } catch (e) {
        api.toast(e.message);
      }
    };
  const mutate = (fn) =>
    safe(async () => {
      const a = api.personal();
      if (!a) throw new Error('请先导入自己的对话。');
      await api.save(fn(a));
    });
  function render() {
    const a = api.active(),
      personal = api.personal();
    if (!a) return;
    for (const [id, value] of [
      ['atlas-month', api.period()],
      ['review-month', api.reviewPeriod()],
    ]) {
      const select = $('#' + id);
      select.replaceChildren(
        new Option('近 7 天', '7'),
        new Option('近 30 天', '30'),
      );
      if (id === 'atlas-month') select.append(new Option('全部日期', 'all'));
      for (const month of monthsFor(a))
        select.append(new Option(month.replace('-', ' 年 ') + ' 月', month));
      select.value = value;
    }
    renderStudy();
    if ($('#archive-dialog').open) renderArchive();
    $('#sync-status').textContent = localStorage.getItem('atlas-sync-time')
      ? '上次接收：' +
        new Date(localStorage.getItem('atlas-sync-time')).toLocaleString(
          'zh-CN',
        )
      : '';
    const notes = $('#reflection-text');
    notes.value = api.isPersonal()
      ? (personal?.reflections?.[api.reviewPeriod()] ?? '')
      : '';
    $('#save-reflection').disabled = !api.isPersonal();
    notes.hidden = !api.isPersonal();
    $('#save-reflection').hidden = !api.isPersonal();
    $('#reflection-hint').hidden = api.isPersonal();
    renderEvidence();
  }
  function renderEvidence() {
    const box = $('#learning-evidence');
    box.replaceChildren();
    const sessions = api.reviewGraph().sessions;
    for (const s of [...sessions].reverse().slice(0, 6)) {
      const quotes = extractTakeaways(s);
      if (!quotes.length) continue;
      const item = el('article', null, 'evidence-card');
      item.append(
        btn(s.title, () => api.source(s), 'text-button'),
        el('p', quotes[0]),
      );
      box.append(item);
    }
    if (!box.childNodes.length)
      box.append(el('p', '保留原文的对话会在这里生成学习摘录。', 'muted'));
  }
  function renderArchive() {
    const a = api.personal();
    $('#archive-list').replaceChildren();
    const rows = [...(showTrash ? (a?.trash ?? []) : (a?.sessions ?? []))]
      .reverse()
      .filter((s) => searchable(s, search));
    page = Math.min(page, Math.max(0, Math.ceil(rows.length / 12) - 1));
    $('#archive-count').textContent =
      `${rows.length} 段${showTrash ? '已移除对话' : '对话'} · 第 ${page + 1} / ${Math.max(1, Math.ceil(rows.length / 12))} 页`;
    $('#archive-prev').disabled = page === 0;
    $('#archive-next').disabled = (page + 1) * 12 >= rows.length;
    $('#archive-trash').textContent = showTrash
      ? '查看档案'
      : '回收站 (' + (a?.trash?.length ?? 0) + ')';
    for (const s of rows.slice(page * 12, page * 12 + 12)) {
      const row = el('article', null, 'archive-row'),
        info = el('div');
      info.append(
        el('strong', s.title),
        el(
          'small',
          s.date ? new Date(s.date).toLocaleDateString('zh-CN') : '日期未知',
        ),
      );
      const actions = el('div', null, 'row-actions');
      if (showTrash)
        actions.append(
          btn(
            '恢复',
            mutate((a) => restoreSession(a, s.id)),
          ),
        );
      else
        actions.append(
          btn('打开', () => api.source(s)),
          btn(
            '移除',
            mutate((a) => trashSession(a, s.id)),
          ),
        );
      row.append(info, actions);
      $('#archive-list').append(row);
    }
    if (!rows.length)
      $('#archive-list').append(
        el('p', search ? '没有匹配的对话。' : '这里还没有对话。', 'empty-copy'),
      );
  }
  function renderStudy() {
    const a = api.personal(),
      list = $('#study-list');
    list.replaceChildren();
    const cards = Object.entries(a?.cards ?? {})
      .filter(([, c]) =>
        c.refs.some((id) => a.sessions.some((s) => s.id === id)),
      )
      .sort(([, a], [, b]) => a.due.localeCompare(b.due));
    $('#study-count').textContent = cards.length + ' 张复习卡';
    for (const [id, c] of cards.slice(0, 12)) {
      const due = new Date(c.due) <= new Date(),
        item = el('article', null, 'study-card'),
        actions = el('div', null, 'row-actions');
      item.append(
        el(
          'small',
          due
            ? '今天可以复习'
            : '下次：' + new Date(c.due).toLocaleDateString('zh-CN'),
        ),
        el('h3', c.label),
      );
      const details = el('details'),
        summary = el('summary', '回忆后，展开原文核对');
      details.append(summary);
      const source = a.sessions.find((s) => c.refs.includes(s.id));
      if (source) {
        const quotes = extractTakeaways(source);
        details.append(
          el(
            'p',
            quotes.join('\n') || '这段对话没有可展示的摘录，请打开来源索引。',
          ),
          btn('查看对话', () => api.source(source)),
        );
      }
      item.append(details);
      for (const [rating, label] of [
        ['again', '还没记住'],
        ['hard', '有点模糊'],
        ['good', '记住了'],
      ])
        actions.append(
          btn(
            label,
            mutate((a) => ({
              ...a,
              cards: { ...a.cards, [id]: scheduleReview(c, rating) },
            })),
          ),
        );
      actions.append(
        btn(
          '取消复习',
          mutate((a) => {
            const cards = { ...a.cards };
            delete cards[id];
            return { ...a, cards };
          }),
          'text-button muted',
        ),
      );
      item.append(actions);
      list.append(item);
    }
    if (!cards.length)
      list.append(
        el(
          'p',
          api.personal()
            ? '点开星图中的知识点，选择「加入复习」。'
            : '导入对话后，可把星图中的知识点加入复习。',
          'empty-copy',
        ),
      );
  }
  function sourceTools(s) {
    if (!api.personal()?.sessions.some((row) => row.id === s.id)) return;
    const form = el('form', null, 'source-edit');
    const title = el('input');
    title.value = s.title;
    title.required = true;
    title.maxLength = 140;
    title.setAttribute('aria-label', '对话标题');
    const date = el('input');
    date.type = 'date';
    date.setAttribute('aria-label', '对话日期');
    date.value = s.date
      ? new Date(
          new Date(s.date).getTime() -
            new Date(s.date).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 10)
      : '';
    const save = el('button', '保存标题和日期', 'button quiet');
    save.type = 'submit';
    form.append(title, date, save);
    form.onsubmit = safe(async (e) => {
      e.preventDefault();
      await api.save(
        editSession(api.personal(), s.id, {
          title: title.value,
          date: date.value
            ? new Date(date.value + 'T12:00:00').toISOString()
            : null,
        }),
      );
      $('#source-title').textContent = title.value;
      $('#source-date').textContent = date.value || '日期未知';
      api.toast('已更新对话');
    });
    const notes = el('textarea');
    notes.rows = 3;
    notes.maxLength = 10000;
    notes.placeholder = '我从这段对话中理解了什么？';
    notes.setAttribute('aria-label', '对话笔记');
    notes.value = api.personal()?.notes?.[s.id] ?? '';
    const saveNote = btn(
      '保存笔记',
      safe(async () => {
        const a = api.personal();
        await api.save({ ...a, notes: { ...a.notes, [s.id]: notes.value } });
        api.toast('笔记已保存');
      }),
    );
    const edit = el('details');
    edit.append(el('summary', '修改标题或日期'), form);
    const block = el('section', null, 'source-tools');
    block.append(el('h3', '对话笔记'), notes, saveNote, edit);
    $('#source-turns').append(block);
  }
  function nodeTools(node, container) {
    if (!api.isPersonal() || node.type === 'topic') return;
    const exists = api.personal()?.cards?.[node.id];
    container.append(
      btn(
        exists ? '已加入复习' : '加入复习',
        mutate((a) => ({
          ...a,
          cards: {
            ...a.cards,
            [node.id]: {
              ...exists,
              label: node.label,
              refs: node.refs,
              due: exists?.due ?? new Date().toISOString(),
              reps: exists?.reps ?? 0,
              interval: exists?.interval ?? 0,
            },
          },
        })),
      ),
    );
  }
  $('#archive-open').onclick = () => {
    $('#archive-dialog').showModal();
    renderArchive();
  };
  $('#archive-search').oninput = (e) => {
    search = e.target.value;
    page = 0;
    renderArchive();
  };
  $('#archive-prev').onclick = () => {
    page--;
    renderArchive();
  };
  $('#archive-next').onclick = () => {
    page++;
    renderArchive();
  };
  $('#archive-trash').onclick = () => {
    showTrash = !showTrash;
    page = 0;
    renderArchive();
  };
  $('#backup-export').onclick = safe(() => {
    if (!api.personal()) throw new Error('还没有可以备份的个人档案。');
    download(
      backup(api.personal()),
      'memory-atlas-backup-' + new Date().toISOString().slice(0, 10) + '.json',
    );
    api.toast('备份已下载，包含原文、笔记和复习进度。');
  });
  let pendingRestore = null;
  $('#backup-file').onchange = safe(async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 80 * 1024 * 1024) throw new Error('备份超过 80 MB。');
    pendingRestore = validateBackup(await f.text());
    $('#restore-message').textContent =
      '备份含 ' +
      pendingRestore.sessions.length +
      ' 段对话。恢复会替换当前档案，请先下载当前备份。';
    $('#restore-actions').hidden = false;
    e.target.value = '';
  });
  $('#restore-cancel').onclick = () => {
    pendingRestore = null;
    $('#restore-actions').hidden = true;
  };
  $('#restore-confirm').onclick = safe(async () => {
    if (!pendingRestore) return;
    await api.replace(pendingRestore);
    pendingRestore = null;
    $('#restore-actions').hidden = true;
    api.toast('备份已恢复');
    renderArchive();
  });
  $('#atlas-month').onchange = (e) => {
    if (e.target.value) api.setPeriod(e.target.value);
  };
  $('#review-month').onchange = (e) => {
    if (e.target.value) api.setReviewPeriod(e.target.value);
  };
  $('#save-reflection').onclick = safe(async () => {
    const a = api.personal();
    if (!a || !api.isPersonal()) return;
    await api.save({
      ...a,
      reflections: {
        ...a.reflections,
        [api.reviewPeriod()]: $('#reflection-text').value,
      },
    });
    api.toast('复盘已保存');
  });
  $('#export-review').onclick = () => {
    const a = api.active(),
      graph = api.reviewGraph();
    const copy = [
      '# Memory Atlas · ' + $('#review-title').textContent,
      '',
      ...$('#review-content').innerText.split('\n'),
      '',
      '## 学习摘录（来自原文，未做事实核验）',
    ];
    for (const s of graph.sessions) {
      const lines = extractTakeaways(s);
      if (lines.length)
        copy.push(
          '',
          '### ' + s.title,
          ...lines.map((x) => '> ' + x),
          '来源：' + s.id,
        );
    }
    const reflection = api.isPersonal()
      ? api.personal()?.reflections?.[api.reviewPeriod()]
      : null;
    if (reflection) copy.push('', '## 我的复盘', reflection);
    download(
      copy.join('\n'),
      'memory-atlas-review-' + api.reviewPeriod() + '.md',
      'text/markdown;charset=utf-8',
    );
  };
  $('#export-graph').onclick = () => {
    const svg = $('#graph').cloneNode(true);
    svg.removeAttribute('hidden');
    svg.setAttribute('style', 'width:1200px;height:686px;background:#241d2b');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '1200');
    svg.setAttribute('height', '686');
    const style = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'style',
    );
    style.textContent = [...document.styleSheets]
      .flatMap((s) => {
        try {
          return [...s.cssRules].map((r) => r.cssText);
        } catch {
          return [];
        }
      })
      .join('\n');
    svg.prepend(style);
    download(
      new XMLSerializer().serializeToString(svg),
      'memory-atlas-graph.svg',
      'image/svg+xml',
    );
  };
  $('#sync-enabled').checked =
    localStorage.getItem('atlas-sync-enabled') === 'true';
  $('#sync-enabled').onchange = (e) => {
    localStorage.setItem('atlas-sync-enabled', String(e.target.checked));
    api.toast(
      e.target.checked ? '已允许此浏览器接收扩展采集' : '已暂停接收扩展采集',
    );
  };
  // Extension bridge passes only validated messages from the exact same window/origin.
  window.addEventListener('message', async (e) => {
    if (
      e.source !== window ||
      e.origin !== location.origin ||
      e.data?.type !== 'ATLAS_CAPTURE'
    )
      return;
    const { requestId, conversation } = e.data;
    const answer = (ok, error) =>
      window.postMessage(
        { type: 'ATLAS_CAPTURE_RESULT', requestId, ok, error },
        location.origin,
      );
    if (localStorage.getItem('atlas-sync-enabled') !== 'true') {
      answer(false, '请在 Memory Atlas 的实时同步中开启接收');
      return;
    }
    if (busy || api.busy()) {
      answer(false, '正在整理，请稍后重试');
      return;
    }
    if (
      typeof requestId !== 'string' ||
      !conversation ||
      typeof conversation.id !== 'string' ||
      !Array.isArray(conversation.messages) ||
      conversation.messages.length > 5000 ||
      JSON.stringify(conversation).length > 2e6
    ) {
      answer(false, '对话格式或大小不受支持');
      return;
    }
    busy = true;
    try {
      await api.importLive(conversation);
      localStorage.setItem('atlas-sync-time', new Date().toISOString());
      render();
      answer(true);
    } catch (err) {
      answer(false, err.message);
    } finally {
      busy = false;
    }
  });
  return { render, sourceTools, nodeTools };
}
