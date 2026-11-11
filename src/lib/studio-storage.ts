import type { ArticleDraft } from './studio-content';
let database: Promise<IDBDatabase> | undefined;
function open() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('bohemia-writing-room-v1', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('drafts', { keyPath: 'id' }); request.result.createObjectStore('preferences'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('当前浏览器无法保存本机草稿，请下载 Markdown 备份。'));
    request.onblocked = () => reject(new Error('请关闭其他写作台标签页后重试。'));
  });
  return database;
}
export async function readDrafts() {
  const db = await open();
  return new Promise<{ drafts: ArticleDraft[]; last?: string }>((resolve, reject) => {
    const transaction = db.transaction(['drafts', 'preferences'], 'readonly');
    const drafts = transaction.objectStore('drafts').getAll();
    const last = transaction.objectStore('preferences').get('last');
    transaction.oncomplete = () => resolve({ drafts: drafts.result, last: last.result });
    transaction.onerror = () => reject(transaction.error);
  });
}
export async function storeDraft(draft: ArticleDraft) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['drafts', 'preferences'], 'readwrite');
    transaction.objectStore('drafts').put(draft);
    transaction.objectStore('preferences').put(draft.id, 'last');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('本机草稿保存失败，请下载 Markdown 备份后继续。'));
    transaction.onabort = () => reject(new Error('本机草稿未保存，请下载 Markdown 备份后继续。'));
  });
}

export async function deleteDraft(id: string) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['drafts', 'preferences'], 'readwrite');
    transaction.objectStore('drafts').delete(id);
    const preferences = transaction.objectStore('preferences');
    const last = preferences.get('last');
    last.onsuccess = () => { if (last.result === id) preferences.delete('last'); };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('本机草稿未能移除，请稍后重试。'));
    transaction.onabort = () => reject(new Error('本机草稿未能移除，请稍后重试。'));
  });
}
