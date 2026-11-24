import { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileJson,
  FileText,
  Film,
  Loader2,
  Mic,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  FilmFormInput,
  FilmProject,
  GeneratedScene,
  NavSection,
  ScriptBlock,
  ScriptDialogue,
  StoryResult,
  StudioErrorDetails,
} from '../types/studio';
import {
  apiGenerateScenes,
  apiGenerateScript,
  apiGenerateStory,
  toStudioErrorDetails,
  type StoryRegenerateSection,
} from '../services/studioApi';
import {
  buildEffectiveCharacterContext,
  buildEffectiveConsistencyPayload,
  buildSlugline,
  downloadJsonFile,
  downloadTextFile,
  formatScenesTxt,
  formatScreenplayTxt,
  formatStoryTxt,
  moveSceneInList,
  parseVideoDurationSeconds,
  reindexScenes,
} from '../utils/narrativeExport';
import { StudioErrorBanner } from './StudioErrorBanner';
import type { StudioJumpContext } from './StudioFeatureViews';

const GENRES = [
  'Drama',
  'Thriller',
  'Sci-Fi',
  'Horor',
  'Romansa',
  'Aksi',
  'Komedi',
  'Misteri',
  'Fantasi',
];
const STORYTELLING_STYLES = [
  'Sinematik Gelap',
  'Dramatis Intim',
  'Alur Cepat & Tegang',
  'Misteri Berlapis',
  'Melodrama Emosional',
  'Realis Kontemporer',
  'Puitis Sinematik',
];
const TARGET_AUDIENCES = [
  'Remaja & Dewasa Muda (17+)',
  'Umum / Keluarga',
  'Dewasa (21+)',
  'Festival Film Independen',
];
const LANGUAGES = [
  'Bahasa Indonesia',
  'English',
  'Bahasa Jawa',
  'Bahasa Sunda',
  'Bahasa Jepang',
  'Bahasa Korea',
];
const DURATIONS = ['15 detik', '30 detik', '60 detik', '3 menit', '5 menit', '10 menit'];

function CharacterConsistencyIntegrationBanner({
  project,
  onNavigate,
}: {
  project: FilmProject;
  onNavigate: (sec: NavSection) => void;
}) {
  const contexts = useMemo(
    () => buildEffectiveCharacterContext(project.characters, project.consistency),
    [project.characters, project.consistency]
  );

  if (contexts.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-[#12141A] border border-[#8B5CF6]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#F4F5F7] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#8B5CF6]" />
            Character Studio Belum Memiliki Karakter Tersimpan
          </p>
          <p className="text-xs text-[#9CA3AF]">
            Anda dapat membuat karakter terlebih dahulu di Character Studio agar nama, deskripsi fisik, kostum, voiceTone, dan Character Identity Anchor otomatis dipakai oleh AI.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('characters')}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 text-[#F4F5F7] hover:bg-[#8B5CF6]/25 min-h-[44px] shrink-0"
        >
          Buka Character Studio
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-[#12141A] border border-[#3B82F6]/30 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#3B82F6] shrink-0" />
          <p className="text-xs font-semibold text-[#F4F5F7]">
            Integrasi Character Consistency Aktif ({contexts.length} Karakter Terhubung)
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('consistency')}
          className="text-xs font-medium text-[#8B5CF6] hover:underline min-h-[36px]"
        >
          Kelola Identity Anchor →
        </button>
      </div>
      <p className="text-xs text-[#9CA3AF] leading-relaxed">
        Gemini API otomatis memakai nama persis, ciri fisik, kostum, <span className="font-mono text-[#F4F5F7]">voiceTone</span>, dan <span className="font-mono text-[#F4F5F7]">Character Identity Anchor</span> berikut tanpa membuat ulang karakter atau menimpa storyboard Anda.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {contexts.map((ctx) => (
          <div
            key={ctx.character.id || ctx.character.name}
            className="p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#F4F5F7] truncate">
                {ctx.character.name} <span className="font-normal text-[#9CA3AF]">({ctx.character.role})</span>
              </span>
              <span
                className={`font-mono text-[10px] px-2 py-0.5 rounded ${
                  ctx.isLocked
                    ? 'bg-[#8B5CF6]/20 text-[#C4B5FD]'
                    : 'bg-white/[0.06] text-[#9CA3AF]'
                }`}
              >
                {ctx.isLocked ? 'Terkunci' : 'Fleksibel'}
              </span>
            </div>
            <p className="text-[11px] text-[#9CA3AF] truncate">
              Suara: {ctx.character.voiceTone || '-'} · Kostum: {ctx.character.costume || '-'}
            </p>
            <p className="font-mono text-[10px] text-[#6B7280] line-clamp-2">
              {ctx.identityAnchor}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface StoryGeneratorViewProps {
  project: FilmProject;
  onUpdateProject: (updater: (prev: FilmProject) => FilmProject) => void;
  onNavigateWithContext: (section: NavSection, ctx?: StudioJumpContext) => void;
}

export function StoryGeneratorView({
  project,
  onUpdateProject,
  onNavigateWithContext,
}: StoryGeneratorViewProps) {
  const [loadingSection, setLoadingSection] = useState<StoryRegenerateSection | null>(null);
  const [error, setError] = useState<StudioErrorDetails | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const lastRetryRef = useRef<(() => void) | null>(null);

  const input = project.input;
  const story = project.story;

  const updateInput = (patch: Partial<FilmFormInput>) => {
    onUpdateProject((prev) => ({
      ...prev,
      input: { ...prev.input, ...patch },
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateStory = (patch: Partial<StoryResult>) => {
    onUpdateProject((prev) => {
      const base: StoryResult = prev.story || {
        storyTitle: prev.input.title || '',
        logline: '',
        shortSynopsis: '',
        fullSynopsis: '',
        synopsis: '',
        worldBackground: '',
        mainConflict: '',
        supportingConflict: '',
        climax: '',
        resolution: '',
        ending: '',
        threeActStructure: { act1: '', act2: '', act3: '' },
        themes: [],
        episodeOutlines: [],
      };
      const merged: StoryResult = {
        ...base,
        ...patch,
      };
      if (patch.fullSynopsis !== undefined && patch.synopsis === undefined) {
        merged.synopsis = patch.fullSynopsis;
      }
      if (patch.synopsis !== undefined && patch.fullSynopsis === undefined) {
        merged.fullSynopsis = patch.synopsis;
      }
      return {
        ...prev,
        story: merged,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleGenerateStory = async (targetSection: StoryRegenerateSection = 'all') => {
    if (!input.title.trim() || !input.premise.trim()) {
      lastRetryRef.current = null;
      setError({
        category: 'BAD_REQUEST',
        message: 'Judul film dan ide/premis cerita wajib diisi sebelum menghasilkan cerita.',
        retryable: false,
      });
      return;
    }

    lastRetryRef.current = () => {
      void handleGenerateStory(targetSection);
    };
    setError(null);
    setLoadingSection(targetSection);
    try {
      const effectiveConsistency = buildEffectiveConsistencyPayload(
        project.characters,
        project.consistency
      );
      const { story: generated } = await apiGenerateStory(input, {
        characters: project.characters,
        consistency: effectiveConsistency,
        existingStory: targetSection === 'all' ? null : story,
        targetSection,
      });

      onUpdateProject((prev) => {
        const current = prev.story;
        if (!current || targetSection === 'all') {
          return {
            ...prev,
            story: {
              ...generated,
              storyTitle: generated.storyTitle || prev.input.title,
              fullSynopsis: generated.fullSynopsis || generated.synopsis,
              synopsis: generated.synopsis || generated.fullSynopsis || '',
            },
            updatedAt: new Date().toISOString(),
          };
        }

        const nextStory: StoryResult = { ...current };
        if (targetSection === 'title_logline') {
          nextStory.storyTitle = generated.storyTitle || current.storyTitle;
          nextStory.logline = generated.logline || current.logline;
          if (generated.themes?.length) nextStory.themes = generated.themes;
        } else if (targetSection === 'synopsis_world') {
          nextStory.shortSynopsis = generated.shortSynopsis || current.shortSynopsis;
          nextStory.fullSynopsis =
            generated.fullSynopsis || generated.synopsis || current.fullSynopsis;
          nextStory.synopsis = nextStory.fullSynopsis || current.synopsis;
          nextStory.worldBackground = generated.worldBackground || current.worldBackground;
        } else if (targetSection === 'conflicts') {
          nextStory.mainConflict = generated.mainConflict || current.mainConflict;
          nextStory.supportingConflict =
            generated.supportingConflict || current.supportingConflict;
          nextStory.climax = generated.climax || current.climax;
        } else if (targetSection === 'ending') {
          nextStory.resolution = generated.resolution || current.resolution;
          nextStory.ending = generated.ending || current.ending;
          nextStory.threeActStructure =
            generated.threeActStructure || current.threeActStructure;
        } else if (targetSection === 'episodes') {
          nextStory.episodeOutlines = generated.episodeOutlines || current.episodeOutlines;
        }

        return {
          ...prev,
          story: nextStory,
          updatedAt: new Date().toISOString(),
        };
      });
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setLoadingSection(null);
    }
  };

  const busy = loadingSection !== null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">
            01. AI Story Generator
          </h1>
          <p className="text-sm text-[#9CA3AF] leading-relaxed">
            Kembangkan premis menjadi struktur cerita lengkap (judul, logline, sinopsis singkat &amp; lengkap, dunia cerita, konflik, klimaks, resolusi, ending, dan garis besar episode) menggunakan Gemini API dan karakter tersimpan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleGenerateStory('all')}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold min-h-[44px] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {loadingSection === 'all' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {loadingSection === 'all' ? 'Menyusun Cerita...' : 'Generate Cerita'}
        </button>
      </div>

      {error ? (
        <StudioErrorBanner
          error={error}
          onRetry={lastRetryRef.current ? () => lastRetryRef.current?.() : undefined}
          isRetrying={busy}
        />
      ) : null}

      <CharacterConsistencyIntegrationBanner
        project={project}
        onNavigate={(sec) => onNavigateWithContext(sec)}
      />

      <section className="p-5 sm:p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-[#F4F5F7]">
            Parameter Cerita &amp; Produksi
          </h2>
          <span className="text-[11px] text-[#9CA3AF]">
            Otomatis tersimpan ke IndexedDB saat diubah
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs text-[#9CA3AF] mb-1.5">Judul Film</label>
            <input
              type="text"
              value={input.title}
              onChange={(e) => updateInput({ title: e.target.value })}
              placeholder="Contoh: Senja di Stasiun Terakhir"
              className="w-full h-11 px-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs text-[#9CA3AF] mb-1.5">Ide atau Premis Cerita</label>
            <textarea
              rows={3}
              value={input.premise}
              onChange={(e) => updateInput({ premise: e.target.value })}
              placeholder="Jelaskan ide utama, konflik inti, atau situasi pembuka cerita..."
              className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] placeholder:text-[#6B7280] leading-relaxed focus:outline-none focus:border-[#8B5CF6]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#9CA3AF] mb-1.5">Genre</label>
            <select
              value={input.genre}
              onChange={(e) => updateInput({ genre: e.target.value })}
              className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
            >
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#9CA3AF] mb-1.5">Tema Cerita</label>
            <input
              type="text"
              value={input.storyTheme || ''}
              onChange={(e) => updateInput({ storyTheme: e.target.value })}
              placeholder="Mis: Pengorbanan keluarga, pengkhianatan, penebusan"
              className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] placeholder:text-[#6B7280]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#9CA3AF] mb-1.5">Gaya Penceritaan</label>
            <select
              value={input.storytellingStyle || input.visualStyle || 'Sinematik Gelap'}
              onChange={(e) => updateInput({ storytellingStyle: e.target.value })}
              className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
            >
              {STORYTELLING_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#9CA3AF] mb-1.5">Target Penonton</label>
            <select
              value={input.targetAudience || 'Remaja & Dewasa Muda (17+)'}
              onChange={(e) => updateInput({ targetAudience: e.target.value })}
              className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
            >
              {TARGET_AUDIENCES.map((aud) => (
                <option key={aud} value={aud}>
                  {aud}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#9CA3AF] mb-1.5">Bahasa Cerita</label>
            <select
              value={input.storyLanguage || input.dialogueLanguage}
              onChange={(e) => updateInput({ storyLanguage: e.target.value })}
              className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Episode</label>
              <input
                type="number"
                min={1}
                max={20}
                value={input.episodeCount}
                onChange={(e) =>
                  updateInput({
                    episodeCount: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                  })
                }
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm font-mono tabular-nums text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Durasi Target</label>
              <select
                value={input.videoDuration}
                onChange={(e) => updateInput({ videoDuration: e.target.value })}
                className="w-full h-11 px-2.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              >
                {DURATIONS.map((dur) => (
                  <option key={dur} value={dur}>
                    {dur}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {story ? (
        <div className="space-y-5">
          {/* Toolbar Aksi Ekspor & Lanjut Alur */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-4 rounded-xl bg-[#12141A] border border-white/[0.08]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyText('story_txt', formatStoryTxt(project, story))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#8B5CF6]/50 min-h-[44px]"
              >
                {copiedKey === 'story_txt' ? (
                  <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#8B5CF6]" />
                )}
                Salin Cerita
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `${(story.storyTitle || input.title || 'cerita').toLowerCase().replace(/\s+/g, '-')}-cerita.txt`,
                    formatStoryTxt(project, story)
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#3B82F6]/50 min-h-[44px]"
              >
                <Download className="w-3.5 h-3.5 text-[#3B82F6]" />
                Unduh TXT
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadJsonFile(
                    `${(story.storyTitle || input.title || 'cerita').toLowerCase().replace(/\s+/g, '-')}-story.json`,
                    { input, story }
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#3B82F6]/50 min-h-[44px]"
              >
                <FileJson className="w-3.5 h-3.5 text-[#3B82F6]" />
                Ekspor JSON
              </button>
            </div>
            <button
              type="button"
              onClick={() => onNavigateWithContext('script')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white min-h-[44px]"
            >
              Teruskan ke Script Writer
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Bagian 1: Judul Cerita & Logline */}
          <div className="p-5 sm:p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[#F4F5F7]">
                Judul Cerita &amp; Logline
              </h3>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleGenerateStory('title_logline')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 min-h-[44px] disabled:opacity-50"
              >
                {loadingSection === 'title_logline' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-[#E5A93C]" />
                )}
                Generate Ulang
              </button>
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Judul Cerita</label>
              <input
                type="text"
                value={story.storyTitle || input.title}
                onChange={(e) => updateStory({ storyTitle: e.target.value })}
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm font-medium text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Logline</label>
              <textarea
                rows={2}
                value={story.logline}
                onChange={(e) => updateStory({ logline: e.target.value })}
                className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] leading-relaxed"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">
                Tema Utama (pisahkan dengan koma)
              </label>
              <input
                type="text"
                value={(story.themes || []).join(', ')}
                onChange={(e) =>
                  updateStory({
                    themes: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
              />
            </div>
          </div>

          {/* Bagian 2: Sinopsis & Latar Belakang Dunia */}
          <div className="p-5 sm:p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[#F4F5F7]">
                Sinopsis &amp; Latar Belakang Dunia Cerita
              </h3>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleGenerateStory('synopsis_world')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 min-h-[44px] disabled:opacity-50"
              >
                {loadingSection === 'synopsis_world' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-[#E5A93C]" />
                )}
                Generate Ulang
              </button>
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Sinopsis Singkat</label>
              <textarea
                rows={2}
                value={story.shortSynopsis || ''}
                onChange={(e) => updateStory({ shortSynopsis: e.target.value })}
                className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] leading-relaxed"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Sinopsis Lengkap</label>
              <textarea
                rows={5}
                value={story.fullSynopsis || story.synopsis}
                onChange={(e) =>
                  updateStory({ fullSynopsis: e.target.value, synopsis: e.target.value })
                }
                className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] leading-relaxed"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">
                Latar Belakang Dunia Cerita
              </label>
              <textarea
                rows={3}
                value={story.worldBackground || ''}
                onChange={(e) => updateStory({ worldBackground: e.target.value })}
                className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] leading-relaxed"
              />
            </div>
          </div>

          {/* Bagian 3: Konflik & Klimaks */}
          <div className="p-5 sm:p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[#F4F5F7]">
                Konflik Utama, Pendukung &amp; Klimaks
              </h3>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleGenerateStory('conflicts')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 min-h-[44px] disabled:opacity-50"
              >
                {loadingSection === 'conflicts' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-[#E5A93C]" />
                )}
                Generate Ulang
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1.5">Konflik Utama</label>
                <textarea
                  rows={4}
                  value={story.mainConflict || ''}
                  onChange={(e) => updateStory({ mainConflict: e.target.value })}
                  className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] leading-relaxed"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1.5">Konflik Pendukung</label>
                <textarea
                  rows={4}
                  value={story.supportingConflict || ''}
                  onChange={(e) => updateStory({ supportingConflict: e.target.value })}
                  className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] leading-relaxed"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1.5">Klimaks</label>
                <textarea
                  rows={4}
                  value={story.climax || ''}
                  onChange={(e) => updateStory({ climax: e.target.value })}
                  className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] leading-relaxed"
                />
              </div>
            </div>
          </div>

          {/* Bagian 4: Penyelesaian, Ending & Struktur 3 Babak */}
          <div className="p-5 sm:p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[#F4F5F7]">
                Penyelesaian, Ending &amp; Struktur Tiga Babak
              </h3>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleGenerateStory('ending')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 min-h-[44px] disabled:opacity-50"
              >
                {loadingSection === 'ending' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-[#E5A93C]" />
                )}
                Generate Ulang
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1.5">Penyelesaian Cerita</label>
                <textarea
                  rows={3}
                  value={story.resolution || ''}
                  onChange={(e) => updateStory({ resolution: e.target.value })}
                  className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] leading-relaxed"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1.5">Ending</label>
                <textarea
                  rows={3}
                  value={story.ending || ''}
                  onChange={(e) => updateStory({ ending: e.target.value })}
                  className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] leading-relaxed"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-white/[0.06]">
              {(['act1', 'act2', 'act3'] as const).map((act, idx) => (
                <div key={act}>
                  <label className="block font-mono text-xs text-[#E5A93C] mb-1.5">
                    Babak 0{idx + 1}
                  </label>
                  <textarea
                    rows={3}
                    value={story.threeActStructure?.[act] || ''}
                    onChange={(e) =>
                      updateStory({
                        threeActStructure: {
                          ...story.threeActStructure,
                          [act]: e.target.value,
                        },
                      })
                    }
                    className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7] leading-relaxed"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Bagian 5: Garis Besar Episode */}
          <div className="p-5 sm:p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[#F4F5F7]">
                Garis Besar Episode ({story.episodeOutlines.length})
              </h3>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleGenerateStory('episodes')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 min-h-[44px] disabled:opacity-50"
              >
                {loadingSection === 'episodes' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-[#E5A93C]" />
                )}
                Generate Ulang Episode
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {story.episodeOutlines.map((ep, idx) => (
                <div
                  key={ep.episodeNumber}
                  className="p-4 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-2.5"
                >
                  <p className="font-mono text-xs text-[#E5A93C]">Episode {ep.episodeNumber}</p>
                  <input
                    type="text"
                    value={ep.title}
                    onChange={(e) => {
                      const nextEps = story.episodeOutlines.map((item, i) =>
                        i === idx ? { ...item, title: e.target.value } : item
                      );
                      updateStory({ episodeOutlines: nextEps });
                    }}
                    className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-sm font-medium text-[#F4F5F7]"
                  />
                  <textarea
                    rows={3}
                    value={ep.summary}
                    onChange={(e) => {
                      const nextEps = story.episodeOutlines.map((item, i) =>
                        i === idx ? { ...item, summary: e.target.value } : item
                      );
                      updateStory({ episodeOutlines: nextEps });
                    }}
                    className="w-full p-2.5 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#9CA3AF] leading-relaxed"
                  />
                  <input
                    type="text"
                    value={ep.cliffhanger}
                    onChange={(e) => {
                      const nextEps = story.episodeOutlines.map((item, i) =>
                        i === idx ? { ...item, cliffhanger: e.target.value } : item
                      );
                      updateStory({ episodeOutlines: nextEps });
                    }}
                    placeholder="Cliffhanger episode..."
                    className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#E5A93C]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-10 rounded-xl bg-[#12141A] border border-white/[0.08] text-center space-y-3">
          <BookOpen className="w-8 h-8 text-[#8B5CF6] mx-auto" />
          <p className="text-sm text-[#9CA3AF]">
            Belum ada cerita yang dihasilkan. Lengkapi parameter di atas lalu tekan{' '}
            <strong className="text-[#F4F5F7]">Generate Cerita</strong> untuk memanggil Gemini API.
          </p>
        </div>
      )}
    </div>
  );
}

interface ScriptWriterViewProps {
  project: FilmProject;
  onUpdateProject: (updater: (prev: FilmProject) => FilmProject) => void;
  onNavigateWithContext: (section: NavSection, ctx?: StudioJumpContext) => void;
}

export function ScriptWriterView({
  project,
  onUpdateProject,
  onNavigateWithContext,
}: ScriptWriterViewProps) {
  const [loadingTarget, setLoadingTarget] = useState<'all' | number | null>(null);
  const [error, setError] = useState<StudioErrorDetails | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const lastRetryRef = useRef<(() => void) | null>(null);

  const input = project.input;
  const charVoiceMap = useMemo(
    () => new Map(project.characters.map((c) => [c.name.trim().toLowerCase(), c.voiceTone])),
    [project.characters]
  );

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleGenerateScript = async (targetSceneNumber?: number) => {
    if (!input.title.trim() || !input.premise.trim()) {
      lastRetryRef.current = null;
      setError({
        category: 'BAD_REQUEST',
        message: 'Judul film dan premis cerita belum diisi. Lengkapi di Formulir Produksi atau Story Generator terlebih dahulu.',
        retryable: false,
      });
      return;
    }

    lastRetryRef.current = () => {
      void handleGenerateScript(targetSceneNumber);
    };
    setError(null);
    setLoadingTarget(targetSceneNumber ?? 'all');
    try {
      const effectiveConsistency = buildEffectiveConsistencyPayload(
        project.characters,
        project.consistency
      );
      const { script: generated } = await apiGenerateScript(
        input,
        project.scenes,
        project.characters,
        {
          story: project.story,
          consistency: effectiveConsistency,
          targetSceneNumber,
          existingScript: targetSceneNumber ? project.script : undefined,
        }
      );

      onUpdateProject((prev) => {
        if (!targetSceneNumber || generated.length === 0) {
          return {
            ...prev,
            script: generated,
            updatedAt: new Date().toISOString(),
          };
        }
        const replacement = { ...generated[0], sceneNumber: targetSceneNumber };
        const exists = prev.script.some((b) => b.sceneNumber === targetSceneNumber);
        const nextScript = exists
          ? prev.script.map((b) => (b.sceneNumber === targetSceneNumber ? replacement : b))
          : [...prev.script, replacement];
        return {
          ...prev,
          script: nextScript,
          updatedAt: new Date().toISOString(),
        };
      });
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setLoadingTarget(null);
    }
  };

  const updateBlock = (sceneNumber: number, patch: Partial<ScriptBlock>) => {
    onUpdateProject((prev) => ({
      ...prev,
      script: prev.script.map((b) => {
        if (b.sceneNumber !== sceneNumber) return b;
        const next = { ...b, ...patch };
        if (
          patch.interiorExterior !== undefined ||
          patch.location !== undefined ||
          patch.timeOfDay !== undefined
        ) {
          next.slugline = buildSlugline(next.interiorExterior, next.location, next.timeOfDay);
        }
        if (patch.visualDescription !== undefined || patch.characterActions !== undefined) {
          next.action = [next.visualDescription, next.characterActions]
            .filter(Boolean)
            .join(' ');
        }
        return next;
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateDialogue = (
    sceneNumber: number,
    dlgIdx: number,
    patch: Partial<ScriptDialogue>
  ) => {
    onUpdateProject((prev) => ({
      ...prev,
      script: prev.script.map((b) =>
        b.sceneNumber === sceneNumber
          ? {
              ...b,
              dialogues: b.dialogues.map((d, i) => (i === dlgIdx ? { ...d, ...patch } : d)),
            }
          : b
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const addDialogue = (sceneNumber: number) => {
    const defaultChar = project.characters[0]?.name || 'KARAKTER';
    onUpdateProject((prev) => ({
      ...prev,
      script: prev.script.map((b) =>
        b.sceneNumber === sceneNumber
          ? {
              ...b,
              dialogues: [
                ...b.dialogues,
                {
                  character: defaultChar,
                  parenthetical: '',
                  expression: 'Serius',
                  line: '',
                },
              ],
            }
          : b
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const removeDialogue = (sceneNumber: number, dlgIdx: number) => {
    onUpdateProject((prev) => ({
      ...prev,
      script: prev.script.map((b) =>
        b.sceneNumber === sceneNumber
          ? {
              ...b,
              dialogues: b.dialogues.filter((_, i) => i !== dlgIdx),
            }
          : b
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const addManualScriptScene = () => {
    const nextNum =
      project.script.reduce((max, b) => Math.max(max, b.sceneNumber), 0) + 1;
    const newBlock: ScriptBlock = {
      sceneNumber: nextNum,
      sceneTitle: `Adegan ${nextNum}`,
      interiorExterior: 'INT',
      location: 'RUANG TAMU',
      timeOfDay: 'MALAM',
      slugline: 'INT. RUANG TAMU - MALAM',
      characters: project.characters.slice(0, 2).map((c) => c.name),
      visualDescription: '',
      characterActions: '',
      action: '',
      cameraDirection: 'Medium shot stabil',
      lighting: 'Pencahayaan hangat kontras rendah',
      audioMood: 'Hening dengan ambient ruangan',
      dialogues: [],
    };
    onUpdateProject((prev) => ({
      ...prev,
      script: [...prev.script, newBlock],
      updatedAt: new Date().toISOString(),
    }));
  };

  const removeScriptScene = (sceneNumber: number) => {
    onUpdateProject((prev) => ({
      ...prev,
      script: prev.script.filter((b) => b.sceneNumber !== sceneNumber),
      updatedAt: new Date().toISOString(),
    }));
  };

  const busy = loadingTarget !== null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">
            02. AI Script Writer
          </h1>
          <p className="text-sm text-[#9CA3AF] leading-relaxed">
            Kembangkan cerita dari Story Generator menjadi naskah film profesional lengkap dengan INT/EXT, visual, aksi, dialog dalam <strong className="text-[#F4F5F7]">{input.dialogueLanguage}</strong> (sesuai voiceTone karakter), ekspresi, kamera, pencahayaan, dan suasana audio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleGenerateScript()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold min-h-[44px] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {loadingTarget === 'all' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {loadingTarget === 'all' ? 'Menulis Naskah...' : 'Generate Naskah'}
        </button>
      </div>

      {error ? (
        <StudioErrorBanner
          error={error}
          onRetry={lastRetryRef.current ? () => lastRetryRef.current?.() : undefined}
          isRetrying={busy}
        />
      ) : null}

      <CharacterConsistencyIntegrationBanner
        project={project}
        onNavigate={(sec) => onNavigateWithContext(sec)}
      />

      {/* Bar Konteks Story -> Script & Pilihan Bahasa Dialog */}
      <div className="p-4 rounded-xl bg-[#12141A] border border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium text-[#F4F5F7] truncate">
            Sumber Cerita: {project.story?.storyTitle || input.title || 'Judul belum diisi'}{' '}
            {project.story ? (
              <span className="text-[#22C55E] font-mono text-[11px] ml-1.5">
                (Terhubung dengan Story Generator)
              </span>
            ) : (
              <span className="text-[#9CA3AF] text-[11px] ml-1.5">
                (Menggunakan premis formulir; buat cerita dulu di Story Generator untuk hasil lebih kaya)
              </span>
            )}
          </p>
          {project.story?.logline ? (
            <p className="text-xs text-[#9CA3AF] line-clamp-1">{project.story.logline}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label className="text-xs text-[#9CA3AF]" htmlFor="script-lang-select">
            Bahasa Dialog:
          </label>
          <select
            id="script-lang-select"
            value={input.dialogueLanguage}
            onChange={(e) =>
              onUpdateProject((prev) => ({
                ...prev,
                input: { ...prev.input, dialogueLanguage: e.target.value },
                updatedAt: new Date().toISOString(),
              }))
            }
            className="h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Toolbar Aksi Naskah */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-4 rounded-xl bg-[#12141A] border border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addManualScriptScene}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 min-h-[44px]"
          >
            <Plus className="w-3.5 h-3.5 text-[#E5A93C]" />
            Tambah Adegan
          </button>
          {project.script.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => void copyText('script_txt', formatScreenplayTxt(project))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#8B5CF6]/50 min-h-[44px]"
              >
                {copiedKey === 'script_txt' ? (
                  <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#8B5CF6]" />
                )}
                Salin Naskah
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `${(input.title || 'naskah').toLowerCase().replace(/\s+/g, '-')}-naskah.txt`,
                    formatScreenplayTxt(project)
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#3B82F6]/50 min-h-[44px]"
              >
                <Download className="w-3.5 h-3.5 text-[#3B82F6]" />
                Unduh TXT
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadJsonFile(
                    `${(input.title || 'naskah').toLowerCase().replace(/\s+/g, '-')}-script.json`,
                    { title: input.title, dialogueLanguage: input.dialogueLanguage, script: project.script }
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#3B82F6]/50 min-h-[44px]"
              >
                <FileJson className="w-3.5 h-3.5 text-[#3B82F6]" />
                Ekspor JSON
              </button>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onNavigateWithContext('scenes')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white min-h-[44px]"
        >
          Teruskan ke Scene Breakdown
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {project.script.length > 0 ? (
        <div className="space-y-5">
          {project.script.map((block) => (
            <div
              key={block.sceneNumber}
              className="p-5 sm:p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4"
            >
              {/* Header Adegan Naskah */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
                <div className="space-y-0.5 min-w-0">
                  <p className="font-mono text-xs font-semibold text-[#E5A93C]">
                    ADEGAN {block.sceneNumber} · {block.slugline}
                  </p>
                  {block.sceneTitle ? (
                    <p className="text-sm font-semibold text-[#F4F5F7]">{block.sceneTitle}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleGenerateScript(block.sceneNumber)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 min-h-[44px] disabled:opacity-50"
                  >
                    {loadingTarget === block.sceneNumber ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-[#E5A93C]" />
                    )}
                    Generate Ulang
                  </button>
                  {block.dialogues.length > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigateWithContext('voice', {
                          voiceLabel: `Dialog Adegan ${block.sceneNumber}`,
                          voiceText: block.dialogues
                            .map((d) => `${d.character}: ${d.line}`)
                            .join('\n'),
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#3B82F6]/50 min-h-[44px]"
                    >
                      <Mic className="w-3.5 h-3.5 text-[#3B82F6]" />
                      Voice Studio
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeScriptScene(block.sceneNumber)}
                    aria-label={`Hapus adegan naskah ${block.sceneNumber}`}
                    className="p-2 rounded-lg text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#EF4444]/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Metadata & Heading Editable */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">Judul Adegan</label>
                  <input
                    type="text"
                    value={block.sceneTitle || ''}
                    onChange={(e) => updateBlock(block.sceneNumber, { sceneTitle: e.target.value })}
                    placeholder={`Adegan ${block.sceneNumber}`}
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">INT / EXT</label>
                  <select
                    value={block.interiorExterior || 'INT'}
                    onChange={(e) =>
                      updateBlock(block.sceneNumber, {
                        interiorExterior: e.target.value as 'INT' | 'EXT' | 'INT/EXT',
                      })
                    }
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
                  >
                    <option value="INT">INT (Interior)</option>
                    <option value="EXT">EXT (Eksterior)</option>
                    <option value="INT/EXT">INT/EXT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">Lokasi</label>
                  <input
                    type="text"
                    value={block.location || ''}
                    onChange={(e) => updateBlock(block.sceneNumber, { location: e.target.value })}
                    placeholder="Lokasi adegan..."
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">Waktu</label>
                  <input
                    type="text"
                    value={block.timeOfDay || ''}
                    onChange={(e) => updateBlock(block.sceneNumber, { timeOfDay: e.target.value })}
                    placeholder="MALAM / SENJA / PAGI"
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
                  />
                </div>
              </div>

              {/* Karakter yang Muncul */}
              <div className="space-y-1.5">
                <label className="block text-[11px] text-[#9CA3AF]">
                  Karakter yang Muncul (pisahkan koma atau pilih dari Character Studio)
                </label>
                <input
                  type="text"
                  value={(block.characters || []).join(', ')}
                  onChange={(e) =>
                    updateBlock(block.sceneNumber, {
                      characters: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="w-full h-10 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
                />
                {project.characters.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {project.characters.map((c) => {
                      const active = (block.characters || []).some(
                        (n) => n.toLowerCase() === c.name.toLowerCase()
                      );
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            const curr = block.characters || [];
                            const next = active
                              ? curr.filter((n) => n.toLowerCase() !== c.name.toLowerCase())
                              : [...curr, c.name];
                            updateBlock(block.sceneNumber, { characters: next });
                          }}
                          className={`px-2.5 py-1 rounded text-[11px] border ${
                            active
                              ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50 text-[#F4F5F7]'
                              : 'bg-[#0A0B0E] border-white/[0.08] text-[#9CA3AF]'
                          }`}
                        >
                          {active ? '✓ ' : '+ '}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Visual, Aksi, Kamera, Pencahayaan, Audio */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">Deskripsi Visual</label>
                  <textarea
                    rows={3}
                    value={block.visualDescription ?? block.action ?? ''}
                    onChange={(e) =>
                      updateBlock(block.sceneNumber, { visualDescription: e.target.value })
                    }
                    className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7] leading-relaxed"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">Aksi Karakter</label>
                  <textarea
                    rows={3}
                    value={block.characterActions ?? block.action ?? ''}
                    onChange={(e) =>
                      updateBlock(block.sceneNumber, { characterActions: e.target.value })
                    }
                    className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7] leading-relaxed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">Petunjuk Kamera</label>
                  <input
                    type="text"
                    value={block.cameraDirection || ''}
                    onChange={(e) =>
                      updateBlock(block.sceneNumber, { cameraDirection: e.target.value })
                    }
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">Pencahayaan</label>
                  <input
                    type="text"
                    value={block.lighting || ''}
                    onChange={(e) => updateBlock(block.sceneNumber, { lighting: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9CA3AF] mb-1">Suasana Audio</label>
                  <input
                    type="text"
                    value={block.audioMood || ''}
                    onChange={(e) => updateBlock(block.sceneNumber, { audioMood: e.target.value })}
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
                  />
                </div>
              </div>

              {/* Dialog Editor */}
              <div className="pt-3 border-t border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#F4F5F7]">
                    Dialog ({block.dialogues.length} Baris)
                  </p>
                  <button
                    type="button"
                    onClick={() => addDialogue(block.sceneNumber)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#8B5CF6]/50 min-h-[40px]"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#8B5CF6]" />
                    Tambah Dialog
                  </button>
                </div>

                {block.dialogues.length > 0 ? (
                  <div className="space-y-3">
                    {block.dialogues.map((dlg, idx) => {
                      const voiceToneHint = charVoiceMap.get(
                        dlg.character.trim().toLowerCase()
                      );
                      return (
                        <div
                          key={`${block.sceneNumber}_${idx}`}
                          className="p-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-2.5"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                            <div className="sm:col-span-4">
                              <label className="block text-[10px] text-[#6B7280] mb-1">
                                Karakter
                              </label>
                              <input
                                type="text"
                                list={`chars-list-${block.sceneNumber}`}
                                value={dlg.character}
                                onChange={(e) =>
                                  updateDialogue(block.sceneNumber, idx, {
                                    character: e.target.value,
                                  })
                                }
                                className="w-full h-10 px-2.5 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs font-semibold text-[#F4F5F7]"
                              />
                              <datalist id={`chars-list-${block.sceneNumber}`}>
                                {project.characters.map((c) => (
                                  <option key={c.id} value={c.name} />
                                ))}
                              </datalist>
                            </div>
                            <div className="sm:col-span-4">
                              <label className="block text-[10px] text-[#6B7280] mb-1">
                                Ekspresi Karakter
                              </label>
                              <input
                                type="text"
                                value={dlg.expression || ''}
                                onChange={(e) =>
                                  updateDialogue(block.sceneNumber, idx, {
                                    expression: e.target.value,
                                  })
                                }
                                placeholder="Mis: Tegang, mata berkaca-kaca"
                                className="w-full h-10 px-2.5 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-[10px] text-[#6B7280] mb-1">
                                Catatan / Parenthetical
                              </label>
                              <input
                                type="text"
                                value={dlg.parenthetical || ''}
                                onChange={(e) =>
                                  updateDialogue(block.sceneNumber, idx, {
                                    parenthetical: e.target.value,
                                  })
                                }
                                placeholder="Mis: berbisik"
                                className="w-full h-10 px-2.5 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#9CA3AF]"
                              />
                            </div>
                            <div className="sm:col-span-1 flex justify-end pt-3 sm:pt-4">
                              <button
                                type="button"
                                onClick={() => removeDialogue(block.sceneNumber, idx)}
                                aria-label="Hapus dialog"
                                className="p-2 rounded text-[#6B7280] hover:text-[#EF4444]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {voiceToneHint ? (
                            <p className="text-[11px] text-[#8B5CF6]">
                              Acuan voiceTone ({dlg.character}): {voiceToneHint}
                            </p>
                          ) : null}
                          <textarea
                            rows={2}
                            value={dlg.line}
                            onChange={(e) =>
                              updateDialogue(block.sceneNumber, idx, { line: e.target.value })
                            }
                            placeholder={`Tulis dialog dalam ${input.dialogueLanguage}...`}
                            className="w-full p-2.5 rounded-lg bg-[#12141A] border border-white/[0.08] text-sm text-[#F4F5F7] leading-relaxed"
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#6B7280]">
                    Adegan tanpa dialog (beat visual). Klik Tambah Dialog jika ingin menambahkan percakapan.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-10 rounded-xl bg-[#12141A] border border-white/[0.08] text-center space-y-3">
          <FileText className="w-8 h-8 text-[#8B5CF6] mx-auto" />
          <p className="text-sm text-[#9CA3AF]">
            Belum ada naskah skenario. Tekan <strong className="text-[#F4F5F7]">Generate Naskah</strong> untuk menyusun skenario profesional berdasarkan cerita dan karakter Anda.
          </p>
        </div>
      )}
    </div>
  );
}

interface SceneBreakdownViewProps {
  project: FilmProject;
  onUpdateProject: (updater: (prev: FilmProject) => FilmProject) => void;
  onNavigateWithContext: (section: NavSection, ctx?: StudioJumpContext) => void;
}

export function SceneBreakdownView({
  project,
  onUpdateProject,
  onNavigateWithContext,
}: SceneBreakdownViewProps) {
  const [loadingTarget, setLoadingTarget] = useState<'all' | number | null>(null);
  const [error, setError] = useState<StudioErrorDetails | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedSceneNumbers, setExpandedSceneNumbers] = useState<Record<number, boolean>>({});
  const lastRetryRef = useRef<(() => void) | null>(null);

  const input = project.input;
  const targetTotalSeconds = parseVideoDurationSeconds(input.videoDuration);
  const currentTotalSeconds = project.scenes.reduce(
    (sum, s) => sum + (Number(s.estimatedSeconds) || 0),
    0
  );

  const toggleExpand = (sceneNumber: number) => {
    setExpandedSceneNumbers((prev) => ({ ...prev, [sceneNumber]: !prev[sceneNumber] }));
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleGenerateScenes = async (targetSceneNumber?: number) => {
    if (!input.title.trim() || !input.premise.trim()) {
      lastRetryRef.current = null;
      setError({
        category: 'BAD_REQUEST',
        message: 'Judul film dan premis cerita belum diisi. Lengkapi di Formulir Produksi terlebih dahulu.',
        retryable: false,
      });
      return;
    }

    lastRetryRef.current = () => {
      void handleGenerateScenes(targetSceneNumber);
    };
    setError(null);
    setLoadingTarget(targetSceneNumber ?? 'all');
    try {
      const effectiveConsistency = buildEffectiveConsistencyPayload(
        project.characters,
        project.consistency
      );
      const { scenes: generated } = await apiGenerateScenes(
        input,
        project.story?.fullSynopsis || project.story?.synopsis,
        project.characters,
        {
          story: project.story,
          script: project.script,
          consistency: effectiveConsistency,
          targetSceneNumber,
        }
      );

      onUpdateProject((prev) => {
        if (!targetSceneNumber) {
          const prevImagesByNum = new Map(
            prev.scenes
              .filter((s) => s.imageDataUrl)
              .map((s) => [
                s.sceneNumber,
                {
                  imageDataUrl: s.imageDataUrl,
                  imageMimeType: s.imageMimeType,
                  imagePromptUsed: s.imagePromptUsed,
                  imageSource: s.imageSource,
                  imageUpdatedAt: s.imageUpdatedAt,
                },
              ])
          );
          const merged = reindexScenes(generated).map((sc) => {
            const img = prevImagesByNum.get(sc.sceneNumber);
            return img ? { ...sc, ...img } : sc;
          });
          return {
            ...prev,
            scenes: merged,
            updatedAt: new Date().toISOString(),
          };
        }

        if (generated.length === 0) return prev;
        const replacement = { ...generated[0], sceneNumber: targetSceneNumber };
        const nextScenes = prev.scenes.map((s) =>
          s.sceneNumber === targetSceneNumber
            ? {
                ...replacement,
                imageDataUrl: s.imageDataUrl,
                imageMimeType: s.imageMimeType,
                imagePromptUsed: s.imagePromptUsed,
                imageSource: s.imageSource,
                imageUpdatedAt: s.imageUpdatedAt,
              }
            : s
        );
        return {
          ...prev,
          scenes: reindexScenes(nextScenes),
          updatedAt: new Date().toISOString(),
        };
      });
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setLoadingTarget(null);
    }
  };

  const addManualScene = () => {
    onUpdateProject((prev) => {
      const nextNum = prev.scenes.reduce((max, s) => Math.max(max, s.sceneNumber), 0) + 1;
      const defaultSec = Math.max(
        5,
        Math.round(targetTotalSeconds / Math.max(1, prev.input.sceneCount || 4))
      );
      const added: GeneratedScene = {
        sceneId: `SCN-${String(nextNum).padStart(3, '0')}`,
        sceneNumber: nextNum,
        episodeNumber: 1,
        heading: `ADEGAN ${nextNum} — LOKASI BARU`,
        location: 'Lokasi belum ditentukan',
        timeOfDay: 'Malam',
        lighting: 'Natural kontras',
        cameraMovement: 'Medium tracking shot',
        mood: 'Dramatis',
        actionSummary: '',
        mainAction: '',
        dialogue: '',
        visualNeeds: 'Framing sinematik konsisten dengan anchor karakter',
        audioNeeds: 'Ambience lokasi dan dialog jernih',
        transitionToNext: 'Cut ke adegan berikutnya',
        charactersInvolved: prev.characters.slice(0, 2).map((c) => c.name),
        estimatedSeconds: defaultSec,
        duration: `${defaultSec} detik`,
      };
      return {
        ...prev,
        scenes: reindexScenes([...prev.scenes, added]),
        updatedAt: new Date().toISOString(),
      };
    });
    setExpandedSceneNumbers((prev) => ({ ...prev, [project.scenes.length + 1]: true }));
  };

  const updateScene = (sceneNumber: number, patch: Partial<GeneratedScene>) => {
    onUpdateProject((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s) => {
        if (s.sceneNumber !== sceneNumber) return s;
        const next = { ...s, ...patch };
        if (patch.mainAction !== undefined && patch.actionSummary === undefined) {
          next.actionSummary = patch.mainAction;
        }
        if (patch.actionSummary !== undefined && patch.mainAction === undefined) {
          next.mainAction = patch.actionSummary;
        }
        if (patch.estimatedSeconds !== undefined) {
          next.duration = `${Math.max(1, patch.estimatedSeconds)} detik`;
        }
        return next;
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const removeScene = (sceneNumber: number) => {
    onUpdateProject((prev) => ({
      ...prev,
      scenes: reindexScenes(prev.scenes.filter((s) => s.sceneNumber !== sceneNumber)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleMoveScene = (index: number, direction: 'up' | 'down') => {
    onUpdateProject((prev) => ({
      ...prev,
      scenes: moveSceneInList(prev.scenes, index, direction),
      updatedAt: new Date().toISOString(),
    }));
  };

  const busy = loadingTarget !== null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">
            05. Scene Generator &amp; Breakdown
          </h1>
          <p className="text-sm text-[#9CA3AF] leading-relaxed">
            Pecah naskah &amp; cerita menjadi {input.sceneCount} adegan produksi dengan Scene ID, durasi (target total {input.videoDuration}), lokasi, karakter, aksi utama, dialog, kebutuhan visual/audio, dan transisi antaradegan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleGenerateScenes()}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold min-h-[44px] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {loadingTarget === 'all' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {loadingTarget === 'all' ? 'Memecah Adegan...' : 'Generate Scene Breakdown'}
        </button>
      </div>

      {error ? (
        <StudioErrorBanner
          error={error}
          onRetry={lastRetryRef.current ? () => lastRetryRef.current?.() : undefined}
          isRetrying={busy}
        />
      ) : null}

      <CharacterConsistencyIntegrationBanner
        project={project}
        onNavigate={(sec) => onNavigateWithContext(sec)}
      />

      {/* Ringkasan Parameter Target Adegan & Durasi */}
      <div className="p-4 rounded-xl bg-[#12141A] border border-white/[0.08] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-[#6B7280] block">Target Jumlah Adegan</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              min={1}
              max={30}
              value={input.sceneCount}
              onChange={(e) =>
                onUpdateProject((prev) => ({
                  ...prev,
                  input: {
                    ...prev.input,
                    sceneCount: Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                  },
                  updatedAt: new Date().toISOString(),
                }))
              }
              className="w-20 h-9 px-2.5 rounded bg-[#0A0B0E] border border-white/[0.1] font-mono text-[#F4F5F7] tabular-nums"
            />
            <span className="text-[#9CA3AF]">adegan</span>
          </div>
        </div>
        <div>
          <span className="text-[#6B7280] block">Durasi Target Film</span>
          <select
            value={input.videoDuration}
            onChange={(e) =>
              onUpdateProject((prev) => ({
                ...prev,
                input: { ...prev.input, videoDuration: e.target.value },
                updatedAt: new Date().toISOString(),
              }))
            }
            className="mt-1 w-full h-9 px-2.5 rounded bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="text-[#6B7280] block">Total Durasi Breakdown</span>
          <p className="font-mono text-sm font-semibold text-[#F4F5F7] tabular-nums mt-2">
            {currentTotalSeconds}s{' '}
            <span className="text-xs font-normal text-[#9CA3AF]">
              / target {targetTotalSeconds}s
            </span>
          </p>
        </div>
        <div>
          <span className="text-[#6B7280] block">Sumber Naskah</span>
          <p className="text-xs font-medium text-[#F4F5F7] mt-2">
            {project.script.length > 0
              ? `${project.script.length} adegan naskah terhubung`
              : 'Menggunakan cerita/premis'}
          </p>
        </div>
      </div>

      {/* Toolbar Aksi Breakdown */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-4 rounded-xl bg-[#12141A] border border-white/[0.08]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addManualScene}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 min-h-[44px]"
          >
            <Plus className="w-3.5 h-3.5 text-[#E5A93C]" />
            Tambah Adegan
          </button>
          {project.scenes.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => void copyText('scenes_txt', formatScenesTxt(project))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#8B5CF6]/50 min-h-[44px]"
              >
                {copiedKey === 'scenes_txt' ? (
                  <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#8B5CF6]" />
                )}
                Salin Breakdown
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `${(input.title || 'scene-breakdown').toLowerCase().replace(/\s+/g, '-')}-scenes.txt`,
                    formatScenesTxt(project)
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#3B82F6]/50 min-h-[44px]"
              >
                <Download className="w-3.5 h-3.5 text-[#3B82F6]" />
                Unduh TXT
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadJsonFile(
                    `${(input.title || 'scene-breakdown').toLowerCase().replace(/\s+/g, '-')}-scenes.json`,
                    { title: input.title, sceneCount: input.sceneCount, videoDuration: input.videoDuration, scenes: project.scenes }
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#3B82F6]/50 min-h-[44px]"
              >
                <FileJson className="w-3.5 h-3.5 text-[#3B82F6]" />
                Ekspor JSON
              </button>
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onNavigateWithContext('storyboard')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white min-h-[44px]"
        >
          Teruskan ke Storyboard Studio
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {project.scenes.length > 0 ? (
        <div className="space-y-4">
          {project.scenes.map((scene, index) => {
            const expanded = Boolean(expandedSceneNumbers[scene.sceneNumber]);
            const sceneIdDisplay =
              scene.sceneId || `SCN-${String(scene.sceneNumber).padStart(3, '0')}`;
            return (
              <div
                key={`${sceneIdDisplay}_${scene.sceneNumber}`}
                className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#8B5CF6]/20 text-[#C4B5FD]">
                        {sceneIdDisplay}
                      </span>
                      <span className="font-mono text-xs text-[#E5A93C] tabular-nums">
                        Adegan {scene.sceneNumber} · Ep. {scene.episodeNumber} ·{' '}
                        {scene.duration || `${scene.estimatedSeconds} detik`}
                      </span>
                    </div>
                    <h2 className="font-display text-base font-semibold text-[#F4F5F7]">
                      {scene.heading}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveScene(index, 'up')}
                      aria-label={`Geser Adegan ${scene.sceneNumber} ke atas`}
                      className="p-2 rounded-lg bg-[#181B22] border border-white/[0.08] text-[#9CA3AF] hover:text-[#F4F5F7] disabled:opacity-30 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === project.scenes.length - 1}
                      onClick={() => handleMoveScene(index, 'down')}
                      aria-label={`Geser Adegan ${scene.sceneNumber} ke bawah`}
                      className="p-2 rounded-lg bg-[#181B22] border border-white/[0.08] text-[#9CA3AF] hover:text-[#F4F5F7] disabled:opacity-30 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleGenerateScenes(scene.sceneNumber)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] hover:border-[#E5A93C]/50 min-h-[44px] disabled:opacity-50"
                    >
                      {loadingTarget === scene.sceneNumber ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-[#E5A93C]" />
                      )}
                      Ulang
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpand(scene.sceneNumber)}
                      className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] hover:border-[#3B82F6]/50 min-h-[44px]"
                    >
                      {expanded ? (
                        <>
                          Tutup Edit <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          Edit Adegan <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeScene(scene.sceneNumber)}
                      aria-label={`Hapus Adegan ${scene.sceneNumber}`}
                      className="p-2 rounded-lg text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#EF4444]/10 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Ringkasan Cepat Breakdown */}
                <div className="space-y-2 text-xs text-[#9CA3AF]">
                  <p className="text-sm text-[#F4F5F7]/90 leading-relaxed">
                    {scene.mainAction || scene.actionSummary || 'Belum ada aksi utama.'}
                  </p>
                  {scene.dialogue ? (
                    <p className="italic text-[#C4B5FD]">Dialog: “{scene.dialogue}”</p>
                  ) : null}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                    <div>
                      <span className="text-[#6B7280]">Lokasi &amp; Waktu: </span>
                      <span className="text-[#F4F5F7]">
                        {scene.location} ({scene.timeOfDay})
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6B7280]">Karakter: </span>
                      <span className="text-[#F4F5F7]">
                        {scene.charactersInvolved.join(', ') || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6B7280]">Kebutuhan Visual: </span>
                      <span className="text-[#9CA3AF]">
                        {scene.visualNeeds || scene.lighting}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6B7280]">Kebutuhan Audio: </span>
                      <span className="text-[#9CA3AF]">
                        {scene.audioNeeds || scene.mood}
                      </span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-[#6B7280]">Transisi ke Adegan Berikutnya: </span>
                      <span className="text-[#E5A93C]">
                        {scene.transitionToNext || 'Cut langsung'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Form Edit Detail Adegan */}
                {expanded ? (
                  <div className="p-4 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">Scene ID</label>
                        <input
                          type="text"
                          value={sceneIdDisplay}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { sceneId: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] font-mono text-xs text-[#F4F5F7]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          Judul / Heading Adegan
                        </label>
                        <input
                          type="text"
                          value={scene.heading}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { heading: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          Durasi (detik)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={600}
                          value={scene.estimatedSeconds}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, {
                              estimatedSeconds: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] font-mono text-xs text-[#F4F5F7]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">Lokasi</label>
                        <input
                          type="text"
                          value={scene.location}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { location: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">Waktu</label>
                        <input
                          type="text"
                          value={scene.timeOfDay}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { timeOfDay: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          Karakter (pisahkan koma)
                        </label>
                        <input
                          type="text"
                          value={scene.charactersInvolved.join(', ')}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, {
                              charactersInvolved: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          Aksi Utama
                        </label>
                        <textarea
                          rows={2}
                          value={scene.mainAction ?? scene.actionSummary}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { mainAction: e.target.value })
                          }
                          className="w-full p-2.5 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          Dialog Inti
                        </label>
                        <textarea
                          rows={2}
                          value={scene.dialogue || ''}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { dialogue: e.target.value })
                          }
                          className="w-full p-2.5 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          Kebutuhan Visual
                        </label>
                        <textarea
                          rows={2}
                          value={scene.visualNeeds || ''}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { visualNeeds: e.target.value })
                          }
                          className="w-full p-2.5 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          Kebutuhan Audio
                        </label>
                        <textarea
                          rows={2}
                          value={scene.audioNeeds || ''}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { audioNeeds: e.target.value })
                          }
                          className="w-full p-2.5 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          Pencahayaan
                        </label>
                        <input
                          type="text"
                          value={scene.lighting}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { lighting: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          Gerakan Kamera
                        </label>
                        <input
                          type="text"
                          value={scene.cameraMovement}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { cameraMovement: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#9CA3AF] mb-1">
                          Transisi ke Adegan Berikutnya
                        </label>
                        <input
                          type="text"
                          value={scene.transitionToNext || ''}
                          onChange={(e) =>
                            updateScene(scene.sceneNumber, { transitionToNext: e.target.value })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7]"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => onNavigateWithContext('storyboard')}
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] hover:border-[#8B5CF6]/50 min-h-[40px]"
                  >
                    Buka Storyboard Studio
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigateWithContext('image', {
                        sceneNumber: scene.sceneNumber,
                        subject: `Adegan ${scene.sceneNumber} (${scene.location}): ${
                          scene.mainAction || scene.actionSummary
                        }`,
                        visualTab: 'scene',
                      })
                    }
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] hover:border-[#3B82F6]/50 min-h-[40px]"
                  >
                    Siapkan Gambar Adegan
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigateWithContext('video', {
                        sceneNumber: scene.sceneNumber,
                        subject: `Adegan ${scene.sceneNumber} (${scene.location}): ${
                          scene.mainAction || scene.actionSummary
                        }`,
                      })
                    }
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] hover:border-[#E5A93C]/50 min-h-[40px]"
                  >
                    Siapkan Video Adegan
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-10 rounded-xl bg-[#12141A] border border-white/[0.08] text-center space-y-3">
          <Film className="w-8 h-8 text-[#8B5CF6] mx-auto" />
          <p className="text-sm text-[#9CA3AF]">
            Belum ada scene breakdown. Tekan <strong className="text-[#F4F5F7]">Generate Scene Breakdown</strong> untuk membagi naskah &amp; cerita menjadi {input.sceneCount} adegan produksi.
          </p>
        </div>
      )}
    </div>
  );
}
