import { useEffect, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Database,
  Download,
  FolderPlus,
  Search,
  Trash2,
} from 'lucide-react';
import type { FilmProject, NavSection } from '../types/studio';
import { fetchAndroidFiles } from '../services/studioApi';
import { formatStorageBytes, type StorageCapacityInfo } from '../services/studioStorage';

interface ProjectsViewProps {
  projects: FilmProject[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
  onNavigate: (section: NavSection) => void;
  storageCapacity?: StorageCapacityInfo | null;
}

export function ProjectsView({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onNavigate,
  storageCapacity,
}: ProjectsViewProps) {
  const [query, setQuery] = useState('');

  const filtered = projects.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.input.title.toLowerCase().includes(q) ||
      p.input.genre.toLowerCase().includes(q) ||
      p.input.premise.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">11. My Projects</h1>
          <p className="text-sm text-[#9CA3AF]">
            Kelola seluruh proyek film pendek Anda. Penyimpanan utama menggunakan IndexedDB browser (termasuk foto referensi, storyboard, dan audio WAV) agar aman jangka panjang.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateProject}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold whitespace-nowrap shrink-0"
        >
          <FolderPlus className="w-4 h-4" />
          Proyek Baru
        </button>
      </div>

      {storageCapacity ? (
        <div className="p-4 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[#F4F5F7] font-medium">
              <Database className="w-4 h-4 text-[#E5A93C] shrink-0" />
              <span>Kapasitas Penyimpanan IndexedDB</span>
            </div>
            <span className="font-mono text-[#9CA3AF] tabular-nums">
              {storageCapacity.supported && storageCapacity.quotaBytes > 0
                ? `${formatStorageBytes(storageCapacity.usageBytes)} / ${formatStorageBytes(storageCapacity.quotaBytes)} (${storageCapacity.percentUsed}%)`
                : `${formatStorageBytes(storageCapacity.usageBytes)} media tersimpan`}
              {storageCapacity.persisted ? ' · Permanen' : ''}
            </span>
          </div>
          {storageCapacity.supported && storageCapacity.quotaBytes > 0 ? (
            <div className="h-1.5 w-full rounded-full bg-[#0A0B0E] overflow-hidden">
              <div
                className={`h-full transition-all ${
                  storageCapacity.isNearFull ? 'bg-[#EF4444]' : 'bg-[#E5A93C]'
                }`}
                style={{ width: `${Math.min(100, Math.max(1, storageCapacity.percentUsed))}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative">
        <Search className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari judul film, genre, atau premis..."
          className="w-full h-11 pl-10 pr-4 rounded-lg bg-[#12141A] border border-white/[0.08] text-sm text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-[#E5A93C]"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((proj) => {
          const isCurrent = proj.id === activeProjectId;
          const hasResult = Boolean(
            proj.story ||
              proj.script.length ||
              proj.scenes.length ||
              (proj.visualAssets && proj.visualAssets.length > 0)
          );
          return (
            <div
              key={proj.id}
              className={`p-5 rounded-xl bg-[#12141A] border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isCurrent ? 'border-[#E5A93C]/50' : 'border-white/[0.08]'
              }`}
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <h2 className="font-display text-base font-semibold text-[#F4F5F7] truncate">
                    {proj.input.title.trim() || 'Proyek Film Tanpa Judul'}
                  </h2>
                  {isCurrent ? (
                    <span className="font-mono text-[11px] text-[#E5A93C] shrink-0">Aktif</span>
                  ) : null}
                </div>
                <p className="text-xs text-[#9CA3AF] truncate">
                  {proj.input.genre} · {proj.input.episodeCount} Episode · {proj.input.sceneCount} Adegan ·{' '}
                  {proj.input.dialogueLanguage} ·{' '}
                  {hasResult ? 'Sudah Diproduksi' : 'Draf Parameter'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onSelectProject(proj.id);
                    onNavigate(hasResult ? 'production-result' : 'production-form');
                  }}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50"
                >
                  {hasResult ? 'Buka Hasil' : 'Buka Formulir'}
                </button>
                {projects.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onDeleteProject(proj.id)}
                    aria-label="Hapus proyek"
                    className="p-2 rounded-lg text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function KotlinExportView() {
  const [files, setFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAndroidFiles()
      .then((list) => {
        setFiles(list);
        if (list.length > 0) setSelectedPath(list[0].path);
      })
      .finally(() => setLoading(false));
  }, []);

  const currentFile = files.find((f) => f.path === selectedPath);

  const handleCopy = async () => {
    if (!currentFile) return;
    await navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = () => {
    if (!currentFile) return;
    const blob = new Blob([currentFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.path.split('/').pop() || 'StudioFile.kt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="pb-6 border-b border-white/[0.08] space-y-1.5">
        <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">
          Kode Sumber Android Native (Kotlin & Jetpack Compose)
        </h1>
        <p className="text-sm text-[#9CA3AF] leading-relaxed max-w-3xl">
          Seluruh berkas arsitektur Android Jetpack Compose Material 3 Dark Mode, model data Kotlin Serialization, klien Gemini API (<span className="font-mono text-[#F4F5F7]">GeminiStudioService.kt</span>), dan repositori Firestore (<span className="font-mono text-[#F4F5F7]">FirebaseProjectRepository.kt</span>) siap disalin atau diunduh ke Android Studio.
        </p>
      </div>

      {loading ? (
        <div className="p-8 rounded-xl bg-[#12141A] border border-white/[0.08] text-sm text-[#9CA3AF]">
          Memuat berkas Kotlin & Gradle...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-1.5">
            {files.map((file) => {
              const active = file.path === selectedPath;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-left text-xs font-mono transition-colors ${
                    active
                      ? 'bg-[#E5A93C]/14 text-[#F4F5F7] border border-[#E5A93C]/35'
                      : 'bg-[#12141A] text-[#9CA3AF] border border-white/[0.08] hover:text-[#F4F5F7]'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5 text-[#E5A93C] shrink-0" />
                  <span className="truncate">{file.path}</span>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-8 rounded-xl bg-[#12141A] border border-white/[0.08] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-[#E5A93C] truncate">{currentFile?.path}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7]"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#22C55E]" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Disalin' : 'Salin'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#E5A93C] text-[#0A0B0E]"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh
                </button>
              </div>
            </div>
            <pre className="p-4 text-xs font-mono text-[#F4F5F7]/90 overflow-x-auto max-h-[600px] leading-relaxed">
              <code>{currentFile?.content}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
