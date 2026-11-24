import type {
  ApiErrorCategory,
  ConsistencyGuide,
  FilmFormInput,
  FilmProject,
  GeneratedCharacter,
  GeneratedScene,
  ModelCapabilityReport,
  ScriptBlock,
  StoryResult,
  StoryboardFrame,
  StudioCapabilities,
  StudioErrorDetails,
  VisualPromptSpec,
} from '../types/studio';

export class StudioApiError extends Error {
  category: ApiErrorCategory;
  httpStatus: number;
  retryable: boolean;
  attempts: number;
  fallbackAttempted: boolean;

  constructor(details: StudioErrorDetails & { httpStatus: number }) {
    super(details.message);
    this.name = 'StudioApiError';
    this.category = details.category;
    this.httpStatus = details.httpStatus;
    this.retryable = details.retryable;
    this.attempts = details.attempts ?? 1;
    this.fallbackAttempted = details.fallbackAttempted ?? false;
  }
}

export function toStudioErrorDetails(err: unknown): StudioErrorDetails {
  if (err instanceof StudioApiError) {
    return {
      message: err.message,
      category: err.category,
      httpStatus: err.httpStatus,
      retryable: err.retryable,
      attempts: err.attempts,
      fallbackAttempted: err.fallbackAttempted,
    };
  }
  if (err instanceof Error) {
    return {
      message: err.message,
      category: 'UNKNOWN',
      retryable: true,
    };
  }
  return {
    message: 'Terjadi kesalahan yang tidak diketahui.',
    category: 'UNKNOWN',
    retryable: true,
  };
}

export function createEmptyInput(): FilmFormInput {
  return {
    title: '',
    premise: '',
    genre: 'Drama',
    characters: [
      { id: 'char_1', name: '', role: 'Protagonis', trait: '' },
      { id: 'char_2', name: '', role: 'Antagonis / Pendukung', trait: '' },
    ],
    episodeCount: 1,
    sceneCount: 4,
    dialogueLanguage: 'Bahasa Indonesia',
    videoDuration: '60 detik',
    visualStyle: 'Sinematik Gelap',
  };
}

export function createNewProject(input?: Partial<FilmFormInput>): FilmProject {
  const now = new Date().toISOString();
  return {
    id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    updatedAt: now,
    input: { ...createEmptyInput(), ...input },
    story: null,
    characters: [],
    consistency: [],
    scenes: [],
    script: [],
    storyboard: [],
    visualPrompts: [],
    visualAssets: [],
    voiceTracks: [],
  };
}

// Penyimpanan utama telah bermigrasi ke IndexedDB (src/services/studioStorage.ts).
// Fungsi berikut dipertahankan hanya untuk pembacaan darurat/referensi kunci lama tanpa menulis media ke localStorage.
export function loadProjectsFromStorage(): FilmProject[] {
  try {
    const raw = localStorage.getItem('ai_film_studio_projects_v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadActiveProjectId(): string | null {
  try {
    return localStorage.getItem('ai_film_studio_active_project_v1');
  } catch {
    return null;
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new StudioApiError({
      message:
        'Koneksi ke server studio gagal atau terputus. Periksa jaringan Anda lalu klik Coba Lagi. Data formulir Anda tetap aman.',
      category: 'NETWORK',
      httpStatus: 0,
      retryable: true,
      attempts: 1,
      fallbackAttempted: false,
    });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new StudioApiError({
      message: data.error || `Permintaan gagal dengan status HTTP ${res.status}.`,
      category: (data.category as ApiErrorCategory) || (res.status === 503 ? 'HIGH_DEMAND' : res.status === 429 ? 'QUOTA' : 'UNKNOWN'),
      httpStatus: res.status,
      retryable: typeof data.retryable === 'boolean' ? data.retryable : res.status >= 500 || res.status === 429,
      attempts: typeof data.attempts === 'number' ? data.attempts : 1,
      fallbackAttempted: Boolean(data.fallbackAttempted),
    });
  }
  return data as T;
}

export async function fetchCapabilities(): Promise<StudioCapabilities> {
  const res = await fetch('/api/studio/capabilities');
  if (!res.ok) {
    throw new Error('Gagal memeriksa kapabilitas studio.');
  }
  return res.json();
}

export async function fetchModelCapabilityReport(): Promise<ModelCapabilityReport> {
  const res = await fetch('/api/studio/model-capabilities');
  if (!res.ok) {
    throw new Error('Gagal memeriksa daftar dan kemampuan model Gemini API.');
  }
  return res.json();
}

export async function fetchAndroidFiles(): Promise<Array<{ path: string; content: string }>> {
  const res = await fetch('/api/android-files');
  if (!res.ok) {
    throw new Error('Gagal memuat berkas sumber Android Kotlin.');
  }
  const data = await res.json();
  return data.files || [];
}

export type StoryRegenerateSection =
  | 'all'
  | 'title_logline'
  | 'synopsis_world'
  | 'conflicts'
  | 'ending'
  | 'episodes';

export function apiGenerateStory(
  input: FilmFormInput,
  options?: {
    characters?: GeneratedCharacter[];
    consistency?: ConsistencyGuide[];
    existingStory?: StoryResult | null;
    targetSection?: StoryRegenerateSection;
  }
) {
  return postJson<{ story: StoryResult; modelUsed?: string }>('/api/studio/story', {
    input,
    characters: options?.characters || [],
    consistency: options?.consistency || [],
    existingStory: options?.existingStory || null,
    targetSection: options?.targetSection || 'all',
  });
}

export function apiGenerateCharacters(input: FilmFormInput, storySummary?: string) {
  return postJson<{ characters: GeneratedCharacter[] }>('/api/studio/characters', { input, storySummary });
}

export function apiGenerateConsistency(input: FilmFormInput, characters: GeneratedCharacter[]) {
  return postJson<{ consistency: ConsistencyGuide[] }>('/api/studio/consistency', { input, characters });
}

export function apiGenerateScenes(
  input: FilmFormInput,
  storySummary?: string,
  characters?: GeneratedCharacter[],
  options?: {
    story?: StoryResult | null;
    script?: ScriptBlock[];
    consistency?: ConsistencyGuide[];
    targetSceneNumber?: number;
  }
) {
  return postJson<{ scenes: GeneratedScene[]; modelUsed?: string }>('/api/studio/scenes', {
    input,
    storySummary,
    characters,
    story: options?.story || undefined,
    script: options?.script || [],
    consistency: options?.consistency || [],
    targetSceneNumber: options?.targetSceneNumber,
  });
}

export function apiGenerateScript(
  input: FilmFormInput,
  scenes: GeneratedScene[],
  characters: GeneratedCharacter[],
  options?: {
    story?: StoryResult | null;
    consistency?: ConsistencyGuide[];
    targetSceneNumber?: number;
    existingScript?: ScriptBlock[];
  }
) {
  return postJson<{ script: ScriptBlock[]; modelUsed?: string }>('/api/studio/script', {
    input,
    scenes,
    characters,
    story: options?.story || undefined,
    consistency: options?.consistency || [],
    targetSceneNumber: options?.targetSceneNumber,
    existingScript: options?.existingScript || [],
  });
}

export function apiGenerateStoryboard(
  input: FilmFormInput,
  scenes: GeneratedScene[],
  consistency: ConsistencyGuide[],
  options?: {
    story?: StoryResult | null;
    script?: ScriptBlock[];
    characters?: GeneratedCharacter[];
    panelCount?: number;
    aspectRatio?: '16:9' | '9:16' | '1:1';
    targetSceneNumber?: number;
    targetFrameNumber?: number;
    existingPanel?: StoryboardFrame | null;
    existingScenePanels?: StoryboardFrame[];
  }
) {
  return postJson<{ storyboard: StoryboardFrame[]; modelUsed?: string }>('/api/studio/storyboard', {
    input,
    scenes,
    consistency,
    story: options?.story || undefined,
    script: options?.script || [],
    characters: options?.characters || [],
    panelCount: options?.panelCount,
    aspectRatio: options?.aspectRatio,
    targetSceneNumber: options?.targetSceneNumber,
    targetFrameNumber: options?.targetFrameNumber,
    existingPanel: options?.existingPanel || null,
    existingScenePanels: options?.existingScenePanels || [],
  });
}

export function apiGenerateVisualPrompt(payload: {
  type: 'image' | 'video';
  input: FilmFormInput;
  subject: string;
  aspectRatio: string;
  durationOrResolution: string;
  consistency: ConsistencyGuide[];
  sceneNumber?: number;
  inputMode?: 'prompt' | 'image';
  hasSourceImage?: boolean;
}) {
  return postJson<{ spec: VisualPromptSpec }>('/api/studio/visual-prompt', payload);
}

export function apiGenerateCharacterVisualPrompt(payload: {
  input: FilmFormInput;
  character: GeneratedCharacter;
  characterId?: string;
  consistency?: ConsistencyGuide;
  aspectRatio: string;
}) {
  return postJson<{ spec: VisualPromptSpec; modelUsed: string; characterId?: string }>(
    '/api/studio/character-image-prompt',
    {
      ...payload,
      characterId: payload.characterId || payload.character.id,
    }
  );
}

export function apiGenerateCharacterImage(payload: {
  input: FilmFormInput;
  character: GeneratedCharacter;
  characterId?: string;
  consistency?: ConsistencyGuide;
  promptOverride?: string;
  aspectRatio: string;
  resolution?: string;
}) {
  return postJson<{
    imageDataUrl: string;
    mimeType: string;
    promptUsed: string;
    modelUsed: string;
    characterId?: string;
  }>('/api/studio/generate-character-image', {
    ...payload,
    characterId: payload.characterId || payload.character.id,
  });
}

export function apiGenerateSceneImage(payload: {
  input: FilmFormInput;
  scene?: GeneratedScene;
  prompt: string;
  aspectRatio: string;
  resolution?: string;
  consistency: ConsistencyGuide[];
  referenceImages?: Array<{ name: string; dataUrl: string }>;
}) {
  return postJson<{
    imageDataUrl: string;
    mimeType: string;
    promptUsed: string;
    modelUsed: string;
  }>('/api/studio/generate-scene-image', payload);
}

export function apiAttemptRenderImage(payload: {
  prompt: string;
  aspectRatio: string;
  sceneNumber?: number;
  referenceImages?: string[];
}) {
  return postJson<{ imageDataUrl: string; mimeType?: string; modelUsed: string }>(
    '/api/studio/render-image',
    payload
  );
}

export function apiAttemptRenderVideo(payload: {
  prompt: string;
  aspectRatio: string;
  duration: string;
  sceneNumber?: number;
  sourceImageDataUrl?: string;
}) {
  return postJson<{ videoDataUrl: string; modelUsed: string }>('/api/studio/render-video', payload);
}

export function apiGenerateVoice(payload: {
  mode: 'single' | 'multi';
  text: string;
  style?: string;
  voiceName?: string;
  speakerOneName?: string;
  speakerOneVoice?: string;
  speakerOneStyle?: string;
  speakerTwoName?: string;
  speakerTwoText?: string;
  speakerTwoVoice?: string;
  speakerTwoStyle?: string;
}) {
  return postJson<{ audioBase64Wav: string; mimeType: string; modelUsed: string }>(
    '/api/studio/voice',
    payload
  );
}

export function apiGenerateFullFilm(
  input: FilmFormInput,
  options?: {
    existingCharacters?: GeneratedCharacter[];
    existingConsistency?: ConsistencyGuide[];
    forceRegenerateCharacters?: boolean;
  }
) {
  return postJson<{
    story: StoryResult;
    characters: GeneratedCharacter[];
    consistency: ConsistencyGuide[];
    scenes: GeneratedScene[];
    script: ScriptBlock[];
    storyboard: StoryboardFrame[];
    generatedAt: string;
    modelUsed: string;
  }>('/api/studio/generate-film', {
    input,
    existingCharacters: options?.existingCharacters || [],
    existingConsistency: options?.existingConsistency || [],
    forceRegenerateCharacters: options?.forceRegenerateCharacters || false,
  });
}
