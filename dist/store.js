let connection;
function openStore() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('memory-atlas', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('local');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}

export async function readArchive() {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const request = db.transaction('local').objectStore('local').get('archive');
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function writeArchive(data, expected) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('local', 'readwrite');
    const store = transaction.objectStore('local');
    const next = data ? { ...data, revision: crypto.randomUUID() } : null;
    let changed = false;
    const read = store.get('archive');
    read.onsuccess = () => {
      if ((read.result?.revision ?? null) !== expected) {
        changed = true;
        transaction.abort();
      } else if (next) {
        store.put(next, 'archive');
      } else {
        store.delete('archive');
      }
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onabort = () =>
      reject(
        changed
          ? new Error('档案刚在另一个标签页更新，请刷新后重试。')
          : (transaction.error ?? new Error('本地保存失败。')),
      );
  });
}
