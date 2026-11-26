import { mergeLive } from './growth-core.js';
import { parseInput } from './importers.js';
import { cluster, profileSession } from './analysis.js';

self.addEventListener(
  'message',
  async ({ data: { inputs, existing, retain } }) => {
    try {
      const sessions = new Map(
        existing.map((session) => [session.id, session]),
      );
      const fingerprints = new Map(
        existing.map((session) => [session.fingerprint, session.id]),
      );
      const failures = [];
      const imported = new Set();
      const replaced = {};
      for (const input of inputs) {
        const name = input.name ?? null;
        try {
          const text =
            typeof input.text === 'function' ? await input.text() : input.text;
          const rows = parseInput({ name, text });
          for (let row of rows) {
            if(row.source==='live') row=mergeLive(sessions.get(row.id),row);
            const duplicate = fingerprints.get(row.fingerprint);
            const sameId = sessions.get(row.id);
            if (sameId && sameId.fingerprint !== row.fingerprint)
              fingerprints.delete(sameId.fingerprint);
            const prior = sessions.get(duplicate);
            // Keep official stable IDs and known dates when the same text was also pasted.
            const id =
              sameId?.id ??
              (row.id.startsWith('chat-') ? row.id : duplicate) ??
              row.id;
            if (duplicate && duplicate !== id) {
              sessions.delete(duplicate);
              imported.delete(duplicate);
              replaced[duplicate] = id;
            }
            const normalized = {
              ...row,
              id,
              date: row.date ?? prior?.date ?? null,
              title:
                prior?.id.startsWith('chat-') && !row.id.startsWith('chat-')
                  ? prior.title
                  : row.title,
            };
            const overrides=sameId?.overrides??prior?.overrides;
            sessions.set(id, {...profileSession({...normalized,...overrides}, retain),...(overrides?{overrides}:{})});
            fingerprints.set(row.fingerprint, id);
            imported.add(id);
          }
        } catch (error) {
          failures.push((name ? name + ' · ' : '') + error.message);
        }
      }
      if (!imported.size)
        throw new Error(failures.join('\n') || '没有找到可导入的对话。');
      const all = [...sessions.values()].sort(
        (a, b) =>
          (a.date ?? '').localeCompare(b.date ?? '') ||
          a.id.localeCompare(b.id),
      );
      const { groups, metrics } = cluster(all);
      self.postMessage({
        sessions: all,
        groups,
        metrics,
        imported: imported.size,
        failures,
        replaced,
      });
    } catch (error) {
      self.postMessage({ error: error.message });
    }
  },
);
