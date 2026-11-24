import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRIMARY_TEXT_MODEL = 'gemini-4-hydrogen';
const ALTERNATIVE_TEXT_MODEL = 'gemini-3.1-flash-lite';
const TTS_SINGLE_MODEL = 'gemini-3.8-flash-lite-tts';
const TTS_FALLBACK_MODEL = 'gemini-3.8-flash-tts';
const TTS_MULTI_MODEL = 'gemini-3.8-flash-tts';
const PRIMARY_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
const HQ_IMAGE_MODEL = 'gemini-nano-banana-2.1';
const IMAGE_CAPABLE_MODELS = [PRIMARY_IMAGE_MODEL, HQ_IMAGE_MODEL, 'gemini-3-pro-image'];

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 800;
const MAX_RETRY_DELAY_MS = 4000;

type ApiErrorCategory =
  | 'CONFIG'
  | 'AUTH'
  | 'QUOTA'
  | 'HIGH_DEMAND'
  | 'MODEL_UNAVAILABLE'
  | 'NETWORK'
  | 'BAD_REQUEST'
  | 'UNKNOWN';

interface ClassifiedError {
  status: number;
  category: ApiErrorCategory;
  message: string;
  retryable: boolean;
  shouldTryFallback: boolean;
}

class ResilientStudioError extends Error {
  status: number;
  category: ApiErrorCategory;
  retryable: boolean;
  attempts: number;
  fallbackAttempted: boolean;

  constructor(params: {
    message: string;
    status: number;
    category: ApiErrorCategory;
    retryable: boolean;
    attempts: number;
    fallbackAttempted: boolean;
  }) {
    super(params.message);
    this.name = 'ResilientStudioError';
    this.status = params.status;
    this.category = params.category;
    this.retryable = params.retryable;
    this.attempts = params.attempts;
    this.fallbackAttempted = params.fallbackAttempted;
  }
}

function sanitizeErrorText(raw: string): string {
  return raw
    .replace(/AIza[0-9A-Za-z\-_]{10,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
}

function extractNumericStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const candidate = err as { status?: unknown; statusCode?: unknown; code?: unknown };
    if (typeof candidate.status === 'number') return candidate.status;
    if (typeof candidate.statusCode === 'number') return candidate.statusCode;
    if (typeof candidate.code === 'number') return candidate.code;
  }
  const text = err instanceof Error ? err.message : String(err);
  const match = text.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : undefined;
}

function classifyGeminiError(err: unknown): ClassifiedError {
  if (err instanceof ResilientStudioError) {
    return {
      status: err.status,
      category: err.category,
      message: err.message,
      retryable: err.retryable,
      shouldTryFallback: false,
    };
  }

  const raw = sanitizeErrorText(err instanceof Error ? err.message : String(err));
  const lower = raw.toLowerCase();
  const numericStatus = extractNumericStatus(err);

  if (lower.includes('gemini_api_key belum') || lower.includes('api key belum dikonfigurasi')) {
    return {
      status: 503,
      category: 'CONFIG',
      message:
        'Konfigurasi Gemini API belum lengkap di server (GEMINI_API_KEY belum diatur). Hubungi administrator atau periksa panel Secrets.',
      retryable: false,
      shouldTryFallback: false,
    };
  }

  if (
    numericStatus === 401 ||
    numericStatus === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('unauthenticated') ||
    lower.includes('unauthorized')
  ) {
    return {
      status: 403,
      category: 'AUTH',
      message:
        'Autentikasi Gemini API ditolak (kunci API tidak valid atau tidak memiliki izin). Periksa kunci API di panel Settings > Secrets.',
      retryable: false,
      shouldTryFallback: false,
    };
  }

  if (
    numericStatus === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit') ||
    lower.includes('quota')
  ) {
    return {
      status: 429,
      category: 'QUOTA',
      message:
        'Batas kuota atau jumlah permintaan Gemini API sedang terlampaui (HTTP 429). Sistem sudah mencoba ulang otomatis—silakan tunggu sebentar lalu klik Coba Lagi.',
      retryable: true,
      shouldTryFallback: true,
    };
  }

  if (
    numericStatus === 503 ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('service unavailable') ||
    lower.includes('model is currently overloaded')
  ) {
    return {
      status: 503,
      category: 'HIGH_DEMAND',
      message:
        'Server Gemini sedang mengalami beban tinggi (HTTP 503 UNAVAILABLE). Sistem telah mencoba ulang hingga 3 kali dan menguji model alternatif, namun layanan masih sibuk. Data formulir Anda aman—klik Coba Lagi beberapa saat lagi.',
      retryable: true,
      shouldTryFallback: true,
    };
  }

  if (numericStatus === 404 || lower.includes('not_found')) {
    return {
      status: 404,
      category: 'MODEL_UNAVAILABLE',
      message:
        'Model Gemini yang diminta tidak ditemukan atau sedang tidak tersedia (HTTP 404). Silakan coba lagi atau periksa model yang tersedia.',
      retryable: true,
      shouldTryFallback: true,
    };
  }

  if (
    numericStatus === 502 ||
    numericStatus === 504 ||
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('enotfound') ||
    lower.includes('fetch failed') ||
    lower.includes('socket hang up') ||
    lower.includes('network')
  ) {
    return {
      status: 504,
      category: 'NETWORK',
      message:
        'Koneksi jaringan ke server Gemini terputus atau mengalami timeout. Pastikan koneksi internet stabil lalu klik Coba Lagi.',
      retryable: true,
      shouldTryFallback: false,
    };
  }

  if (numericStatus === 400) {
    return {
      status: 400,
      category: 'BAD_REQUEST',
      message: `Permintaan tidak dapat diproses oleh Gemini API (HTTP 400). Periksa kembali data input Anda.`,
      retryable: false,
      shouldTryFallback: false,
    };
  }

  return {
    status: 500,
    category: 'UNKNOWN',
    message: `Terjadi kendala saat menghubungi layanan Gemini API: ${raw || 'Kesalahan tidak dikenal.'}`,
    retryable: true,
    shouldTryFallback: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeExponentialBackoffMs(retryIndex: number): number {
  const exp = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * Math.pow(2, retryIndex));
  const jitter = Math.floor(Math.random() * 200);
  return exp + jitter;
}

async function callGeminiWithResilience<T>(params: {
  primaryModel: string;
  alternativeModel?: string;
  operationName: string;
  execute: (modelName: string) => Promise<T>;
}): Promise<{ data: T; modelUsed: string; fallbackUsed: boolean; attempts: number }> {
  let attempts = 0;
  let lastClassified: ClassifiedError | null = null;

  // Fase 1: Model utama dengan batas maksimal 3 kali retry + exponential backoff
  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    attempts += 1;
    try {
      const data = await params.execute(params.primaryModel);
      return { data, modelUsed: params.primaryModel, fallbackUsed: false, attempts };
    } catch (err) {
      const classified = classifyGeminiError(err);
      lastClassified = classified;

      // Gagal cepat untuk error konfigurasi, autentikasi, atau input tidak valid
      if (classified.category === 'CONFIG' || classified.category === 'AUTH' || classified.category === 'BAD_REQUEST') {
        throw new ResilientStudioError({
          message: classified.message,
          status: classified.status,
          category: classified.category,
          retryable: classified.retryable,
          attempts,
          fallbackAttempted: false,
        });
      }

      // Jika model 404 tidak ditemukan, langsung beralih ke model alternatif tanpa membuang retry
      if (classified.category === 'MODEL_UNAVAILABLE' && params.alternativeModel) {
        break;
      }

      const isTransient =
        classified.category === 'HIGH_DEMAND' ||
        classified.category === 'QUOTA' ||
        classified.category === 'NETWORK';

      if (!isTransient || retry >= MAX_RETRIES) {
        break;
      }

      const delayMs = computeExponentialBackoffMs(retry);
      console.warn(
        `[${params.operationName}] Percobaan ${retry + 1}/${MAX_RETRIES + 1} pada ${params.primaryModel} gagal (${classified.category}). Menunggu ${delayMs}ms sebelum mencoba ulang...`
      );
      await sleep(delayMs);
    }
  }

  // Fase 2: Coba model alternatif yang kompatibel jika tersedia & error mendukung fallback
  if (
    params.alternativeModel &&
    params.alternativeModel !== params.primaryModel &&
    lastClassified?.shouldTryFallback
  ) {
    for (let altRetry = 0; altRetry <= 1; altRetry++) {
      attempts += 1;
      try {
        console.info(
          `[${params.operationName}] Mencoba model alternatif ${params.alternativeModel} (percobaan ${altRetry + 1})...`
        );
        const data = await params.execute(params.alternativeModel);
        return { data, modelUsed: params.alternativeModel, fallbackUsed: true, attempts };
      } catch (altErr) {
        const altClassified = classifyGeminiError(altErr);
        lastClassified = altClassified;
        if (
          altClassified.category === 'CONFIG' ||
          altClassified.category === 'AUTH' ||
          altClassified.category === 'BAD_REQUEST'
        ) {
          throw new ResilientStudioError({
            message: altClassified.message,
            status: altClassified.status,
            category: altClassified.category,
            retryable: altClassified.retryable,
            attempts,
            fallbackAttempted: true,
          });
        }
        if (altRetry < 1 && (altClassified.category === 'HIGH_DEMAND' || altClassified.category === 'QUOTA')) {
          await sleep(BASE_RETRY_DELAY_MS);
        }
      }
    }
  }

  const finalError = lastClassified || {
    status: 500,
    category: 'UNKNOWN' as ApiErrorCategory,
    message: 'Gagal menghubungi layanan Gemini API.',
    retryable: true,
  };

  throw new ResilientStudioError({
    message: finalError.message,
    status: finalError.status,
    category: finalError.category,
    retryable: finalError.retryable,
    attempts,
    fallbackAttempted: Boolean(params.alternativeModel && params.alternativeModel !== params.primaryModel),
  });
}

function sendErrorResponse(res: express.Response, err: unknown) {
  if (err instanceof ResilientStudioError) {
    res.status(err.status).json({
      error: err.message,
      category: err.category,
      retryable: err.retryable,
      attempts: err.attempts,
      fallbackAttempted: err.fallbackAttempted,
    });
    return;
  }
  const classified = classifyGeminiError(err);
  res.status(classified.status).json({
    error: classified.message,
    category: classified.category,
    retryable: classified.retryable,
    attempts: 1,
    fallbackAttempted: false,
  });
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new ResilientStudioError({
      message:
        'Konfigurasi Gemini API belum lengkap di server (GEMINI_API_KEY belum diatur).',
      status: 503,
      category: 'CONFIG',
      retryable: false,
      attempts: 0,
      fallbackAttempted: false,
    });
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseJsonSafe<T>(text: string | undefined, fallbackError: string): T {
  if (!text) {
    throw new Error(fallbackError);
  }
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/```json\s*([\s\S]*?)\s*```/) || cleaned.match(/([\{\[][\s\S]*[\}\]])/);
    if (match && match[1]) {
      return JSON.parse(match[1]) as T;
    }
    throw new Error(fallbackError);
  }
}

interface CharacterInputPayload {
  id?: string;
  name?: string;
  role?: string;
  trait?: string;
  age?: string;
  gender?: string;
  appearance?: string;
  facialDescription?: string;
  eyeShape?: string;
  noseShape?: string;
  lipShape?: string;
  skinTone?: string;
  hairDescription?: string;
  height?: string;
  bodyBuild?: string;
  physicalTraits?: string;
  personality?: string;
  costume?: string;
  voiceTone?: string;
  motivation?: string;
}

interface ConsistencyInputPayload {
  characterId?: string;
  characterName?: string;
  identitySeed?: string;
  promptAnchor?: string;
  forbiddenChanges?: string;
  locked?: boolean;
}

interface FilmInputPayload {
  title?: string;
  premise?: string;
  genre?: string;
  characters?: CharacterInputPayload[];
  episodeCount?: number;
  sceneCount?: number;
  dialogueLanguage?: string;
  videoDuration?: string;
  visualStyle?: string;
  storyTheme?: string;
  storytellingStyle?: string;
  targetAudience?: string;
  storyLanguage?: string;
}

function parseTargetDurationSeconds(duration?: string): number {
  const raw = (duration || '60 detik').trim().toLowerCase();
  const match = raw.match(/(\d+(?:[.,]\d+)?)/);
  const val = match ? Number(match[1].replace(',', '.')) : 60;
  if (!Number.isFinite(val) || val <= 0) return 60;
  if (raw.includes('menit') || raw.includes('min')) {
    return Math.round(val * 60);
  }
  return Math.round(val);
}

function formatFilmContext(input: FilmInputPayload): string {
  const charList = (input.characters || [])
    .filter((c) => c.name?.trim())
    .map((c) => `- ${c.name} (${c.role || 'Pemeran'}): ${c.trait || 'Karakter utama'}`)
    .join('\n');

  return [
    `Judul Film: ${input.title || 'Tanpa Judul'}`,
    `Genre: ${input.genre || 'Drama'}`,
    `Tema Cerita: ${input.storyTheme || 'Belum ditentukan secara khusus'}`,
    `Gaya Penceritaan: ${input.storytellingStyle || input.visualStyle || 'Sinematik Dramatis'}`,
    `Target Penonton: ${input.targetAudience || 'Remaja & Dewasa Muda'}`,
    `Gaya Visual: ${input.visualStyle || 'Sinematik Gelap'}`,
    `Premis / Cerita: ${input.premise || '-'}`,
    `Bahasa Cerita: ${input.storyLanguage || input.dialogueLanguage || 'Bahasa Indonesia'}`,
    `Bahasa Dialog: ${input.dialogueLanguage || 'Bahasa Indonesia'}`,
    `Jumlah Episode: ${input.episodeCount || 1}`,
    `Jumlah Adegan Target: ${input.sceneCount || 4}`,
    `Durasi Video Target: ${input.videoDuration || '60 detik'} (~${parseTargetDurationSeconds(input.videoDuration)} detik total)`,
    `Daftar Karakter Awal:\n${charList || '- Belum ditentukan (kembangkan karakter yang relevan jika belum ada di Character Studio)'}`,
  ].join('\n');
}

function formatLockedCharactersDirective(
  charactersContext?: unknown[],
  consistencyContext?: unknown[]
): string {
  const chars = Array.isArray(charactersContext)
    ? (charactersContext as CharacterInputPayload[]).filter((c) => c?.name?.trim())
    : [];
  const guides = Array.isArray(consistencyContext)
    ? (consistencyContext as ConsistencyInputPayload[])
    : [];

  if (chars.length === 0 && guides.length === 0) {
    return '';
  }

  const guideById = new Map(
    guides.filter((g) => g.characterId).map((g) => [g.characterId!, g])
  );
  const guideByName = new Map(
    guides
      .filter((g) => g.characterName)
      .map((g) => [g.characterName!.trim().toLowerCase(), g])
  );

  const lines: string[] = [
    '=== KARAKTER TERKUNCI DARI CHARACTER STUDIO (WAJIB DIPATUHI) ===',
    'ATURAN KETAT INTEGRASI CHARACTER CONSISTENCY:',
    '1. Gunakan NAMA KARAKTER persis seperti yang tersimpan di bawah ini.',
    '2. Pertahankan identitas, ciri fisik, bentuk wajah, rambut, dan tinggi/bentuk tubuh.',
    '3. JANGAN mengubah pakaian/kostum karakter tanpa alasan cerita yang eksplisit.',
    '4. Pertahankan Character Identity Anchor di setiap deskripsi visual.',
    '5. Gunakan voiceTone tiap karakter sebagai acuan diksi, tempo, dan nada dialognya.',
    '6. JANGAN membuat ulang atau mengganti identitas karakter yang sudah ada.',
  ];

  chars.forEach((c, idx) => {
    const matchedGuide =
      (c.id ? guideById.get(c.id) : undefined) ||
      guideByName.get((c.name || '').trim().toLowerCase());
    const phys = [
      c.gender,
      c.age ? `usia ${c.age}` : '',
      c.facialDescription || c.appearance,
      c.eyeShape ? `mata: ${c.eyeShape}` : '',
      c.noseShape ? `hidung: ${c.noseShape}` : '',
      c.lipShape ? `bibir: ${c.lipShape}` : '',
      c.skinTone ? `kulit: ${c.skinTone}` : '',
      c.hairDescription ? `rambut: ${c.hairDescription}` : '',
      c.height ? `tinggi: ${c.height}` : '',
      c.bodyBuild ? `tubuh: ${c.bodyBuild}` : '',
      c.physicalTraits ? `ciri khusus: ${c.physicalTraits}` : '',
    ]
      .filter(Boolean)
      .join(', ');

    lines.push(
      `\n[Karakter #${idx + 1}: ${c.name}] (${c.role || 'Pemeran'})`,
      `- Identitas & Fisik: ${phys || '-'}`,
      `- Kostum Wajib: ${c.costume || '-'}`,
      `- Karakter Suara (voiceTone untuk dialog): ${c.voiceTone || '-'}`,
      `- Kepribadian & Motivasi: ${[c.personality, c.motivation].filter(Boolean).join(' | ') || '-'}`,
      matchedGuide?.promptAnchor
        ? `- Character Identity Anchor (${matchedGuide.locked !== false ? 'TERKUNCI' : 'FLEKSIBEL'}): ${matchedGuide.promptAnchor}`
        : `- Character Identity Anchor: ${c.name} (${phys || c.role || 'karakter utama'}), kostum: ${c.costume || 'sesuai profil'}`
    );
    if (matchedGuide?.forbiddenChanges) {
      lines.push(`- Aturan Konsistensi: ${matchedGuide.forbiddenChanges}`);
    }
  });

  for (const g of guides) {
    const alreadyCovered = chars.some(
      (c) =>
        (g.characterId && c.id === g.characterId) ||
        (g.characterName && c.name?.trim().toLowerCase() === g.characterName.trim().toLowerCase())
    );
    if (!alreadyCovered && g.characterName) {
      lines.push(
        `\n[Anchor Karakter: ${g.characterName}]`,
        `- Character Identity Anchor: ${g.promptAnchor || '-'}`,
        g.forbiddenChanges ? `- Aturan Konsistensi: ${g.forbiddenChanges}` : ''
      );
    }
  }

  return lines.filter(Boolean).join('\n');
}

type StoryRegenerateSection =
  | 'all'
  | 'title_logline'
  | 'synopsis_world'
  | 'conflicts'
  | 'ending'
  | 'episodes';

async function generateStoryWithGemini(
  ai: GoogleGenAI,
  input: FilmInputPayload,
  primaryModel = PRIMARY_TEXT_MODEL,
  options?: {
    charactersContext?: unknown[];
    consistencyContext?: unknown[];
    existingStory?: Record<string, unknown> | null;
    targetSection?: StoryRegenerateSection;
  }
) {
  const episodeTarget = Math.max(1, Math.min(20, Number(input.episodeCount) || 1));
  const storyLang = input.storyLanguage || input.dialogueLanguage || 'Bahasa Indonesia';
  const charDirective = formatLockedCharactersDirective(
    options?.charactersContext,
    options?.consistencyContext
  );
  const targetSection = options?.targetSection || 'all';
  const existingCtx =
    targetSection !== 'all' && options?.existingStory
      ? `\n\nCerita yang Sudah Ada (pertahankan konteks utama, perbarui khususnya bagian "${targetSection}"):\n${JSON.stringify(
          options.existingStory
        )}`
      : '';

  return callGeminiWithResilience({
    primaryModel,
    alternativeModel: ALTERNATIVE_TEXT_MODEL,
    operationName: 'StoryGenerator',
    execute: async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: `Buat struktur cerita film profesional yang lengkap dan terstruktur dalam bahasa "${storyLang}" berdasarkan data produksi berikut:\n\n${formatFilmContext(
          input
        )}${charDirective ? `\n\n${charDirective}` : ''}${existingCtx}\n\nPastikan menghasilkan tepat ${episodeTarget} ringkasan episode yang logis, emosional, dan sesuai target durasi (${
          input.videoDuration || '60 detik'
        }).`,
        config: {
          systemInstruction:
            'Anda adalah kepala penulis skenario dan showrunner film drama pendek profesional. Tulis seluruh elemen cerita secara sinematik, mendalam, koheren, dan siap diproduksi. Hormati penuh seluruh karakter, deskripsi fisik, kostum, voiceTone, dan Character Identity Anchor yang diberikan.',
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              storyTitle: { type: Type.STRING, description: 'Judul cerita film yang kuat dan puitis/komersial.' },
              logline: { type: Type.STRING, description: 'Logline 1-2 kalimat yang tajam.' },
              shortSynopsis: { type: Type.STRING, description: 'Sinopsis singkat 2-3 kalimat untuk pitch cepat.' },
              fullSynopsis: { type: Type.STRING, description: 'Sinopsis lengkap cerita dari awal hingga akhir.' },
              synopsis: { type: Type.STRING, description: 'Sinopsis utama (isi sama dengan fullSynopsis).' },
              worldBackground: { type: Type.STRING, description: 'Latar belakang dunia cerita, atmosfer, aturan sosial, dan setting utama.' },
              mainConflict: { type: Type.STRING, description: 'Konflik utama yang menggerakkan protagonis.' },
              supportingConflict: { type: Type.STRING, description: 'Konflik pendukung / subplot yang memperkaya drama.' },
              climax: { type: Type.STRING, description: 'Titik puncak ketegangan / klimaks cerita.' },
              resolution: { type: Type.STRING, description: 'Penyelesaian konflik setelah klimaks.' },
              ending: { type: Type.STRING, description: 'Gambaran adegan akhir / ending yang berkesan.' },
              threeActStructure: {
                type: Type.OBJECT,
                properties: {
                  act1: { type: Type.STRING, description: 'Babak 1: Pengenalan dan insiden pemicu.' },
                  act2: { type: Type.STRING, description: 'Babak 2: Eskalasi konflik dan titik balik.' },
                  act3: { type: Type.STRING, description: 'Babak 3: Klimaks dan resolusi.' },
                },
                required: ['act1', 'act2', 'act3'],
              },
              themes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 sampai 5 tema utama.',
              },
              episodeOutlines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    episodeNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    cliffhanger: { type: Type.STRING },
                  },
                  required: ['episodeNumber', 'title', 'summary', 'cliffhanger'],
                },
              },
            },
            required: [
              'storyTitle',
              'logline',
              'shortSynopsis',
              'fullSynopsis',
              'synopsis',
              'worldBackground',
              'mainConflict',
              'supportingConflict',
              'climax',
              'resolution',
              'ending',
              'threeActStructure',
              'themes',
              'episodeOutlines',
            ],
          },
        },
      });
      const parsed = parseJsonSafe<Record<string, unknown>>(
        response.text,
        'Gagal mem-parsing output cerita dari Gemini.'
      );
      if (!parsed.synopsis && typeof parsed.fullSynopsis === 'string') {
        parsed.synopsis = parsed.fullSynopsis;
      }
      if (!parsed.fullSynopsis && typeof parsed.synopsis === 'string') {
        parsed.fullSynopsis = parsed.synopsis;
      }
      return parsed;
    },
  });
}

async function generateCharactersWithGemini(
  ai: GoogleGenAI,
  input: FilmInputPayload,
  storySummary?: string,
  primaryModel = PRIMARY_TEXT_MODEL
) {
  return callGeminiWithResilience({
    primaryModel,
    alternativeModel: ALTERNATIVE_TEXT_MODEL,
    operationName: 'CharacterStudio',
    execute: async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: `Kembangkan profil karakter mendalam untuk proyek film berikut:\n\n${formatFilmContext(input)}${
          storySummary ? `\n\nKonteks Sinopsis:\n${storySummary}` : ''
        }`,
        config: {
          systemInstruction:
            'Anda adalah direktur casting dan desainer karakter film. Kembalikan daftar profil karakter yang detail dan konsisten dengan genre dan premis dalam Bahasa Indonesia.',
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              characters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    role: { type: Type.STRING },
                    age: { type: Type.STRING },
                    gender: { type: Type.STRING },
                    appearance: { type: Type.STRING },
                    facialDescription: { type: Type.STRING },
                    eyeShape: { type: Type.STRING },
                    noseShape: { type: Type.STRING },
                    lipShape: { type: Type.STRING },
                    skinTone: { type: Type.STRING },
                    hairDescription: { type: Type.STRING },
                    height: { type: Type.STRING },
                    bodyBuild: { type: Type.STRING },
                    physicalTraits: { type: Type.STRING },
                    personality: { type: Type.STRING },
                    costume: { type: Type.STRING },
                    voiceTone: { type: Type.STRING },
                    motivation: { type: Type.STRING },
                  },
                  required: [
                    'id',
                    'name',
                    'role',
                    'age',
                    'gender',
                    'appearance',
                    'facialDescription',
                    'eyeShape',
                    'noseShape',
                    'lipShape',
                    'skinTone',
                    'hairDescription',
                    'height',
                    'bodyBuild',
                    'physicalTraits',
                    'personality',
                    'costume',
                    'voiceTone',
                    'motivation',
                  ],
                },
              },
            },
            required: ['characters'],
          },
        },
      });
      return parseJsonSafe<{ characters: unknown[] }>(
        response.text,
        'Gagal mem-parsing profil karakter dari Gemini.'
      );
    },
  });
}

async function generateConsistencyWithGemini(
  ai: GoogleGenAI,
  input: FilmInputPayload,
  charactersContext: unknown[],
  primaryModel = PRIMARY_TEXT_MODEL
) {
  return callGeminiWithResilience({
    primaryModel,
    alternativeModel: ALTERNATIVE_TEXT_MODEL,
    operationName: 'CharacterConsistency',
    execute: async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: `Susun Panduan Konsistensi Karakter (Character Consistency Bible) untuk menjaga wajah, postur, kostum, palet warna, dan prompt anchor agar identik di seluruh adegan.\n\nData Film:\n${formatFilmContext(
          input
        )}\n\nProfil Karakter:\n${JSON.stringify(charactersContext)}`,
        config: {
          systemInstruction:
            'Anda adalah supervisor kontinuitas visual dan AI character consistency director. Buat anchor visual yang sangat spesifik agar karakter tetap konsisten di semua frame. Gunakan Bahasa Indonesia untuk deskripsi dan Bahasa Inggris sinematik untuk promptAnchor.',
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              consistency: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    characterName: { type: Type.STRING },
                    identitySeed: { type: Type.STRING },
                    facialFeatures: { type: Type.STRING },
                    hairAndBuild: { type: Type.STRING },
                    signatureOutfit: { type: Type.STRING },
                    colorPaletteHex: { type: Type.ARRAY, items: { type: Type.STRING } },
                    forbiddenChanges: { type: Type.STRING },
                    promptAnchor: { type: Type.STRING },
                  },
                  required: [
                    'characterName',
                    'identitySeed',
                    'facialFeatures',
                    'hairAndBuild',
                    'signatureOutfit',
                    'colorPaletteHex',
                    'forbiddenChanges',
                    'promptAnchor',
                  ],
                },
              },
            },
            required: ['consistency'],
          },
        },
      });
      return parseJsonSafe<{ consistency: unknown[] }>(
        response.text,
        'Gagal mem-parsing panduan konsistensi karakter dari Gemini.'
      );
    },
  });
}

async function generateScenesWithGemini(
  ai: GoogleGenAI,
  input: FilmInputPayload,
  storySummary?: string,
  charactersContext?: unknown[],
  primaryModel = PRIMARY_TEXT_MODEL,
  options?: {
    storyContext?: unknown;
    scriptContext?: unknown[];
    consistencyContext?: unknown[];
    targetSceneNumber?: number;
  }
) {
  const sceneTarget = Math.max(1, Math.min(30, Number(input.sceneCount) || 4));
  const totalSecondsTarget = parseTargetDurationSeconds(input.videoDuration);
  const avgSecondsPerScene = Math.max(3, Math.round(totalSecondsTarget / sceneTarget));
  const charDirective = formatLockedCharactersDirective(
    charactersContext,
    options?.consistencyContext
  );
  const targetSceneNum = options?.targetSceneNumber;
  const countInstruction = targetSceneNum
    ? `Buat ulang hanya 1 adegan produksi yaitu Adegan nomor ${targetSceneNum} (sceneId "SCN-${String(
        targetSceneNum
      ).padStart(3, '0')}", estimasi durasi sekitar ${avgSecondsPerScene} detik) agar selaras dengan keseluruhan film berdurasi total ~${totalSecondsTarget} detik.`
    : `Buat breakdown TEPAT ${sceneTarget} adegan terstruktur (SCN-001 s.d. SCN-${String(
        sceneTarget
      ).padStart(3, '0')}). Total penjumlahan estimatedSeconds dari seluruh ${sceneTarget} adegan harus mendekati target durasi film yaitu ${totalSecondsTarget} detik (${
        input.videoDuration || '60 detik'
      }, rata-rata ~${avgSecondsPerScene} detik per adegan).`;

  return callGeminiWithResilience({
    primaryModel,
    alternativeModel: ALTERNATIVE_TEXT_MODEL,
    operationName: 'SceneGenerator',
    execute: async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: `${countInstruction}\n\n${formatFilmContext(input)}${
          options?.storyContext
            ? `\n\nCerita Lengkap:\n${JSON.stringify(options.storyContext)}`
            : storySummary
              ? `\n\nSinopsis:\n${storySummary}`
              : ''
        }${
          options?.scriptContext?.length
            ? `\n\nNaskah Skenario (jadikan dasar pembagian adegan produksi):\n${JSON.stringify(
                options.scriptContext
              )}`
            : ''
        }${charDirective ? `\n\n${charDirective}` : ''}`,
        config: {
          systemInstruction:
            'Anda adalah sutradara dan asisten sutradara pertama (1st AD). Susun scene breakdown produksi yang presisi dalam Bahasa Indonesia dengan Scene ID, durasi, lokasi, karakter dari Character Studio, aksi utama, dialog inti, kebutuhan visual, kebutuhan audio, dan transisi antaradegan.',
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sceneId: { type: Type.STRING, description: 'Contoh: SCN-001' },
                    sceneNumber: { type: Type.INTEGER },
                    episodeNumber: { type: Type.INTEGER },
                    heading: { type: Type.STRING },
                    location: { type: Type.STRING },
                    timeOfDay: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    cameraMovement: { type: Type.STRING },
                    mood: { type: Type.STRING },
                    actionSummary: { type: Type.STRING },
                    mainAction: { type: Type.STRING },
                    dialogue: { type: Type.STRING },
                    visualNeeds: { type: Type.STRING },
                    audioNeeds: { type: Type.STRING },
                    transitionToNext: { type: Type.STRING },
                    charactersInvolved: { type: Type.ARRAY, items: { type: Type.STRING } },
                    estimatedSeconds: { type: Type.INTEGER },
                    duration: { type: Type.STRING, description: 'Contoh: 15 detik' },
                  },
                  required: [
                    'sceneId',
                    'sceneNumber',
                    'episodeNumber',
                    'heading',
                    'location',
                    'timeOfDay',
                    'lighting',
                    'cameraMovement',
                    'mood',
                    'actionSummary',
                    'mainAction',
                    'dialogue',
                    'visualNeeds',
                    'audioNeeds',
                    'transitionToNext',
                    'charactersInvolved',
                    'estimatedSeconds',
                    'duration',
                  ],
                },
              },
            },
            required: ['scenes'],
          },
        },
      });
      const parsed = parseJsonSafe<{ scenes: Array<Record<string, unknown>> }>(
        response.text,
        'Gagal mem-parsing daftar adegan dari Gemini.'
      );
      parsed.scenes = (parsed.scenes || []).map((sc, idx) => {
        const num = targetSceneNum || Number(sc.sceneNumber) || idx + 1;
        const sec = Math.max(1, Number(sc.estimatedSeconds) || avgSecondsPerScene);
        return {
          ...sc,
          sceneNumber: num,
          sceneId: (typeof sc.sceneId === 'string' && sc.sceneId.trim()) || `SCN-${String(num).padStart(3, '0')}`,
          estimatedSeconds: sec,
          duration: (typeof sc.duration === 'string' && sc.duration.trim()) || `${sec} detik`,
          mainAction: (sc.mainAction as string) || (sc.actionSummary as string) || '',
          actionSummary: (sc.actionSummary as string) || (sc.mainAction as string) || '',
        };
      });
      return parsed;
    },
  });
}

async function generateScriptWithGemini(
  ai: GoogleGenAI,
  input: FilmInputPayload,
  scenesContext?: unknown[],
  charactersContext?: unknown[],
  primaryModel = PRIMARY_TEXT_MODEL,
  options?: {
    storyContext?: unknown;
    consistencyContext?: unknown[];
    targetSceneNumber?: number;
    existingScript?: unknown[];
  }
) {
  const lang = input.dialogueLanguage || 'Bahasa Indonesia';
  const sceneTarget = Math.max(1, Math.min(30, Number(input.sceneCount) || 4));
  const charDirective = formatLockedCharactersDirective(
    charactersContext,
    options?.consistencyContext
  );
  const targetSceneNum = options?.targetSceneNumber;
  const sceneScopeInstruction = targetSceneNum
    ? `Tulis ulang HANYA 1 adegan naskah yaitu Adegan nomor ${targetSceneNum} secara sangat detail dan sinematik.`
    : `Tulis naskah skenario lengkap sebanyak ${sceneTarget} adegan yang berkesinambungan.`;

  return callGeminiWithResilience({
    primaryModel,
    alternativeModel: ALTERNATIVE_TEXT_MODEL,
    operationName: 'ScriptWriter',
    execute: async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: `${sceneScopeInstruction}\n\nATURAN BAHASA DIALOG WAJIB: Seluruh kalimat pada field "line" dalam dialogues WAJIB ditulis dalam bahasa "${lang}". Deskripsi visual, aksi, kamera, pencahayaan, dan suasana audio ditulis dalam Bahasa Indonesia profesional.\n\n${formatFilmContext(
          input
        )}${
          options?.storyContext
            ? `\n\nCerita yang Dikembangkan:\n${JSON.stringify(options.storyContext)}`
            : ''
        }${scenesContext?.length ? `\n\nDaftar Adegan:\n${JSON.stringify(scenesContext)}` : ''}${
          options?.existingScript?.length && targetSceneNum
            ? `\n\nKonteks Naskah Adegan Lain:\n${JSON.stringify(options.existingScript)}`
            : ''
        }${charDirective ? `\n\n${charDirective}` : ''}`,
        config: {
          systemInstruction:
            'Anda adalah penulis skenario film profesional. Tulis setiap adegan dengan nomor adegan, judul adegan, INT atau EXT, lokasi, waktu, daftar karakter, deskripsi visual, aksi karakter, dialog berkarakter (ekspresi + dialog sesuai voiceTone masing-masing karakter & bahasa yang dipilih), petunjuk kamera, pencahayaan, dan suasana audio. Hormati penuh kostum dan identitas karakter yang terkunci.',
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              script: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sceneNumber: { type: Type.INTEGER },
                    sceneTitle: { type: Type.STRING },
                    interiorExterior: { type: Type.STRING, description: 'INT, EXT, atau INT/EXT' },
                    location: { type: Type.STRING },
                    timeOfDay: { type: Type.STRING },
                    slugline: { type: Type.STRING },
                    characters: { type: Type.ARRAY, items: { type: Type.STRING } },
                    visualDescription: { type: Type.STRING },
                    characterActions: { type: Type.STRING },
                    action: { type: Type.STRING },
                    cameraDirection: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    audioMood: { type: Type.STRING },
                    dialogues: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          character: { type: Type.STRING },
                          parenthetical: { type: Type.STRING },
                          expression: { type: Type.STRING },
                          line: { type: Type.STRING },
                        },
                        required: ['character', 'parenthetical', 'expression', 'line'],
                      },
                    },
                  },
                  required: [
                    'sceneNumber',
                    'sceneTitle',
                    'interiorExterior',
                    'location',
                    'timeOfDay',
                    'slugline',
                    'characters',
                    'visualDescription',
                    'characterActions',
                    'action',
                    'cameraDirection',
                    'lighting',
                    'audioMood',
                    'dialogues',
                  ],
                },
              },
            },
            required: ['script'],
          },
        },
      });
      const parsed = parseJsonSafe<{ script: Array<Record<string, unknown>> }>(
        response.text,
        'Gagal mem-parsing naskah skenario dari Gemini.'
      );
      parsed.script = (parsed.script || []).map((block, idx) => {
        const ieRaw = String(block.interiorExterior || 'INT').toUpperCase();
        const interiorExterior = ieRaw.includes('INT/EXT')
          ? 'INT/EXT'
          : ieRaw.includes('EXT')
            ? 'EXT'
            : 'INT';
        const location = String(block.location || 'LOKASI');
        const timeOfDay = String(block.timeOfDay || 'MALAM');
        const slugline =
          (typeof block.slugline === 'string' && block.slugline.trim()) ||
          `${interiorExterior}. ${location.toUpperCase()} - ${timeOfDay.toUpperCase()}`;
        const visualDescription = String(block.visualDescription || '');
        const characterActions = String(block.characterActions || block.action || '');
        return {
          ...block,
          sceneNumber: targetSceneNum || Number(block.sceneNumber) || idx + 1,
          interiorExterior,
          location,
          timeOfDay,
          slugline,
          visualDescription,
          characterActions,
          action:
            (typeof block.action === 'string' && block.action.trim()) ||
            [visualDescription, characterActions].filter(Boolean).join(' '),
        };
      });
      return parsed;
    },
  });
}

async function generateStoryboardWithGemini(
  ai: GoogleGenAI,
  input: FilmInputPayload,
  scenesContext?: unknown[],
  consistencyContext?: unknown[],
  primaryModel = PRIMARY_TEXT_MODEL,
  options?: {
    storyContext?: unknown;
    scriptContext?: unknown[];
    charactersContext?: unknown[];
    panelCount?: number;
    aspectRatio?: string;
    targetSceneNumber?: number;
    targetFrameNumber?: number;
    existingPanel?: Record<string, unknown> | null;
    existingScenePanels?: Array<Record<string, unknown>>;
  }
) {
  const allowedRatio = ['16:9', '9:16', '1:1'].includes(String(options?.aspectRatio || '16:9'))
    ? String(options?.aspectRatio)
    : '16:9';
  const requestedPanelCount = Math.max(1, Math.min(12, Number(options?.panelCount) || 4));
  const targetSceneNumber = options?.targetSceneNumber ? Number(options.targetSceneNumber) : undefined;
  const targetFrameNumber = options?.targetFrameNumber ? Number(options.targetFrameNumber) : undefined;

  const rawChars = Array.isArray(options?.charactersContext)
    ? (options?.charactersContext as Array<Record<string, unknown>>)
    : [];
  const rawConsistency = Array.isArray(consistencyContext)
    ? (consistencyContext as Array<Record<string, unknown>>)
    : [];
  const rawScenes = Array.isArray(scenesContext)
    ? (scenesContext as Array<Record<string, unknown>>)
    : [];

  const charDirective = formatLockedCharactersDirective(rawChars, rawConsistency);

  const relevantScenes = targetSceneNumber
    ? rawScenes.filter((s) => Number(s.sceneNumber) === targetSceneNumber)
    : rawScenes;
  const relevantScript = targetSceneNumber && Array.isArray(options?.scriptContext)
    ? (options.scriptContext as Array<Record<string, unknown>>).filter(
        (b) => Number(b.sceneNumber) === targetSceneNumber
      )
    : options?.scriptContext || [];

  let scopeInstruction = '';
  if (targetFrameNumber && targetSceneNumber) {
    scopeInstruction = `Buat ulang HANYA 1 panel storyboard yaitu Panel #${targetFrameNumber} untuk Adegan ${targetSceneNumber} agar berkesinambungan dengan panel sebelum/sesudahnya pada adegan tersebut.`;
  } else if (targetSceneNumber) {
    scopeInstruction = `Buat TEPAT ${requestedPanelCount} panel storyboard berurutan secara kronologis untuk Adegan ${targetSceneNumber}. Panel 1 membuka situasi adegan dan setiap panel berikutnya melanjutkan aksi karakter, emosi, kamera, dan ruang secara logis hingga panel ke-${requestedPanelCount}.`;
  } else {
    scopeInstruction = `Buat panel storyboard sinematik berurutan untuk seluruh adegan yang diberikan (${
      relevantScenes.length || 1
    } adegan). Susun ${Math.min(
      4,
      requestedPanelCount
    )} panel per adegan secara logis dan kronologis agar alur aksi berkesinambungan.`;
  }

  return callGeminiWithResilience({
    primaryModel,
    alternativeModel: ALTERNATIVE_TEXT_MODEL,
    operationName: 'StoryboardStudio',
    execute: async (model) => {
      const response = await ai.models.generateContent({
        model,
        contents: `${scopeInstruction}

ATURAN WAJIB STORYBOARD STUDIO:
1. Nilai shotType WAJIB salah satu persis dari: "Extreme Wide", "Wide", "Medium", "Close-Up", atau "Extreme Close-Up".
2. Jangan pernah menciptakan karakter baru di luar daftar Character Studio yang diberikan.
3. Setiap visualPrompt (Bahasa Inggris) WAJIB memasukkan Character Identity Anchor / deskripsi fisik & kostum persis dari karakter yang tampil agar konsistensi wajah, rambut, warna kulit, tubuh, dan kostum terjaga di rasio aspek ${allowedRatio}.
4. Sertakan negativePrompt (Bahasa Inggris) untuk mencegah distorsi wajah/kostum/teks.
5. Gunakan Bahasa Indonesia untuk deskripsi visual, aksi karakter, ekspresi & gestur, posisi karakter dalam frame, pencahayaan, suasana & lingkungan, serta dialog.

${formatFilmContext(input)}${
          options?.storyContext
            ? `\n\nRingkasan Cerita:\n${JSON.stringify(options.storyContext)}`
            : ''
        }${
          relevantScenes.length
            ? `\n\nTarget Scene Breakdown:\n${JSON.stringify(relevantScenes)}`
            : scenesContext?.length
              ? `\n\nDaftar Adegan:\n${JSON.stringify(scenesContext)}`
              : ''
        }${
          relevantScript.length
            ? `\n\nNaskah Skenario Terkait:\n${JSON.stringify(relevantScript)}`
            : ''
        }${
          options?.existingScenePanels?.length
            ? `\n\nKonteks Panel Lain pada Adegan Ini (jaga kesinambungan):\n${JSON.stringify(
                options.existingScenePanels
              )}`
            : ''
        }${
          options?.existingPanel
            ? `\n\nPanel Lama yang Sedang Diperbarui:\n${JSON.stringify(options.existingPanel)}`
            : ''
        }${charDirective ? `\n\n${charDirective}` : ''}`,
        config: {
          systemInstruction:
            'Anda adalah storyboard artist, director of photography (DoP), dan continuity supervisor. Susun panel storyboard kronologis yang presisi dengan ukuran shot standar sinema (Extreme Wide, Wide, Medium, Close-Up, Extreme Close-Up), sudut kamera, gerakan kamera, pencahayaan, atmosfer, aksi, gestur, posisi frame, visualPrompt berkonsistensi karakter, serta negativePrompt.',
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              storyboard: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    frameNumber: { type: Type.INTEGER },
                    sceneNumber: { type: Type.INTEGER },
                    sceneId: { type: Type.STRING, description: 'Contoh: SCN-001' },
                    timeLabel: { type: Type.STRING, description: 'Contoh: Malam Hujan / 00:00-00:05' },
                    location: { type: Type.STRING },
                    characters: { type: Type.ARRAY, items: { type: Type.STRING } },
                    visualDescription: { type: Type.STRING },
                    characterAction: { type: Type.STRING },
                    expressionAndGesture: { type: Type.STRING },
                    characterPosition: { type: Type.STRING },
                    dialogue: { type: Type.STRING },
                    shotType: {
                      type: Type.STRING,
                      description: 'Harus salah satu: Extreme Wide, Wide, Medium, Close-Up, Extreme Close-Up',
                    },
                    cameraAngle: { type: Type.STRING },
                    cameraMovement: { type: Type.STRING },
                    lensMm: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    atmosphere: { type: Type.STRING },
                    compositionNotes: { type: Type.STRING },
                    visualPrompt: { type: Type.STRING },
                    negativePrompt: { type: Type.STRING },
                    dialogueCue: { type: Type.STRING },
                    durationSeconds: { type: Type.INTEGER },
                  },
                  required: [
                    'frameNumber',
                    'sceneNumber',
                    'sceneId',
                    'timeLabel',
                    'location',
                    'characters',
                    'visualDescription',
                    'characterAction',
                    'expressionAndGesture',
                    'characterPosition',
                    'dialogue',
                    'shotType',
                    'cameraAngle',
                    'cameraMovement',
                    'lensMm',
                    'lighting',
                    'atmosphere',
                    'compositionNotes',
                    'visualPrompt',
                    'negativePrompt',
                    'dialogueCue',
                    'durationSeconds',
                  ],
                },
              },
            },
            required: ['storyboard'],
          },
        },
      });
      const parsed = parseJsonSafe<{ storyboard: Array<Record<string, unknown>> }>(
        response.text,
        'Gagal mem-parsing panel storyboard dari Gemini.'
      );

      const normalizeShot = (rawShot: unknown): string => {
        const low = String(rawShot || '').toLowerCase();
        if (low.includes('extreme wide') || low === 'ews') return 'Extreme Wide';
        if (low.includes('extreme close') || low === 'ecu') return 'Extreme Close-Up';
        if (low.includes('close') || low === 'cu' || low === 'mcu') return 'Close-Up';
        if (low.includes('wide') || low === 'ws' || low === 'ls') return 'Wide';
        return 'Medium';
      };

      const charByLower = new Map<string, Record<string, unknown>>();
      for (const c of rawChars) {
        const cname = String(c.name || '').trim().toLowerCase();
        if (cname) charByLower.set(cname, c);
      }

      const guideByLower = new Map<string, Record<string, unknown>>();
      for (const g of rawConsistency) {
        const gname = String(g.characterName || '').trim().toLowerCase();
        if (gname) guideByLower.set(gname, g);
      }

      const normalizedList = (parsed.storyboard || []).map((panel, idx) => {
        const sceneNum = targetSceneNumber || Number(panel.sceneNumber) || 1;
        const matchedScene = rawScenes.find((s) => Number(s.sceneNumber) === sceneNum);
        const sceneId =
          (typeof panel.sceneId === 'string' && panel.sceneId.trim()) ||
          (typeof matchedScene?.sceneId === 'string' && matchedScene.sceneId.trim()) ||
          `SCN-${String(sceneNum).padStart(3, '0')}`;

        // Enforce saved characters if Character Studio has entries
        const rawPanelChars = Array.isArray(panel.characters)
          ? panel.characters.map((x) => String(x || '').trim()).filter(Boolean)
          : [];
        const matchedSavedNames: string[] = [];
        const matchedSavedIds: string[] = [];

        if (rawChars.length > 0) {
          for (const candidate of rawPanelChars) {
            const found =
              charByLower.get(candidate.toLowerCase()) ||
              rawChars.find((c) => {
                const n = String(c.name || '').trim().toLowerCase();
                return n && (n.includes(candidate.toLowerCase()) || candidate.toLowerCase().includes(n));
              });
            if (found) {
              const properName = String(found.name || candidate);
              if (!matchedSavedNames.includes(properName)) {
                matchedSavedNames.push(properName);
              }
              if (found.id && !matchedSavedIds.includes(String(found.id))) {
                matchedSavedIds.push(String(found.id));
              }
            }
          }
        }

        const finalCharacters =
          rawChars.length > 0 ? matchedSavedNames : rawPanelChars;

        // Guarantee locked Character Identity Anchor appears in visualPrompt
        let visualPrompt = String(panel.visualPrompt || '').trim();
        const anchorSnippets: string[] = [];
        for (const charName of finalCharacters) {
          const guide = guideByLower.get(charName.toLowerCase());
          const charObj = charByLower.get(charName.toLowerCase());
          const isLocked = guide ? guide.locked !== false : true;
          const anchorText = String(
            (guide?.promptAnchor as string) || (charObj?.visualPromptAnchor as string) || ''
          ).trim();
          if (isLocked && anchorText) {
            const probe = anchorText.slice(0, 24).toLowerCase();
            if (!visualPrompt.toLowerCase().includes(probe)) {
              anchorSnippets.push(`[${charName} Identity Anchor: ${anchorText}]`);
            }
          }
        }
        if (anchorSnippets.length > 0) {
          visualPrompt = visualPrompt
            ? `${visualPrompt}\n[Character Consistency Locks: ${anchorSnippets.join(' ')}]`
            : `[Character Consistency Locks: ${anchorSnippets.join(' ')}]`;
        }

        const desc = String(panel.visualDescription || panel.compositionNotes || '');
        const dlg = String(panel.dialogue || panel.dialogueCue || '');

        return {
          ...panel,
          id: `sb_${sceneNum}_${idx + 1}_${Date.now().toString(36)}`,
          frameNumber: targetFrameNumber || Number(panel.frameNumber) || idx + 1,
          sceneNumber: sceneNum,
          sceneId,
          timeLabel:
            String(panel.timeLabel || '').trim() ||
            String(matchedScene?.timeOfDay || 'Siang'),
          location:
            String(panel.location || '').trim() ||
            String(matchedScene?.location || 'Lokasi adegan'),
          characters: finalCharacters,
          characterIds: matchedSavedIds,
          visualDescription: desc,
          characterAction: String(panel.characterAction || desc),
          expressionAndGesture: String(panel.expressionAndGesture || ''),
          characterPosition: String(panel.characterPosition || ''),
          dialogue: dlg,
          dialogueCue: String(panel.dialogueCue || dlg),
          shotType: normalizeShot(panel.shotType),
          cameraAngle: String(panel.cameraAngle || 'Eye-Level'),
          cameraMovement: String(panel.cameraMovement || matchedScene?.cameraMovement || 'Static'),
          lensMm: String(panel.lensMm || '35mm'),
          lighting: String(panel.lighting || matchedScene?.lighting || 'Pencahayaan sinematik'),
          atmosphere: String(panel.atmosphere || matchedScene?.mood || 'Atmosfer dramatik'),
          compositionNotes: String(panel.compositionNotes || desc),
          visualPrompt,
          negativePrompt:
            String(panel.negativePrompt || '').trim() ||
            'blurry, deformed face, extra fingers, inconsistent outfit, watermark, text',
          durationSeconds: Math.max(2, Number(panel.durationSeconds) || 5),
          aspectRatio: allowedRatio,
        };
      });

      const slicedList =
        targetFrameNumber && normalizedList.length > 1
          ? [normalizedList[0]]
          : targetSceneNumber && normalizedList.length > requestedPanelCount
            ? normalizedList.slice(0, requestedPanelCount)
            : normalizedList;

      return { storyboard: slicedList };
    },
  });
}

function collectAndroidFiles(dir: string, rootDir: string): Array<{ path: string; content: string }> {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: Array<{ path: string; content: string }> = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectAndroidFiles(fullPath, rootDir));
    } else {
      results.push({
        path: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
        content: fs.readFileSync(fullPath, 'utf8'),
      });
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

interface InspectedModelEntry {
  name: string;
  displayName: string;
  role: 'text' | 'tts' | 'image' | 'video' | 'other';
  supportsImageGeneration: boolean;
  requiresPaidKey: boolean;
  availableOnCurrentKey: boolean;
  notes: string;
}

interface ModelCapabilityReport {
  checkedAt: string;
  geminiConfigured: boolean;
  paidKeyEnabled: boolean;
  imageGenerationReady: boolean;
  activeImageModel: string | null;
  activeTextModel: string;
  alternativeTextModel: string;
  liveCatalogChecked: boolean;
  statusMessage: string;
  models: InspectedModelEntry[];
}

function isPaidMediaKeyEnabled(): boolean {
  return process.env.ALLOW_PAID_GEMINI_MEDIA === 'true';
}

function normalizeModelShortName(rawName: string): string {
  return rawName.replace(/^models\//, '');
}

async function inspectGeminiModelCapabilities(ai?: GoogleGenAI): Promise<ModelCapabilityReport> {
  const checkedAt = new Date().toISOString();
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  const paidKeyEnabled = isPaidMediaKeyEnabled();

  const knownModels: InspectedModelEntry[] = [
    {
      name: PRIMARY_TEXT_MODEL,
      displayName: 'Gemini 4 Hydrogen (Teks & Penalaran)',
      role: 'text',
      supportsImageGeneration: false,
      requiresPaidKey: false,
      availableOnCurrentKey: hasKey,
      notes: 'Hanya mendukung teks, JSON terstruktur, analisis gambar/audio input, dan penyusunan prompt sinematik. Tidak dapat membuat pixel gambar.',
    },
    {
      name: ALTERNATIVE_TEXT_MODEL,
      displayName: 'Gemini 3.1 Flash Lite (Alternatif Teks)',
      role: 'text',
      supportsImageGeneration: false,
      requiresPaidKey: false,
      availableOnCurrentKey: hasKey,
      notes: 'Model cadangan cepat untuk cerita, skenario, konsistensi karakter, dan prompt. Tidak mendukung pembuatan gambar.',
    },
    {
      name: TTS_SINGLE_MODEL,
      displayName: 'Gemini 3.8 Flash Lite TTS',
      role: 'tts',
      supportsImageGeneration: false,
      requiresPaidKey: false,
      availableOnCurrentKey: hasKey,
      notes: 'Menghasilkan audio dialog/narasi WAV 24kHz secara nyata.',
    },
    {
      name: PRIMARY_IMAGE_MODEL,
      displayName: 'Gemini 3.1 Flash Lite Image (Nano Banana)',
      role: 'image',
      supportsImageGeneration: true,
      requiresPaidKey: true,
      availableOnCurrentKey: hasKey && paidKeyEnabled,
      notes: 'Model resmi pembuatan & pengeditan gambar Gemini. Memerlukan Paid API Key.',
    },
    {
      name: HQ_IMAGE_MODEL,
      displayName: 'Gemini Nano Banana 2.1 (High-Res 1K/2K/4K)',
      role: 'image',
      supportsImageGeneration: true,
      requiresPaidKey: true,
      availableOnCurrentKey: hasKey && paidKeyEnabled,
      notes: 'Model pembuatan gambar kualitas tinggi dengan referensi wajah/karakter. Memerlukan Paid API Key.',
    },
  ];

  if (!hasKey || !ai) {
    return {
      checkedAt,
      geminiConfigured: false,
      paidKeyEnabled,
      imageGenerationReady: false,
      activeImageModel: null,
      activeTextModel: PRIMARY_TEXT_MODEL,
      alternativeTextModel: ALTERNATIVE_TEXT_MODEL,
      liveCatalogChecked: false,
      statusMessage:
        'GEMINI_API_KEY belum dikonfigurasi pada server. Model teks dan pembuatan gambar belum dapat dijalankan.',
      models: knownModels,
    };
  }

  let liveCatalogChecked = false;
  const discoveredByName = new Map<string, { displayName?: string; supportedActions?: string[] }>();

  try {
    const pager = await ai.models.list();
    let count = 0;
    for await (const item of pager) {
      if (!item?.name) continue;
      const shortName = normalizeModelShortName(item.name);
      discoveredByName.set(shortName, {
        displayName: item.displayName,
        supportedActions: item.supportedActions,
      });
      count += 1;
      if (count >= 50) break;
    }
    liveCatalogChecked = true;
  } catch {
    liveCatalogChecked = false;
  }

  if (liveCatalogChecked && discoveredByName.size > 0) {
    for (const entry of knownModels) {
      const found = discoveredByName.get(entry.name);
      if (found) {
        if (found.displayName) {
          entry.displayName = found.displayName;
        }
        if (entry.role === 'image') {
          entry.availableOnCurrentKey = paidKeyEnabled;
        }
      }
    }

    for (const [shortName, meta] of discoveredByName.entries()) {
      const lower = shortName.toLowerCase();
      const isImageNamed =
        lower.includes('image') || lower.includes('imagen') || lower.includes('nano-banana');
      if (isImageNamed && !knownModels.some((m) => m.name === shortName)) {
        knownModels.push({
          name: shortName,
          displayName: meta.displayName || shortName,
          role: 'image',
          supportsImageGeneration: true,
          requiresPaidKey: true,
          availableOnCurrentKey: paidKeyEnabled,
          notes:
            'Terdeteksi pada katalog model Gemini API sebagai model image generation (memerlukan Paid API Key).',
        });
      }
    }
  }

  const activeImageModel = paidKeyEnabled ? PRIMARY_IMAGE_MODEL : null;
  const imageGenerationReady = Boolean(hasKey && paidKeyEnabled && activeImageModel);

  const statusMessage = imageGenerationReady
    ? `Layanan Image Generation aktif menggunakan ${activeImageModel}. Model teks (${PRIMARY_TEXT_MODEL}) tetap digunakan khusus untuk struktur cerita, konsistensi, dan prompt visual.`
    : liveCatalogChecked
      ? `Pemeriksaan katalog Gemini API berhasil: model teks aktif (${PRIMARY_TEXT_MODEL} & ${ALTERNATIVE_TEXT_MODEL}) tidak mendukung pembuatan pixel gambar. Model image generation (${PRIMARY_IMAGE_MODEL} & ${HQ_IMAGE_MODEL}) memerlukan kunci API Gemini berbayar yang belum diaktifkan pada sesi ini.`
      : `Pemeriksaan kapabilitas selesai: model teks aktif (${PRIMARY_TEXT_MODEL} & ${ALTERNATIVE_TEXT_MODEL}) hanya mendukung teks/prompt dan bukan image generator. Model image generation (${PRIMARY_IMAGE_MODEL} / ${HQ_IMAGE_MODEL}) memerlukan kunci API Gemini berbayar yang belum diaktifkan pada sesi ini.`;

  return {
    checkedAt,
    geminiConfigured: hasKey,
    paidKeyEnabled,
    imageGenerationReady,
    activeImageModel,
    activeTextModel: PRIMARY_TEXT_MODEL,
    alternativeTextModel: ALTERNATIVE_TEXT_MODEL,
    liveCatalogChecked,
    statusMessage,
    models: knownModels,
  };
}

function parseDataUrlParts(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function renderImageWithGemini(
  ai: GoogleGenAI,
  params: {
    prompt: string;
    aspectRatio: string;
    resolution?: string;
    referenceImages?: Array<{ name?: string; dataUrl: string }>;
    operationName: string;
  }
): Promise<{ imageDataUrl: string; mimeType: string; modelUsed: string; promptUsed: string }> {
  const report = await inspectGeminiModelCapabilities(ai);

  if (!report.imageGenerationReady) {
    throw new ResilientStudioError({
      message: `${report.statusMessage} Tidak ada gambar placeholder palsu yang dibuat. Anda tetap dapat menyusun prompt AI presisi atau mengunggah gambar referensi/visual Anda sendiri.`,
      status: 402,
      category: 'CONFIG',
      retryable: false,
      attempts: 1,
      fallbackAttempted: false,
    });
  }

  const allowedAspect = ['1:1', '3:4', '4:3', '9:16', '16:9'].includes(params.aspectRatio)
    ? params.aspectRatio
    : '16:9';

  const parts: Array<
    { text: string } | { inlineData: { data: string; mimeType: string } }
  > = [];

  for (const ref of params.referenceImages || []) {
    const parsed = parseDataUrlParts(ref.dataUrl);
    if (parsed) {
      parts.push({
        inlineData: {
          data: parsed.data,
          mimeType: parsed.mimeType,
        },
      });
    }
  }
  parts.push({ text: params.prompt });

  const useHq = params.resolution === '2K' || params.resolution === '4K';
  const primaryImgModel = useHq ? HQ_IMAGE_MODEL : PRIMARY_IMAGE_MODEL;
  const fallbackImgModel = useHq ? PRIMARY_IMAGE_MODEL : HQ_IMAGE_MODEL;

  const result = await callGeminiWithResilience({
    primaryModel: primaryImgModel,
    alternativeModel: fallbackImgModel,
    operationName: params.operationName,
    execute: async (model) => {
      const config: Record<string, unknown> = {
        imageConfig:
          model === HQ_IMAGE_MODEL
            ? { aspectRatio: allowedAspect, imageSize: params.resolution || '1K' }
            : { aspectRatio: allowedAspect },
      };
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config,
      });

      const responseParts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of responseParts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          return {
            imageDataUrl: `data:${mime};base64,${part.inlineData.data}`,
            mimeType: mime,
          };
        }
      }
      throw new Error(
        `Model ${model} tidak mengembalikan data gambar (inlineData) pada respons.`
      );
    },
  });

  return {
    ...result.data,
    modelUsed: result.modelUsed,
    promptUsed: params.prompt,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/studio/capabilities', (_req, res) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    const paidEnabled = isPaidMediaKeyEnabled();
    res.json({
      geminiConfigured: hasKey,
      textModel: PRIMARY_TEXT_MODEL,
      alternativeTextModel: ALTERNATIVE_TEXT_MODEL,
      ttsSingleModel: TTS_SINGLE_MODEL,
      ttsFallbackModel: TTS_FALLBACK_MODEL,
      ttsMultiModel: TTS_MULTI_MODEL,
      imageModels: IMAGE_CAPABLE_MODELS,
      imageGenerationReady: hasKey && paidEnabled,
      maxRetries: MAX_RETRIES,
      paidMediaRenderingEnabled: paidEnabled,
      firebaseConfigured: false,
    });
  });

  app.get('/api/studio/model-capabilities', async (_req, res) => {
    try {
      const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
      const ai = hasKey ? getGeminiClient() : undefined;
      const report = await inspectGeminiModelCapabilities(ai);
      res.json(report);
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.get('/api/android-files', (_req, res) => {
    const androidDir = path.join(__dirname, 'android-kotlin-compose');
    const files = collectAndroidFiles(androidDir, androidDir);
    res.json({ files });
  });

  app.post('/api/studio/story', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const result = await generateStoryWithGemini(
        ai,
        req.body.input || {},
        PRIMARY_TEXT_MODEL,
        {
          charactersContext: req.body.characters || [],
          consistencyContext: req.body.consistency || [],
          existingStory: req.body.existingStory || null,
          targetSection: req.body.targetSection || 'all',
        }
      );
      res.json({
        story: result.data,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/characters', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const result = await generateCharactersWithGemini(ai, req.body.input || {}, req.body.storySummary);
      res.json({
        ...result.data,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/consistency', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const result = await generateConsistencyWithGemini(ai, req.body.input || {}, req.body.characters || []);
      res.json({
        ...result.data,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/scenes', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const result = await generateScenesWithGemini(
        ai,
        req.body.input || {},
        req.body.storySummary,
        req.body.characters || [],
        PRIMARY_TEXT_MODEL,
        {
          storyContext: req.body.story,
          scriptContext: req.body.script || [],
          consistencyContext: req.body.consistency || [],
          targetSceneNumber: req.body.targetSceneNumber,
        }
      );
      res.json({
        ...result.data,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/script', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const result = await generateScriptWithGemini(
        ai,
        req.body.input || {},
        req.body.scenes || [],
        req.body.characters || [],
        PRIMARY_TEXT_MODEL,
        {
          storyContext: req.body.story,
          consistencyContext: req.body.consistency || [],
          targetSceneNumber: req.body.targetSceneNumber,
          existingScript: req.body.existingScript || [],
        }
      );
      res.json({
        ...result.data,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/storyboard', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const result = await generateStoryboardWithGemini(
        ai,
        req.body.input || {},
        req.body.scenes || [],
        req.body.consistency || [],
        PRIMARY_TEXT_MODEL,
        {
          storyContext: req.body.story,
          scriptContext: req.body.script || [],
          charactersContext: req.body.characters || [],
          panelCount: req.body.panelCount,
          aspectRatio: req.body.aspectRatio,
          targetSceneNumber: req.body.targetSceneNumber,
          targetFrameNumber: req.body.targetFrameNumber,
          existingPanel: req.body.existingPanel || null,
          existingScenePanels: req.body.existingScenePanels || [],
        }
      );
      res.json({
        ...result.data,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/visual-prompt', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const {
        type,
        input,
        subject,
        aspectRatio,
        durationOrResolution,
        consistency,
        sceneNumber,
        inputMode,
        hasSourceImage,
      } = req.body as {
        type: 'image' | 'video';
        input: FilmInputPayload;
        subject: string;
        aspectRatio: string;
        durationOrResolution: string;
        consistency?: unknown[];
        sceneNumber?: number;
        inputMode?: 'prompt' | 'image';
        hasSourceImage?: boolean;
      };

      const result = await callGeminiWithResilience({
        primaryModel: PRIMARY_TEXT_MODEL,
        alternativeModel: ALTERNATIVE_TEXT_MODEL,
        operationName: 'VisualPrompt',
        execute: async (model) => {
          const response = await ai.models.generateContent({
            model,
            contents: `Susun spesifikasi prompt produksi ${type === 'video' ? 'video sinematik' : 'gambar keyframe'} yang presisi.\n\nMode Input: ${
              inputMode === 'image' ? 'Image-to-Video (dari gambar referensi)' : 'Text-to-Media'
            }${hasSourceImage ? ' (Gambar referensi terlampir)' : ''}\n${
              sceneNumber ? `Nomor Adegan: ${sceneNumber}\n` : ''
            }Subjek/Adegan Target: ${subject}\nRasio Aspek: ${aspectRatio}\nTarget Teknis: ${durationOrResolution}\n\nKonteks Film:\n${formatFilmContext(
              input || {}
            )}${consistency?.length ? `\n\nAnchor Konsistensi Karakter:\n${JSON.stringify(consistency)}` : ''}`,
            config: {
              systemInstruction:
                'Anda adalah AI Cinematography Prompt Director. Buat promptText dan negativePrompt dalam Bahasa Inggris sinematik yang sangat detail, serta cameraSpec dan targetLabel dalam Bahasa Indonesia.',
              responseMimeType: 'application/json',
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  targetLabel: { type: Type.STRING },
                  promptText: { type: Type.STRING },
                  negativePrompt: { type: Type.STRING },
                  cameraSpec: { type: Type.STRING },
                },
                required: ['targetLabel', 'promptText', 'negativePrompt', 'cameraSpec'],
              },
            },
          });
          return parseJsonSafe<Record<string, string>>(
            response.text,
            'Gagal menyusun blueprint prompt visual dari Gemini.'
          );
        },
      });

      res.json({
        spec: {
          id: `vp_${Date.now()}`,
          type: type === 'video' ? 'video' : 'image',
          sceneNumber,
          inputMode: inputMode || 'prompt',
          aspectRatio: aspectRatio || '16:9',
          durationOrResolution: durationOrResolution || (type === 'video' ? '10s / 720p' : '1K'),
          createdAt: new Date().toISOString(),
          ...result.data,
        },
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/character-image-prompt', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const { input, character, consistency, aspectRatio, characterId } = req.body as {
        input: FilmInputPayload;
        characterId?: string;
        character: {
          id?: string;
          name?: string;
          role?: string;
          age?: string;
          gender?: string;
          appearance?: string;
          facialDescription?: string;
          eyeShape?: string;
          noseShape?: string;
          lipShape?: string;
          skinTone?: string;
          hairDescription?: string;
          height?: string;
          bodyBuild?: string;
          physicalTraits?: string;
          costume?: string;
          personality?: string;
        };
        consistency?: { promptAnchor?: string; forbiddenChanges?: string };
        aspectRatio?: string;
      };

      if (!character?.name?.trim()) {
        res.status(400).json({
          category: 'BAD_REQUEST',
          retryable: false,
          error: 'Nama karakter wajib diisi sebelum menyusun prompt visual karakter.',
        });
        return;
      }

      const resolvedCharacterId = characterId || character.id;

      const result = await callGeminiWithResilience({
        primaryModel: PRIMARY_TEXT_MODEL,
        alternativeModel: ALTERNATIVE_TEXT_MODEL,
        operationName: 'CharacterImagePrompt',
        execute: async (model) => {
          const response = await ai.models.generateContent({
            model,
            contents: `Susun prompt referensi visual karakter film (Character Reference Portrait & Sheet) agar konsisten di semua adegan.\n\nData Karakter:\n- ID Karakter: ${
              resolvedCharacterId || '-'
            }\n- Nama: ${character.name}\n- Peran: ${character.role || 'Utama'}\n- Usia: ${
              character.age || 'Dewasa'
            }\n- Jenis Kelamin: ${character.gender || '-'}\n- Wajah: ${
              character.facialDescription || character.appearance || '-'
            }\n- Bentuk Mata: ${character.eyeShape || '-'}\n- Bentuk Hidung: ${
              character.noseShape || '-'
            }\n- Bentuk Bibir: ${character.lipShape || '-'}\n- Warna Kulit: ${
              character.skinTone || '-'
            }\n- Gaya & Panjang Rambut: ${character.hairDescription || '-'}\n- Tinggi Badan: ${
              character.height || '-'
            }\n- Bentuk Tubuh: ${character.bodyBuild || '-'}\n- Ciri Fisik Khusus: ${
              character.physicalTraits || '-'
            }\n- Pakaian & Kostum: ${character.costume || '-'}\n- Kepribadian: ${
              character.personality || '-'
            }\n${
              consistency?.promptAnchor ? `- Character Identity Anchor: ${consistency.promptAnchor}\n` : ''
            }${
              consistency?.forbiddenChanges ? `- Aturan Penguncian: ${consistency.forbiddenChanges}\n` : ''
            }\nRasio Aspek Target: ${aspectRatio || '1:1'}\nKonteks Film:\n${formatFilmContext(input || {})}`,
            config: {
              systemInstruction:
                'Anda adalah AI Character Lookdev & Continuity Supervisor. Tulis promptText dan negativePrompt dalam Bahasa Inggris sinematik yang mengunci detail wajah, mata, hidung, bibir, warna kulit, rambut, tinggi badan, bentuk tubuh, ciri fisik, dan kostum agar konsisten lintas adegan. Tulis cameraSpec dan targetLabel dalam Bahasa Indonesia.',
              responseMimeType: 'application/json',
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  targetLabel: { type: Type.STRING },
                  promptText: { type: Type.STRING },
                  negativePrompt: { type: Type.STRING },
                  cameraSpec: { type: Type.STRING },
                },
                required: ['targetLabel', 'promptText', 'negativePrompt', 'cameraSpec'],
              },
            },
          });
          return parseJsonSafe<Record<string, string>>(
            response.text,
            'Gagal menyusun prompt visual karakter dari Gemini.'
          );
        },
      });

      res.json({
        spec: {
          id: `vp_char_${Date.now()}`,
          type: 'image',
          characterId: resolvedCharacterId,
          inputMode: 'prompt',
          aspectRatio: aspectRatio || '1:1',
          durationOrResolution: '1K',
          createdAt: new Date().toISOString(),
          ...result.data,
        },
        characterId: resolvedCharacterId,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/generate-character-image', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const { input, character, characterId, consistency, promptOverride, aspectRatio, resolution } = req.body as {
        input?: FilmInputPayload;
        characterId?: string;
        character?: {
          id?: string;
          name?: string;
          age?: string;
          gender?: string;
          facialDescription?: string;
          eyeShape?: string;
          noseShape?: string;
          lipShape?: string;
          skinTone?: string;
          hairDescription?: string;
          height?: string;
          bodyBuild?: string;
          physicalTraits?: string;
          costume?: string;
          referenceImageDataUrl?: string;
        };
        consistency?: { promptAnchor?: string };
        promptOverride?: string;
        aspectRatio?: string;
        resolution?: string;
      };

      const resolvedCharacterId = characterId || character?.id;

      const assembledPrompt =
        promptOverride?.trim() ||
        [
          `Cinematic character reference portrait of ${character?.name || 'film character'}`,
          character?.gender || '',
          character?.age ? `age ${character.age}` : '',
          character?.facialDescription || '',
          character?.eyeShape ? `eyes: ${character.eyeShape}` : '',
          character?.noseShape ? `nose: ${character.noseShape}` : '',
          character?.lipShape ? `lips: ${character.lipShape}` : '',
          character?.skinTone ? `skin tone: ${character.skinTone}` : '',
          character?.hairDescription ? `hair: ${character.hairDescription}` : '',
          character?.height ? `height: ${character.height}` : '',
          character?.bodyBuild ? `build: ${character.bodyBuild}` : '',
          character?.physicalTraits ? `physical traits: ${character.physicalTraits}` : '',
          character?.costume ? `wearing ${character.costume}` : '',
          consistency?.promptAnchor || '',
          input?.visualStyle ? `style: ${input.visualStyle}` : 'cinematic film still, 35mm lens',
        ]
          .filter(Boolean)
          .join(', ');

      const rendered = await renderImageWithGemini(ai, {
        prompt: assembledPrompt,
        aspectRatio: aspectRatio || '1:1',
        resolution: resolution || '1K',
        referenceImages: character?.referenceImageDataUrl
          ? [{ name: character.name, dataUrl: character.referenceImageDataUrl }]
          : [],
        operationName: 'CharacterImageGenerator',
      });

      res.json({
        ...rendered,
        characterId: resolvedCharacterId,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/generate-scene-image', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const { input, scene, prompt, aspectRatio, resolution, consistency, referenceImages } = req.body as {
        input?: FilmInputPayload;
        scene?: {
          sceneNumber?: number;
          location?: string;
          timeOfDay?: string;
          lighting?: string;
          mood?: string;
          cameraMovement?: string;
          actionSummary?: string;
        };
        prompt?: string;
        aspectRatio?: string;
        resolution?: string;
        consistency?: Array<{ characterName?: string; promptAnchor?: string }>;
        referenceImages?: Array<{ name?: string; dataUrl: string }>;
      };

      const anchors = (consistency || [])
        .map((c) => `${c.characterName}: ${c.promptAnchor}`)
        .filter(Boolean)
        .join('; ');

      const assembledPrompt = [
        prompt?.trim() || scene?.actionSummary || '',
        scene?.location ? `Location: ${scene.location} (${scene.timeOfDay || 'Night'})` : '',
        scene?.lighting ? `Lighting: ${scene.lighting}` : '',
        scene?.mood ? `Mood: ${scene.mood}` : '',
        input?.visualStyle ? `Cinematic style: ${input.visualStyle}` : '',
        anchors ? `Character consistency locks: ${anchors}` : '',
      ]
        .filter(Boolean)
        .join('. ');

      if (!assembledPrompt.trim()) {
        res.status(400).json({
          category: 'BAD_REQUEST',
          retryable: false,
          error: 'Deskripsi adegan atau prompt visual wajib diisi sebelum membuat gambar adegan.',
        });
        return;
      }

      const rendered = await renderImageWithGemini(ai, {
        prompt: assembledPrompt,
        aspectRatio: aspectRatio || '16:9',
        resolution: resolution || '1K',
        referenceImages,
        operationName: 'SceneImageGenerator',
      });

      res.json(rendered);
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/render-image', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const { prompt, aspectRatio, referenceImages } = req.body as {
        prompt?: string;
        aspectRatio?: string;
        referenceImages?: string[];
      };

      const rendered = await renderImageWithGemini(ai, {
        prompt: prompt || '',
        aspectRatio: aspectRatio || '16:9',
        referenceImages: (referenceImages || []).filter(Boolean).map((dataUrl) => ({ dataUrl })),
        operationName: 'RenderImage',
      });
      res.json(rendered);
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/render-video', (_req, res) => {
    res.status(402).json({
      category: 'CONFIG',
      retryable: false,
      error:
        'Rendering video AI langsung menggunakan gemini-omni-1.2-flash memerlukan kunci API Gemini berbayar yang belum diaktifkan pada sesi ini. Tidak ada video palsu yang dihasilkan.',
    });
  });

  app.post('/api/studio/voice', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const {
        mode,
        text,
        style,
        voiceName,
        speakerOneName,
        speakerOneVoice,
        speakerOneStyle,
        speakerTwoName,
        speakerTwoText,
        speakerTwoVoice,
        speakerTwoStyle,
      } = req.body as {
        mode?: 'single' | 'multi';
        text?: string;
        style?: string;
        voiceName?: string;
        speakerOneName?: string;
        speakerOneVoice?: string;
        speakerOneStyle?: string;
        speakerTwoName?: string;
        speakerTwoText?: string;
        speakerTwoVoice?: string;
        speakerTwoStyle?: string;
      };

      if (!text?.trim()) {
        res.status(400).json({
          category: 'BAD_REQUEST',
          retryable: false,
          error: 'Teks dialog atau narasi wajib diisi.',
        });
        return;
      }

      if (mode === 'multi') {
        const s1 = speakerOneName?.trim() || 'Pembicara 1';
        const s2 = speakerTwoName?.trim() || 'Pembicara 2';
        const line2 = speakerTwoText?.trim() || 'Baik, saya mengerti situasi ini.';

        const result = await callGeminiWithResilience({
          primaryModel: TTS_MULTI_MODEL,
          operationName: 'VoiceStudioMulti',
          execute: async (model) => {
            const response = await ai.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: `${s1}: ${text.trim()}`,
                      speechMetadata: {
                        speaker: s1,
                        style: speakerOneStyle?.trim() || 'Dramatic film dialogue, natural emotion',
                      },
                    },
                    {
                      text: `${s2}: ${line2}`,
                      speechMetadata: {
                        speaker: s2,
                        style: speakerTwoStyle?.trim() || 'Responsive film co-star, clear delivery',
                      },
                    },
                  ],
                },
              ],
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  multiSpeakerVoiceConfig: {
                    speakerVoiceConfigs: [
                      {
                        speaker: s1,
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerOneVoice || 'Puck' } },
                      },
                      {
                        speaker: s2,
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerTwoVoice || 'Kore' } },
                      },
                    ],
                  },
                },
              },
            });
            const part = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (!part?.data) {
              throw new Error('Model TTS tidak mengembalikan data audio.');
            }
            return {
              audioBase64Wav: part.data,
              mimeType: part.mimeType || 'audio/wav',
            };
          },
        });

        res.json({
          ...result.data,
          modelUsed: result.modelUsed,
          fallbackUsed: result.fallbackUsed,
          attempts: result.attempts,
        });
        return;
      }

      const result = await callGeminiWithResilience({
        primaryModel: TTS_SINGLE_MODEL,
        alternativeModel: TTS_FALLBACK_MODEL,
        operationName: 'VoiceStudioSingle',
        execute: async (model) => {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: text.trim(),
                    speechMetadata: {
                      style: style?.trim() || 'Sinematik, ekspresif, jelas seperti pengisi suara drama',
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceName || 'Kore',
                  },
                },
              },
            },
          });
          const part = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          if (!part?.data) {
            throw new Error('Model TTS tidak mengembalikan data audio.');
          }
          return {
            audioBase64Wav: part.data,
            mimeType: part.mimeType || 'audio/wav',
          };
        },
      });

      res.json({
        ...result.data,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  app.post('/api/studio/generate-film', async (req, res) => {
    try {
      const ai = getGeminiClient();
      const input: FilmInputPayload = req.body.input || {};
      const existingCharacters = Array.isArray(req.body.existingCharacters)
        ? req.body.existingCharacters
        : [];
      const existingConsistency = Array.isArray(req.body.existingConsistency)
        ? req.body.existingConsistency
        : [];
      const forceRegenerateCharacters = Boolean(req.body.forceRegenerateCharacters);

      if (!input.title?.trim() || !input.premise?.trim()) {
        res.status(400).json({
          category: 'BAD_REQUEST',
          retryable: false,
          error: 'Judul film dan premis cerita wajib diisi sebelum Generate Film.',
        });
        return;
      }

      const keepExistingChars = existingCharacters.length > 0 && !forceRegenerateCharacters;

      const storyRes = await generateStoryWithGemini(ai, input, PRIMARY_TEXT_MODEL, {
        charactersContext: keepExistingChars ? existingCharacters : undefined,
        consistencyContext: keepExistingChars ? existingConsistency : undefined,
      });
      const effectiveModel = storyRes.modelUsed;
      let anyFallback = storyRes.fallbackUsed;

      let finalCharacters = existingCharacters;
      let finalConsistency = existingConsistency;
      let modelForNext = effectiveModel;

      if (!keepExistingChars) {
        const charRes = await generateCharactersWithGemini(
          ai,
          input,
          String(storyRes.data.fullSynopsis || storyRes.data.synopsis || ''),
          effectiveModel
        );
        anyFallback = anyFallback || charRes.fallbackUsed;
        finalCharacters = charRes.data.characters || [];

        const consistencyRes = await generateConsistencyWithGemini(
          ai,
          input,
          finalCharacters,
          charRes.modelUsed
        );
        anyFallback = anyFallback || consistencyRes.fallbackUsed;
        finalConsistency = consistencyRes.data.consistency || [];
        modelForNext = consistencyRes.modelUsed;
      } else if (finalConsistency.length === 0) {
        const consistencyRes = await generateConsistencyWithGemini(
          ai,
          input,
          finalCharacters,
          effectiveModel
        );
        anyFallback = anyFallback || consistencyRes.fallbackUsed;
        finalConsistency = consistencyRes.data.consistency || [];
        modelForNext = consistencyRes.modelUsed;
      }

      const sceneRes = await generateScenesWithGemini(
        ai,
        input,
        String(storyRes.data.fullSynopsis || storyRes.data.synopsis || ''),
        finalCharacters,
        modelForNext,
        {
          storyContext: storyRes.data,
          consistencyContext: finalConsistency,
        }
      );
      anyFallback = anyFallback || sceneRes.fallbackUsed;

      const [scriptRes, storyboardRes] = await Promise.all([
        generateScriptWithGemini(
          ai,
          input,
          sceneRes.data.scenes || [],
          finalCharacters,
          sceneRes.modelUsed,
          {
            storyContext: storyRes.data,
            consistencyContext: finalConsistency,
          }
        ),
        generateStoryboardWithGemini(
          ai,
          input,
          sceneRes.data.scenes || [],
          finalConsistency,
          sceneRes.modelUsed,
          {
            storyContext: storyRes.data,
            charactersContext: finalCharacters,
            panelCount: 3,
            aspectRatio: '16:9',
          }
        ),
      ]);
      anyFallback = anyFallback || scriptRes.fallbackUsed || storyboardRes.fallbackUsed;

      res.json({
        story: storyRes.data,
        characters: finalCharacters,
        consistency: finalConsistency,
        scenes: sceneRes.data.scenes || [],
        script: scriptRes.data.script || [],
        storyboard: storyboardRes.data.storyboard || [],
        generatedAt: new Date().toISOString(),
        modelUsed: storyboardRes.modelUsed,
        fallbackUsed: anyFallback,
      });
    } catch (err) {
      sendErrorResponse(res, err);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`AI FILM STUDIO server running on http://0.0.0.0:${port}`);
  });
}

startServer();
