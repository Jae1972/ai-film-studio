import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Info,
  LayoutGrid,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  RefreshCw,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';
import type {
  FilmProject,
  NavSection,
  ProductionVisualAsset,
  StudioCapabilities,
  StudioErrorDetails,
  VoiceTrack,
} from '../types/studio';
import {
  apiAttemptRenderVideo,
  apiGenerateVisualPrompt,
  apiGenerateVoice,
  toStudioErrorDetails,
} from '../services/studioApi';
import { optimizeImageFile } from '../utils/imageAssets';
import { formatActiveConsistencyForPrompt } from '../utils/characterConsistency';
import { CharacterConsistencyView, CharacterStudioView } from './CharacterStudioViews';
import {
  SceneBreakdownView,
  ScriptWriterView,
  StoryGeneratorView,
} from './NarrativeStudioViews';
import { StoryboardStudioView } from './StoryboardStudioView';
import { StudioErrorBanner } from './StudioErrorBanner';
import { VisualProductionView } from './VisualProductionView';

export interface StudioJumpContext {
  sceneNumber?: number;
  subject?: string;
  voiceText?: string;
  voiceLabel?: string;
  characterId?: string;
  visualTab?: 'character' | 'scene' | 'models';
}

interface StudioFeatureViewsProps {
  section: NavSection;
  project: FilmProject;
  capabilities: StudioCapabilities | null;
  jumpContext: StudioJumpContext | null;
  onClearJumpContext: () => void;
  onUpdateProject: (updater: (prev: FilmProject) => FilmProject) => void;
  onNavigateWithContext: (section: NavSection, ctx?: StudioJumpContext) => void;
}

const VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

export function StudioFeatureViews({
  section,
  project,
  capabilities,
  jumpContext,
  onClearJumpContext,
  onUpdateProject,
  onNavigateWithContext,
}: StudioFeatureViewsProps) {
  const [loading, setLoading] = useState(false);
  const [renderLoading, setRenderLoading] = useState(false);
  const [error, setError] = useState<StudioErrorDetails | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const lastRetryFnRef = useRef<(() => void) | null>(null);

  const [selectedSceneNum, setSelectedSceneNum] = useState<number>(0);
  const [visualSubject, setVisualSubject] = useState('');
  const [visualAspect, setVisualAspect] = useState('16:9');
  const [visualTargetSpec, setVisualTargetSpec] = useState(section === 'video' ? '10s / 720p' : '1K');
  const [videoInputMode, setVideoInputMode] = useState<'prompt' | 'image'>('prompt');
  const [videoRefImage, setVideoRefImage] = useState<string>('');
  const videoImageInputRef = useRef<HTMLInputElement | null>(null);

  const [voiceMode, setVoiceMode] = useState<'single' | 'multi'>('single');
  const [voiceLabel, setVoiceLabel] = useState('Narasi Adegan Pembuka');
  const [voiceName, setVoiceName] = useState('Kore');
  const [voiceStyle, setVoiceStyle] = useState('Dramatis, jernih, sinematik');
  const [voiceText, setVoiceText] = useState('');
  const [speakerTwoName, setSpeakerTwoName] = useState('Lawan Bicara');
  const [speakerTwoVoice, setSpeakerTwoVoice] = useState('Puck');
  const [speakerTwoStyle, setSpeakerTwoStyle] = useState('Tegas, emosional');
  const [speakerTwoText, setSpeakerTwoText] = useState('');

  useEffect(() => {
    setError(null);
    lastRetryFnRef.current = null;
    if (section === 'video') {
      setVisualTargetSpec('10s / 720p');
    } else if (section === 'image') {
      setVisualTargetSpec('1K');
    }
  }, [section]);

  useEffect(() => {
    if (!jumpContext || section === 'image') return;
    if (jumpContext.sceneNumber) {
      setSelectedSceneNum(jumpContext.sceneNumber);
    }
    if (jumpContext.subject) {
      setVisualSubject(jumpContext.subject);
    }
    if (jumpContext.voiceText) {
      setVoiceText(jumpContext.voiceText);
    }
    if (jumpContext.voiceLabel) {
      setVoiceLabel(jumpContext.voiceLabel);
    }
    onClearJumpContext();
  }, [jumpContext, onClearJumpContext, section]);

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const ensureInputReady = () => {
    if (!project.input.title.trim() || !project.input.premise.trim()) {
      lastRetryFnRef.current = null;
      setError({
        category: 'BAD_REQUEST',
        message: 'Judul film dan premis cerita belum diisi. Silakan lengkapi di Formulir Produksi terlebih dahulu.',
        retryable: false,
      });
      return false;
    }
    return true;
  };

  const runAction = async (fn: () => Promise<void>) => {
    lastRetryFnRef.current = () => {
      void runAction(fn);
    };
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSceneForMedia = (sceneNum: number) => {
    setSelectedSceneNum(sceneNum);
    if (sceneNum === 0) return;
    const scene = project.scenes.find((s) => s.sceneNumber === sceneNum);
    const sb = project.storyboard.find((f) => f.sceneNumber === sceneNum);
    if (sb || scene) {
      const desc = sb?.visualDescription || scene?.actionSummary || '';
      const loc = sb?.location || scene?.location || '';
      const chars = (sb?.characters || scene?.charactersInvolved || []).join(', ');
      setVisualSubject(
        `Adegan ${sceneNum} (${loc}): ${desc}${chars ? `. Karakter: ${chars}` : ''}`
      );
    }
  };

  const handleVideoRefUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      setError(null);
      const { dataUrl } = await optimizeImageFile(file, 'video-ref');
      setVideoRefImage(dataUrl);
    } catch (err) {
      setError({
        category: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'Gagal memuat dan mengompresi gambar referensi video.',
        retryable: false,
      });
    }
  };

  const renderHeader = (title: string, subtitle: string, actionLabel?: string, onAction?: () => void) => (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
      <div className="space-y-1.5 max-w-2xl">
        <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">{title}</h1>
        <p className="text-sm text-[#9CA3AF] leading-relaxed">{subtitle}</p>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold min-h-[44px] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Memproses...' : actionLabel}
        </button>
      ) : null}
    </div>
  );

  const renderError = () =>
    error ? (
      <StudioErrorBanner
        error={error}
        onRetry={lastRetryFnRef.current ? () => lastRetryFnRef.current?.() : undefined}
        isRetrying={loading || renderLoading}
      />
    ) : null;

  if (section === 'characters') {
    return (
      <CharacterStudioView
        project={project}
        capabilities={capabilities}
        onUpdateProject={onUpdateProject}
        onNavigate={(next) => onNavigateWithContext(next)}
        onOpenCharacterVisual={(characterId) =>
          onNavigateWithContext('image', { characterId, visualTab: 'character' })
        }
      />
    );
  }

  if (section === 'consistency') {
    return (
      <CharacterConsistencyView
        project={project}
        capabilities={capabilities}
        onUpdateProject={onUpdateProject}
        onNavigate={(next) => onNavigateWithContext(next)}
      />
    );
  }

  if (section === 'story') {
    return (
      <StoryGeneratorView
        project={project}
        onUpdateProject={onUpdateProject}
        onNavigateWithContext={onNavigateWithContext}
      />
    );
  }

  if (section === 'script') {
    return (
      <ScriptWriterView
        project={project}
        onUpdateProject={onUpdateProject}
        onNavigateWithContext={onNavigateWithContext}
      />
    );
  }

  if (section === 'scenes') {
    return (
      <SceneBreakdownView
        project={project}
        onUpdateProject={onUpdateProject}
        onNavigateWithContext={onNavigateWithContext}
      />
    );
  }

  if (section === 'image') {
    return (
      <VisualProductionView
        project={project}
        capabilities={capabilities}
        jumpContext={jumpContext}
        onClearJumpContext={onClearJumpContext}
        onUpdateProject={onUpdateProject}
        onNavigate={(next) => onNavigateWithContext(next)}
      />
    );
  }

  if (section === 'video') {
    const filteredSpecs = project.visualPrompts.filter((v) => v.type === 'video');
    const charRefsWithImages = project.characters.filter((c) => Boolean(c.referenceImageDataUrl));

    const handleRenderMediaAttempt = async () => {
      lastRetryFnRef.current = () => {
        void handleRenderMediaAttempt();
      };
      setError(null);
      setRenderLoading(true);
      try {
        await apiAttemptRenderVideo({
          prompt: visualSubject,
          aspectRatio: visualAspect,
          duration: visualTargetSpec,
          sceneNumber: selectedSceneNum || undefined,
          sourceImageDataUrl: videoInputMode === 'image' ? videoRefImage : undefined,
        });
      } catch (err) {
        setError(toStudioErrorDetails(err));
      } finally {
        setRenderLoading(false);
      }
    };

    const isVideo = true;
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {renderHeader(
          '07. Video Generator',
          'Integrasi AI Video Generator dari prompt adegan atau gambar referensi, lengkap dengan penyusunan blueprint gerak oleh Gemini.'
        )}

        <div className="flex items-start gap-3 p-4 rounded-xl bg-[#E5A93C]/10 border border-[#E5A93C]/30 text-sm">
          <Info className="w-5 h-5 text-[#E5A93C] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-[#F4F5F7]">
              Integrasi Layanan AI Video (gemini-omni-1.2-flash) Siap Pakai
            </p>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              Endpoint server dan alur prompt sudah terpasang. Karena kunci API Gemini berbayar belum diaktifkan pada sesi ini, studio tidak akan menampilkan video palsu saat Anda menekan Render—tetapi Anda tetap bisa menyusun <strong className="text-[#F4F5F7]">Prompt & Blueprint Kamera Nyata</strong> per adegan via {capabilities?.textModel || 'gemini-4-hydrogen'}.
            </p>
          </div>
        </div>

        {renderError()}

        <div className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-5">
          <div className="inline-flex p-1 rounded-lg bg-[#0A0B0E] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setVideoInputMode('prompt')}
              className={`px-3.5 py-2 rounded-md text-xs font-medium min-h-[38px] ${
                videoInputMode === 'prompt' ? 'bg-[#E5A93C] text-[#0A0B0E]' : 'text-[#9CA3AF]'
              }`}
            >
              Dari Prompt Adegan
            </button>
            <button
              type="button"
              onClick={() => setVideoInputMode('image')}
              className={`px-3.5 py-2 rounded-md text-xs font-medium min-h-[38px] ${
                videoInputMode === 'image' ? 'bg-[#E5A93C] text-[#0A0B0E]' : 'text-[#9CA3AF]'
              }`}
            >
              Dari Gambar Referensi (Image-to-Video)
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs text-[#9CA3AF] mb-1.5">
                Pilih Adegan dari Proyek (Opsional)
              </label>
              <select
                value={selectedSceneNum}
                onChange={(e) => handleSelectSceneForMedia(Number(e.target.value))}
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              >
                <option value={0}>Input Kustom / Manual</option>
                {project.scenes.map((s) => (
                  <option key={s.sceneNumber} value={s.sceneNumber}>
                    Adegan {s.sceneNumber}: {s.heading} ({s.location})
                  </option>
                ))}
              </select>
            </div>

            {videoInputMode === 'image' ? (
              <div className="md:col-span-3 p-4 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#F4F5F7]">
                    Gambar Awal (Starting Frame)
                  </span>
                  <input
                    ref={videoImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handleVideoRefUpload(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => videoImageInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#181B22] border border-white/[0.1] text-[#F4F5F7]"
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-[#E5A93C]" />
                    Unggah Gambar
                  </button>
                </div>
                {charRefsWithImages.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-[#6B7280]">Atau pilih referensi karakter:</span>
                    {charRefsWithImages.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setVideoRefImage(c.referenceImageDataUrl || '')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border ${
                          videoRefImage === c.referenceImageDataUrl
                            ? 'border-[#E5A93C] bg-[#E5A93C]/12 text-[#F4F5F7]'
                            : 'border-white/[0.08] bg-[#12141A] text-[#9CA3AF]'
                        }`}
                      >
                        <img
                          src={c.referenceImageDataUrl}
                          alt={c.name}
                          className="w-4 h-4 rounded object-cover"
                        />
                        {c.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {videoRefImage ? (
                  <img
                    src={videoRefImage}
                    alt="Frame awal video"
                    className="w-32 h-20 rounded-lg object-cover border border-white/10"
                  />
                ) : null}
              </div>
            ) : null}

            <div className="md:col-span-3">
              <label className="block text-xs text-[#9CA3AF] mb-1.5">
                Arahan Gerakan & Adegan Video
              </label>
              <textarea
                rows={3}
                value={visualSubject}
                onChange={(e) => setVisualSubject(e.target.value)}
                placeholder="Contoh: Adegan 1 - Kamera melakukan slow dolly-in saat tokoh utama membuka koper di peron berkabut..."
                className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] placeholder:text-[#6B7280]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Rasio Aspek</label>
              <select
                value={visualAspect}
                onChange={(e) => setVisualAspect(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              >
                <option value="16:9">16:9 (Sinematik)</option>
                <option value="9:16">9:16 (Vertikal Android/Reels)</option>
                <option value="1:1">1:1 (Persegi)</option>
                <option value="4:3">4:3 (Klasik)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Durasi & Resolusi</label>
              <select
                value={visualTargetSpec}
                onChange={(e) => setVisualTargetSpec(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              >
                <option value="5s / 720p">5 detik · 720p</option>
                <option value="10s / 720p">10 detik · 720p</option>
                <option value="10s / 1080p">10 detik · 1080p</option>
                <option value="15s / 1080p">15 detik · 1080p</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                disabled={loading || !visualSubject.trim()}
                onClick={() => {
                  void runAction(async () => {
                    const { spec } = await apiGenerateVisualPrompt({
                      type: 'video',
                      input: project.input,
                      subject: visualSubject,
                      aspectRatio: visualAspect,
                      durationOrResolution: visualTargetSpec,
                      consistency: formatActiveConsistencyForPrompt(
                        project.consistency,
                        project.characters
                      ),
                      sceneNumber: selectedSceneNum || undefined,
                      inputMode: videoInputMode,
                      hasSourceImage: Boolean(videoInputMode === 'image' && videoRefImage),
                    });
                    onUpdateProject((prev) => ({
                      ...prev,
                      visualPrompts: [
                        {
                          ...spec,
                          sourceImageDataUrl: videoInputMode === 'image' ? videoRefImage : undefined,
                        },
                        ...prev.visualPrompts,
                      ],
                      updatedAt: new Date().toISOString(),
                    }));
                  });
                }}
                className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold disabled:opacity-45"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Susun Prompt
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/[0.08]">
            <p className="text-xs text-[#9CA3AF]">
              {project.consistency.length > 0
                ? `${project.consistency.filter((g) => g.locked !== false).length} anchor konsistensi karakter aktif akan otomatis disuntikkan.`
                : 'Belum ada Character Consistency aktif.'}
            </p>
            <button
              type="button"
              disabled={renderLoading || !visualSubject.trim()}
              onClick={() => void handleRenderMediaAttempt()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#181B22] border border-white/[0.12] hover:border-[#E5A93C]/50 text-xs font-medium text-[#F4F5F7] disabled:opacity-45"
            >
              {renderLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Video className="w-3.5 h-3.5 text-[#E5A93C]" />
              )}
              Render Video AI (Cek API)
            </button>
          </div>
        </div>

        {filteredSpecs.length > 0 ? (
          <div className="space-y-4">
            {filteredSpecs.map((spec) => (
              <div key={spec.id} className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#F4F5F7]">
                    {spec.sceneNumber ? `Adegan ${spec.sceneNumber} · ` : ''}
                    {spec.targetLabel}
                  </h3>
                  <span className="font-mono text-xs text-[#E5A93C]">
                    {spec.aspectRatio} · {spec.durationOrResolution}
                  </span>
                </div>
                <p className="text-xs text-[#9CA3AF]">Spesifikasi Kamera: {spec.cameraSpec}</p>
                {spec.sourceImageDataUrl ? (
                  <img
                    src={spec.sourceImageDataUrl}
                    alt="Referensi Image-to-Video"
                    className="w-28 h-16 rounded object-cover border border-white/10"
                  />
                ) : null}
                <div className="p-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.08] flex items-start justify-between gap-3">
                  <p className="font-mono text-xs text-[#F4F5F7] leading-relaxed">{spec.promptText}</p>
                  <button
                    type="button"
                    onClick={() => copyText(spec.id, spec.promptText)}
                    className="p-1.5 rounded text-[#9CA3AF] hover:text-[#F4F5F7] shrink-0"
                    title="Salin Prompt"
                  >
                    {copiedKey === spec.id ? <Check className="w-4 h-4 text-[#22C55E]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="font-mono text-[11px] text-[#6B7280]">Negative Prompt: {spec.negativePrompt}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            text={`Belum ada spesifikasi prompt ${isVideo ? 'video' : 'gambar'}. Pilih adegan atau tulis deskripsi di atas untuk menyusunnya dengan Gemini.`}
          />
        )}
      </div>
    );
  }

  if (section === 'voice') {
    const loadSceneDialogueIntoVoice = (sceneNum: number) => {
      const scriptScene = project.script.find((b) => b.sceneNumber === sceneNum);
      if (!scriptScene || scriptScene.dialogues.length === 0) return;
      if (scriptScene.dialogues.length >= 2) {
        setVoiceMode('multi');
        setVoiceLabel(`Dialog Adegan ${sceneNum}`);
        setVoiceText(scriptScene.dialogues[0].line);
        setSpeakerTwoName(scriptScene.dialogues[1].character);
        setSpeakerTwoText(scriptScene.dialogues[1].line);
      } else {
        setVoiceMode('single');
        setVoiceLabel(`Dialog Adegan ${sceneNum}`);
        setVoiceText(scriptScene.dialogues[0].line);
      }
    };

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {renderHeader(
          '08. Voice Studio',
          'Buat dialog karakter dan narasi film dalam format WAV 24kHz nyata menggunakan Gemini TTS, atau muat langsung dialog dari naskah adegan.'
        )}
        {renderError()}

        <div className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex p-1 rounded-lg bg-[#0A0B0E] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setVoiceMode('single')}
                className={`px-3.5 py-2 rounded-md text-xs font-medium min-h-[38px] transition-colors ${
                  voiceMode === 'single' ? 'bg-[#E5A93C] text-[#0A0B0E]' : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
                }`}
              >
                Narasi / Monolog
              </button>
              <button
                type="button"
                onClick={() => setVoiceMode('multi')}
                className={`px-3.5 py-2 rounded-md text-xs font-medium min-h-[38px] transition-colors ${
                  voiceMode === 'multi' ? 'bg-[#E5A93C] text-[#0A0B0E]' : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
                }`}
              >
                Dialog Dua Pembicara
              </button>
            </div>

            {project.script.length > 0 ? (
              <select
                defaultValue=""
                onChange={(e) => {
                  const num = Number(e.target.value);
                  if (num) loadSceneDialogueIntoVoice(num);
                }}
                className="h-10 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-xs text-[#F4F5F7]"
              >
                <option value="">Muat Dialog dari Naskah...</option>
                {project.script.map((b) => (
                  <option key={b.sceneNumber} value={b.sceneNumber}>
                    Adegan {b.sceneNumber}: {b.slugline}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Label Trek Audio</label>
              <input
                type="text"
                value={voiceLabel}
                onChange={(e) => setVoiceLabel(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">
                {voiceMode === 'multi' ? 'Suara Pembicara 1' : 'Karakter Suara'}
              </label>
              <select
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              >
                {VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Gaya Penyampaian</label>
              <input
                type="text"
                value={voiceStyle}
                onChange={(e) => setVoiceStyle(e.target.value)}
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#9CA3AF] mb-1.5">
              {voiceMode === 'multi' ? 'Dialog Pembicara 1' : 'Teks Narasi / Dialog'}
            </label>
            <textarea
              rows={3}
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
              placeholder="Masukkan kalimat narasi atau dialog film yang ingin disuarakan..."
              className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] placeholder:text-[#6B7280]"
            />
          </div>

          {voiceMode === 'multi' ? (
            <div className="pt-4 border-t border-white/[0.08] space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1.5">Nama Pembicara 2</label>
                  <input
                    type="text"
                    value={speakerTwoName}
                    onChange={(e) => setSpeakerTwoName(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1.5">Suara Pembicara 2</label>
                  <select
                    value={speakerTwoVoice}
                    onChange={(e) => setSpeakerTwoVoice(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                  >
                    {VOICES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1.5">Gaya Pembicara 2</label>
                  <input
                    type="text"
                    value={speakerTwoStyle}
                    onChange={(e) => setSpeakerTwoStyle(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1.5">Dialog Pembicara 2</label>
                <textarea
                  rows={2}
                  value={speakerTwoText}
                  onChange={(e) => setSpeakerTwoText(e.target.value)}
                  placeholder="Balasan dialog pembicara kedua..."
                  className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] placeholder:text-[#6B7280]"
                />
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={loading || !voiceText.trim()}
              onClick={() => {
                void runAction(async () => {
                  const res = await apiGenerateVoice({
                    mode: voiceMode,
                    text: voiceText,
                    style: voiceStyle,
                    voiceName,
                    speakerOneName: project.characters[0]?.name || 'Pembicara 1',
                    speakerOneVoice: voiceName,
                    speakerOneStyle: voiceStyle,
                    speakerTwoName,
                    speakerTwoText,
                    speakerTwoVoice,
                    speakerTwoStyle,
                  });

                  const track: VoiceTrack = {
                    id: `voice_${Date.now()}`,
                    label: voiceLabel.trim() || 'Trek Suara Film',
                    mode: voiceMode,
                    voiceName,
                    secondaryVoiceName: voiceMode === 'multi' ? speakerTwoVoice : undefined,
                    scriptText:
                      voiceMode === 'multi'
                        ? `${voiceText} / ${speakerTwoName}: ${speakerTwoText}`
                        : voiceText,
                    audioBase64Wav: res.audioBase64Wav,
                    mimeType: res.mimeType,
                    createdAt: new Date().toISOString(),
                  };
                  onUpdateProject((prev) => ({
                    ...prev,
                    voiceTracks: [track, ...prev.voiceTracks],
                    updatedAt: new Date().toISOString(),
                  }));
                });
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold min-h-[44px] disabled:opacity-45"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
              {loading ? 'Mensintesis Audio...' : 'Generate Suara (WAV)'}
            </button>
          </div>
        </div>

        {project.voiceTracks.length > 0 ? (
          <div className="space-y-4">
            {project.voiceTracks.map((track) => (
              <div key={track.id} className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[#F4F5F7]">{track.label}</h3>
                    <p className="text-xs text-[#9CA3AF]">
                      {track.mode === 'multi'
                        ? `Dialog: ${track.voiceName} & ${track.secondaryVoiceName}`
                        : `Narasi: ${track.voiceName}`}{' '}
                      · WAV 24kHz
                    </p>
                  </div>
                  <a
                    href={`data:${track.mimeType};base64,${track.audioBase64Wav}`}
                    download={`${track.label.toLowerCase().replace(/\s+/g, '-')}.wav`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7]"
                  >
                    <Download className="w-3.5 h-3.5 text-[#E5A93C]" />
                    Unduh WAV
                  </a>
                </div>
                <p className="text-xs text-[#9CA3AF]">{track.scriptText}</p>
                <audio
                  controls
                  src={`data:${track.mimeType};base64,${track.audioBase64Wav}`}
                  className="w-full h-10"
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="Belum ada audio suara WAV. Masukkan dialog atau narasi di atas lalu tekan Generate Suara." />
        )}
      </div>
    );
  }

  // Storyboard Studio (09)
  return (
    <StoryboardStudioView
      project={project}
      capabilities={capabilities}
      jumpContext={jumpContext}
      onClearJumpContext={onClearJumpContext}
      onUpdateProject={onUpdateProject}
      onNavigateWithContext={onNavigateWithContext}
    />
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="p-10 rounded-xl bg-[#12141A] border border-white/[0.08] text-center">
      <p className="text-sm text-[#9CA3AF]">{text}</p>
    </div>
  );
}
