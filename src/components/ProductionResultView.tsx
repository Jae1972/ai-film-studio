import { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  ShieldCheck,
  UserCheck,
  Users,
  Volume2,
} from 'lucide-react';
import type { FilmProject, NavSection, StudioErrorDetails } from '../types/studio';
import { collectProjectVisualAssets, downloadImageDataUrl } from '../utils/imageAssets';
import { downloadTextFile, formatScreenplayTxt } from '../utils/narrativeExport';
import { formatStoryboardTxt } from '../utils/storyboardExport';
import { StudioErrorBanner } from './StudioErrorBanner';

interface ProductionResultViewProps {
  project: FilmProject;
  onNavigate: (section: NavSection) => void;
  onSynthesizeDialogue: (sceneNumber: number, text: string, character: string) => Promise<void>;
  synthesizingScene: number | null;
  error?: StudioErrorDetails | null;
  onRetryError?: () => void;
}

type ResultTab = 'overview' | 'story' | 'characters' | 'scenes' | 'script' | 'storyboard' | 'gallery' | 'media' | 'audio';

export function ProductionResultView({
  project,
  onNavigate,
  onSynthesizeDialogue,
  synthesizingScene,
  error,
  onRetryError,
}: ProductionResultViewProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>('overview');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visualAssets = collectProjectVisualAssets(project);

  const hasContent =
    Boolean(project.story) ||
    project.characters.length > 0 ||
    project.scenes.length > 0 ||
    project.script.length > 0 ||
    project.storyboard.length > 0 ||
    project.visualPrompts.length > 0 ||
    project.voiceTracks.length > 0 ||
    visualAssets.length > 0;

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const exportProjectJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.input.title || 'film-project').toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportScreenplayTxt = () => {
    const filename = `${(project.input.title || 'naskah').toLowerCase().replace(/\s+/g, '-')}-naskah.txt`;
    downloadTextFile(filename, formatScreenplayTxt(project));
  };

  const exportStoryboardTxt = () => {
    const filename = `${(project.input.title || 'storyboard').toLowerCase().replace(/\s+/g, '-')}-storyboard.txt`;
    downloadTextFile(filename, formatStoryboardTxt(project));
  };

  if (!hasContent) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center space-y-5">
        <div className="w-12 h-12 rounded-xl bg-[#12141A] border border-white/[0.08] flex items-center justify-center mx-auto">
          <Film className="w-5 h-5 text-[#E5A93C]" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">
            Belum Ada Hasil Produksi
          </h1>
          <p className="text-sm text-[#9CA3AF] max-w-md mx-auto leading-relaxed">
            Halaman ini menampilkan seluruh hasil produksi secara terstruktur dari Gemini API. Isi formulir produksi lalu tekan Generate Film, atau gunakan modul di sidebar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('production-form')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#E5A93C] text-[#0A0B0E] text-sm font-semibold hover:bg-[#F0B94D] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Buka Formulir Produksi
        </button>
      </div>
    );
  }

  const tabs: Array<{ id: ResultTab; label: string; count?: number; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Ringkasan Terstruktur', icon: Film },
    { id: 'story', label: 'Cerita & Episode', count: project.story?.episodeOutlines.length || 0, icon: BookOpen },
    { id: 'characters', label: 'Karakter & Konsistensi', count: project.characters.length, icon: UserCheck },
    { id: 'scenes', label: 'Adegan', count: project.scenes.length, icon: Film },
    { id: 'storyboard', label: 'Storyboard Visual', count: project.storyboard.length, icon: LayoutGrid },
    { id: 'script', label: 'Naskah', count: project.script.length, icon: FileText },
    { id: 'gallery', label: 'Galeri Visual', count: visualAssets.length, icon: ImageIcon },
    { id: 'media', label: 'Prompt Gambar/Video', count: project.visualPrompts.length, icon: ImageIcon },
    { id: 'audio', label: 'Suara WAV', count: project.voiceTracks.length, icon: Mic },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-1.5 min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#F4F5F7] truncate">
            {project.input.title || 'Hasil Produksi Film'}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF] tabular-nums">
            <span>{project.input.genre}</span>
            <span aria-hidden="true">·</span>
            <span>{project.input.visualStyle}</span>
            <span aria-hidden="true">·</span>
            <span>{project.input.episodeCount} Episode</span>
            <span aria-hidden="true">·</span>
            <span>{project.scenes.length || project.input.sceneCount} Adegan</span>
            <span aria-hidden="true">·</span>
            <span>{project.input.dialogueLanguage}</span>
            <span aria-hidden="true">·</span>
            <span>{project.input.videoDuration}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={exportScreenplayTxt}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-[#F4F5F7] bg-[#181B22] border border-white/[0.1] hover:border-white/25 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#E5A93C]" />
            Ekspor Naskah (.txt)
          </button>
          <button
            type="button"
            onClick={exportStoryboardTxt}
            disabled={project.storyboard.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-[#F4F5F7] bg-[#181B22] border border-white/[0.1] hover:border-white/25 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#E5A93C]" />
            Ekspor Storyboard (.txt)
          </button>
          <button
            type="button"
            onClick={exportProjectJson}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-[#F4F5F7] bg-[#181B22] border border-white/[0.1] hover:border-white/25 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[#E5A93C]" />
            Ekspor Proyek (.json)
          </button>
          <button
            type="button"
            onClick={() => onNavigate('production-form')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-[#0A0B0E] bg-[#E5A93C] hover:bg-[#F0B94D] transition-colors whitespace-nowrap shrink-0"
          >
            Edit Parameter
          </button>
        </div>
      </header>

      {error ? (
        <StudioErrorBanner
          error={error}
          onRetry={onRetryError}
          isRetrying={synthesizingScene !== null}
        />
      ) : null}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
                active
                  ? 'bg-[#E5A93C] text-[#0A0B0E] font-semibold'
                  : 'bg-[#12141A] text-[#9CA3AF] border border-white/[0.08] hover:text-[#F4F5F7]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' ? (
                <span className={`font-mono tabular-nums ${active ? 'text-[#0A0B0E]/80' : 'text-[#6B7280]'}`}>
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <SummaryStatCard label="Karakter" value={String(project.characters.length)} onClick={() => onNavigate('characters')} />
            <SummaryStatCard label="Adegan" value={String(project.scenes.length)} onClick={() => onNavigate('scenes')} />
            <SummaryStatCard label="Storyboard" value={String(project.storyboard.length)} onClick={() => onNavigate('storyboard')} />
            <SummaryStatCard label="Aset Visual" value={String(visualAssets.length)} onClick={() => onNavigate('gallery')} />
            <SummaryStatCard label="Audio Suara" value={String(project.voiceTracks.length)} onClick={() => onNavigate('voice')} />
          </div>

          {project.story ? (
            <section className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-[#F4F5F7]">1. Ringkasan Cerita</h2>
                <button type="button" onClick={() => setActiveTab('story')} className="text-xs text-[#E5A93C] hover:underline">
                  Lihat Detail Episode →
                </button>
              </div>
              <p className="text-sm font-medium text-[#E5A93C]">{project.story.logline}</p>
              <p className="text-sm text-[#9CA3AF] leading-relaxed">{project.story.synopsis}</p>
            </section>
          ) : null}

          {project.characters.length > 0 ? (
            <section className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-[#F4F5F7]">
                  2. Karakter & Konsistensi Visual
                </h2>
                <button type="button" onClick={() => onNavigate('consistency')} className="text-xs text-[#E5A93C] hover:underline">
                  Kelola Konsistensi →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {project.characters.map((c) => (
                  <div key={c.id || c.name} className="p-4 rounded-lg bg-[#0A0B0E] border border-white/[0.08] flex items-start gap-3">
                    {c.referenceImageDataUrl ? (
                      <img src={c.referenceImageDataUrl} alt={c.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : null}
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-[#F4F5F7] truncate">
                        {c.name} <span className="text-xs font-normal text-[#E5A93C]">· {c.role} ({c.age})</span>
                      </p>
                      <p className="text-xs text-[#9CA3AF] line-clamp-2">
                        {c.facialDescription || c.appearance} · {c.costume}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {project.storyboard.length > 0 || project.scenes.length > 0 ? (
            <section className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-[#F4F5F7]">
                  3. Alur Adegan & Storyboard
                </h2>
                <button type="button" onClick={() => onNavigate('storyboard')} className="text-xs text-[#E5A93C] hover:underline">
                  Buka Storyboard Studio →
                </button>
              </div>
              <div className="space-y-3">
                {(project.storyboard.length > 0
                  ? project.storyboard.map((sb) => ({
                      key: sb.frameNumber,
                      sceneNum: sb.sceneNumber,
                      location: sb.location || project.scenes.find((s) => s.sceneNumber === sb.sceneNumber)?.location || '-',
                      characters: sb.characters?.join(', ') || '-',
                      visual: sb.visualDescription || sb.compositionNotes,
                      dialogue: sb.dialogue || sb.dialogueCue,
                    }))
                  : project.scenes.map((sc) => ({
                      key: sc.sceneNumber,
                      sceneNum: sc.sceneNumber,
                      location: sc.location,
                      characters: sc.charactersInvolved.join(', '),
                      visual: sc.actionSummary,
                      dialogue: '',
                    }))
                ).map((item) => (
                  <div key={item.key} className="p-4 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-semibold text-[#E5A93C]">Adegan {item.sceneNum}</span>
                      <span className="text-[#9CA3AF]">{item.location} · {item.characters}</span>
                    </div>
                    <p className="text-sm text-[#F4F5F7]/90 leading-relaxed">{item.visual}</p>
                    {item.dialogue ? (
                      <p className="text-xs text-[#9CA3AF] italic">“{item.dialogue}”</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {activeTab === 'story' && (
        <div className="space-y-6">
          {project.story ? (
            <>
              <div className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4">
                {project.story.storyTitle ? (
                  <div>
                    <p className="text-xs font-medium text-[#6B7280] mb-0.5">Judul Cerita</p>
                    <p className="text-lg font-display font-semibold text-[#F4F5F7]">
                      {project.story.storyTitle}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-medium text-[#E5A93C] mb-1">Logline</p>
                  <p className="text-base sm:text-lg font-medium text-[#F4F5F7] leading-relaxed">
                    {project.story.logline}
                  </p>
                </div>
                {project.story.shortSynopsis ? (
                  <div className="pt-4 border-t border-white/[0.08]">
                    <p className="text-xs font-medium text-[#6B7280] mb-1.5">Sinopsis Singkat</p>
                    <p className="text-sm text-[#F4F5F7]/90 leading-relaxed">
                      {project.story.shortSynopsis}
                    </p>
                  </div>
                ) : null}
                <div className="pt-4 border-t border-white/[0.08]">
                  <p className="text-xs font-medium text-[#6B7280] mb-1.5">Sinopsis Lengkap</p>
                  <p className="text-sm text-[#9CA3AF] leading-relaxed whitespace-pre-line">
                    {project.story.fullSynopsis || project.story.synopsis}
                  </p>
                </div>
                {project.story.worldBackground ? (
                  <div className="pt-4 border-t border-white/[0.08]">
                    <p className="text-xs font-medium text-[#6B7280] mb-1.5">Latar Belakang Dunia Cerita</p>
                    <p className="text-sm text-[#9CA3AF] leading-relaxed">
                      {project.story.worldBackground}
                    </p>
                  </div>
                ) : null}
                {(project.story.mainConflict || project.story.supportingConflict || project.story.climax) ? (
                  <div className="pt-4 border-t border-white/[0.08] grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-[#E5A93C] block mb-1">Konflik Utama</span>
                      <p className="text-[#9CA3AF] leading-relaxed">{project.story.mainConflict || '-'}</p>
                    </div>
                    <div>
                      <span className="text-[#E5A93C] block mb-1">Konflik Pendukung</span>
                      <p className="text-[#9CA3AF] leading-relaxed">{project.story.supportingConflict || '-'}</p>
                    </div>
                    <div>
                      <span className="text-[#E5A93C] block mb-1">Klimaks</span>
                      <p className="text-[#9CA3AF] leading-relaxed">{project.story.climax || '-'}</p>
                    </div>
                  </div>
                ) : null}
                {(project.story.resolution || project.story.ending) ? (
                  <div className="pt-4 border-t border-white/[0.08] grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[#6B7280] block mb-1">Penyelesaian Cerita</span>
                      <p className="text-[#9CA3AF] leading-relaxed">{project.story.resolution || '-'}</p>
                    </div>
                    <div>
                      <span className="text-[#6B7280] block mb-1">Ending</span>
                      <p className="text-[#9CA3AF] leading-relaxed">{project.story.ending || '-'}</p>
                    </div>
                  </div>
                ) : null}
                <div className="pt-4 border-t border-white/[0.08] text-xs text-[#9CA3AF]">
                  <span className="text-[#6B7280] mr-2">Tema Utama:</span>
                  {project.story.themes.join(' · ')}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(['act1', 'act2', 'act3'] as const).map((act, idx) => (
                  <div key={act} className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-2">
                    <p className="text-xs font-mono text-[#E5A93C]">Babak 0{idx + 1}</p>
                    <p className="text-sm text-[#9CA3AF] leading-relaxed">{project.story!.threeActStructure[act]}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h2 className="font-display text-lg font-semibold text-[#F4F5F7]">
                  Struktur Episode ({project.story.episodeOutlines.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {project.story.episodeOutlines.map((ep) => (
                    <div
                      key={ep.episodeNumber}
                      className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-2.5"
                    >
                      <h3 className="font-medium text-sm text-[#F4F5F7]">
                        Episode {ep.episodeNumber}: {ep.title}
                      </h3>
                      <p className="text-sm text-[#9CA3AF] leading-relaxed">{ep.summary}</p>
                      <p className="text-xs text-[#E5A93C] pt-1">
                        Hook / Cliffhanger: <span className="text-[#F4F5F7]">{ep.cliffhanger}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <EmptySectionPrompt
              label="Cerita belum dibuat untuk proyek ini."
              actionLabel="Buka Story Generator"
              onClick={() => onNavigate('story')}
            />
          )}
        </div>
      )}

      {activeTab === 'characters' && (
        <div className="space-y-6">
          {project.characters.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {project.characters.map((char) => (
                <div
                  key={char.id || char.name}
                  className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-3"
                >
                  <div className="flex items-start gap-3">
                    {char.referenceImageDataUrl ? (
                      <img
                        src={char.referenceImageDataUrl}
                        alt={char.name}
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-display text-base font-semibold text-[#F4F5F7]">{char.name}</h3>
                          <span className="text-xs text-[#E5A93C]">
                            {char.role} · Usia {char.age}
                          </span>
                        </div>
                        {char.referenceImageDataUrl ? (
                          <button
                            type="button"
                            onClick={() => downloadImageDataUrl(char.referenceImageDataUrl!, `karakter-${char.name}`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3 h-3 text-[#E5A93C]" />
                            Unduh
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm text-[#9CA3AF]">
                    <p><span className="text-[#6B7280]">Wajah:</span> {char.facialDescription || char.appearance}</p>
                    {char.hairDescription ? (
                      <p><span className="text-[#6B7280]">Rambut:</span> {char.hairDescription}</p>
                    ) : null}
                    {char.physicalTraits ? (
                      <p><span className="text-[#6B7280]">Ciri Fisik:</span> {char.physicalTraits}</p>
                    ) : null}
                    <p><span className="text-[#6B7280]">Pakaian:</span> {char.costume}</p>
                    <p><span className="text-[#6B7280]">Kepribadian:</span> {char.personality}</p>
                    <p><span className="text-[#6B7280]">Karakter Suara:</span> {char.voiceTone}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptySectionPrompt
              label="Profil karakter belum dihasilkan."
              actionLabel="Buka Character Studio"
              onClick={() => onNavigate('characters')}
            />
          )}

          {project.consistency.length > 0 ? (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#E5A93C]" />
                <h2 className="font-display text-lg font-semibold text-[#F4F5F7]">
                  Panduan Konsistensi Karakter
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {project.consistency.map((guide) => (
                  <div
                    key={guide.characterName}
                    className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-sm text-[#F4F5F7]">{guide.characterName}</h3>
                      <span className="font-mono text-xs text-[#9CA3AF]">
                        Seed: {guide.identitySeed} · {guide.locked !== false ? 'Terkunci' : 'Fleksibel'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-[#9CA3AF]">
                      <div>
                        <span className="text-[#6B7280] block mb-0.5">Fitur Wajah</span>
                        {guide.facialFeatures}
                      </div>
                      <div>
                        <span className="text-[#6B7280] block mb-0.5">Rambut & Postur</span>
                        {guide.hairAndBuild}
                      </div>
                      <div>
                        <span className="text-[#6B7280] block mb-0.5">Larangan Perubahan</span>
                        {guide.forbiddenChanges}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] flex items-start justify-between gap-3">
                      <p className="font-mono text-xs text-[#F4F5F7] leading-relaxed">{guide.promptAnchor}</p>
                      <button
                        type="button"
                        onClick={() => handleCopy(`anchor_${guide.characterName}`, guide.promptAnchor)}
                        className="p-1.5 rounded text-[#9CA3AF] hover:text-[#F4F5F7] shrink-0"
                        title="Salin Prompt Anchor"
                      >
                        {copiedId === `anchor_${guide.characterName}` ? (
                          <Check className="w-4 h-4 text-[#22C55E]" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {activeTab === 'scenes' && (
        <div className="space-y-4">
          {project.scenes.length > 0 ? (
            project.scenes.map((scene) => (
              <div
                key={scene.sceneNumber}
                className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-[#F4F5F7]">
                    {scene.sceneId ? (
                      <span className="font-mono text-xs text-[#8B5CF6] mr-2">{scene.sceneId}</span>
                    ) : null}
                    Adegan {scene.sceneNumber}: {scene.heading}
                  </h3>
                  <span className="font-mono text-xs text-[#E5A93C] tabular-nums">
                    Ep. {scene.episodeNumber} · {scene.duration || `${scene.estimatedSeconds}s`}
                  </span>
                </div>
                <p className="text-sm text-[#9CA3AF] leading-relaxed">
                  {scene.mainAction || scene.actionSummary}
                </p>
                {scene.dialogue ? (
                  <p className="text-xs italic text-[#C4B5FD]">Dialog: “{scene.dialogue}”</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B7280] pt-1">
                  <span>Lokasi: <strong className="font-normal text-[#9CA3AF]">{scene.location} ({scene.timeOfDay})</strong></span>
                  <span>Visual: <strong className="font-normal text-[#9CA3AF]">{scene.visualNeeds || scene.lighting}</strong></span>
                  <span>Audio: <strong className="font-normal text-[#9CA3AF]">{scene.audioNeeds || scene.mood}</strong></span>
                  <span>Kamera: <strong className="font-normal text-[#9CA3AF]">{scene.cameraMovement}</strong></span>
                  <span>Tokoh: <strong className="font-normal text-[#9CA3AF]">{scene.charactersInvolved.join(', ')}</strong></span>
                  {scene.transitionToNext ? (
                    <span>Transisi: <strong className="font-normal text-[#E5A93C]">{scene.transitionToNext}</strong></span>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <EmptySectionPrompt
              label="Breakdown adegan belum tersedia."
              actionLabel="Buka Scene Generator"
              onClick={() => onNavigate('scenes')}
            />
          )}
        </div>
      )}

      {activeTab === 'storyboard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {project.storyboard.length > 0 ? (
            project.storyboard.map((frame) => {
              const matchedScene = project.scenes.find((s) => s.sceneNumber === frame.sceneNumber);
              const matchedScript = project.script.find((s) => s.sceneNumber === frame.sceneNumber);
              const frameImage = frame.imageDataUrl || matchedScene?.imageDataUrl;
              const location = frame.location || matchedScene?.location || '-';
              const characters = frame.characters?.length
                ? frame.characters
                : matchedScene?.charactersInvolved || [];
              const visualDesc = frame.visualDescription || frame.compositionNotes;
              const dialogue = frame.dialogue || frame.dialogueCue;

              return (
                <div
                  key={frame.id || frame.frameNumber}
                  className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-[#E5A93C] tabular-nums">
                      Panel #{frame.frameNumber} · {frame.sceneId || `Adegan ${frame.sceneNumber}`}
                    </span>
                    <span className="font-mono text-[#9CA3AF] tabular-nums">
                      {frame.shotType} · {frame.cameraAngle} · {frame.aspectRatio || '16:9'} · {frame.durationSeconds}s
                    </span>
                  </div>

                  {frameImage ? (
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-[#0A0B0E] border border-white/[0.08]">
                      <img
                        src={frameImage}
                        alt={`Panel ${frame.frameNumber} Adegan ${frame.sceneNumber}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => downloadImageDataUrl(frameImage, `storyboard-panel-${frame.frameNumber}-adegan-${frame.sceneNumber}`)}
                        className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-[#0A0B0E]/85 border border-white/15 text-[#F4F5F7] hover:border-[#E5A93C]"
                      >
                        <Download className="w-3 h-3 text-[#E5A93C]" />
                        Unduh
                      </button>
                    </div>
                  ) : null}

                  <div className="p-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.06] text-xs text-[#9CA3AF] space-y-2">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#E5A93C] shrink-0 mt-0.5" />
                      <span className="text-[#F4F5F7]">{location}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Users className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0 mt-0.5" />
                      <span>{characters.join(', ') || '-'}</span>
                    </div>
                    <p className="text-[#F4F5F7]/90 leading-relaxed">{visualDesc}</p>
                    {dialogue ? (
                      <div className="flex items-start gap-2 pt-1">
                        <MessageSquare className="w-3.5 h-3.5 text-[#E5A93C] shrink-0 mt-0.5" />
                        <span className="italic">“{dialogue}”</span>
                      </div>
                    ) : null}
                    {matchedScript ? (
                      <div className="pt-2 border-t border-white/[0.06] space-y-1">
                        <p className="font-mono text-[11px] text-[#E5A93C]">{matchedScript.slugline}</p>
                        {matchedScript.dialogues.slice(0, 2).map((d, idx) => (
                          <p key={idx} className="text-[11px] text-[#9CA3AF]">
                            <strong className="font-semibold text-[#F4F5F7]">{d.character}:</strong> {d.line}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] flex items-start justify-between gap-2">
                    <p className="font-mono text-[11px] text-[#9CA3AF] leading-relaxed">
                      {frame.visualPrompt}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(`sb_${frame.frameNumber}`, frame.visualPrompt)}
                      className="p-1.5 rounded text-[#9CA3AF] hover:text-[#F4F5F7] shrink-0"
                      title="Salin Visual Prompt"
                    >
                      {copiedId === `sb_${frame.frameNumber}` ? (
                        <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="md:col-span-2">
              <EmptySectionPrompt
                label="Panel storyboard belum tersedia."
                actionLabel="Buka Storyboard Visual"
                onClick={() => onNavigate('storyboard')}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'gallery' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#9CA3AF]">
              Seluruh gambar karakter, visual adegan, dan panel storyboard yang tersimpan pada proyek ini.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('image')}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 whitespace-nowrap shrink-0"
              >
                AI Visual Production
              </button>
              <button
                type="button"
                onClick={() => onNavigate('gallery')}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#E5A93C] text-[#0A0B0E] hover:bg-[#F0B94D] whitespace-nowrap shrink-0"
              >
                Buka Galeri Lengkap
              </button>
            </div>
          </div>

          {visualAssets.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visualAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="rounded-xl bg-[#12141A] border border-white/[0.08] overflow-hidden flex flex-col"
                >
                  <div className="aspect-video bg-[#0A0B0E] border-b border-white/[0.08] overflow-hidden">
                    <img
                      src={asset.imageDataUrl}
                      alt={asset.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <span className="font-mono text-[11px] uppercase text-[#E5A93C]">
                        {asset.kind === 'character' ? 'Karakter' : asset.kind === 'scene' ? 'Adegan' : 'Storyboard'}
                      </span>
                      <h3 className="text-sm font-semibold text-[#F4F5F7] truncate">{asset.title}</h3>
                      <p className="text-xs text-[#9CA3AF] truncate">{asset.subtitle}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadImageDataUrl(asset.imageDataUrl, asset.title)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-[#E5A93C]" />
                      Unduh Gambar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptySectionPrompt
              label="Belum ada gambar karakter atau adegan yang tersimpan pada proyek ini."
              actionLabel="Buka AI Visual Production"
              onClick={() => onNavigate('image')}
            />
          )}
        </div>
      )}

      {activeTab === 'script' && (
        <div className="space-y-4">
          {project.script.length > 0 ? (
            project.script.map((block) => (
              <div
                key={block.sceneNumber}
                className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                  <p className="font-mono text-xs font-semibold text-[#E5A93C]">{block.slugline}</p>
                  {block.dialogues.length > 0 ? (
                    <button
                      type="button"
                      disabled={synthesizingScene === block.sceneNumber}
                      onClick={() =>
                        onSynthesizeDialogue(
                          block.sceneNumber,
                          block.dialogues.map((d) => `${d.character}: ${d.line}`).join(' '),
                          block.dialogues[0].character
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {synthesizingScene === block.sceneNumber ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5 text-[#E5A93C]" />
                      )}
                      Buat Suara Dialog (WAV)
                    </button>
                  ) : null}
                </div>
                <p className="text-sm text-[#9CA3AF] leading-relaxed">
                  {block.visualDescription || block.action}
                </p>
                {block.characterActions && block.characterActions !== block.visualDescription ? (
                  <p className="text-xs text-[#9CA3AF]">
                    <span className="text-[#6B7280]">Aksi Karakter:</span> {block.characterActions}
                  </p>
                ) : null}
                {(block.cameraDirection || block.lighting || block.audioMood) ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6B7280]">
                    {block.cameraDirection ? <span>Kamera: <strong className="font-normal text-[#9CA3AF]">{block.cameraDirection}</strong></span> : null}
                    {block.lighting ? <span>Cahaya: <strong className="font-normal text-[#9CA3AF]">{block.lighting}</strong></span> : null}
                    {block.audioMood ? <span>Audio: <strong className="font-normal text-[#9CA3AF]">{block.audioMood}</strong></span> : null}
                  </div>
                ) : null}
                <div className="space-y-3 pl-4 sm:pl-8">
                  {block.dialogues.map((dlg, idx) => (
                    <div key={`${block.sceneNumber}_${idx}`} className="space-y-0.5 max-w-xl">
                      <p className="font-mono text-xs font-semibold text-[#F4F5F7]">
                        {dlg.character.toUpperCase()}
                        {(dlg.expression || dlg.parenthetical) ? (
                          <span className="font-sans font-normal text-[#6B7280] ml-2">
                            ({[dlg.expression, dlg.parenthetical].filter(Boolean).join(' · ')})
                          </span>
                        ) : null}
                      </p>
                      <p className="text-sm text-[#F4F5F7]/90 leading-relaxed">{dlg.line}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <EmptySectionPrompt
              label="Naskah skenario belum ditulis."
              actionLabel="Buka Script Writer"
              onClick={() => onNavigate('script')}
            />
          )}
        </div>
      )}

      {activeTab === 'media' && (
        <div className="space-y-4">
          {project.visualPrompts.length > 0 ? (
            project.visualPrompts.map((spec) => (
              <div key={spec.id} className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#F4F5F7]">
                    {spec.type === 'video' ? 'Blueprint Video' : 'Blueprint Gambar'} · {spec.targetLabel}
                  </span>
                  <span className="font-mono text-xs text-[#E5A93C]">
                    {spec.aspectRatio} · {spec.durationOrResolution}
                  </span>
                </div>
                <p className="text-xs text-[#9CA3AF]">{spec.cameraSpec}</p>
                <p className="font-mono text-xs text-[#F4F5F7] bg-[#0A0B0E] p-3 rounded-lg border border-white/[0.08]">
                  {spec.promptText}
                </p>
              </div>
            ))
          ) : (
            <EmptySectionPrompt
              label="Belum ada spesifikasi prompt gambar atau video."
              actionLabel="Buka Image Generator"
              onClick={() => onNavigate('image')}
            />
          )}
        </div>
      )}

      {activeTab === 'audio' && (
        <div className="space-y-4">
          {project.voiceTracks.length > 0 ? (
            project.voiceTracks.map((track) => (
              <div
                key={track.id}
                className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[#F4F5F7]">{track.label}</h3>
                    <p className="text-xs text-[#9CA3AF]">
                      Suara: {track.voiceName}
                      {track.secondaryVoiceName ? ` & ${track.secondaryVoiceName}` : ''} · Format WAV 24kHz
                    </p>
                  </div>
                  <a
                    href={`data:${track.mimeType};base64,${track.audioBase64Wav}`}
                    download={`${track.label.toLowerCase().replace(/\s+/g, '-')}.wav`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-white/25"
                  >
                    <Download className="w-3.5 h-3.5 text-[#E5A93C]" />
                    Unduh WAV
                  </a>
                </div>
                <p className="text-xs text-[#9CA3AF] leading-relaxed">{track.scriptText}</p>
                <audio
                  controls
                  src={`data:${track.mimeType};base64,${track.audioBase64Wav}`}
                  className="w-full h-10"
                />
              </div>
            ))
          ) : (
            <EmptySectionPrompt
              label="Belum ada audio suara WAV yang dihasilkan."
              actionLabel="Buka Voice Studio"
              onClick={() => onNavigate('voice')}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SummaryStatCard({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-4 rounded-xl bg-[#12141A] border border-white/[0.08] hover:border-[#E5A93C]/45 text-left transition-colors"
    >
      <p className="text-xs text-[#9CA3AF]">{label}</p>
      <p className="font-mono text-2xl font-semibold text-[#F4F5F7] tabular-nums mt-1">{value}</p>
    </button>
  );
}

function EmptySectionPrompt({
  label,
  actionLabel,
  onClick,
}: {
  label: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="p-8 rounded-xl bg-[#12141A] border border-white/[0.08] text-center space-y-3">
      <p className="text-sm text-[#9CA3AF]">{label}</p>
      <button
        type="button"
        onClick={onClick}
        className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 transition-colors"
      >
        {actionLabel}
      </button>
    </div>
  );
}
