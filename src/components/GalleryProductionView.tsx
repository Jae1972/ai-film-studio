import { useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  FilmProject,
  NavSection,
  ProductionVisualAsset,
} from '../types/studio';
import {
  collectProjectVisualAssets,
  compressImageFileToDataUrl,
  downloadImageDataUrl,
} from '../utils/imageAssets';

interface GalleryProductionViewProps {
  project: FilmProject;
  onUpdateProject: (updater: (prev: FilmProject) => FilmProject) => void;
  onNavigate: (section: NavSection) => void;
}

type GalleryFilter = 'all' | 'character' | 'scene' | 'storyboard';

export function GalleryProductionView({
  project,
  onUpdateProject,
  onNavigate,
}: GalleryProductionViewProps) {
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [query, setQuery] = useState('');
  const [previewAsset, setPreviewAsset] = useState<ProductionVisualAsset | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const allAssets = useMemo(() => collectProjectVisualAssets(project), [project]);

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allAssets.filter((item) => {
      if (filter !== 'all' && item.kind !== filter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.promptUsed.toLowerCase().includes(q)
      );
    });
  }, [allAssets, filter, query]);

  const counts = useMemo(
    () => ({
      all: allAssets.length,
      character: allAssets.filter((a) => a.kind === 'character').length,
      scene: allAssets.filter((a) => a.kind === 'scene').length,
      storyboard: allAssets.filter((a) => a.kind === 'storyboard').length,
    }),
    [allAssets]
  );

  const handleImportGalleryAsset = async (file: File | undefined) => {
    if (!file) return;
    try {
      setUploadError(null);
      const { dataUrl, mimeType } = await compressImageFileToDataUrl(file, 1024);
      const cleanName = file.name.replace(/\.[^.]+$/, '') || 'Aset Visual Produksi';
      const newAsset: ProductionVisualAsset = {
        id: `asset_manual_${Date.now()}`,
        kind: 'scene',
        title: cleanName,
        subtitle: 'Unggahan Aset Produksi Manual',
        promptUsed: 'Aset visual produksi yang diunggah pengguna',
        aspectRatio: '16:9',
        imageDataUrl: dataUrl,
        mimeType,
        source: 'user-upload',
        createdAt: new Date().toISOString(),
      };
      onUpdateProject((prev) => ({
        ...prev,
        visualAssets: [newAsset, ...(prev.visualAssets || [])],
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Gagal memuat berkas gambar ke galeri.'
      );
    }
  };

  const handleDeleteAsset = (asset: ProductionVisualAsset) => {
    onUpdateProject((prev) => ({
      ...prev,
      visualAssets: (prev.visualAssets || []).filter((a) => a.id !== asset.id),
      characters:
        asset.kind === 'character' && asset.characterId
          ? prev.characters.map((c) =>
              c.id === asset.characterId
                ? { ...c, referenceImageDataUrl: undefined, referenceImageSource: undefined }
                : c
            )
          : prev.characters,
      scenes:
        asset.kind === 'scene' && asset.sceneNumber
          ? prev.scenes.map((s) =>
              s.sceneNumber === asset.sceneNumber
                ? { ...s, imageDataUrl: undefined, imageSource: undefined }
                : s
            )
          : prev.scenes,
      storyboard:
        asset.kind === 'storyboard'
          ? prev.storyboard.map((f) => {
              const matches = asset.frameNumber
                ? f.frameNumber === asset.frameNumber
                : f.sceneNumber === asset.sceneNumber;
              return matches
                ? { ...f, imageDataUrl: undefined, imageMimeType: undefined, imageSource: undefined }
                : f;
            })
          : asset.kind === 'scene' && asset.sceneNumber
            ? prev.storyboard.map((f) =>
                f.sceneNumber === asset.sceneNumber
                  ? { ...f, imageDataUrl: undefined, imageMimeType: undefined, imageSource: undefined }
                  : f
              )
            : prev.storyboard,
      updatedAt: new Date().toISOString(),
    }));
    if (previewAsset?.id === asset.id) {
      setPreviewAsset(null);
    }
  };

  const kindLabel = (kind: ProductionVisualAsset['kind']) => {
    if (kind === 'character') return 'Karakter';
    if (kind === 'storyboard') return 'Storyboard';
    return 'Adegan';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">
            10. Galeri Produksi Visual
          </h1>
          <p className="text-sm text-[#9CA3AF] leading-relaxed">
            Manajemen seluruh hasil visual karakter, referensi adegan, dan panel storyboard proyek Anda. Setiap aset tersimpan otomatis dan dapat diunduh kapan saja.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void handleImportGalleryAsset(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#E5A93C]/50 text-[#F4F5F7] text-xs font-medium min-h-[42px] whitespace-nowrap shrink-0"
          >
            <ImagePlus className="w-4 h-4 text-[#E5A93C]" />
            Unggah Aset Visual
          </button>
          <button
            type="button"
            onClick={() => onNavigate('image')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold min-h-[42px] whitespace-nowrap shrink-0"
          >
            <ImageIcon className="w-4 h-4" />
            Buka AI Visual Production
          </button>
        </div>
      </div>

      {uploadError ? (
        <div role="alert" className="p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/35 text-sm text-[#F4F5F7]">
          {uploadError}
        </div>
      ) : null}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="inline-flex flex-wrap p-1 rounded-lg bg-[#12141A] border border-white/[0.08] gap-1">
          {(
            [
              { id: 'all', label: `Semua (${counts.all})` },
              { id: 'character', label: `Karakter (${counts.character})` },
              { id: 'scene', label: `Adegan (${counts.scene})` },
              { id: 'storyboard', label: `Storyboard (${counts.storyboard})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 min-h-[38px] tabular-nums ${
                filter === tab.id
                  ? 'bg-[#E5A93C] text-[#0A0B0E] font-semibold'
                  : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari karakter, adegan, atau prompt..."
            className="w-full h-10 pl-10 pr-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-xs text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-[#E5A93C]"
          />
        </div>
      </div>

      {filteredAssets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAssets.map((asset) => (
            <article
              key={asset.id}
              className="rounded-xl bg-[#12141A] border border-white/[0.08] overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="aspect-video bg-[#0A0B0E] border-b border-white/[0.08] overflow-hidden">
                  <img
                    src={asset.imageDataUrl}
                    alt={asset.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-xs text-[#9CA3AF] tabular-nums">
                    <span>{kindLabel(asset.kind)}</span>
                    <span aria-hidden="true" className="mx-1.5">·</span>
                    <span>{asset.aspectRatio}</span>
                    <span aria-hidden="true" className="mx-1.5">·</span>
                    <span>
                      {asset.source === 'gemini-ai'
                        ? asset.modelUsed || 'Gemini AI'
                        : 'Referensi Unggahan'}
                    </span>
                  </p>
                  <h2 className="font-display text-base font-semibold text-[#F4F5F7] truncate">
                    {asset.title}
                  </h2>
                  <p className="text-xs text-[#9CA3AF] line-clamp-2 leading-relaxed">
                    {asset.subtitle}
                  </p>
                </div>
              </div>

              <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewAsset(asset)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#E5A93C]/50 text-xs font-medium text-[#F4F5F7] whitespace-nowrap shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#E5A93C]" />
                    Pratinjau
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadImageDataUrl(asset.imageDataUrl, asset.title)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-xs font-semibold text-[#0A0B0E] whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteAsset(asset)}
                  aria-label={`Hapus aset ${asset.title}`}
                  className="p-2 rounded-lg text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="p-10 rounded-xl bg-[#12141A] border border-white/[0.08] text-center space-y-4">
          <div className="w-11 h-11 rounded-xl bg-[#0A0B0E] border border-white/[0.08] flex items-center justify-center mx-auto">
            <ImageIcon className="w-5 h-5 text-[#E5A93C]" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="font-display text-base font-semibold text-[#F4F5F7]">
              Galeri Produksi Masih Kosong
            </h2>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              Belum ada gambar karakter atau adegan yang tersimpan pada proyek ini. Buat atau unggah referensi visual melalui Character Studio, Scene Image Generator, atau Storyboard Visual.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('characters')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#E5A93C]/50 text-xs font-medium text-[#F4F5F7]"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#E5A93C]" />
              Buka Character Studio
            </button>
            <button
              type="button"
              onClick={() => onNavigate('image')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-xs font-semibold text-[#0A0B0E]"
            >
              <Film className="w-3.5 h-3.5" />
              Buka Scene Image Generator
            </button>
          </div>
        </div>
      )}

      {previewAsset ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Pratinjau ${previewAsset.title}`}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="max-w-4xl w-full rounded-xl bg-[#12141A] border border-white/[0.12] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold text-[#F4F5F7] truncate">
                  {previewAsset.title}
                </h3>
                <p className="text-xs text-[#9CA3AF] truncate">{previewAsset.subtitle}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => downloadImageDataUrl(previewAsset.imageDataUrl, previewAsset.title)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#E5A93C] text-[#0A0B0E] text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  aria-label="Tutup pratinjau"
                  className="p-2 rounded-lg bg-[#181B22] text-[#9CA3AF] hover:text-[#F4F5F7]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 bg-[#0A0B0E] overflow-y-auto flex-1 flex flex-col items-center gap-4">
              <img
                src={previewAsset.imageDataUrl}
                alt={previewAsset.title}
                referrerPolicy="no-referrer"
                className="max-h-[60vh] w-auto rounded-lg object-contain border border-white/[0.08]"
              />
              <div className="w-full p-3.5 rounded-lg bg-[#12141A] border border-white/[0.08] space-y-1">
                <p className="text-xs font-medium text-[#E5A93C]">Prompt / Referensi Visual</p>
                <p className="font-mono text-xs text-[#9CA3AF] leading-relaxed">
                  {previewAsset.promptUsed}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
