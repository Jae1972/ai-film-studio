import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Film,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type {
  FilmProject,
  NavSection,
  ProductionVisualAsset,
  StudioCapabilities,
  StudioErrorDetails,
} from '../types/studio';
import {
  apiGenerateCharacterImage,
  apiGenerateCharacterVisualPrompt,
  apiGenerateSceneImage,
  apiGenerateVisualPrompt,
  toStudioErrorDetails,
} from '../services/studioApi';
import { downloadImageDataUrl, optimizeImageFile } from '../utils/imageAssets';
import {
  buildCharacterIdentityAnchor,
  formatActiveConsistencyForPrompt,
  resolveConsistencyLocks,
} from '../utils/characterConsistency';
import { StudioErrorBanner } from './StudioErrorBanner';
import { ModelCapabilityPanel } from './ModelCapabilityPanel';

export interface VisualJumpContext {
  sceneNumber?: number;
  subject?: string;
  characterId?: string;
  visualTab?: 'character' | 'scene' | 'models';
}

interface VisualProductionViewProps {
  project: FilmProject;
  capabilities: StudioCapabilities | null;
  jumpContext?: VisualJumpContext | null;
  onClearJumpContext?: () => void;
  onUpdateProject: (updater: (prev: FilmProject) => FilmProject) => void;
  onNavigate: (section: NavSection) => void;
}

export function VisualProductionView({
  project,
  jumpContext,
  onClearJumpContext,
  onUpdateProject,
  onNavigate,
}: VisualProductionViewProps) {
  const [activeTab, setActiveTab] = useState<'character' | 'scene' | 'models'>('scene');
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [error, setError] = useState<StudioErrorDetails | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const lastRetryRef = useRef<(() => void) | null>(null);

  // Character Image Generator state
  const [selectedCharId, setSelectedCharId] = useState<string>(
    project.characters[0]?.id || ''
  );
  const [charAspect, setCharAspect] = useState('1:1');
  const [charResolution, setCharResolution] = useState('1K');
  const [charPromptOverride, setCharPromptOverride] = useState('');
  const charFileInputRef = useRef<HTMLInputElement | null>(null);

  // Scene Image Generator state
  const [selectedSceneNum, setSelectedSceneNum] = useState<number>(
    project.scenes[0]?.sceneNumber || 0
  );
  const [sceneSubject, setSceneSubject] = useState('');
  const [sceneAspect, setSceneAspect] = useState('16:9');
  const [sceneResolution, setSceneResolution] = useState('1K');
  const [selectedRefCharIds, setSelectedRefCharIds] = useState<string[]>([]);
  const sceneFileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCharacter = useMemo(
    () =>
      project.characters.find((c) => c.id === selectedCharId) ||
      project.characters[0] ||
      null,
    [project.characters, selectedCharId]
  );

  const selectedConsistency = useMemo(() => {
    if (!selectedCharacter) return undefined;
    return project.consistency.find(
      (g) =>
        (g.characterId && g.characterId === selectedCharacter.id) ||
        g.characterName.toLowerCase() === selectedCharacter.name.toLowerCase()
    );
  }, [project.consistency, selectedCharacter]);

  const selectedScene = useMemo(
    () => project.scenes.find((s) => s.sceneNumber === selectedSceneNum) || null,
    [project.scenes, selectedSceneNum]
  );

  useEffect(() => {
    const exists = project.characters.some((c) => c.id === selectedCharId);
    if ((!selectedCharId || !exists) && project.characters[0]?.id) {
      setSelectedCharId(project.characters[0].id);
    }
  }, [project.characters, selectedCharId]);

  useEffect(() => {
    if (!jumpContext) return;
    if (jumpContext.visualTab) {
      setActiveTab(jumpContext.visualTab);
    }
    if (jumpContext.characterId) {
      const targetChar = project.characters.find((c) => c.id === jumpContext.characterId);
      setSelectedCharId(jumpContext.characterId);
      setActiveTab('character');
      if (targetChar) {
        const targetGuide = project.consistency.find(
          (g) =>
            g.characterId === targetChar.id ||
            g.characterName.toLowerCase() === targetChar.name.toLowerCase()
        );
        setCharPromptOverride(
          targetChar.visualPromptAnchor ||
            targetGuide?.promptAnchor ||
            buildCharacterIdentityAnchor(targetChar, resolveConsistencyLocks(targetGuide))
        );
      }
    }
    if (jumpContext.sceneNumber) {
      setSelectedSceneNum(jumpContext.sceneNumber);
      setActiveTab('scene');
      const matched = project.scenes.find((s) => s.sceneNumber === jumpContext.sceneNumber);
      if (matched) {
        const involvedIds = project.characters
          .filter((c) =>
            matched.charactersInvolved.some(
              (name) => name.toLowerCase() === c.name.toLowerCase()
            )
          )
          .map((c) => c.id);
        setSelectedRefCharIds(involvedIds);
      }
    }
    if (jumpContext.subject) {
      setSceneSubject(jumpContext.subject);
    }
    onClearJumpContext?.();
  }, [jumpContext, onClearJumpContext, project.characters, project.consistency, project.scenes]);

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const upsertVisualAsset = (
    prev: FilmProject,
    asset: ProductionVisualAsset
  ): ProductionVisualAsset[] => {
    const existing = prev.visualAssets || [];
    const filtered = existing.filter((item) => {
      if (asset.kind === 'character' && asset.characterId) {
        return !(item.kind === 'character' && item.characterId === asset.characterId);
      }
      if (asset.kind === 'scene' && asset.sceneNumber) {
        return !(item.kind === 'scene' && item.sceneNumber === asset.sceneNumber);
      }
      return item.id !== asset.id;
    });
    return [asset, ...filtered];
  };

  const handleSelectScene = (sceneNumber: number) => {
    setSelectedSceneNum(sceneNumber);
    if (!sceneNumber) return;
    const sc = project.scenes.find((s) => s.sceneNumber === sceneNumber);
    if (!sc) return;

    const involvedIds = project.characters
      .filter((c) =>
        sc.charactersInvolved.some((name) => name.toLowerCase() === c.name.toLowerCase())
      )
      .map((c) => c.id);
    setSelectedRefCharIds(involvedIds);

    setSceneSubject(
      [
        `Adegan ${sc.sceneNumber}: ${sc.heading}`,
        `Lokasi: ${sc.location} (${sc.timeOfDay})`,
        `Suasana: ${sc.mood}, Pencahayaan: ${sc.lighting}, Kamera: ${sc.cameraMovement}`,
        sc.actionSummary,
      ]
        .filter(Boolean)
        .join('. ')
    );
  };

  const toggleRefChar = (id: string) => {
    setSelectedRefCharIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGenerateCharPrompt = async () => {
    if (!selectedCharacter) {
      setError({
        category: 'BAD_REQUEST',
        message: 'Pilih atau tambahkan karakter terlebih dahulu di Character Studio.',
        retryable: false,
      });
      return;
    }
    lastRetryRef.current = () => {
      void handleGenerateCharPrompt();
    };
    setError(null);
    setLoadingPrompt(true);
    try {
      const { spec } = await apiGenerateCharacterVisualPrompt({
        input: project.input,
        character: selectedCharacter,
        characterId: selectedCharacter.id,
        consistency: selectedConsistency?.locked !== false ? selectedConsistency : undefined,
        aspectRatio: charAspect,
      });
      setCharPromptOverride(spec.promptText);
      onUpdateProject((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === selectedCharacter.id
            ? { ...c, visualPromptAnchor: spec.promptText }
            : c
        ),
        visualPrompts: [{ ...spec, characterId: selectedCharacter.id }, ...prev.visualPrompts],
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setLoadingPrompt(false);
    }
  };

  const handleGenerateCharImage = async () => {
    if (!selectedCharacter) {
      setError({
        category: 'BAD_REQUEST',
        message: 'Pilih karakter terlebih dahulu sebelum membuat gambar karakter.',
        retryable: false,
      });
      return;
    }
    lastRetryRef.current = () => {
      void handleGenerateCharImage();
    };
    setError(null);
    setLoadingImage(true);
    try {
      const targetCharacterId = selectedCharacter.id;
      const res = await apiGenerateCharacterImage({
        input: project.input,
        character: selectedCharacter,
        characterId: targetCharacterId,
        consistency: selectedConsistency?.locked !== false ? selectedConsistency : undefined,
        promptOverride: charPromptOverride.trim() || undefined,
        aspectRatio: charAspect,
        resolution: charResolution,
      });

      const resolvedCharId = res.characterId || targetCharacterId;
      const asset: ProductionVisualAsset = {
        id: `asset_char_${resolvedCharId}_${Date.now()}`,
        kind: 'character',
        title: selectedCharacter.name,
        subtitle: `${selectedCharacter.role} · Usia ${selectedCharacter.age || '-'}`,
        characterId: resolvedCharId,
        characterName: selectedCharacter.name,
        promptUsed: res.promptUsed,
        aspectRatio: charAspect,
        imageDataUrl: res.imageDataUrl,
        mimeType: res.mimeType,
        source: 'gemini-ai',
        modelUsed: res.modelUsed,
        createdAt: new Date().toISOString(),
      };

      onUpdateProject((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === resolvedCharId
            ? {
                ...c,
                referenceImageDataUrl: res.imageDataUrl,
                referenceImageMimeType: res.mimeType,
                referenceImageSource: 'gemini-ai',
                visualPromptAnchor: res.promptUsed,
              }
            : c
        ),
        consistency: prev.consistency.map((g) =>
          (g.characterId && g.characterId === resolvedCharId) ||
          g.characterName.toLowerCase() === selectedCharacter.name.toLowerCase()
            ? { ...g, characterId: g.characterId || resolvedCharId, referenceImageDataUrl: res.imageDataUrl }
            : g
        ),
        visualAssets: upsertVisualAsset(prev, asset),
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setLoadingImage(false);
    }
  };

  const handleUploadCharImage = async (file: File | undefined) => {
    if (!file || !selectedCharacter) return;
    try {
      setError(null);
      const targetCharId = selectedCharacter.id;
      const { dataUrl, mimeType } = await optimizeImageFile(file, 'character');
      const asset: ProductionVisualAsset = {
        id: `asset_char_${targetCharId}_${Date.now()}`,
        kind: 'character',
        title: selectedCharacter.name,
        subtitle: `${selectedCharacter.role} · Usia ${selectedCharacter.age || '-'}`,
        characterId: targetCharId,
        characterName: selectedCharacter.name,
        promptUsed:
          charPromptOverride.trim() ||
          [
            selectedCharacter.facialDescription,
            selectedCharacter.eyeShape,
            selectedCharacter.noseShape,
            selectedCharacter.lipShape,
            selectedCharacter.skinTone,
            selectedCharacter.hairDescription,
            selectedCharacter.height,
            selectedCharacter.bodyBuild,
            selectedCharacter.physicalTraits,
            selectedCharacter.costume,
          ]
            .filter(Boolean)
            .join(', ') ||
          'Referensi gambar karakter',
        aspectRatio: charAspect,
        imageDataUrl: dataUrl,
        mimeType,
        source: 'user-upload',
        createdAt: new Date().toISOString(),
      };

      onUpdateProject((prev) => ({
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === targetCharId
            ? {
                ...c,
                referenceImageDataUrl: dataUrl,
                referenceImageMimeType: mimeType,
                referenceImageSource: 'user-upload',
              }
            : c
        ),
        consistency: prev.consistency.map((g) =>
          (g.characterId && g.characterId === targetCharId) ||
          g.characterName.toLowerCase() === selectedCharacter.name.toLowerCase()
            ? { ...g, characterId: g.characterId || targetCharId, referenceImageDataUrl: dataUrl }
            : g
        ),
        visualAssets: upsertVisualAsset(prev, asset),
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError({
        category: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'Gagal memuat gambar karakter.',
        retryable: false,
      });
    }
  };

  const handleDeleteCharImage = () => {
    if (!selectedCharacter) return;
    const targetCharId = selectedCharacter.id;
    onUpdateProject((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === targetCharId
          ? {
              ...c,
              referenceImageDataUrl: undefined,
              referenceImageMimeType: undefined,
              referenceImageSource: undefined,
            }
          : c
      ),
      consistency: prev.consistency.map((g) =>
        (g.characterId && g.characterId === targetCharId) ||
        g.characterName.toLowerCase() === selectedCharacter.name.toLowerCase()
          ? { ...g, referenceImageDataUrl: undefined }
          : g
      ),
      visualAssets: (prev.visualAssets || []).filter(
        (a) => !(a.kind === 'character' && a.characterId === targetCharId)
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleGenerateScenePrompt = async () => {
    if (!sceneSubject.trim()) {
      setError({
        category: 'BAD_REQUEST',
        message: 'Pilih adegan atau isi deskripsi visual adegan terlebih dahulu.',
        retryable: false,
      });
      return;
    }
    lastRetryRef.current = () => {
      void handleGenerateScenePrompt();
    };
    setError(null);
    setLoadingPrompt(true);
    try {
      const refCharacters = project.characters.filter((c) => selectedRefCharIds.includes(c.id));
      const activeConsistency = formatActiveConsistencyForPrompt(
        project.consistency.filter((g) => {
          if (g.locked === false) return false;
          if (refCharacters.length === 0) return true;
          return refCharacters.some(
            (c) =>
              (g.characterId && g.characterId === c.id) ||
              c.name.toLowerCase() === g.characterName.toLowerCase()
          );
        }),
        project.characters
      );

      const { spec } = await apiGenerateVisualPrompt({
        type: 'image',
        input: project.input,
        subject: sceneSubject,
        aspectRatio: sceneAspect,
        durationOrResolution: sceneResolution,
        consistency: activeConsistency,
        sceneNumber: selectedSceneNum || undefined,
        inputMode: 'prompt',
      });

      onUpdateProject((prev) => ({
        ...prev,
        visualPrompts: [spec, ...prev.visualPrompts],
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setLoadingPrompt(false);
    }
  };

  const handleGenerateSceneImage = async () => {
    if (!sceneSubject.trim() && !selectedScene) {
      setError({
        category: 'BAD_REQUEST',
        message: 'Pilih adegan atau tulis deskripsi visual adegan sebelum memanggil generator gambar.',
        retryable: false,
      });
      return;
    }
    lastRetryRef.current = () => {
      void handleGenerateSceneImage();
    };
    setError(null);
    setLoadingImage(true);
    try {
      const refCharacters = project.characters.filter(
        (c) => selectedRefCharIds.includes(c.id) && c.referenceImageDataUrl
      );
      const activeConsistency = formatActiveConsistencyForPrompt(
        project.consistency,
        project.characters
      );

      const res = await apiGenerateSceneImage({
        input: project.input,
        scene: selectedScene || undefined,
        prompt: sceneSubject,
        aspectRatio: sceneAspect,
        resolution: sceneResolution,
        consistency: activeConsistency,
        referenceImages: refCharacters.map((c) => ({
          name: c.name,
          dataUrl: c.referenceImageDataUrl || '',
        })),
      });

      const sceneLabel = selectedScene
        ? `Adegan ${selectedScene.sceneNumber}: ${selectedScene.heading}`
        : `Visual Adegan Kustom`;

      const asset: ProductionVisualAsset = {
        id: `asset_scene_${selectedScene?.sceneNumber || 'custom'}_${Date.now()}`,
        kind: 'scene',
        title: sceneLabel,
        subtitle: selectedScene
          ? `${selectedScene.location} (${selectedScene.timeOfDay}) · ${selectedScene.lighting}`
          : `${project.input.visualStyle} · ${sceneAspect}`,
        sceneNumber: selectedScene?.sceneNumber,
        promptUsed: res.promptUsed,
        aspectRatio: sceneAspect,
        imageDataUrl: res.imageDataUrl,
        mimeType: res.mimeType,
        source: 'gemini-ai',
        modelUsed: res.modelUsed,
        createdAt: new Date().toISOString(),
      };

      onUpdateProject((prev) => ({
        ...prev,
        scenes: selectedScene
          ? prev.scenes.map((s) =>
              s.sceneNumber === selectedScene.sceneNumber
                ? {
                    ...s,
                    imageDataUrl: res.imageDataUrl,
                    imageMimeType: res.mimeType,
                    imagePromptUsed: res.promptUsed,
                    imageSource: 'gemini-ai',
                    imageUpdatedAt: new Date().toISOString(),
                  }
                : s
            )
          : prev.scenes,
        storyboard: selectedScene
          ? prev.storyboard.map((f) =>
              f.sceneNumber === selectedScene.sceneNumber
                ? {
                    ...f,
                    imageDataUrl: res.imageDataUrl,
                    imageMimeType: res.mimeType,
                    imageSource: 'gemini-ai',
                    imageUpdatedAt: new Date().toISOString(),
                  }
                : f
            )
          : prev.storyboard,
        visualAssets: upsertVisualAsset(prev, asset),
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setLoadingImage(false);
    }
  };

  const handleUploadSceneImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setError(null);
      const { dataUrl, mimeType } = await optimizeImageFile(file, 'scene');
      const sceneLabel = selectedScene
        ? `Adegan ${selectedScene.sceneNumber}: ${selectedScene.heading}`
        : file.name.replace(/\.[^.]+$/, '') || 'Visual Adegan';

      const asset: ProductionVisualAsset = {
        id: `asset_scene_${selectedScene?.sceneNumber || 'upload'}_${Date.now()}`,
        kind: 'scene',
        title: sceneLabel,
        subtitle: selectedScene
          ? `${selectedScene.location} (${selectedScene.timeOfDay})`
          : `Unggahan Adegan · ${sceneAspect}`,
        sceneNumber: selectedScene?.sceneNumber,
        promptUsed: sceneSubject.trim() || selectedScene?.actionSummary || 'Visual adegan unggahan',
        aspectRatio: sceneAspect,
        imageDataUrl: dataUrl,
        mimeType,
        source: 'user-upload',
        createdAt: new Date().toISOString(),
      };

      onUpdateProject((prev) => ({
        ...prev,
        scenes: selectedScene
          ? prev.scenes.map((s) =>
              s.sceneNumber === selectedScene.sceneNumber
                ? {
                    ...s,
                    imageDataUrl: dataUrl,
                    imageMimeType: mimeType,
                    imagePromptUsed: sceneSubject.trim() || s.actionSummary,
                    imageSource: 'user-upload',
                    imageUpdatedAt: new Date().toISOString(),
                  }
                : s
            )
          : prev.scenes,
        storyboard: selectedScene
          ? prev.storyboard.map((f) =>
              f.sceneNumber === selectedScene.sceneNumber
                ? {
                    ...f,
                    imageDataUrl: dataUrl,
                    imageMimeType: mimeType,
                    imageSource: 'user-upload',
                    imageUpdatedAt: new Date().toISOString(),
                  }
                : f
            )
          : prev.storyboard,
        visualAssets: upsertVisualAsset(prev, asset),
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError({
        category: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'Gagal memuat gambar adegan.',
        retryable: false,
      });
    }
  };

  const imagePrompts = project.visualPrompts.filter((v) => v.type === 'image');

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">
            06. AI Visual Production
          </h1>
          <p className="text-sm text-[#9CA3AF] leading-relaxed">
            Bangun referensi visual karakter konsisten, visualisasi setiap adegan berdasarkan lokasi, pencahayaan, dan gaya sinematik, serta periksa kapabilitas model Gemini API secara transparan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('storyboard')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#E5A93C]/50 text-xs font-medium text-[#F4F5F7] min-h-[44px] whitespace-nowrap shrink-0"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[#E5A93C]" />
            Storyboard Visual
          </button>
          <button
            type="button"
            onClick={() => onNavigate('gallery')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#E5A93C]/50 text-xs font-medium text-[#F4F5F7] min-h-[44px] whitespace-nowrap shrink-0"
          >
            <ImageIcon className="w-3.5 h-3.5 text-[#E5A93C]" />
            Galeri Produksi
          </button>
        </div>
      </div>

      <ModelCapabilityPanel compact={activeTab !== 'models'} />

      <div className="inline-flex flex-wrap p-1 rounded-lg bg-[#12141A] border border-white/[0.08] gap-1">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setActiveTab('character');
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium min-h-[44px] whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'character'
              ? 'bg-[#E5A93C] text-[#0A0B0E] font-semibold'
              : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          Character Image Generator
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setActiveTab('scene');
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium min-h-[44px] whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'scene'
              ? 'bg-[#E5A93C] text-[#0A0B0E] font-semibold'
              : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          Scene Image Generator
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setActiveTab('models');
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium min-h-[44px] whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'models'
              ? 'bg-[#E5A93C] text-[#0A0B0E] font-semibold'
              : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Kemampuan Model Gemini
        </button>
      </div>

      {error ? (
        <StudioErrorBanner
          error={error}
          onRetry={lastRetryRef.current ? () => lastRetryRef.current?.() : undefined}
          isRetrying={loadingPrompt || loadingImage}
        />
      ) : null}

      {activeTab === 'character' ? (
        <div className="space-y-6">
          {project.characters.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#12141A] border border-white/[0.08] text-center space-y-3">
              <p className="text-sm text-[#9CA3AF]">
                Belum ada karakter di proyek ini. Buat profil karakter terlebih dahulu di Character Studio agar konsistensi wajah, rambut, pakaian, dan ciri fisiknya terjaga.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('characters')}
                className="px-4 py-2 rounded-lg bg-[#E5A93C] text-[#0A0B0E] text-xs font-semibold"
              >
                Buka Character Studio
              </button>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1.5">
                    Pilih Karakter
                  </label>
                  <select
                    value={selectedCharacter?.id || ''}
                    onChange={(e) => {
                      setSelectedCharId(e.target.value);
                      const found = project.characters.find((c) => c.id === e.target.value);
                      setCharPromptOverride(found?.visualPromptAnchor || '');
                    }}
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                  >
                    {project.characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1.5">Rasio Aspek</label>
                  <select
                    value={charAspect}
                    onChange={(e) => setCharAspect(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                  >
                    <option value="1:1">1:1 (Potret Referensi)</option>
                    <option value="3:4">3:4 (Potret Vertikal)</option>
                    <option value="16:9">16:9 (Character Sheet)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#9CA3AF] mb-1.5">Resolusi</label>
                  <select
                    value={charResolution}
                    onChange={(e) => setCharResolution(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                  >
                    <option value="1K">1K Standar</option>
                    <option value="2K">2K Tinggi</option>
                  </select>
                </div>
              </div>

              {selectedCharacter ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-4 border-t border-white/[0.08]">
                  <div className="lg:col-span-4 space-y-3">
                    <div className="aspect-square rounded-xl bg-[#0A0B0E] border border-white/[0.08] overflow-hidden flex items-center justify-center">
                      {selectedCharacter.referenceImageDataUrl ? (
                        <img
                          src={selectedCharacter.referenceImageDataUrl}
                          alt={`Referensi visual ${selectedCharacter.name}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="p-6 text-center space-y-2">
                          <UserCheck className="w-7 h-7 text-[#6B7280] mx-auto" />
                          <p className="text-xs text-[#9CA3AF]">
                            Belum ada gambar referensi untuk {selectedCharacter.name}.
                          </p>
                        </div>
                      )}
                    </div>

                    <input
                      ref={charFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        void handleUploadCharImage(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => charFileInputRef.current?.click()}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#8B5CF6]/50 text-xs font-medium text-[#F4F5F7] min-h-[44px]"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-[#8B5CF6]" />
                        {selectedCharacter.referenceImageDataUrl ? 'Ganti Foto' : 'Unggah Referensi'}
                      </button>
                      {selectedCharacter.referenceImageDataUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              downloadImageDataUrl(
                                selectedCharacter.referenceImageDataUrl!,
                                `karakter-${selectedCharacter.name}`
                              )
                            }
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#3B82F6]/50 text-xs font-medium text-[#F4F5F7] min-h-[44px]"
                          >
                            <Download className="w-3.5 h-3.5 text-[#3B82F6]" />
                            Unduh
                          </button>
                          <button
                            type="button"
                            onClick={handleDeleteCharImage}
                            aria-label={`Hapus foto ${selectedCharacter.name}`}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#EF4444]/50 text-xs font-medium text-[#EF4444] min-h-[44px]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hapus Foto
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="lg:col-span-8 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#0A0B0E] p-4 rounded-xl border border-white/[0.08]">
                      <div>
                        <span className="text-[#6B7280] block">Identitas &amp; Wajah</span>
                        <p className="text-[#F4F5F7] mt-0.5">
                          {selectedCharacter.gender ? `${selectedCharacter.gender} · ` : ''}
                          {selectedCharacter.age || '-'} — {selectedCharacter.facialDescription || selectedCharacter.appearance || '-'}
                        </p>
                        {(selectedCharacter.eyeShape || selectedCharacter.noseShape || selectedCharacter.lipShape || selectedCharacter.skinTone) ? (
                          <p className="text-[11px] text-[#9CA3AF] mt-1">
                            {[
                              selectedCharacter.eyeShape ? `Mata: ${selectedCharacter.eyeShape}` : '',
                              selectedCharacter.noseShape ? `Hidung: ${selectedCharacter.noseShape}` : '',
                              selectedCharacter.lipShape ? `Bibir: ${selectedCharacter.lipShape}` : '',
                              selectedCharacter.skinTone ? `Kulit: ${selectedCharacter.skinTone}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <span className="text-[#6B7280] block">Gaya &amp; Panjang Rambut</span>
                        <p className="text-[#F4F5F7] mt-0.5">
                          {selectedCharacter.hairDescription || '-'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[#6B7280] block">Tinggi, Tubuh &amp; Ciri Fisik</span>
                        <p className="text-[#F4F5F7] mt-0.5">
                          {[
                            selectedCharacter.height,
                            selectedCharacter.bodyBuild,
                            selectedCharacter.physicalTraits,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '-'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[#6B7280] block">Pakaian &amp; Kostum</span>
                        <p className="text-[#F4F5F7] mt-0.5">
                          {selectedCharacter.costume || '-'}
                        </p>
                      </div>
                      {selectedConsistency ? (
                        <div className="sm:col-span-2 pt-2 border-t border-white/[0.06]">
                          <span className="text-[#8B5CF6] block font-medium">
                            Character Identity Anchor ({selectedConsistency.identitySeed} · {selectedConsistency.locked !== false ? 'Terkunci' : 'Nonaktif'})
                          </span>
                          <p className="font-mono text-[11px] text-[#9CA3AF] mt-0.5">
                            {selectedConsistency.promptAnchor}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <label className="block text-xs text-[#9CA3AF] mb-1.5">
                        Prompt Visual Karakter (Opsional / Dihasilkan Gemini)
                      </label>
                      <textarea
                        rows={3}
                        value={charPromptOverride}
                        onChange={(e) => setCharPromptOverride(e.target.value)}
                        placeholder="Tekan 'Susun Prompt Karakter' untuk menyusun prompt sinematik dari ciri wajah, rambut, pakaian, dan anchor konsistensi..."
                        className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] font-mono text-xs text-[#F4F5F7] placeholder:text-[#6B7280]"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={loadingPrompt}
                        onClick={() => void handleGenerateCharPrompt()}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold min-h-[44px] disabled:opacity-50"
                      >
                        {loadingPrompt ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        Susun Prompt Karakter (Gemini)
                      </button>

                      <button
                        type="button"
                        disabled={loadingImage}
                        onClick={() => void handleGenerateCharImage()}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.12] hover:border-[#8B5CF6]/50 text-[#F4F5F7] text-xs font-medium min-h-[44px] disabled:opacity-50"
                      >
                        {loadingImage ? (
                          <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-[#8B5CF6]" />
                        )}
                        Generate Gambar Karakter (AI)
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === 'scene' ? (
        <div className="space-y-6">
          <div className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1.5">
                  Pilih Adegan Proyek
                </label>
                <select
                  value={selectedSceneNum}
                  onChange={(e) => handleSelectScene(Number(e.target.value))}
                  className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                >
                  <option value={0}>Adegan Kustom / Manual</option>
                  {project.scenes.map((s) => (
                    <option key={s.sceneNumber} value={s.sceneNumber}>
                      Adegan {s.sceneNumber}: {s.heading}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1.5">Rasio Aspek</label>
                <select
                  value={sceneAspect}
                  onChange={(e) => setSceneAspect(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                >
                  <option value="16:9">16:9 (Layar Lebar Sinematik)</option>
                  <option value="9:16">9:16 (Vertikal Drama HP)</option>
                  <option value="4:3">4:3 (Klasik)</option>
                  <option value="1:1">1:1 (Persegi)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1.5">Resolusi Target</label>
                <select
                  value={sceneResolution}
                  onChange={(e) => setSceneResolution(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7]"
                >
                  <option value="1K">1K Standar</option>
                  <option value="2K">2K Tinggi</option>
                  <option value="4K">4K Ultra</option>
                </select>
              </div>
            </div>

            {selectedScene ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[#0A0B0E] border border-white/[0.08] text-xs">
                <div>
                  <span className="text-[#6B7280] block">Lokasi & Waktu</span>
                  <span className="text-[#F4F5F7]">
                    {selectedScene.location} ({selectedScene.timeOfDay})
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280] block">Pencahayaan & Suasana</span>
                  <span className="text-[#F4F5F7]">
                    {selectedScene.lighting} · {selectedScene.mood}
                  </span>
                </div>
                <div>
                  <span className="text-[#6B7280] block">Gaya & Kamera</span>
                  <span className="text-[#F4F5F7]">
                    {project.input.visualStyle} · {selectedScene.cameraMovement}
                  </span>
                </div>
              </div>
            ) : null}

            {project.characters.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-[#9CA3AF]">
                  Referensi Karakter & Konsistensi yang Disertakan:
                </p>
                <div className="flex flex-wrap gap-2">
                  {project.characters.map((c) => {
                    const active = selectedRefCharIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleRefChar(c.id)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                          active
                            ? 'bg-[#E5A93C]/14 border-[#E5A93C]/50 text-[#F4F5F7]'
                            : 'bg-[#0A0B0E] border-white/[0.08] text-[#9CA3AF]'
                        }`}
                      >
                        {c.referenceImageDataUrl ? (
                          <img
                            src={c.referenceImageDataUrl}
                            alt={c.name}
                            className="w-4 h-4 rounded object-cover"
                          />
                        ) : null}
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div>
              <label className="block text-xs text-[#9CA3AF] mb-1.5">
                Deskripsi Visual Adegan (Lokasi, Pencahayaan, Aksi, Gaya Sinematik)
              </label>
              <textarea
                rows={3}
                value={sceneSubject}
                onChange={(e) => setSceneSubject(e.target.value)}
                placeholder="Contoh: Medium wide shot di peron stasiun malam berkabut, pencahayaan lampu neon dingin, tokoh berdiri memegang koper kulit terkunci dengan rintik hujan..."
                className="w-full p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] placeholder:text-[#6B7280]"
              />
            </div>

            {selectedScene?.imageDataUrl ? (
              <div className="p-4 rounded-xl bg-[#0A0B0E] border border-white/[0.08] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#E5A93C]">
                    Gambar Tersimpan untuk Adegan {selectedScene.sceneNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadImageDataUrl(
                        selectedScene.imageDataUrl!,
                        `adegan-${selectedScene.sceneNumber}`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181B22] border border-white/[0.1] text-xs text-[#F4F5F7]"
                  >
                    <Download className="w-3.5 h-3.5 text-[#E5A93C]" />
                    Unduh Gambar Adegan
                  </button>
                </div>
                <img
                  src={selectedScene.imageDataUrl}
                  alt={`Visual Adegan ${selectedScene.sceneNumber}`}
                  referrerPolicy="no-referrer"
                  className="max-h-72 w-auto rounded-lg object-contain border border-white/[0.08]"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-white/[0.08]">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={loadingPrompt || !sceneSubject.trim()}
                  onClick={() => void handleGenerateScenePrompt()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold min-h-[42px] disabled:opacity-45"
                >
                  {loadingPrompt ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Susun Prompt Adegan (Gemini)
                </button>

                <button
                  type="button"
                  disabled={loadingImage || (!sceneSubject.trim() && !selectedScene)}
                  onClick={() => void handleGenerateSceneImage()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.12] hover:border-[#E5A93C]/50 text-[#F4F5F7] text-xs font-medium min-h-[42px] disabled:opacity-45"
                >
                  {loadingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#E5A93C]" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-[#E5A93C]" />
                  )}
                  Generate Gambar Adegan (AI)
                </button>
              </div>

              <div>
                <input
                  ref={sceneFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void handleUploadSceneImage(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => sceneFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#E5A93C]/50 text-xs font-medium text-[#F4F5F7] min-h-[42px]"
                >
                  <ImagePlus className="w-3.5 h-3.5 text-[#E5A93C]" />
                  Unggah / Kaitkan Visual Adegan
                </button>
              </div>
            </div>
          </div>

          {imagePrompts.length > 0 ? (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-[#F4F5F7]">
                Daftar Prompt Visual Tersusun ({imagePrompts.length})
              </h2>
              {imagePrompts.map((spec) => (
                <div
                  key={spec.id}
                  className="p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#F4F5F7]">
                      {spec.sceneNumber ? `Adegan ${spec.sceneNumber} · ` : ''}
                      {spec.targetLabel}
                    </h3>
                    <span className="font-mono text-xs text-[#E5A93C]">
                      {spec.aspectRatio} · {spec.durationOrResolution}
                    </span>
                  </div>
                  <p className="text-xs text-[#9CA3AF]">Kamera & Gaya: {spec.cameraSpec}</p>
                  <div className="p-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.08] flex items-start justify-between gap-3">
                    <p className="font-mono text-xs text-[#F4F5F7] leading-relaxed">
                      {spec.promptText}
                    </p>
                    <button
                      type="button"
                      onClick={() => copyText(spec.id, spec.promptText)}
                      className="p-1.5 rounded text-[#9CA3AF] hover:text-[#F4F5F7] shrink-0"
                      title="Salin Prompt"
                    >
                      {copiedKey === spec.id ? (
                        <Check className="w-4 h-4 text-[#22C55E]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-[11px] text-[#6B7280]">
                    Negative Prompt: {spec.negativePrompt}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
