import { useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  UserPlus,
} from 'lucide-react';
import type {
  CharacterReferenceSheet,
  CharacterSheetViewKey,
  ConsistencyGuide,
  ConsistencyLocks,
  FilmProject,
  GeneratedCharacter,
  NavSection,
  ProductionVisualAsset,
  StudioCapabilities,
  StudioErrorDetails,
} from '../types/studio';
import {
  apiGenerateCharacterImage,
  apiGenerateCharacters,
  apiGenerateConsistency,
  toStudioErrorDetails,
} from '../services/studioApi';
import {
  downloadImageDataUrl,
  optimizeImageFile,
} from '../utils/imageAssets';
import {
  buildCharacterIdentityAnchor,
  buildForbiddenChangesText,
  buildReferenceSheetPrompt,
  CHARACTER_SHEET_VIEWS,
  countReferenceSheetImages,
  DEFAULT_CONSISTENCY_LOCKS,
  removeCharacterAndRelations,
  resolveConsistencyLocks,
  syncGuideWithCharacter,
} from '../utils/characterConsistency';
import { StudioErrorBanner } from './StudioErrorBanner';

interface CharacterViewsProps {
  project: FilmProject;
  capabilities?: StudioCapabilities | null;
  onUpdateProject: (updater: (prev: FilmProject) => FilmProject) => void;
  onNavigate: (section: NavSection) => void;
  onOpenCharacterVisual?: (characterId: string) => void;
}

const GENDER_OPTIONS = ['Laki-laki', 'Perempuan', 'Lainnya'];

function createEmptyCharacterDraft(): GeneratedCharacter {
  return {
    id: '',
    name: '',
    role: 'Protagonis',
    age: '',
    gender: 'Perempuan',
    appearance: '',
    facialDescription: '',
    eyeShape: '',
    noseShape: '',
    lipShape: '',
    skinTone: '',
    hairDescription: '',
    height: '',
    bodyBuild: '',
    physicalTraits: '',
    personality: '',
    costume: '',
    voiceTone: '',
    motivation: '',
    referenceImageDataUrl: '',
    referenceImageNotes: '',
    referenceSheet: {},
  };
}

function buildCharacterVisualSummary(char: Partial<GeneratedCharacter>): string {
  return (
    [
      char.gender,
      char.facialDescription,
      char.eyeShape ? `Mata ${char.eyeShape}` : '',
      char.noseShape ? `Hidung ${char.noseShape}` : '',
      char.lipShape ? `Bibir ${char.lipShape}` : '',
      char.skinTone ? `Kulit ${char.skinTone}` : '',
      char.hairDescription,
      char.height ? `Tinggi ${char.height}` : '',
      char.bodyBuild ? `Tubuh ${char.bodyBuild}` : '',
      char.physicalTraits,
      char.costume,
    ]
      .filter(Boolean)
      .join('. ') || 'Referensi visual karakter'
  );
}

export function CharacterStudioView({
  project,
  capabilities,
  onUpdateProject,
  onNavigate,
  onOpenCharacterVisual,
}: CharacterViewsProps) {
  const [loading, setLoading] = useState(false);
  const [sheetLoadingKey, setSheetLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<StudioErrorDetails | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedAnatomyIds, setExpandedAnatomyIds] = useState<Record<string, boolean>>({});
  const [expandedSheetIds, setExpandedSheetIds] = useState<Record<string, boolean>>({});

  const [newChar, setNewChar] = useState<GeneratedCharacter>(() => createEmptyCharacterDraft());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const copyPrompt = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const toggleAnatomy = (charId: string) => {
    setExpandedAnatomyIds((prev) => ({ ...prev, [charId]: !(prev[charId] ?? true) }));
  };

  const toggleSheet = (charId: string) => {
    setExpandedSheetIds((prev) => ({ ...prev, [charId]: !prev[charId] }));
  };

  const handleUploadNewImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { dataUrl, mimeType } = await optimizeImageFile(file, 'character');
      setNewChar((prev) => ({
        ...prev,
        referenceImageDataUrl: dataUrl,
        referenceImageMimeType: mimeType,
        referenceImageSource: 'user-upload',
      }));
      setError(null);
    } catch (err) {
      setError({
        category: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'Gagal memuat gambar referensi.',
        retryable: false,
      });
    }
  };

  const handleUploadCharacterImage = async (charId: string, file: File | undefined) => {
    if (!file) return;
    try {
      const { dataUrl, mimeType } = await optimizeImageFile(file, 'character');
      onUpdateProject((prev) => {
        const target = prev.characters.find((c) => c.id === charId);
        const newAsset: ProductionVisualAsset | null = target
          ? {
              id: `asset_char_${charId}_${Date.now()}`,
              kind: 'character',
              title: target.name || 'Karakter',
              subtitle: `${target.role || 'Pemeran'} · Usia ${target.age || '-'}`,
              characterId: charId,
              characterName: target.name,
              promptUsed: buildCharacterVisualSummary(target),
              aspectRatio: '1:1',
              imageDataUrl: dataUrl,
              mimeType,
              source: 'user-upload',
              createdAt: new Date().toISOString(),
            }
          : null;

        return {
          ...prev,
          characters: prev.characters.map((c) =>
            c.id === charId
              ? {
                  ...c,
                  referenceImageDataUrl: dataUrl,
                  referenceImageMimeType: mimeType,
                  referenceImageSource: 'user-upload',
                }
              : c
          ),
          consistency: prev.consistency.map((g) =>
            (g.characterId && g.characterId === charId) ||
            (target && g.characterName.toLowerCase() === target.name.toLowerCase())
              ? { ...g, characterId: g.characterId || charId, referenceImageDataUrl: dataUrl }
              : g
          ),
          visualAssets: newAsset
            ? [
                newAsset,
                ...(prev.visualAssets || []).filter(
                  (a) =>
                    !(
                      a.kind === 'character' &&
                      (a.characterId === charId ||
                        (!a.characterId && target && a.characterName === target.name))
                    )
                ),
              ]
            : prev.visualAssets,
          updatedAt: new Date().toISOString(),
        };
      });
      setError(null);
    } catch (err) {
      setError({
        category: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'Gagal memperbarui gambar referensi karakter.',
        retryable: false,
      });
    }
  };

  const handleDeleteCharacterImage = (charId: string) => {
    onUpdateProject((prev) => {
      const target = prev.characters.find((c) => c.id === charId);
      return {
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === charId
            ? {
                ...c,
                referenceImageDataUrl: undefined,
                referenceImageMimeType: undefined,
                referenceImageSource: undefined,
              }
            : c
        ),
        consistency: prev.consistency.map((g) =>
          (g.characterId && g.characterId === charId) ||
          (target && g.characterName.toLowerCase() === target.name.toLowerCase())
            ? { ...g, referenceImageDataUrl: undefined }
            : g
        ),
        visualAssets: (prev.visualAssets || []).filter(
          (a) =>
            !(
              a.kind === 'character' &&
              (a.characterId === charId ||
                (!a.characterId && target && a.characterName === target.name)) &&
              !a.id.startsWith('asset_sheet_')
            )
        ),
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleUploadReferenceSheetImage = async (
    charId: string,
    viewKey: CharacterSheetViewKey,
    file: File | undefined
  ) => {
    if (!file) return;
    try {
      const { dataUrl, mimeType } = await optimizeImageFile(file, 'character');
      onUpdateProject((prev) => {
        const target = prev.characters.find((c) => c.id === charId);
        const guide = prev.consistency.find(
          (g) =>
            (g.characterId && g.characterId === charId) ||
            (target && g.characterName.toLowerCase() === target.name.toLowerCase())
        );
        const defaultPrompt = target ? buildReferenceSheetPrompt(target, viewKey, guide) : '';

        return {
          ...prev,
          characters: prev.characters.map((c) => {
            if (c.id !== charId) return c;
            const prevSheet: CharacterReferenceSheet = c.referenceSheet || {};
            return {
              ...c,
              referenceSheet: {
                ...prevSheet,
                [viewKey]: {
                  ...prevSheet[viewKey],
                  imageDataUrl: dataUrl,
                  mimeType,
                  source: 'user-upload',
                  promptText: prevSheet[viewKey]?.promptText || defaultPrompt,
                  updatedAt: new Date().toISOString(),
                },
              },
            };
          }),
          updatedAt: new Date().toISOString(),
        };
      });
      setError(null);
    } catch (err) {
      setError({
        category: 'BAD_REQUEST',
        message:
          err instanceof Error ? err.message : 'Gagal memuat gambar lembar referensi karakter.',
        retryable: false,
      });
    }
  };

  const handleDeleteReferenceSheetImage = (charId: string, viewKey: CharacterSheetViewKey) => {
    onUpdateProject((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => {
        if (c.id !== charId || !c.referenceSheet) return c;
        const prevSlot = c.referenceSheet[viewKey];
        return {
          ...c,
          referenceSheet: {
            ...c.referenceSheet,
            [viewKey]: prevSlot
              ? {
                  ...prevSlot,
                  imageDataUrl: undefined,
                  mimeType: undefined,
                  source: undefined,
                  updatedAt: new Date().toISOString(),
                }
              : undefined,
          },
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleGenerateReferenceSheetAi = async (
    char: GeneratedCharacter,
    viewKey: CharacterSheetViewKey
  ) => {
    const opKey = `${char.id}_${viewKey}`;
    setError(null);
    setSheetLoadingKey(opKey);
    try {
      const guide = project.consistency.find(
        (g) =>
          (g.characterId && g.characterId === char.id) ||
          g.characterName.toLowerCase() === char.name.toLowerCase()
      );
      const viewPrompt =
        char.referenceSheet?.[viewKey]?.promptText?.trim() ||
        buildReferenceSheetPrompt(char, viewKey, guide);

      const res = await apiGenerateCharacterImage({
        input: project.input,
        character: char,
        characterId: char.id,
        consistency: guide?.locked !== false ? guide : undefined,
        promptOverride: viewPrompt,
        aspectRatio: viewKey === 'fullBody' ? '3:4' : '1:1',
        resolution: '1K',
      });

      onUpdateProject((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === char.id
            ? {
                ...c,
                referenceSheet: {
                  ...(c.referenceSheet || {}),
                  [viewKey]: {
                    imageDataUrl: res.imageDataUrl,
                    mimeType: res.mimeType,
                    source: 'gemini-ai',
                    promptText: res.promptUsed,
                    updatedAt: new Date().toISOString(),
                  },
                },
              }
            : c
        ),
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setSheetLoadingKey(null);
    }
  };

  const handleAddManualCharacter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChar.name.trim()) {
      setError({
        category: 'BAD_REQUEST',
        message: 'Nama karakter wajib diisi.',
        retryable: false,
      });
      return;
    }
    const charId = `char_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const created: GeneratedCharacter = {
      ...newChar,
      id: charId,
      appearance: newChar.appearance.trim() || buildCharacterVisualSummary(newChar),
    };
    onUpdateProject((prev) => {
      const nextAssets = created.referenceImageDataUrl
        ? [
            {
              id: `asset_char_${charId}_${Date.now()}`,
              kind: 'character' as const,
              title: created.name,
              subtitle: `${created.role} · Usia ${created.age || '-'}`,
              characterId: charId,
              characterName: created.name,
              promptUsed: buildCharacterVisualSummary(created),
              aspectRatio: '1:1',
              imageDataUrl: created.referenceImageDataUrl,
              mimeType: created.referenceImageMimeType || 'image/jpeg',
              source: 'user-upload' as const,
              createdAt: new Date().toISOString(),
            },
            ...(prev.visualAssets || []),
          ]
        : prev.visualAssets;
      return {
        ...prev,
        characters: [...prev.characters, created],
        visualAssets: nextAssets,
        updatedAt: new Date().toISOString(),
      };
    });
    setNewChar(createEmptyCharacterDraft());
    setShowCreateForm(false);
    setError(null);
  };

  const updateCharacterField = (id: string, patch: Partial<GeneratedCharacter>) => {
    onUpdateProject((prev) => {
      const prevChar = prev.characters.find((c) => c.id === id);
      const nextCharacters = prev.characters.map((c) => {
        if (c.id !== id) return c;
        const merged = { ...c, ...patch };
        return {
          ...merged,
          appearance: buildCharacterVisualSummary(merged),
        };
      });
      const updatedChar = nextCharacters.find((c) => c.id === id);

      const nextConsistency = prev.consistency.map((g, idx) => {
        const matches =
          (g.characterId && g.characterId === id) ||
          (prevChar && g.characterName.toLowerCase() === prevChar.name.toLowerCase());
        if (!matches || !updatedChar) return g;
        return syncGuideWithCharacter(updatedChar, g, idx);
      });

      const nextVisualAssets =
        updatedChar && patch.name !== undefined
          ? (prev.visualAssets || []).map((a) =>
              a.characterId === id
                ? {
                    ...a,
                    characterName: updatedChar.name,
                    title: a.id.startsWith('asset_sheet_') ? a.title : updatedChar.name,
                  }
                : a
            )
          : prev.visualAssets;

      return {
        ...prev,
        characters: nextCharacters,
        consistency: nextConsistency,
        visualAssets: nextVisualAssets,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const deleteCharacter = (id: string) => {
    onUpdateProject((prev) => removeCharacterAndRelations(prev, id));
  };

  const handleGenerateCharacters = async () => {
    if (!project.input.title.trim() || !project.input.premise.trim()) {
      setError({
        category: 'BAD_REQUEST',
        message:
          'Isi Judul Film dan Cerita / Premis di Formulir Produksi terlebih dahulu untuk generate karakter dengan Gemini.',
        retryable: false,
      });
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { characters } = await apiGenerateCharacters(
        project.input,
        project.story?.synopsis
      );
      onUpdateProject((prev) => {
        const prevByName = new Map(
          prev.characters.map((c) => [c.name.toLowerCase(), c])
        );
        const merged = characters.map((c, idx) => {
          const old = prevByName.get(c.name.toLowerCase());
          return {
            ...c,
            id: c.id || old?.id || `char_${Date.now()}_${idx}`,
            referenceImageDataUrl:
              c.referenceImageDataUrl || old?.referenceImageDataUrl,
            referenceImageMimeType:
              c.referenceImageMimeType || old?.referenceImageMimeType,
            referenceImageSource:
              c.referenceImageSource || old?.referenceImageSource,
            referenceSheet: c.referenceSheet || old?.referenceSheet,
          };
        });
        return { ...prev, characters: merged, updatedAt: new Date().toISOString() };
      });
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSyncToConsistency = () => {
    if (project.characters.length === 0) {
      setError({
        category: 'BAD_REQUEST',
        message: 'Buat atau generate minimal satu karakter terlebih dahulu.',
        retryable: false,
      });
      return;
    }
    onUpdateProject((prev) => {
      const existingById = new Map(
        prev.consistency
          .filter((g) => g.characterId)
          .map((g) => [g.characterId!, g])
      );
      const existingByName = new Map(
        prev.consistency.map((g) => [g.characterName.toLowerCase(), g])
      );
      const nextGuides: ConsistencyGuide[] = prev.characters.map((char, idx) => {
        const prevGuide =
          existingById.get(char.id) || existingByName.get(char.name.toLowerCase());
        return syncGuideWithCharacter(char, prevGuide, idx);
      });
      return { ...prev, consistency: nextGuides, updatedAt: new Date().toISOString() };
    });
    onNavigate('consistency');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">
            03. Character Studio
          </h1>
          <p className="text-sm text-[#9CA3AF] leading-relaxed">
            Kelola profil lengkap 14 atribut karakter, foto referensi utama, dan Lembar Referensi 4 Tampilan (Depan, Samping, Belakang, Seluruh Tubuh) yang tersimpan permanen di IndexedDB.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#181B22] border border-[#8B5CF6]/40 hover:border-[#8B5CF6] text-[#F4F5F7] text-xs font-medium min-h-[44px] whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4 text-[#8B5CF6]" />
            {showCreateForm ? 'Tutup Form' : 'Tambah Karakter'}
          </button>
          <button
            type="button"
            onClick={handleGenerateCharacters}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-semibold min-h-[44px] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {loading ? 'Memproses...' : 'Generate via Gemini'}
          </button>
        </div>
      </div>

      {error ? (
        <StudioErrorBanner
          error={error}
          onRetry={() => void handleGenerateCharacters()}
          isRetrying={loading}
        />
      ) : null}

      {showCreateForm ? (
        <form
          onSubmit={handleAddManualCharacter}
          className="p-5 sm:p-6 rounded-xl bg-[#12141A] border border-[#8B5CF6]/40 space-y-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-[#F4F5F7]">
              Tambah Karakter Baru (Profil Lengkap)
            </h2>
            <span className="text-[11px] font-mono text-[#8B5CF6]">14 Atribut Identitas</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Nama Karakter *</label>
              <input
                type="text"
                required
                value={newChar.name}
                onChange={(e) => setNewChar((p) => ({ ...p, name: e.target.value }))}
                placeholder="Contoh: Nadira Putri"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Usia</label>
              <input
                type="text"
                value={newChar.age}
                onChange={(e) => setNewChar((p) => ({ ...p, age: e.target.value }))}
                placeholder="Contoh: 26 tahun"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Jenis Kelamin</label>
              <select
                value={newChar.gender || 'Perempuan'}
                onChange={(e) => setNewChar((p) => ({ ...p, gender: e.target.value }))}
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              >
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Peran dalam Film</label>
              <input
                type="text"
                value={newChar.role}
                onChange={(e) => setNewChar((p) => ({ ...p, role: e.target.value }))}
                placeholder="Protagonis / Antagonis"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Karakter Suara</label>
              <input
                type="text"
                value={newChar.voiceTone}
                onChange={(e) => setNewChar((p) => ({ ...p, voiceTone: e.target.value }))}
                placeholder="Contoh: Tenang, serak lembut"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Deskripsi Wajah</label>
              <input
                type="text"
                value={newChar.facialDescription || ''}
                onChange={(e) =>
                  setNewChar((p) => ({ ...p, facialDescription: e.target.value }))
                }
                placeholder="Bentuk wajah oval, tulang pipi tegas, tahi lalat di pipi kanan..."
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Bentuk Mata</label>
              <input
                type="text"
                value={newChar.eyeShape || ''}
                onChange={(e) => setNewChar((p) => ({ ...p, eyeShape: e.target.value }))}
                placeholder="Contoh: Almond gelap tajam"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Bentuk Hidung</label>
              <input
                type="text"
                value={newChar.noseShape || ''}
                onChange={(e) => setNewChar((p) => ({ ...p, noseShape: e.target.value }))}
                placeholder="Contoh: Mancung ramping"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Bentuk Bibir</label>
              <input
                type="text"
                value={newChar.lipShape || ''}
                onChange={(e) => setNewChar((p) => ({ ...p, lipShape: e.target.value }))}
                placeholder="Contoh: Tebal natural tegas"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Warna Kulit</label>
              <input
                type="text"
                value={newChar.skinTone || ''}
                onChange={(e) => setNewChar((p) => ({ ...p, skinTone: e.target.value }))}
                placeholder="Contoh: Sawo matang hangat"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-[#9CA3AF] mb-1.5">
                Gaya dan Panjang Rambut
              </label>
              <input
                type="text"
                value={newChar.hairDescription || ''}
                onChange={(e) =>
                  setNewChar((p) => ({ ...p, hairDescription: e.target.value }))
                }
                placeholder="Contoh: Hitam bergelombang sebahu belah samping"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Tinggi Badan</label>
              <input
                type="text"
                value={newChar.height || ''}
                onChange={(e) => setNewChar((p) => ({ ...p, height: e.target.value }))}
                placeholder="Contoh: 168 cm"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Bentuk Tubuh</label>
              <input
                type="text"
                value={newChar.bodyBuild || ''}
                onChange={(e) => setNewChar((p) => ({ ...p, bodyBuild: e.target.value }))}
                placeholder="Contoh: Ramping atletis"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Pakaian &amp; Kostum</label>
              <input
                type="text"
                value={newChar.costume}
                onChange={(e) => setNewChar((p) => ({ ...p, costume: e.target.value }))}
                placeholder="Contoh: Mantel trench abu-abu gelap, syal rajut marun"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[#9CA3AF] mb-1.5">Ciri Fisik Khusus</label>
              <input
                type="text"
                value={newChar.physicalTraits || ''}
                onChange={(e) => setNewChar((p) => ({ ...p, physicalTraits: e.target.value }))}
                placeholder="Contoh: Bekas luka tipis di pelipis kiri, kacamata bingkai tipis"
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-[#9CA3AF] mb-1.5">
                Kepribadian &amp; Motivasi
              </label>
              <input
                type="text"
                value={newChar.personality}
                onChange={(e) => setNewChar((p) => ({ ...p, personality: e.target.value }))}
                placeholder="Sifat dasar dan tujuan tokoh dalam cerita..."
                className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-[#9CA3AF] mb-1.5">
                Foto Referensi Utama
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  void handleUploadNewImage(e.target.files?.[0]);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-11 min-h-[44px] px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.12] hover:border-[#8B5CF6]/60 text-xs text-[#F4F5F7] inline-flex items-center justify-center gap-2"
              >
                <ImagePlus className="w-4 h-4 text-[#8B5CF6]" />
                {newChar.referenceImageDataUrl
                  ? 'Ganti Foto Referensi Utama'
                  : 'Unggah Foto Referensi Utama'}
              </button>
            </div>
          </div>

          {newChar.referenceImageDataUrl ? (
            <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08]">
              <img
                src={newChar.referenceImageDataUrl}
                alt="Pratinjau referensi karakter"
                className="w-16 h-16 rounded-lg object-cover border border-white/10"
              />
              <div className="text-xs text-[#9CA3AF] flex-1 min-w-[180px]">
                Foto referensi utama siap disimpan ke IndexedDB sebagai acuan identitas karakter.
              </div>
              <button
                type="button"
                onClick={() =>
                  setNewChar((p) => ({
                    ...p,
                    referenceImageDataUrl: '',
                    referenceImageMimeType: undefined,
                  }))
                }
                className="px-3 py-2 rounded-lg text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 min-h-[44px]"
              >
                Hapus Foto
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2.5 rounded-lg text-xs font-medium text-[#9CA3AF] bg-[#181B22] border border-white/[0.08] min-h-[44px]"
            >
              Batal
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              Simpan Karakter
            </button>
          </div>
        </form>
      ) : null}

      {project.characters.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#12141A] border border-white/[0.08]">
            <p className="text-xs text-[#9CA3AF]">
              Total{' '}
              <strong className="text-[#F4F5F7] tabular-nums">
                {project.characters.length}
              </strong>{' '}
              karakter terdaftar. Sinkronkan ke Character Consistency untuk mengunci identitas &amp; membuat Character Identity Anchor.
            </p>
            <button
              type="button"
              onClick={handleSyncToConsistency}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-95 min-h-[44px] whitespace-nowrap shrink-0"
            >
              Kunci ke Character Consistency
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-5">
            {project.characters.map((char) => {
              const anatomyOpen = expandedAnatomyIds[char.id] ?? true;
              const sheetOpen = expandedSheetIds[char.id] ?? false;
              const sheetCount = countReferenceSheetImages(char.referenceSheet);
              const linkedGuide = project.consistency.find(
                (g) =>
                  (g.characterId && g.characterId === char.id) ||
                  g.characterName.toLowerCase() === char.name.toLowerCase()
              );

              return (
                <article
                  key={char.id || char.name}
                  className="p-4 sm:p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-5"
                >
                  {/* Header: Foto Referensi Utama + Edit Inline Nama, Usia, Gender, Peran, Suara */}
                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    <div className="space-y-2 shrink-0 w-full sm:w-36">
                      <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl bg-[#0A0B0E] border border-white/[0.1] overflow-hidden flex items-center justify-center">
                        {char.referenceImageDataUrl ? (
                          <img
                            src={char.referenceImageDataUrl}
                            alt={`Foto referensi utama ${char.name}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-[#6B7280] p-3 text-center">
                            <ImagePlus className="w-5 h-5" />
                            <span className="text-[11px]">Foto Referensi Utama</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap sm:flex-col gap-2">
                        <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#181B22] border border-[#8B5CF6]/40 hover:border-[#8B5CF6] text-xs font-medium text-[#F4F5F7] cursor-pointer min-h-[44px] flex-1">
                          <ImagePlus className="w-3.5 h-3.5 text-[#8B5CF6]" />
                          {char.referenceImageDataUrl ? 'Ganti Foto' : 'Unggah Foto'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              void handleUploadCharacterImage(char.id, e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {char.referenceImageDataUrl ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteCharacterImage(char.id)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#EF4444]/60 text-xs font-medium text-[#EF4444] min-h-[44px] flex-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus Foto
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex-1 w-full min-w-0 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-mono px-2 py-1 rounded bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30">
                            ID: {char.id}
                          </span>
                          {linkedGuide?.locked !== false && linkedGuide ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-[#3B82F6]/15 text-[#60A5FA] border border-[#3B82F6]/30">
                              <Lock className="w-3 h-3" />
                              Konsistensi Terkunci
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteCharacter(char.id)}
                          aria-label={`Hapus ${char.name}`}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#EF4444]/10 border border-white/[0.08] min-h-[44px] min-w-[44px]"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="hidden sm:inline">Hapus Karakter</span>
                        </button>
                      </div>

                      {/* Edit Inline: Nama, Usia, Jenis Kelamin, Peran, Karakter Suara */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Nama Karakter</label>
                          <input
                            type="text"
                            value={char.name}
                            onChange={(e) =>
                              updateCharacterField(char.id, { name: e.target.value })
                            }
                            placeholder="Nama tokoh"
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm font-medium text-[#F4F5F7]"
                          />
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Usia</label>
                          <input
                            type="text"
                            value={char.age || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { age: e.target.value })
                            }
                            placeholder="Contoh: 25 tahun"
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                          />
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Jenis Kelamin</label>
                          <select
                            value={char.gender || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { gender: e.target.value })
                            }
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                          >
                            <option value="">Pilih jenis kelamin</option>
                            {GENDER_OPTIONS.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                            {char.gender && !GENDER_OPTIONS.includes(char.gender) ? (
                              <option value={char.gender}>{char.gender}</option>
                            ) : null}
                          </select>
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Peran dalam Film</label>
                          <input
                            type="text"
                            value={char.role || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { role: e.target.value })
                            }
                            placeholder="Protagonis / Antagonis"
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[#9CA3AF] block mb-1">Karakter Suara</label>
                          <input
                            type="text"
                            value={char.voiceTone || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { voiceTone: e.target.value })
                            }
                            placeholder="Nada bicara, intonasi, karakter suara..."
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bagian Detail Wajah, Anatomi, Rambut, Kostum */}
                  <div className="pt-3 border-t border-white/[0.08] space-y-3">
                    <button
                      type="button"
                      onClick={() => toggleAnatomy(char.id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-[#0A0B0E] border border-white/[0.08] hover:border-[#3B82F6]/40 text-xs font-medium text-[#F4F5F7] min-h-[44px]"
                    >
                      <span>Detail Wajah, Anatomi, Rambut, Tubuh &amp; Kostum</span>
                      {anatomyOpen ? (
                        <ChevronUp className="w-4 h-4 text-[#3B82F6]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
                      )}
                    </button>

                    {anatomyOpen ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                        <div className="sm:col-span-2 lg:col-span-3">
                          <label className="text-[#9CA3AF] block mb-1">Deskripsi Wajah</label>
                          <input
                            type="text"
                            value={char.facialDescription || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, {
                                facialDescription: e.target.value,
                              })
                            }
                            placeholder="Bentuk wajah, struktur rahang, ekspresi khas..."
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Bentuk Mata</label>
                          <input
                            type="text"
                            value={char.eyeShape || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { eyeShape: e.target.value })
                            }
                            placeholder="Almond, sipit, bulat, tatapan tajam..."
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Bentuk Hidung</label>
                          <input
                            type="text"
                            value={char.noseShape || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { noseShape: e.target.value })
                            }
                            placeholder="Mancung, ramping, lurus..."
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Bentuk Bibir</label>
                          <input
                            type="text"
                            value={char.lipShape || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { lipShape: e.target.value })
                            }
                            placeholder="Tebal natural, tipis tegas..."
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Warna Kulit</label>
                          <input
                            type="text"
                            value={char.skinTone || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { skinTone: e.target.value })
                            }
                            placeholder="Sawo matang, kuning langsat, gelap..."
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[#9CA3AF] block mb-1">
                            Gaya dan Panjang Rambut
                          </label>
                          <input
                            type="text"
                            value={char.hairDescription || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, {
                                hairDescription: e.target.value,
                              })
                            }
                            placeholder="Gaya, warna, dan panjang rambut"
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Tinggi Badan</label>
                          <input
                            type="text"
                            value={char.height || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { height: e.target.value })
                            }
                            placeholder="Contoh: 172 cm"
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Bentuk Tubuh</label>
                          <input
                            type="text"
                            value={char.bodyBuild || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { bodyBuild: e.target.value })
                            }
                            placeholder="Ramping, atletis, tegap..."
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Ciri Fisik Khusus</label>
                          <input
                            type="text"
                            value={char.physicalTraits || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, {
                                physicalTraits: e.target.value,
                              })
                            }
                            placeholder="Bekas luka, tahi lalat, tato, aksesori..."
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-2">
                          <label className="text-[#9CA3AF] block mb-1">
                            Pakaian dan Kostum
                          </label>
                          <input
                            type="text"
                            value={char.costume || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { costume: e.target.value })
                            }
                            placeholder="Detail pakaian utama, warna, dan aksesori kostum"
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                        <div>
                          <label className="text-[#9CA3AF] block mb-1">Kepribadian</label>
                          <input
                            type="text"
                            value={char.personality || ''}
                            onChange={(e) =>
                              updateCharacterField(char.id, { personality: e.target.value })
                            }
                            placeholder="Sifat dan karakter tokoh"
                            className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] text-xs text-[#F4F5F7]"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Bagian Character Reference Sheet (4 Tampilan) */}
                  <div className="pt-3 border-t border-white/[0.08] space-y-3">
                    <button
                      type="button"
                      onClick={() => toggleSheet(char.id)}
                      className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-[#0A0B0E] border border-[#8B5CF6]/35 hover:border-[#8B5CF6]/70 text-xs font-medium text-[#F4F5F7] min-h-[44px]"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#8B5CF6]" />
                        Lembar Referensi Karakter (4 Tampilan)
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#8B5CF6]/15 text-[#A78BFA]">
                          {sheetCount}/4 Tersimpan
                        </span>
                      </span>
                      {sheetOpen ? (
                        <ChevronUp className="w-4 h-4 text-[#8B5CF6]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />
                      )}
                    </button>

                    {sheetOpen ? (
                      <div className="p-4 rounded-xl bg-[#0A0B0E] border border-white/[0.08] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <p className="text-[#9CA3AF]">
                            Acuan identitas:{' '}
                            <strong className="text-[#F4F5F7]">
                              {char.referenceImageDataUrl
                                ? 'Foto Referensi Utama aktif terhubung'
                                : 'Profil teks karakter (unggah Foto Referensi Utama agar makin konsisten)'}
                            </strong>
                          </p>
                          <span
                            className={`text-[11px] px-2.5 py-1 rounded border ${
                              capabilities?.imageGenerationReady
                                ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E]'
                                : 'bg-[#3B82F6]/10 border-[#3B82F6]/30 text-[#93C5FD]'
                            }`}
                          >
                            {capabilities?.imageGenerationReady
                              ? 'AI Image Generator Aktif'
                              : 'AI Image Generator belum aktif (butuh Paid Key) · Gunakan unggah manual'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {CHARACTER_SHEET_VIEWS.map((view) => {
                            const slot = char.referenceSheet?.[view.key];
                            const viewPrompt =
                              slot?.promptText?.trim() ||
                              buildReferenceSheetPrompt(char, view.key, linkedGuide);
                            const opKey = `${char.id}_${view.key}`;
                            const isGenLoading = sheetLoadingKey === opKey;

                            return (
                              <div
                                key={view.key}
                                className="p-3.5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-3 flex flex-col justify-between"
                              >
                                <div className="space-y-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-xs font-semibold text-[#F4F5F7]">
                                      {view.label}
                                    </h4>
                                    {slot?.imageDataUrl ? (
                                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/25">
                                        {slot.source === 'gemini-ai'
                                          ? 'AI Gemini'
                                          : 'Unggahan User'}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-[#6B7280]">
                                        Kosong
                                      </span>
                                    )}
                                  </div>

                                  <div className="aspect-square rounded-lg bg-[#0A0B0E] border border-white/[0.08] overflow-hidden flex items-center justify-center">
                                    {slot?.imageDataUrl ? (
                                      <img
                                        src={slot.imageDataUrl}
                                        alt={`${char.name} - ${view.shortLabel}`}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="p-4 text-center space-y-1.5">
                                        <ImageIcon className="w-5 h-5 text-[#6B7280] mx-auto" />
                                        <p className="text-[11px] text-[#9CA3AF]">
                                          Belum ada gambar {view.shortLabel}
                                        </p>
                                        <p className="text-[10px] text-[#6B7280]">
                                          Unggah gambar manual atau gunakan prompt sudut ini.
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  <div className="p-2.5 rounded-lg bg-[#0A0B0E] border border-white/[0.06] flex items-start justify-between gap-2">
                                    <p className="font-mono text-[10px] text-[#9CA3AF] line-clamp-3 leading-relaxed">
                                      {viewPrompt}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => copyPrompt(opKey, viewPrompt)}
                                      aria-label={`Salin prompt ${view.shortLabel}`}
                                      className="p-2 rounded text-[#9CA3AF] hover:text-[#F4F5F7] shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                    >
                                      {copiedKey === opKey ? (
                                        <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.06]">
                                  <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#181B22] border border-[#8B5CF6]/40 hover:border-[#8B5CF6] text-xs font-medium text-[#F4F5F7] cursor-pointer min-h-[44px]">
                                    <ImagePlus className="w-3.5 h-3.5 text-[#8B5CF6]" />
                                    {slot?.imageDataUrl ? 'Ganti' : 'Unggah'}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        void handleUploadReferenceSheetImage(
                                          char.id,
                                          view.key,
                                          e.target.files?.[0]
                                        );
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>

                                  {capabilities?.imageGenerationReady ? (
                                    <button
                                      type="button"
                                      disabled={isGenLoading}
                                      onClick={() =>
                                        void handleGenerateReferenceSheetAi(char, view.key)
                                      }
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-medium min-h-[44px] disabled:opacity-50"
                                    >
                                      {isGenLoading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Sparkles className="w-3.5 h-3.5" />
                                      )}
                                      Generate AI
                                    </button>
                                  ) : null}

                                  {slot?.imageDataUrl ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          downloadImageDataUrl(
                                            slot.imageDataUrl!,
                                            `${char.name}-${view.key}`
                                          )
                                        }
                                        aria-label={`Unduh ${view.shortLabel}`}
                                        className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#3B82F6]/60 text-xs text-[#F4F5F7] min-h-[44px] min-w-[44px]"
                                      >
                                        <Download className="w-3.5 h-3.5 text-[#3B82F6]" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteReferenceSheetImage(char.id, view.key)
                                        }
                                        aria-label={`Hapus ${view.shortLabel}`}
                                        className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#EF4444]/60 text-xs text-[#EF4444] min-h-[44px] min-w-[44px]"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Aksi Footer Kartu Karakter (Touch Area >= 44px) */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-white/[0.08]">
                    {onOpenCharacterVisual ? (
                      <button
                        type="button"
                        onClick={() => onOpenCharacterVisual(char.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#181B22] border border-[#3B82F6]/40 hover:border-[#3B82F6] text-xs font-medium text-[#F4F5F7] min-h-[44px]"
                      >
                        <ImageIcon className="w-4 h-4 text-[#3B82F6]" />
                        Character Image Generator
                      </button>
                    ) : null}
                    {char.referenceImageDataUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          downloadImageDataUrl(
                            char.referenceImageDataUrl!,
                            `referensi-${char.name}`
                          )
                        }
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#8B5CF6]/50 text-xs font-medium text-[#F4F5F7] min-h-[44px]"
                      >
                        <Download className="w-4 h-4 text-[#8B5CF6]" />
                        Unduh Foto
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggleSheet(char.id)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#8B5CF6]/50 text-xs font-medium text-[#F4F5F7] min-h-[44px]"
                    >
                      <Layers className="w-4 h-4 text-[#8B5CF6]" />
                      {sheetOpen ? 'Tutup Lembar 4 Tampilan' : 'Lembar 4 Tampilan'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="p-10 rounded-xl bg-[#12141A] border border-white/[0.08] text-center space-y-3">
          <p className="text-sm text-[#9CA3AF]">
            Belum ada karakter di Character Studio. Tambahkan karakter secara manual (lengkap dengan 14 atribut &amp; foto referensi) atau klik Generate via Gemini.
          </p>
        </div>
      )}
    </div>
  );
}

export function CharacterConsistencyView({
  project,
  onUpdateProject,
  onNavigate,
}: CharacterViewsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<StudioErrorDetails | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleSyncFromStudio = () => {
    if (project.characters.length === 0) {
      setError({
        category: 'BAD_REQUEST',
        message: 'Belum ada karakter di Character Studio untuk disinkronkan.',
        retryable: false,
      });
      return;
    }
    setError(null);
    onUpdateProject((prev) => {
      const existingById = new Map(
        prev.consistency
          .filter((g) => g.characterId)
          .map((g) => [g.characterId!, g])
      );
      const existingByName = new Map(
        prev.consistency.map((g) => [g.characterName.toLowerCase(), g])
      );
      const synced = prev.characters.map((char, idx) =>
        syncGuideWithCharacter(
          char,
          existingById.get(char.id) || existingByName.get(char.name.toLowerCase()),
          idx
        )
      );
      return { ...prev, consistency: synced, updatedAt: new Date().toISOString() };
    });
  };

  const handleGenerateConsistency = async () => {
    if (!project.input.title.trim() || !project.input.premise.trim()) {
      setError({
        category: 'BAD_REQUEST',
        message: 'Judul film dan premis di Formulir Produksi harus diisi terlebih dahulu.',
        retryable: false,
      });
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const chars = project.characters.length
        ? project.characters
        : (await apiGenerateCharacters(project.input, project.story?.synopsis)).characters;

      const { consistency } = await apiGenerateConsistency(project.input, chars);
      const charByName = new Map(chars.map((c) => [c.name.toLowerCase(), c]));
      const existingByName = new Map(
        project.consistency.map((g) => [g.characterName.toLowerCase(), g])
      );

      const enriched: ConsistencyGuide[] = consistency.map((g, idx) => {
        const matchedChar = charByName.get(g.characterName.toLowerCase());
        const prevGuide = existingByName.get(g.characterName.toLowerCase());
        const locks = resolveConsistencyLocks(prevGuide);
        const anchor = matchedChar
          ? buildCharacterIdentityAnchor(matchedChar, locks, g.identitySeed)
          : g.promptAnchor;
        return {
          ...g,
          characterId: matchedChar?.id || prevGuide?.characterId,
          skinTone: matchedChar?.skinTone || g.skinTone,
          heightAndBody:
            [matchedChar?.height, matchedChar?.bodyBuild].filter(Boolean).join(' · ') ||
            g.heightAndBody,
          specialTraits: matchedChar?.physicalTraits || g.specialTraits,
          locked: prevGuide?.locked ?? true,
          locks,
          forbiddenChanges: buildForbiddenChangesText(locks, prevGuide?.locked ?? true),
          promptAnchor: g.promptAnchor || anchor,
          referenceImageDataUrl:
            g.referenceImageDataUrl || matchedChar?.referenceImageDataUrl,
        };
      });

      onUpdateProject((prev) => ({
        ...prev,
        characters: chars,
        consistency: enriched,
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setLoading(false);
    }
  };

  const matchGuide = (g: ConsistencyGuide, guideKey: string) =>
    (g.characterId && g.characterId === guideKey) || g.characterName === guideKey;

  const updateGuide = (guideKey: string, patch: Partial<ConsistencyGuide>) => {
    onUpdateProject((prev) => ({
      ...prev,
      consistency: prev.consistency.map((g) =>
        matchGuide(g, guideKey) ? { ...g, ...patch } : g
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const toggleMasterLock = (guide: ConsistencyGuide) => {
    const nextLocked = !(guide.locked !== false);
    const locks = resolveConsistencyLocks(guide);
    const key = guide.characterId || guide.characterName;
    updateGuide(key, {
      locked: nextLocked,
      forbiddenChanges: buildForbiddenChangesText(locks, nextLocked),
    });
  };

  const toggleGranularLock = (
    guide: ConsistencyGuide,
    lockField: keyof ConsistencyLocks
  ) => {
    const currentLocks = resolveConsistencyLocks(guide);
    const nextLocks: ConsistencyLocks = {
      ...currentLocks,
      [lockField]: !currentLocks[lockField],
    };
    const isMasterLocked = guide.locked !== false;
    const matchedChar = project.characters.find(
      (c) =>
        (guide.characterId && c.id === guide.characterId) ||
        c.name.toLowerCase() === guide.characterName.toLowerCase()
    );
    const nextAnchor = matchedChar
      ? buildCharacterIdentityAnchor(matchedChar, nextLocks, guide.identitySeed)
      : guide.promptAnchor;
    const key = guide.characterId || guide.characterName;

    updateGuide(key, {
      locks: nextLocks,
      forbiddenChanges: buildForbiddenChangesText(nextLocks, isMasterLocked),
      promptAnchor: nextAnchor,
    });
  };

  const rebuildAnchorFromProfile = (guide: ConsistencyGuide) => {
    const matchedChar = project.characters.find(
      (c) =>
        (guide.characterId && c.id === guide.characterId) ||
        c.name.toLowerCase() === guide.characterName.toLowerCase()
    );
    if (!matchedChar) return;
    const locks = resolveConsistencyLocks(guide);
    const idx = project.consistency.findIndex((g) =>
      matchGuide(g, guide.characterId || guide.characterName)
    );
    const refreshed = syncGuideWithCharacter(matchedChar, { ...guide, locks }, Math.max(0, idx));
    updateGuide(guide.characterId || guide.characterName, refreshed);
  };

  const handleUploadReference = async (guide: ConsistencyGuide, file: File | undefined) => {
    if (!file) return;
    try {
      const { dataUrl, mimeType } = await optimizeImageFile(file, 'character');
      const key = guide.characterId || guide.characterName;
      onUpdateProject((prev) => ({
        ...prev,
        consistency: prev.consistency.map((g) =>
          matchGuide(g, key) ? { ...g, referenceImageDataUrl: dataUrl } : g
        ),
        characters: prev.characters.map((c) =>
          (guide.characterId && c.id === guide.characterId) ||
          c.name.toLowerCase() === guide.characterName.toLowerCase()
            ? {
                ...c,
                referenceImageDataUrl: dataUrl,
                referenceImageMimeType: mimeType,
                referenceImageSource: 'user-upload',
              }
            : c
        ),
        updatedAt: new Date().toISOString(),
      }));
      setError(null);
    } catch (err) {
      setError({
        category: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'Gagal mengunggah foto referensi.',
        retryable: false,
      });
    }
  };

  const handleDeleteReference = (guide: ConsistencyGuide) => {
    const key = guide.characterId || guide.characterName;
    onUpdateProject((prev) => ({
      ...prev,
      consistency: prev.consistency.map((g) =>
        matchGuide(g, key) ? { ...g, referenceImageDataUrl: undefined } : g
      ),
      characters: prev.characters.map((c) =>
        (guide.characterId && c.id === guide.characterId) ||
        c.name.toLowerCase() === guide.characterName.toLowerCase()
          ? {
              ...c,
              referenceImageDataUrl: undefined,
              referenceImageMimeType: undefined,
              referenceImageSource: undefined,
            }
          : c
      ),
      visualAssets: (prev.visualAssets || []).filter(
        (a) =>
          !(
            a.kind === 'character' &&
            ((guide.characterId && a.characterId === guide.characterId) ||
              (!a.characterId &&
                a.characterName?.toLowerCase() === guide.characterName.toLowerCase())) &&
            !a.id.startsWith('asset_sheet_')
          )
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">
            04. Character Consistency Lock
          </h1>
          <p className="text-sm text-[#9CA3AF] leading-relaxed">
            Kunci identitas wajah, rambut, warna kulit, tinggi &amp; bentuk tubuh, serta kostum karakter secara terpisah. Character Identity Anchor otomatis disertakan pada penyusunan adegan, storyboard, gambar, dan video.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('characters')}
            className="px-3.5 py-2.5 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] hover:border-[#8B5CF6]/50 text-[#F4F5F7] min-h-[44px] whitespace-nowrap shrink-0"
          >
            Character Studio
          </button>
          <button
            type="button"
            onClick={handleSyncFromStudio}
            className="px-3.5 py-2.5 rounded-lg text-xs font-medium bg-[#181B22] border border-[#3B82F6]/40 hover:border-[#3B82F6] text-[#93C5FD] min-h-[44px] whitespace-nowrap shrink-0"
          >
            Sinkronkan Profil
          </button>
          <button
            type="button"
            onClick={handleGenerateConsistency}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#8B5CF6] to-[#3B82F6] hover:opacity-95 text-white text-xs font-semibold min-h-[44px] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            {loading ? 'Menyusun...' : 'Generate Konsistensi'}
          </button>
        </div>
      </div>

      {error ? (
        <StudioErrorBanner
          error={error}
          onRetry={() => void handleGenerateConsistency()}
          isRetrying={loading}
        />
      ) : null}

      {project.consistency.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#12141A] border border-[#8B5CF6]/30">
            <p className="text-xs text-[#9CA3AF]">
              <strong className="text-[#A78BFA]">
                {project.consistency.filter((g) => g.locked !== false).length}
              </strong>{' '}
              dari {project.consistency.length} karakter aktif terkunci. Character Identity Anchor otomatis masuk ke prompt adegan dan gambar.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigate('scenes')}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#3B82F6]/60 min-h-[44px]"
              >
                Lanjut ke Scene Generator
              </button>
              <button
                type="button"
                onClick={() => onNavigate('image')}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#8B5CF6]/15 border border-[#8B5CF6]/45 text-[#C4B5FD] min-h-[44px]"
              >
                Buka Image Generator
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {project.consistency.map((guide) => {
              const isLocked = guide.locked !== false;
              const locks = resolveConsistencyLocks(guide);
              const guideKey = guide.characterId || guide.characterName;

              const lockButtons: Array<{
                field: keyof ConsistencyLocks;
                label: string;
                desc: string;
              }> = [
                {
                  field: 'face',
                  label: 'Kunci Wajah & Kulit',
                  desc: 'Wajah, mata, hidung, bibir & warna kulit tetap',
                },
                {
                  field: 'hair',
                  label: 'Kunci Rambut',
                  desc: 'Gaya & panjang rambut tidak berubah',
                },
                {
                  field: 'body',
                  label: 'Kunci Tubuh & Fisik',
                  desc: 'Tinggi, bentuk tubuh & ciri fisik tetap',
                },
                {
                  field: 'costume',
                  label: 'Kunci Kostum',
                  desc: 'Pakaian mengikuti referensi kostum',
                },
              ];

              return (
                <div
                  key={guideKey}
                  className={`p-5 sm:p-6 rounded-xl bg-[#12141A] border space-y-5 ${
                    isLocked ? 'border-[#8B5CF6]/35' : 'border-white/[0.08]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="space-y-2 shrink-0">
                        <div className="w-20 h-20 rounded-xl bg-[#0A0B0E] border border-white/[0.1] overflow-hidden flex items-center justify-center">
                          {guide.referenceImageDataUrl ? (
                            <img
                              src={guide.referenceImageDataUrl}
                              alt={`Referensi konsistensi ${guide.characterName}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-[#6B7280] p-2 text-center">
                              <ImagePlus className="w-4 h-4" />
                              <span className="text-[10px]">Foto Ref</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <label className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#8B5CF6]/50 text-[11px] text-[#F4F5F7] cursor-pointer min-h-[44px]">
                            {guide.referenceImageDataUrl ? 'Ganti' : 'Unggah'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                void handleUploadReference(guide, e.target.files?.[0]);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {guide.referenceImageDataUrl ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteReference(guide)}
                              aria-label={`Hapus foto referensi ${guide.characterName}`}
                              className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#EF4444]/50 text-[11px] text-[#EF4444] min-h-[44px] min-w-[44px]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div>
                        <h2 className="font-display text-lg font-semibold text-[#F4F5F7]">
                          {guide.characterName}
                        </h2>
                        <p className="font-mono text-xs text-[#60A5FA] mt-0.5">
                          ID Seed: {guide.identitySeed}
                        </p>
                        <p className="text-xs text-[#9CA3AF] mt-1">
                          {isLocked
                            ? 'Mode Lock Aktif — Identitas terjaga di semua adegan & prompt.'
                            : 'Mode Lock Nonaktif — Konsistensi karakter sedang dilepas.'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleMasterLock(guide)}
                      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold border min-h-[44px] shrink-0 ${
                        isLocked
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/55 text-[#C4B5FD]'
                          : 'bg-[#181B22] border-white/[0.1] text-[#9CA3AF]'
                      }`}
                    >
                      {isLocked ? (
                        <Lock className="w-4 h-4 text-[#A78BFA]" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                      {isLocked ? 'Consistency Lock: AKTIF' : 'Consistency Lock: NONAKTIF'}
                    </button>
                  </div>

                  {/* Pilihan Kunci Terpisah: Wajah, Rambut, Tubuh, Kostum */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[#9CA3AF]">
                      Penguncian Atribut Terpisah
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {lockButtons.map((item) => {
                        const active = locks[item.field];
                        return (
                          <button
                            key={item.field}
                            type="button"
                            onClick={() => toggleGranularLock(guide, item.field)}
                            className={`p-3 rounded-lg border text-left transition-colors min-h-[44px] flex flex-col justify-between gap-1 ${
                              active && isLocked
                                ? 'bg-[#3B82F6]/15 border-[#3B82F6]/50 text-[#F4F5F7]'
                                : active
                                ? 'bg-[#181B22] border-white/[0.15] text-[#F4F5F7]'
                                : 'bg-[#0A0B0E] border-white/[0.06] text-[#6B7280]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="text-xs font-semibold">{item.label}</span>
                              {active ? (
                                <Lock className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                              )}
                            </div>
                            <span className="text-[11px] leading-snug opacity-80">
                              {item.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#9CA3AF] p-4 rounded-xl bg-[#0A0B0E] border border-white/[0.06]">
                    <p>
                      <span className="text-[#6B7280]">Wajah &amp; Kulit:</span>{' '}
                      {guide.facialFeatures}
                    </p>
                    <p>
                      <span className="text-[#6B7280]">Rambut, Tinggi &amp; Tubuh:</span>{' '}
                      {guide.hairAndBuild}
                    </p>
                    <p>
                      <span className="text-[#6B7280]">Kostum Referensi:</span>{' '}
                      {guide.signatureOutfit}
                    </p>
                    <p>
                      <span className="text-[#6B7280]">Aturan Larangan:</span>{' '}
                      <span className="text-[#F4F5F7]/90">{guide.forbiddenChanges}</span>
                    </p>
                  </div>

                  {/* Character Identity Anchor */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-medium text-[#A78BFA]">
                        Character Identity Anchor (otomatis disuntikkan ke prompt adegan &amp; gambar)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => rebuildAnchorFromProfile(guide)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#3B82F6]/50 text-xs text-[#93C5FD] min-h-[44px]"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Perbarui Anchor dari Profil
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(`cons_${guideKey}`, guide.promptAnchor)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181B22] border border-white/[0.1] text-xs text-[#9CA3AF] hover:text-[#F4F5F7] min-h-[44px]"
                        >
                          {copiedKey === `cons_${guideKey}` ? (
                            <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          Salin
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={guide.promptAnchor}
                      onChange={(e) =>
                        updateGuide(guideKey, { promptAnchor: e.target.value })
                      }
                      className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-[#8B5CF6]/25 font-mono text-xs text-[#F4F5F7] leading-relaxed"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="p-10 rounded-xl bg-[#12141A] border border-white/[0.08] text-center space-y-3">
          <p className="text-sm text-[#9CA3AF]">
            Belum ada referensi konsistensi visual. Buat karakter di Character Studio lalu tekan &quot;Kunci ke Character Consistency&quot;, atau tekan Generate Konsistensi.
          </p>
        </div>
      )}
    </div>
  );
}
