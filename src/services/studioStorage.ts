import type { FilmProject } from '../types/studio';

export const DB_NAME = 'ai_film_studio_db';
export const DB_VERSION = 1;

export const PROJECTS_STORE = 'projects';
export const MEDIA_IMAGES_STORE = 'media_images';
export const MEDIA_AUDIO_STORE = 'media_audio';
export const APP_META_STORE = 'app_meta';

export const LEGACY_PROJECTS_STORAGE_KEY = 'ai_film_studio_projects_v1';
export const LEGACY_ACTIVE_PROJECT_ID_KEY = 'ai_film_studio_active_project_v1';
const MIGRATION_META_KEY = 'legacy_localstorage_migration_v1';
const ACTIVE_PROJECT_META_KEY = 'active_project_id';

const IMAGE_REF_PREFIX = '__idb_img__:';
const AUDIO_REF_PREFIX = '__idb_wav__:';

export type StorageAlertLevel = 'info' | 'warning' | 'error';

export type StorageAlertCode =
  | 'QUOTA_EXCEEDED'
  | 'NEAR_FULL'
  | 'IDB_UNAVAILABLE'
  | 'WRITE_FAILED'
  | 'READ_FAILED'
  | 'MIGRATION_FAILED'
  | 'MIGRATION_DONE';

export interface StorageCapacityInfo {
  supported: boolean;
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  remainingBytes: number;
  isNearFull: boolean;
  persisted: boolean | null;
}

export interface StorageStatusAlert {
  level: StorageAlertLevel;
  code: StorageAlertCode;
  message: string;
  capacity?: StorageCapacityInfo;
}

export interface StorageInitializationResult {
  projects: FilmProject[];
  activeProjectId: string | null;
  migratedCount: number;
  capacity: StorageCapacityInfo;
  alert: StorageStatusAlert | null;
}

interface StoredMediaRecord {
  key: string;
  projectId: string;
  mimeType: string;
  bytes: Uint8Array;
  byteLength: number;
  updatedAt: string;
}

interface AppMetaRecord {
  key: string;
  value: unknown;
}

export class StudioStorageError extends Error {
  code: StorageAlertCode;

  constructor(code: StorageAlertCode, message: string) {
    super(message);
    this.name = 'StudioStorageError';
    this.code = code;
  }
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const chunkSize = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return btoa(parts.join(''));
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const commaIdx = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || commaIdx < 0) return null;
  const header = dataUrl.slice(5, commaIdx);
  if (!header.includes(';base64')) return null;
  const mimeType = header.split(';')[0] || 'image/jpeg';
  const base64 = dataUrl.slice(commaIdx + 1);
  if (!base64) return null;
  return { mimeType, base64 };
}

function contentFingerprint(payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const step = payload.length > 4096 ? Math.floor(payload.length / 512) : 1;
  for (let i = 0; i < payload.length; i += step) {
    const code = payload.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const head = payload.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '');
  const tail = payload.slice(-8).replace(/[^a-zA-Z0-9]/g, '');
  return `${payload.length}_${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}_${head}${tail}`;
}

export function classifyStorageError(err: unknown, context: 'read' | 'write' | 'migrate'): StudioStorageError {
  if (err instanceof StudioStorageError) return err;
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  const lower = `${name} ${msg}`.toLowerCase();

  if (
    name === 'QuotaExceededError' ||
    lower.includes('quotaexceeded') ||
    lower.includes('quota exceeded') ||
    lower.includes('disk full') ||
    lower.includes('storage full')
  ) {
    return new StudioStorageError(
      'QUOTA_EXCEEDED',
      'Kapasitas penyimpanan perangkat penuh (QuotaExceededError). Data terbaru gagal disimpan ke IndexedDB. Proyek yang sudah ada tidak dihapus—silakan unduh atau hapus aset gambar/audio yang tidak diperlukan terlebih dahulu.'
    );
  }

  if (
    lower.includes('indexeddb tidak tersedia') ||
    lower.includes('securityerror') ||
    lower.includes('not allowed')
  ) {
    return new StudioStorageError(
      'IDB_UNAVAILABLE',
      'Browser membatasi akses IndexedDB (misalnya pada mode Incognito ketat atau penyimpanan terkunci). Gunakan mode browser normal agar proyek tersimpan permanen.'
    );
  }

  if (context === 'migrate') {
    return new StudioStorageError(
      'MIGRATION_FAILED',
      `Gagal memigrasikan data lama ke IndexedDB (${msg || 'kesalahan penyimpanan'}). Data lama di localStorage tetap dipertahankan.`
    );
  }
  if (context === 'read') {
    return new StudioStorageError(
      'READ_FAILED',
      `Gagal membaca data proyek dari IndexedDB (${msg || 'kesalahan baca'}).`
    );
  }
  return new StudioStorageError(
    'WRITE_FAILED',
    `Gagal menyimpan perubahan proyek ke IndexedDB (${msg || 'kesalahan tulis'}). Data Anda di layar tetap dipertahankan.`
  );
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

export interface StudioStorageRuntime {
  idbFactory?: IDBFactory;
  localStorage?: Storage;
  navigatorStorage?: StorageManager;
}

export function createStudioStorage(runtime?: StudioStorageRuntime) {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const getIdbFactory = (): IDBFactory => {
    const factory =
      runtime?.idbFactory ??
      (typeof globalThis !== 'undefined' ? globalThis.indexedDB : undefined);
    if (!factory) {
      throw new StudioStorageError(
        'IDB_UNAVAILABLE',
        'IndexedDB tidak tersedia pada peramban ini.'
      );
    }
    return factory;
  };

  const getLocalStorage = (): Storage | null => {
    if (runtime?.localStorage) return runtime.localStorage;
    try {
      return typeof globalThis !== 'undefined' && globalThis.localStorage
        ? globalThis.localStorage
        : null;
    } catch {
      return null;
    }
  };

  const getNavigatorStorage = (): StorageManager | undefined => {
    if (runtime?.navigatorStorage) return runtime.navigatorStorage;
    try {
      return typeof navigator !== 'undefined' ? navigator.storage : undefined;
    } catch {
      return undefined;
    }
  };

  const openDb = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let factory: IDBFactory;
      try {
        factory = getIdbFactory();
      } catch (err) {
        dbPromise = null;
        reject(err);
        return;
      }

      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(MEDIA_IMAGES_STORE)) {
          const imgStore = db.createObjectStore(MEDIA_IMAGES_STORE, { keyPath: 'key' });
          imgStore.createIndex('by_project', 'projectId', { unique: false });
        }
        if (!db.objectStoreNames.contains(MEDIA_AUDIO_STORE)) {
          const audStore = db.createObjectStore(MEDIA_AUDIO_STORE, { keyPath: 'key' });
          audStore.createIndex('by_project', 'projectId', { unique: false });
        }
        if (!db.objectStoreNames.contains(APP_META_STORE)) {
          db.createObjectStore(APP_META_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error || new Error('Gagal membuka database IndexedDB.'));
      };
      req.onblocked = () => {
        dbPromise = null;
        reject(new Error('Database IndexedDB sedang diblokir oleh tab lain.'));
      };
    });

    return dbPromise;
  };

  const closeDatabase = async (): Promise<void> => {
    if (!dbPromise) return;
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // Abaikan jika gagal terbuka
    } finally {
      dbPromise = null;
    }
  };

  const dehydrateProjectMedia = (project: FilmProject): {
    dehydrated: FilmProject;
    images: Map<string, StoredMediaRecord>;
    audios: Map<string, StoredMediaRecord>;
  } => {
    const images = new Map<string, StoredMediaRecord>();
    const audios = new Map<string, StoredMediaRecord>();
    const now = new Date().toISOString();

    const extractImageRef = (dataUrl?: string): string | undefined => {
      if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
      if (dataUrl.startsWith(IMAGE_REF_PREFIX)) return dataUrl;
      const parsed = parseImageDataUrl(dataUrl);
      if (!parsed) return dataUrl;
      const key = `${project.id}::img::${contentFingerprint(parsed.base64)}`;
      if (!images.has(key)) {
        const bytes = base64ToUint8Array(parsed.base64);
        images.set(key, {
          key,
          projectId: project.id,
          mimeType: parsed.mimeType,
          bytes,
          byteLength: bytes.byteLength,
          updatedAt: now,
        });
      }
      return `${IMAGE_REF_PREFIX}${key}`;
    };

    const extractAudioRef = (base64Wav: string, mimeType: string): string => {
      if (!base64Wav) return '';
      if (base64Wav.startsWith(AUDIO_REF_PREFIX)) return base64Wav;
      const key = `${project.id}::wav::${contentFingerprint(base64Wav)}`;
      if (!audios.has(key)) {
        const bytes = base64ToUint8Array(base64Wav);
        audios.set(key, {
          key,
          projectId: project.id,
          mimeType: mimeType || 'audio/wav',
          bytes,
          byteLength: bytes.byteLength,
          updatedAt: now,
        });
      }
      return `${AUDIO_REF_PREFIX}${key}`;
    };

    const dehydrated: FilmProject = {
      ...project,
      visualAssets: (project.visualAssets || []).map((asset) => ({
        ...asset,
        imageDataUrl: extractImageRef(asset.imageDataUrl) || '',
      })),
      characters: (project.characters || []).map((c) => ({
        ...c,
        referenceImageDataUrl: extractImageRef(c.referenceImageDataUrl),
        referenceSheet: c.referenceSheet
          ? {
              front: c.referenceSheet.front
                ? {
                    ...c.referenceSheet.front,
                    imageDataUrl: extractImageRef(c.referenceSheet.front.imageDataUrl),
                  }
                : undefined,
              side: c.referenceSheet.side
                ? {
                    ...c.referenceSheet.side,
                    imageDataUrl: extractImageRef(c.referenceSheet.side.imageDataUrl),
                  }
                : undefined,
              back: c.referenceSheet.back
                ? {
                    ...c.referenceSheet.back,
                    imageDataUrl: extractImageRef(c.referenceSheet.back.imageDataUrl),
                  }
                : undefined,
              fullBody: c.referenceSheet.fullBody
                ? {
                    ...c.referenceSheet.fullBody,
                    imageDataUrl: extractImageRef(c.referenceSheet.fullBody.imageDataUrl),
                  }
                : undefined,
            }
          : undefined,
      })),
      consistency: (project.consistency || []).map((g) => ({
        ...g,
        referenceImageDataUrl: extractImageRef(g.referenceImageDataUrl),
      })),
      scenes: (project.scenes || []).map((s) => ({
        ...s,
        imageDataUrl: extractImageRef(s.imageDataUrl),
      })),
      storyboard: (project.storyboard || []).map((f) => ({
        ...f,
        imageDataUrl: extractImageRef(f.imageDataUrl),
      })),
      visualPrompts: (project.visualPrompts || []).map((vp) => ({
        ...vp,
        sourceImageDataUrl: extractImageRef(vp.sourceImageDataUrl),
      })),
      voiceTracks: (project.voiceTracks || []).map((vt) => ({
        ...vt,
        audioBase64Wav: extractAudioRef(vt.audioBase64Wav, vt.mimeType),
      })),
    };

    return { dehydrated, images, audios };
  };

  const rehydrateProjectMedia = (
    stored: FilmProject,
    imageMap: Map<string, StoredMediaRecord>,
    audioMap: Map<string, StoredMediaRecord>
  ): FilmProject => {
    const decodedImageCache = new Map<string, string>();
    const decodedAudioCache = new Map<string, string>();

    const resolveImageRef = (val?: string): string | undefined => {
      if (!val || !val.startsWith(IMAGE_REF_PREFIX)) return val;
      const key = val.slice(IMAGE_REF_PREFIX.length);
      if (decodedImageCache.has(key)) return decodedImageCache.get(key);
      const rec = imageMap.get(key);
      if (!rec) return undefined;
      const dataUrl = `data:${rec.mimeType};base64,${uint8ArrayToBase64(rec.bytes)}`;
      decodedImageCache.set(key, dataUrl);
      return dataUrl;
    };

    const resolveAudioRef = (val: string): string => {
      if (!val || !val.startsWith(AUDIO_REF_PREFIX)) return val;
      const key = val.slice(AUDIO_REF_PREFIX.length);
      if (decodedAudioCache.has(key)) return decodedAudioCache.get(key)!;
      const rec = audioMap.get(key);
      if (!rec) return '';
      const b64 = uint8ArrayToBase64(rec.bytes);
      decodedAudioCache.set(key, b64);
      return b64;
    };

    return {
      ...stored,
      visualAssets: (stored.visualAssets || []).map((asset) => ({
        ...asset,
        imageDataUrl: resolveImageRef(asset.imageDataUrl) || '',
      })),
      characters: (stored.characters || []).map((c) => ({
        ...c,
        referenceImageDataUrl: resolveImageRef(c.referenceImageDataUrl),
        referenceSheet: c.referenceSheet
          ? {
              front: c.referenceSheet.front
                ? {
                    ...c.referenceSheet.front,
                    imageDataUrl: resolveImageRef(c.referenceSheet.front.imageDataUrl),
                  }
                : undefined,
              side: c.referenceSheet.side
                ? {
                    ...c.referenceSheet.side,
                    imageDataUrl: resolveImageRef(c.referenceSheet.side.imageDataUrl),
                  }
                : undefined,
              back: c.referenceSheet.back
                ? {
                    ...c.referenceSheet.back,
                    imageDataUrl: resolveImageRef(c.referenceSheet.back.imageDataUrl),
                  }
                : undefined,
              fullBody: c.referenceSheet.fullBody
                ? {
                    ...c.referenceSheet.fullBody,
                    imageDataUrl: resolveImageRef(c.referenceSheet.fullBody.imageDataUrl),
                  }
                : undefined,
            }
          : undefined,
      })),
      consistency: (stored.consistency || []).map((g) => ({
        ...g,
        referenceImageDataUrl: resolveImageRef(g.referenceImageDataUrl),
      })),
      scenes: (stored.scenes || []).map((s) => ({
        ...s,
        imageDataUrl: resolveImageRef(s.imageDataUrl),
      })),
      storyboard: (stored.storyboard || []).map((f) => ({
        ...f,
        imageDataUrl: resolveImageRef(f.imageDataUrl),
      })),
      visualPrompts: (stored.visualPrompts || []).map((vp) => ({
        ...vp,
        sourceImageDataUrl: resolveImageRef(vp.sourceImageDataUrl),
      })),
      voiceTracks: (stored.voiceTracks || []).map((vt) => ({
        ...vt,
        audioBase64Wav: resolveAudioRef(vt.audioBase64Wav),
      })),
    };
  };

  const saveProjectToDb = async (project: FilmProject): Promise<void> => {
    try {
      const db = await openDb();
      const { dehydrated, images, audios } = dehydrateProjectMedia(project);

      const tx = db.transaction(
        [PROJECTS_STORE, MEDIA_IMAGES_STORE, MEDIA_AUDIO_STORE],
        'readwrite'
      );
      const projStore = tx.objectStore(PROJECTS_STORE);
      const imgStore = tx.objectStore(MEDIA_IMAGES_STORE);
      const audStore = tx.objectStore(MEDIA_AUDIO_STORE);

      const existingImgKeys = (await requestToPromise(
        imgStore.index('by_project').getAllKeys(project.id)
      )) as string[];
      const existingAudKeys = (await requestToPromise(
        audStore.index('by_project').getAllKeys(project.id)
      )) as string[];

      const existingImgSet = new Set(existingImgKeys);
      const existingAudSet = new Set(existingAudKeys);

      // Hapus media yang tidak lagi dipakai proyek ini
      for (const oldKey of existingImgKeys) {
        if (!images.has(oldKey)) {
          imgStore.delete(oldKey);
        }
      }
      for (const oldKey of existingAudKeys) {
        if (!audios.has(oldKey)) {
          audStore.delete(oldKey);
        }
      }

      // Tulis media baru saja (lewati penulisan ulang blob biner yang sudah tersimpan identik)
      for (const [key, rec] of images.entries()) {
        if (!existingImgSet.has(key)) {
          imgStore.put(rec);
        }
      }
      for (const [key, rec] of audios.entries()) {
        if (!existingAudSet.has(key)) {
          audStore.put(rec);
        }
      }

      projStore.put(dehydrated);
      await transactionDone(tx);
    } catch (err) {
      throw classifyStorageError(err, 'write');
    }
  };

  const loadAllProjectsFromDb = async (): Promise<FilmProject[]> => {
    try {
      const db = await openDb();
      const tx = db.transaction(
        [PROJECTS_STORE, MEDIA_IMAGES_STORE, MEDIA_AUDIO_STORE],
        'readonly'
      );
      const [storedProjects, storedImages, storedAudios] = await Promise.all([
        requestToPromise(tx.objectStore(PROJECTS_STORE).getAll()) as Promise<FilmProject[]>,
        requestToPromise(tx.objectStore(MEDIA_IMAGES_STORE).getAll()) as Promise<StoredMediaRecord[]>,
        requestToPromise(tx.objectStore(MEDIA_AUDIO_STORE).getAll()) as Promise<StoredMediaRecord[]>,
      ]);
      await transactionDone(tx);

      const imageMap = new Map(storedImages.map((rec) => [rec.key, rec]));
      const audioMap = new Map(storedAudios.map((rec) => [rec.key, rec]));

      const hydrated = storedProjects.map((p) =>
        rehydrateProjectMedia(p, imageMap, audioMap)
      );
      hydrated.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return hydrated;
    } catch (err) {
      throw classifyStorageError(err, 'read');
    }
  };

  const loadSingleProjectFromDb = async (projectId: string): Promise<FilmProject | null> => {
    try {
      const db = await openDb();
      const tx = db.transaction(
        [PROJECTS_STORE, MEDIA_IMAGES_STORE, MEDIA_AUDIO_STORE],
        'readonly'
      );
      const [stored, imgs, auds] = await Promise.all([
        requestToPromise(tx.objectStore(PROJECTS_STORE).get(projectId)) as Promise<FilmProject | undefined>,
        requestToPromise(
          tx.objectStore(MEDIA_IMAGES_STORE).index('by_project').getAll(projectId)
        ) as Promise<StoredMediaRecord[]>,
        requestToPromise(
          tx.objectStore(MEDIA_AUDIO_STORE).index('by_project').getAll(projectId)
        ) as Promise<StoredMediaRecord[]>,
      ]);
      await transactionDone(tx);
      if (!stored) return null;
      return rehydrateProjectMedia(
        stored,
        new Map(imgs.map((r) => [r.key, r])),
        new Map(auds.map((r) => [r.key, r]))
      );
    } catch (err) {
      throw classifyStorageError(err, 'read');
    }
  };

  const deleteProjectFromDb = async (projectId: string): Promise<void> => {
    try {
      const db = await openDb();
      const tx = db.transaction(
        [PROJECTS_STORE, MEDIA_IMAGES_STORE, MEDIA_AUDIO_STORE],
        'readwrite'
      );
      const imgStore = tx.objectStore(MEDIA_IMAGES_STORE);
      const audStore = tx.objectStore(MEDIA_AUDIO_STORE);

      const [imgKeys, audKeys] = await Promise.all([
        requestToPromise(imgStore.index('by_project').getAllKeys(projectId)) as Promise<string[]>,
        requestToPromise(audStore.index('by_project').getAllKeys(projectId)) as Promise<string[]>,
      ]);
      for (const k of imgKeys) imgStore.delete(k);
      for (const k of audKeys) audStore.delete(k);
      tx.objectStore(PROJECTS_STORE).delete(projectId);
      await transactionDone(tx);
    } catch (err) {
      throw classifyStorageError(err, 'write');
    }
  };

  const getMeta = async <T = unknown>(key: string): Promise<T | null> => {
    const db = await openDb();
    const tx = db.transaction([APP_META_STORE], 'readonly');
    const rec = (await requestToPromise(
      tx.objectStore(APP_META_STORE).get(key)
    )) as AppMetaRecord | undefined;
    await transactionDone(tx);
    return rec ? (rec.value as T) : null;
  };

  const setMeta = async (key: string, value: unknown): Promise<void> => {
    try {
      const db = await openDb();
      const tx = db.transaction([APP_META_STORE], 'readwrite');
      tx.objectStore(APP_META_STORE).put({ key, value } satisfies AppMetaRecord);
      await transactionDone(tx);
    } catch (err) {
      throw classifyStorageError(err, 'write');
    }
  };

  const saveActiveProjectIdToDb = async (id: string): Promise<void> => {
    await setMeta(ACTIVE_PROJECT_META_KEY, id);
  };

  const loadActiveProjectIdFromDb = async (): Promise<string | null> => {
    try {
      const val = await getMeta<string>(ACTIVE_PROJECT_META_KEY);
      return typeof val === 'string' ? val : null;
    } catch {
      return null;
    }
  };

  const estimateStorageCapacity = async (): Promise<StorageCapacityInfo> => {
    const navStorage = getNavigatorStorage();
    let persisted: boolean | null = null;
    if (navStorage?.persisted) {
      try {
        persisted = await navStorage.persisted();
      } catch {
        persisted = null;
      }
    }

    if (navStorage?.estimate) {
      try {
        const est = await navStorage.estimate();
        const usageBytes = est.usage ?? 0;
        const quotaBytes = est.quota ?? 0;
        if (quotaBytes > 0) {
          const percentUsed = Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10);
          const remainingBytes = Math.max(0, quotaBytes - usageBytes);
          const isNearFull = percentUsed >= 80 || remainingBytes < 15 * 1024 * 1024;
          return {
            supported: true,
            usageBytes,
            quotaBytes,
            percentUsed,
            remainingBytes,
            isNearFull,
            persisted,
          };
        }
      } catch {
        // Fallback di bawah
      }
    }

    // Fallback perkiraan ukuran media IndexedDB jika navigator.storage.estimate tidak tersedia
    try {
      const db = await openDb();
      const tx = db.transaction(
        [PROJECTS_STORE, MEDIA_IMAGES_STORE, MEDIA_AUDIO_STORE],
        'readonly'
      );
      const [projs, imgs, auds] = await Promise.all([
        requestToPromise(tx.objectStore(PROJECTS_STORE).getAll()) as Promise<FilmProject[]>,
        requestToPromise(tx.objectStore(MEDIA_IMAGES_STORE).getAll()) as Promise<StoredMediaRecord[]>,
        requestToPromise(tx.objectStore(MEDIA_AUDIO_STORE).getAll()) as Promise<StoredMediaRecord[]>,
      ]);
      await transactionDone(tx);
      const metaBytes = JSON.stringify(projs).length * 2;
      const imgBytes = imgs.reduce((s, r) => s + (r.byteLength || r.bytes.byteLength), 0);
      const audBytes = auds.reduce((s, r) => s + (r.byteLength || r.bytes.byteLength), 0);
      return {
        supported: false,
        usageBytes: metaBytes + imgBytes + audBytes,
        quotaBytes: 0,
        percentUsed: 0,
        remainingBytes: 0,
        isNearFull: false,
        persisted,
      };
    } catch {
      return {
        supported: false,
        usageBytes: 0,
        quotaBytes: 0,
        percentUsed: 0,
        remainingBytes: 0,
        isNearFull: false,
        persisted,
      };
    }
  };

  const verifyProjectIntegrity = (source: FilmProject, persisted: FilmProject | null): boolean => {
    if (!persisted || persisted.id !== source.id) return false;
    if ((persisted.characters?.length || 0) !== (source.characters?.length || 0)) return false;
    if ((persisted.scenes?.length || 0) !== (source.scenes?.length || 0)) return false;
    if ((persisted.storyboard?.length || 0) !== (source.storyboard?.length || 0)) return false;
    if ((persisted.voiceTracks?.length || 0) !== (source.voiceTracks?.length || 0)) return false;
    if ((persisted.visualAssets?.length || 0) !== (source.visualAssets?.length || 0)) return false;

    for (let i = 0; i < (source.characters?.length || 0); i++) {
      if (
        (source.characters[i].referenceImageDataUrl || undefined) !==
        (persisted.characters[i].referenceImageDataUrl || undefined)
      ) {
        return false;
      }
      const srcSheet = source.characters[i].referenceSheet;
      const dstSheet = persisted.characters[i].referenceSheet;
      for (const viewKey of ['front', 'side', 'back', 'fullBody'] as const) {
        if (
          (srcSheet?.[viewKey]?.imageDataUrl || undefined) !==
          (dstSheet?.[viewKey]?.imageDataUrl || undefined)
        ) {
          return false;
        }
      }
    }
    for (let i = 0; i < (source.storyboard?.length || 0); i++) {
      if (
        (source.storyboard[i].imageDataUrl || undefined) !==
        (persisted.storyboard[i].imageDataUrl || undefined)
      ) {
        return false;
      }
    }
    for (let i = 0; i < (source.voiceTracks?.length || 0); i++) {
      if (source.voiceTracks[i].audioBase64Wav !== persisted.voiceTracks[i].audioBase64Wav) {
        return false;
      }
    }
    return true;
  };

  const migrateLegacyLocalStorage = async (): Promise<{
    migratedCount: number;
    legacyActiveId: string | null;
  }> => {
    const ls = getLocalStorage();
    if (!ls) return { migratedCount: 0, legacyActiveId: null };

    const rawProjects = ls.getItem(LEGACY_PROJECTS_STORAGE_KEY);
    const legacyActiveId = ls.getItem(LEGACY_ACTIVE_PROJECT_ID_KEY);
    if (!rawProjects) {
      if (legacyActiveId) {
        const existingActive = await loadActiveProjectIdFromDb();
        if (!existingActive) {
          await saveActiveProjectIdToDb(legacyActiveId);
        }
        ls.removeItem(LEGACY_ACTIVE_PROJECT_ID_KEY);
      }
      return { migratedCount: 0, legacyActiveId };
    }

    let parsedLegacy: FilmProject[];
    try {
      const parsed = JSON.parse(rawProjects);
      parsedLegacy = Array.isArray(parsed) ? parsed : [];
    } catch {
      return { migratedCount: 0, legacyActiveId };
    }

    if (parsedLegacy.length === 0) {
      ls.removeItem(LEGACY_PROJECTS_STORAGE_KEY);
      if (legacyActiveId) ls.removeItem(LEGACY_ACTIVE_PROJECT_ID_KEY);
      return { migratedCount: 0, legacyActiveId };
    }

    const migrationMarker = await getMeta<{ completed?: boolean; projectIds?: string[] }>(
      MIGRATION_META_KEY
    );

    const existingProjects = await loadAllProjectsFromDb();
    const existingIds = new Set(existingProjects.map((p) => p.id));

    if (migrationMarker?.completed && parsedLegacy.every((p) => existingIds.has(p.id))) {
      // Sudah pernah terverifikasi & tidak ada proyek baru di localStorage; bersihkan sisa agar bebas duplikasi
      ls.removeItem(LEGACY_PROJECTS_STORAGE_KEY);
      if (legacyActiveId) ls.removeItem(LEGACY_ACTIVE_PROJECT_ID_KEY);
      return { migratedCount: 0, legacyActiveId };
    }

    let migratedCount = 0;
    const migratedIds: string[] = [];

    for (const rawProj of parsedLegacy) {
      if (!rawProj || typeof rawProj.id !== 'string') continue;

      const normalized: FilmProject = {
        ...rawProj,
        characters: (rawProj.characters || []).map((c, idx) => ({
          ...c,
          id: c.id || `char_legacy_${idx}_${rawProj.id}`,
        })),
        consistency: rawProj.consistency || [],
        scenes: rawProj.scenes || [],
        script: rawProj.script || [],
        storyboard: rawProj.storyboard || [],
        visualPrompts: rawProj.visualPrompts || [],
        visualAssets: rawProj.visualAssets || [],
        voiceTracks: rawProj.voiceTracks || [],
      };

      if (existingIds.has(normalized.id)) {
        // Cegah duplikasi proyek yang sudah ada di IndexedDB
        continue;
      }

      await saveProjectToDb(normalized);
      const readBack = await loadSingleProjectFromDb(normalized.id);
      if (!verifyProjectIntegrity(normalized, readBack)) {
        throw new StudioStorageError(
          'MIGRATION_FAILED',
          `Verifikasi integritas data gagal saat memigrasikan proyek "${normalized.input?.title || normalized.id}". Data lama di localStorage tetap dipertahankan.`
        );
      }

      existingIds.add(normalized.id);
      migratedIds.push(normalized.id);
      migratedCount += 1;
    }

    if (legacyActiveId) {
      const existingActive = await loadActiveProjectIdFromDb();
      if (!existingActive) {
        await saveActiveProjectIdToDb(legacyActiveId);
      }
    }

    await setMeta(MIGRATION_META_KEY, {
      completed: true,
      completedAt: new Date().toISOString(),
      projectIds: migratedIds,
    });

    // Hapus data lama HANYA setelah migrasi & verifikasi selesai sukses
    ls.removeItem(LEGACY_PROJECTS_STORAGE_KEY);
    if (legacyActiveId) {
      ls.removeItem(LEGACY_ACTIVE_PROJECT_ID_KEY);
    }

    return { migratedCount, legacyActiveId };
  };

  const initializeStudioStorage = async (
    createFallbackProject: () => FilmProject
  ): Promise<StorageInitializationResult> => {
    try {
      const navStorage = getNavigatorStorage();
      if (navStorage?.persist) {
        navStorage.persist().catch(() => false);
      }

      const migration = await migrateLegacyLocalStorage();
      let projects = await loadAllProjectsFromDb();

      if (projects.length === 0) {
        const fresh = createFallbackProject();
        await saveProjectToDb(fresh);
        await saveActiveProjectIdToDb(fresh.id);
        projects = [fresh];
      }

      let activeProjectId = await loadActiveProjectIdFromDb();
      if (!activeProjectId || !projects.some((p) => p.id === activeProjectId)) {
        activeProjectId =
          migration.legacyActiveId && projects.some((p) => p.id === migration.legacyActiveId)
            ? migration.legacyActiveId
            : projects[0].id;
        await saveActiveProjectIdToDb(activeProjectId);
      }

      const capacity = await estimateStorageCapacity();
      let alert: StorageStatusAlert | null = null;
      if (capacity.isNearFull) {
        alert = {
          level: 'warning',
          code: 'NEAR_FULL',
          capacity,
          message: `Penyimpanan browser hampir penuh (${capacity.percentUsed}% terpakai). Sebaiknya unduh atau rapikan aset visual/audio lama agar proyek berikutnya tetap tersimpan lancar.`,
        };
      }

      return {
        projects,
        activeProjectId,
        migratedCount: migration.migratedCount,
        capacity,
        alert,
      };
    } catch (err) {
      const storageErr = classifyStorageError(err, 'migrate');

      // Fallback darurat baca-saja dari localStorage jika IndexedDB gagal agar data lama tetap terlihat
      const ls = getLocalStorage();
      let emergencyProjects: FilmProject[] = [];
      let emergencyActiveId: string | null = null;
      if (ls) {
        try {
          const raw = ls.getItem(LEGACY_PROJECTS_STORAGE_KEY);
          const parsed = raw ? JSON.parse(raw) : [];
          if (Array.isArray(parsed)) emergencyProjects = parsed;
          emergencyActiveId = ls.getItem(LEGACY_ACTIVE_PROJECT_ID_KEY);
        } catch {
          // Abaikan JSON rusak
        }
      }

      if (emergencyProjects.length === 0) {
        const fresh = createFallbackProject();
        emergencyProjects = [fresh];
        emergencyActiveId = fresh.id;
      }

      return {
        projects: emergencyProjects,
        activeProjectId: emergencyActiveId || emergencyProjects[0].id,
        migratedCount: 0,
        capacity: {
          supported: false,
          usageBytes: 0,
          quotaBytes: 0,
          percentUsed: 0,
          remainingBytes: 0,
          isNearFull: false,
          persisted: null,
        },
        alert: {
          level: 'error',
          code: storageErr.code,
          message: storageErr.message,
        },
      };
    }
  };

  return {
    openDb,
    closeDatabase,
    saveProjectToDb,
    loadAllProjectsFromDb,
    loadSingleProjectFromDb,
    deleteProjectFromDb,
    saveActiveProjectIdToDb,
    loadActiveProjectIdFromDb,
    migrateLegacyLocalStorage,
    initializeStudioStorage,
    estimateStorageCapacity,
    getMeta,
  };
}

export const studioStorage = createStudioStorage();

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
