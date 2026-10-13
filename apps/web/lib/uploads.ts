export type SavedUpload = { id: string; name: string; src: string; createdAt: string };
let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('gradesign-uploads', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', {keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {database=undefined; reject(new Error('Uploads could not be saved in this browser.'));};
  });
}
async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve,reject) => {
    const tx=db.transaction('images',mode);
    const request=action(tx.objectStore('images'));
    tx.oncomplete=()=>resolve(request.result);
    tx.onabort=()=>reject(tx.error ?? new Error('Upload storage is full or unavailable.'));
    tx.onerror=()=>{};
  });
}
export async function listUploads(): Promise<SavedUpload[]> {
  const images = await transact<SavedUpload[]>('readonly',store=>store.getAll());
  return images.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function saveUpload(image: SavedUpload) { await transact('readwrite',store=>store.put(image)); }
export async function deleteUpload(id: string) { await transact('readwrite',store=>store.delete(id)); }
