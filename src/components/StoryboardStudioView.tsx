import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MapPin,
  Maximize2,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  CharacterSheetViewKey,
  FilmProject,
  NavSection,
  ProductionVisualAsset,
  StoryboardAspectRatio,
  StoryboardFrame,
  StudioCapabilities,
  StudioErrorDetails,
} from '../types/studio';
import { apiGenerateSceneImage, apiGenerateStoryboard, toStudioErrorDetails } from '../services/studioApi';
import { formatActiveConsistencyForPrompt } from '../utils/characterConsistency';
import { downloadImageDataUrl, optimizeImageFile } from '../utils/imageAssets';
import { downloadTextFile } from '../utils/narrativeExport';
import {
  STORYBOARD_ASPECT_RATIOS,
  STORYBOARD_PANEL_COUNTS,
  STORYBOARD_SHOT_SIZES,
  createBlankStoryboardPanel,
  exportStoryboardSheetPng,
  formatStoryboardJson,
  formatStoryboardTxt,
  injectAnchorsIntoPanelPrompt,
  mergeSceneStoryboardFrames,
  moveStoryboardFrame,
  normalizeShotSize,
  reindexStoryboardFrames,
  replaceSingleStoryboardFrame,
  resolvePanelCharacters,
  resolveSceneId,
} from '../utils/storyboardExport';
import { StudioErrorBanner } from './StudioErrorBanner';
import type { StudioJumpContext } from './StudioFeatureViews';

interface StoryboardStudioViewProps {
  project: FilmProject;
  capabilities: StudioCapabilities | null;
  jumpContext: StudioJumpContext | null;
  onClearJumpContext: () => void;
  onUpdateProject: (updater: (prev: FilmProject) => FilmProject) => void;
  onNavigateWithContext: (section: NavSection, ctx?: StudioJumpContext) => void;
}

const SHEET_VIEW_LABELS: Array<{ key: CharacterSheetViewKey; label: string }> = [
  { key: 'front', label: 'Depan' },
  { key: 'side', label: 'Samping' },
  { key: 'back', label: 'Belakang' },
  { key: 'fullBody', label: 'Seluruh Tubuh' },
];

export function StoryboardStudioView({
  project,
  capabilities,
  jumpContext,
  onClearJumpContext,
  onUpdateProject,
  onNavigateWithContext,
}: StoryboardStudioViewProps) {
  const [selectedSceneFilter, setSelectedSceneFilter] = useState<number | 'all'>('all');
  const [panelCount, setPanelCount] = useState<number>(4);
  const [aspectRatio, setAspectRatio] = useState<StoryboardAspectRatio>('16:9');
  const [activeFrameNumber, setActiveFrameNumber] = useState<number | null>(
    project.storyboard[0]?.frameNumber ?? null
  );
  const [lightboxFrameNumber, setLightboxFrameNumber] = useState<number | null>(null);
  const [generatingScope, setGeneratingScope] = useState<string | null>(null);
  const [renderingFrameNum, setRenderingFrameNum] = useState<number | null>(null);
  const [exportingSheet, setExportingSheet] = useState(false);
  const [error, setError] = useState<StudioErrorDetails | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [refCharId, setRefCharId] = useState<string>('');
  const lastRetryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (jumpContext?.sceneNumber) {
      setSelectedSceneFilter(jumpContext.sceneNumber);
      onClearJumpContext();
    }
  }, [jumpContext, onClearJumpContext]);

  const orderedScenes = useMemo(
    () => [...project.scenes].sort((a, b) => a.sceneNumber - b.sceneNumber),
    [project.scenes]
  );

  const visibleFrames = useMemo(() => {
    if (selectedSceneFilter === 'all') return project.storyboard;
    return project.storyboard.filter((f) => f.sceneNumber === selectedSceneFilter);
  }, [project.storyboard, selectedSceneFilter]);

  useEffect(() => {
    if (!visibleFrames.length) {
      setActiveFrameNumber(null);
      return;
    }
    const stillVisible = visibleFrames.some((f) => f.frameNumber === activeFrameNumber);
    if (!stillVisible) {
      setActiveFrameNumber(visibleFrames[0].frameNumber);
    }
  }, [visibleFrames, activeFrameNumber]);

  const activePanel = useMemo(
    () => visibleFrames.find((f) => f.frameNumber === activeFrameNumber) || visibleFrames[0] || null,
    [visibleFrames, activeFrameNumber]
  );

  const lightboxPanel = useMemo(
    () => project.storyboard.find((f) => f.frameNumber === lightboxFrameNumber) || null,
    [project.storyboard, lightboxFrameNumber]
  );

  const activePanelCharacters = useMemo(() => {
    if (!activePanel) return [];
    return resolvePanelCharacters(activePanel, project.characters);
  }, [activePanel, project.characters]);

  useEffect(() => {
    if (activePanelCharacters.length > 0) {
      if (!activePanelCharacters.some((c) => c.id === refCharId)) {
        setRefCharId(activePanelCharacters[0].id);
      }
    } else if (project.characters.length > 0 && !project.characters.some((c) => c.id === refCharId)) {
      setRefCharId(project.characters[0].id);
    }
  }, [activePanelCharacters, project.characters, refCharId]);

  const inspectedCharacter = useMemo(
    () =>
      project.characters.find((c) => c.id === refCharId) ||
      activePanelCharacters[0] ||
      project.characters[0] ||
      null,
    [project.characters, activePanelCharacters, refCharId]
  );

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => {
      setNotice((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  const ensureInputReady = () => {
    if (!project.input.title.trim() || !project.input.premise.trim()) {
      setError({
        category: 'BAD_REQUEST',
        message: 'Isi Judul Film dan Cerita / Premis di Formulir Produksi terlebih dahulu.',
        retryable: false,
      });
      return false;
    }
    return true;
  };

  const updatePanelField = (frameNumber: number, patch: Partial<StoryboardFrame>) => {
    onUpdateProject((prev) => ({
      ...prev,
      storyboard: prev.storyboard.map((f) => (f.frameNumber === frameNumber ? { ...f, ...patch } : f)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleToggleCharacterOnPanel = (frame: StoryboardFrame, charId: string, charName: string) => {
    const currentIds = new Set(frame.characterIds || []);
    const currentNames = [...(frame.characters || [])];
    const hasChar =
      currentIds.has(charId) ||
      currentNames.some((n) => n.trim().toLowerCase() === charName.trim().toLowerCase());

    let nextIds: string[];
    let nextNames: string[];

    if (hasChar) {
      nextIds = Array.from(currentIds).filter((id) => id !== charId);
      nextNames = currentNames.filter((n) => n.trim().toLowerCase() !== charName.trim().toLowerCase());
    } else {
      nextIds = [...Array.from(currentIds), charId];
      nextNames = currentNames.some((n) => n.trim().toLowerCase() === charName.trim().toLowerCase())
        ? currentNames
        : [...currentNames, charName];
    }

    const updatedFrame: StoryboardFrame = {
      ...frame,
      characterIds: nextIds,
      characters: nextNames,
    };
    updatedFrame.visualPrompt = injectAnchorsIntoPanelPrompt(
      updatedFrame,
      project.characters,
      project.consistency
    );
    updatePanelField(frame.frameNumber, {
      characterIds: nextIds,
      characters: nextNames,
      visualPrompt: updatedFrame.visualPrompt,
    });
  };

  const handleInjectAnchors = (frame: StoryboardFrame) => {
    const updatedPrompt = injectAnchorsIntoPanelPrompt(
      frame,
      project.characters,
      project.consistency
    );
    updatePanelField(frame.frameNumber, { visualPrompt: updatedPrompt });
    showNotice(`Identity Anchor karakter disisipkan ke prompt Panel #${frame.frameNumber}.`);
  };

  const handleGenerateStoryboard = async (targetSceneNum?: number) => {
    if (!ensureInputReady()) return;
    if (orderedScenes.length === 0) {
      setError({
        category: 'BAD_REQUEST',
        message: 'Scene Breakdown masih kosong. Buat adegan terlebih dahulu di menu Scene Breakdown.',
        retryable: false,
      });
      return;
    }

    const scopeKey = targetSceneNum ? `scene_${targetSceneNum}` : 'all';
    lastRetryRef.current = () => {
      void handleGenerateStoryboard(targetSceneNum);
    };
    setError(null);
    setGeneratingScope(scopeKey);

    try {
      const { storyboard } = await apiGenerateStoryboard(
        project.input,
        orderedScenes,
        formatActiveConsistencyForPrompt(project.consistency, project.characters),
        {
          story: project.story,
          script: project.script,
          characters: project.characters,
          panelCount,
          aspectRatio,
          targetSceneNumber: targetSceneNum,
        }
      );

      let nextSelectedFrame: number | null = null;
      onUpdateProject((prev) => {
        if (targetSceneNum) {
          const prevSceneImages = prev.storyboard
            .filter((f) => f.sceneNumber === targetSceneNum && f.imageDataUrl)
            .map((f) => ({
              imageDataUrl: f.imageDataUrl,
              imageMimeType: f.imageMimeType,
              imageSource: f.imageSource,
              imageUpdatedAt: f.imageUpdatedAt,
            }));

          const incomingWithPreservedImages = storyboard.map((f, idx) => {
            const preserved = prevSceneImages[idx];
            return preserved && !f.imageDataUrl ? { ...f, ...preserved } : f;
          });

          const merged = mergeSceneStoryboardFrames(
            prev.storyboard,
            incomingWithPreservedImages,
            targetSceneNum,
            prev.scenes
          );
          const firstForScene = merged.find((f) => f.sceneNumber === targetSceneNum);
          nextSelectedFrame = firstForScene?.frameNumber ?? null;
          return {
            ...prev,
            storyboard: merged,
            updatedAt: new Date().toISOString(),
          };
        }

        const prevImageBySceneAndOffset = new Map<string, StoryboardFrame>();
        const countByScene = new Map<number, number>();
        for (const oldFrame of prev.storyboard) {
          const idx = countByScene.get(oldFrame.sceneNumber) || 0;
          countByScene.set(oldFrame.sceneNumber, idx + 1);
          if (oldFrame.imageDataUrl) {
            prevImageBySceneAndOffset.set(`${oldFrame.sceneNumber}_${idx}`, oldFrame);
          }
        }

        const newCountByScene = new Map<number, number>();
        const mergedAll = reindexStoryboardFrames(
          storyboard.map((f) => {
            const idx = newCountByScene.get(f.sceneNumber) || 0;
            newCountByScene.set(f.sceneNumber, idx + 1);
            const old = prevImageBySceneAndOffset.get(`${f.sceneNumber}_${idx}`);
            return {
              ...f,
              aspectRatio: f.aspectRatio || aspectRatio,
              imageDataUrl: f.imageDataUrl || old?.imageDataUrl,
              imageMimeType: f.imageMimeType || old?.imageMimeType,
              imageSource: f.imageSource || old?.imageSource,
              imageUpdatedAt: f.imageUpdatedAt || old?.imageUpdatedAt,
            };
          }),
          prev.scenes
        );
        nextSelectedFrame = mergedAll[0]?.frameNumber ?? null;
        return {
          ...prev,
          storyboard: mergedAll,
          updatedAt: new Date().toISOString(),
        };
      });

      if (nextSelectedFrame !== null) {
        setActiveFrameNumber(nextSelectedFrame);
      }
      showNotice(
        targetSceneNum
          ? `${storyboard.length} panel storyboard Adegan ${targetSceneNum} berhasil dibuat berurutan.`
          : `${storyboard.length} panel storyboard berhasil disusun dari Scene Breakdown.`
      );
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setGeneratingScope(null);
    }
  };

  const handleRegenerateSinglePanel = async (panel: StoryboardFrame) => {
    if (!ensureInputReady()) return;
    const scopeKey = `panel_${panel.frameNumber}`;
    lastRetryRef.current = () => {
      void handleRegenerateSinglePanel(panel);
    };
    setError(null);
    setGeneratingScope(scopeKey);

    try {
      const sameScenePanels = project.storyboard.filter((f) => f.sceneNumber === panel.sceneNumber);
      const { storyboard } = await apiGenerateStoryboard(
        project.input,
        orderedScenes,
        formatActiveConsistencyForPrompt(project.consistency, project.characters),
        {
          story: project.story,
          script: project.script,
          characters: project.characters,
          panelCount: sameScenePanels.length || 1,
          aspectRatio: panel.aspectRatio || aspectRatio,
          targetSceneNumber: panel.sceneNumber,
          targetFrameNumber: panel.frameNumber,
          existingPanel: panel,
          existingScenePanels: sameScenePanels,
        }
      );

      const generated = storyboard[0];
      if (!generated) {
        throw new Error('Gemini tidak mengembalikan panel pengganti.');
      }

      onUpdateProject((prev) => ({
        ...prev,
        storyboard: replaceSingleStoryboardFrame(
          prev.storyboard,
          panel.frameNumber,
          {
            ...generated,
            imageDataUrl: panel.imageDataUrl,
            imageMimeType: panel.imageMimeType,
            imageSource: panel.imageSource,
            imageUpdatedAt: panel.imageUpdatedAt,
          },
          prev.scenes
        ),
        updatedAt: new Date().toISOString(),
      }));
      showNotice(`Panel #${panel.frameNumber} dibuat ulang tanpa mengubah panel lainnya.`);
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setGeneratingScope(null);
    }
  };

  const handleAddBlankPanel = () => {
    const targetSceneNum =
      selectedSceneFilter !== 'all'
        ? selectedSceneFilter
        : activePanel?.sceneNumber || orderedScenes[0]?.sceneNumber || 1;
    const matchedScene = orderedScenes.find((s) => s.sceneNumber === targetSceneNum);

    let insertedFrameNum = project.storyboard.length + 1;
    onUpdateProject((prev) => {
      const newPanel = createBlankStoryboardPanel(
        matchedScene,
        prev.storyboard.length + 1,
        prev,
        aspectRatio
      );
      let insertIndex = prev.storyboard.length;
      for (let i = prev.storyboard.length - 1; i >= 0; i--) {
        if (prev.storyboard[i].sceneNumber <= targetSceneNum) {
          insertIndex = i + 1;
          break;
        }
      }
      const nextList = [...prev.storyboard];
      nextList.splice(insertIndex, 0, newPanel);
      const reindexed = reindexStoryboardFrames(nextList, prev.scenes);
      const found = reindexed.find((f) => f.id === newPanel.id);
      if (found) insertedFrameNum = found.frameNumber;
      return {
        ...prev,
        storyboard: reindexed,
        updatedAt: new Date().toISOString(),
      };
    });
    setActiveFrameNumber(insertedFrameNum);
    showNotice(`Panel baru ditambahkan ke Adegan ${targetSceneNum}.`);
  };

  const handleDeletePanel = (frameNumber: number) => {
    onUpdateProject((prev) => {
      const remaining = prev.storyboard.filter((f) => f.frameNumber !== frameNumber);
      const reindexed = reindexStoryboardFrames(remaining, prev.scenes);
      return {
        ...prev,
        storyboard: reindexed,
        updatedAt: new Date().toISOString(),
      };
    });
    if (lightboxFrameNumber === frameNumber) {
      setLightboxFrameNumber(null);
    }
    showNotice(`Panel #${frameNumber} dihapus.`);
  };

  const handleMovePanel = (frameNumber: number, direction: 'up' | 'down') => {
    onUpdateProject((prev) => ({
      ...prev,
      storyboard: moveStoryboardFrame(
        prev.storyboard,
        frameNumber,
        direction,
        selectedSceneFilter,
        prev.scenes
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleApplyAspectRatio = (nextRatio: StoryboardAspectRatio) => {
    setAspectRatio(nextRatio);
    if (activePanel) {
      updatePanelField(activePanel.frameNumber, { aspectRatio: nextRatio });
    }
  };

  const handleUploadPanelImage = async (frame: StoryboardFrame, file: File | undefined) => {
    if (!file) return;
    try {
      setError(null);
      const { dataUrl, mimeType } = await optimizeImageFile(file, 'scene');
      const now = new Date().toISOString();
      const asset: ProductionVisualAsset = {
        id: `asset_sb_${frame.sceneNumber}_${frame.frameNumber}_${Date.now()}`,
        kind: 'storyboard',
        title: `Storyboard Panel #${frame.frameNumber} (${resolveSceneId(frame.sceneNumber, orderedScenes, frame.sceneId)})`,
        subtitle: `${frame.shotType} · ${frame.location || 'Lokasi adegan'}`,
        sceneNumber: frame.sceneNumber,
        frameNumber: frame.frameNumber,
        promptUsed: frame.visualPrompt || frame.visualDescription || 'Panel storyboard',
        aspectRatio: frame.aspectRatio || aspectRatio,
        imageDataUrl: dataUrl,
        mimeType,
        source: 'user-upload',
        createdAt: now,
      };
      onUpdateProject((prev) => ({
        ...prev,
        storyboard: prev.storyboard.map((f) =>
          f.frameNumber === frame.frameNumber
            ? {
                ...f,
                imageDataUrl: dataUrl,
                imageMimeType: mimeType,
                imageSource: 'user-upload',
                imageUpdatedAt: now,
              }
            : f
        ),
        visualAssets: [
          asset,
          ...(prev.visualAssets || []).filter(
            (a) => !(a.kind === 'storyboard' && a.frameNumber === frame.frameNumber)
          ),
        ],
        updatedAt: now,
      }));
      showNotice(`Gambar Panel #${frame.frameNumber} berhasil disimpan ke IndexedDB.`);
    } catch (err) {
      setError({
        category: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'Gagal memuat gambar panel storyboard.',
        retryable: false,
      });
    }
  };

  const handleRemovePanelImage = (frame: StoryboardFrame) => {
    onUpdateProject((prev) => ({
      ...prev,
      storyboard: prev.storyboard.map((f) =>
        f.frameNumber === frame.frameNumber
          ? {
              ...f,
              imageDataUrl: undefined,
              imageMimeType: undefined,
              imageSource: undefined,
              imageUpdatedAt: undefined,
            }
          : f
      ),
      visualAssets: (prev.visualAssets || []).filter(
        (a) => !(a.kind === 'storyboard' && a.frameNumber === frame.frameNumber)
      ),
      updatedAt: new Date().toISOString(),
    }));
    showNotice(`Gambar Panel #${frame.frameNumber} dihapus. Deskripsi dan prompt tetap aman.`);
  };

  const handleGeneratePanelImage = async (frame: StoryboardFrame) => {
    const matchedScene = orderedScenes.find((s) => s.sceneNumber === frame.sceneNumber);
    lastRetryRef.current = () => {
      void handleGeneratePanelImage(frame);
    };
    setError(null);
    setRenderingFrameNum(frame.frameNumber);

    try {
      const panelChars = resolvePanelCharacters(frame, project.characters);
      const refImages: Array<{ name: string; dataUrl: string }> = [];
      for (const ch of panelChars) {
        if (ch.referenceImageDataUrl) {
          refImages.push({ name: `${ch.name} (Utama)`, dataUrl: ch.referenceImageDataUrl });
        }
        if (ch.referenceSheet?.front?.imageDataUrl) {
          refImages.push({ name: `${ch.name} (Depan)`, dataUrl: ch.referenceSheet.front.imageDataUrl });
        }
      }

      const finalPrompt = injectAnchorsIntoPanelPrompt(
        frame,
        project.characters,
        project.consistency
      );

      const res = await apiGenerateSceneImage({
        input: project.input,
        scene: matchedScene,
        prompt: finalPrompt,
        aspectRatio: frame.aspectRatio || aspectRatio,
        resolution: '1K',
        consistency: formatActiveConsistencyForPrompt(project.consistency, project.characters),
        referenceImages: refImages,
      });

      const now = new Date().toISOString();
      const asset: ProductionVisualAsset = {
        id: `asset_sb_${frame.sceneNumber}_${frame.frameNumber}_${Date.now()}`,
        kind: 'storyboard',
        title: `Storyboard Panel #${frame.frameNumber} (${resolveSceneId(frame.sceneNumber, orderedScenes, frame.sceneId)})`,
        subtitle: `${frame.shotType} · ${frame.location || matchedScene?.location || '-'}`,
        sceneNumber: frame.sceneNumber,
        frameNumber: frame.frameNumber,
        promptUsed: res.promptUsed,
        aspectRatio: frame.aspectRatio || aspectRatio,
        imageDataUrl: res.imageDataUrl,
        mimeType: res.mimeType,
        source: 'gemini-ai',
        modelUsed: res.modelUsed,
        createdAt: now,
      };

      onUpdateProject((prev) => ({
        ...prev,
        storyboard: prev.storyboard.map((f) =>
          f.frameNumber === frame.frameNumber
            ? {
                ...f,
                imageDataUrl: res.imageDataUrl,
                imageMimeType: res.mimeType,
                imageSource: 'gemini-ai',
                imageUpdatedAt: now,
              }
            : f
        ),
        visualAssets: [
          asset,
          ...(prev.visualAssets || []).filter(
            (a) => !(a.kind === 'storyboard' && a.frameNumber === frame.frameNumber)
          ),
        ],
        updatedAt: now,
      }));
      showNotice(`Gambar Panel #${frame.frameNumber} berhasil dibuat oleh ${res.modelUsed}.`);
    } catch (err) {
      setError(toStudioErrorDetails(err));
    } finally {
      setRenderingFrameNum(null);
    }
  };

  const handleExportTxt = () => {
    const frames = visibleFrames.length ? visibleFrames : project.storyboard;
    const content = formatStoryboardTxt(project, frames);
    const suffix = selectedSceneFilter === 'all' ? 'semua' : `adegan-${selectedSceneFilter}`;
    const base = (project.input.title || 'storyboard').toLowerCase().replace(/[^a-z0-9-_]+/gi, '-');
    downloadTextFile(`${base}-storyboard-${suffix}.txt`, content);
    showNotice('Deskripsi storyboard (.txt) berhasil diunduh.');
  };

  const handleExportJson = () => {
    const frames = visibleFrames.length ? visibleFrames : project.storyboard;
    const content = formatStoryboardJson(project, frames);
    const suffix = selectedSceneFilter === 'all' ? 'semua' : `adegan-${selectedSceneFilter}`;
    const base = (project.input.title || 'storyboard').toLowerCase().replace(/[^a-z0-9-_]+/gi, '-');
    downloadTextFile(`${base}-storyboard-${suffix}.json`, content, 'application/json;charset=utf-8');
    showNotice('Data lengkap storyboard (.json) berhasil diunduh.');
  };

  const handleExportPngSheet = async () => {
    const frames = visibleFrames.length ? visibleFrames : project.storyboard;
    if (!frames.length) return;
    setExportingSheet(true);
    setError(null);
    try {
      await exportStoryboardSheetPng(
        project,
        frames,
        `${project.input.title || 'ai-film-studio'}-${
          selectedSceneFilter === 'all' ? 'lengkap' : `adegan-${selectedSceneFilter}`
        }`
      );
      showNotice('Lembar Storyboard gabungan (.png) berhasil diunduh.');
    } catch (err) {
      setError({
        category: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'Gagal menyusun lembar PNG storyboard.',
        retryable: false,
      });
    } finally {
      setExportingSheet(false);
    }
  };

  const getAspectClass = (ratio?: StoryboardAspectRatio) => {
    if (ratio === '9:16') return 'aspect-[9/16] max-h-72 mx-auto w-auto max-w-full';
    if (ratio === '1:1') return 'aspect-square max-h-64 mx-auto w-auto max-w-full';
    return 'aspect-video w-full';
  };

  const lightboxIndex = lightboxPanel
    ? visibleFrames.findIndex((f) => f.frameNumber === lightboxPanel.frameNumber)
    : -1;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header Toolbar */}
      <header className="pb-5 border-b border-white/[0.08] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold text-[#F4F5F7]">
              09. Storyboard Studio
            </h1>
            <p className="text-sm text-[#9CA3AF] max-w-2xl leading-relaxed">
              Pecah setiap adegan Scene Breakdown menjadi 3–8 panel berurutan lengkap dengan ukuran shot, kamera, pencahayaan, Character Consistency Lock, serta ekspor lembar storyboard.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={generatingScope !== null}
              onClick={() =>
                void handleGenerateStoryboard(
                  selectedSceneFilter === 'all' ? undefined : selectedSceneFilter
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {generatingScope === (selectedSceneFilter === 'all' ? 'all' : `scene_${selectedSceneFilter}`) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {selectedSceneFilter === 'all'
                ? 'Generate Semua Adegan'
                : `Buat ${panelCount} Panel Adegan ${selectedSceneFilter}`}
            </button>

            <button
              type="button"
              onClick={handleAddBlankPanel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 text-[#E5A93C]" />
              Tambah Panel
            </button>
          </div>
        </div>

        {/* Panel Count, Aspect Ratio & Export Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#9CA3AF] mr-1">Panel/Adegan:</span>
              <div className="inline-flex items-center p-1 rounded-lg bg-[#12141A] border border-white/[0.08]">
                {STORYBOARD_PANEL_COUNTS.map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setPanelCount(cnt)}
                    className={`px-3 py-1.5 min-h-[36px] rounded-md text-xs font-mono tabular-nums transition-colors ${
                      panelCount === cnt
                        ? 'bg-[#E5A93C] text-[#0A0B0E] font-semibold'
                        : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#9CA3AF] mr-1">Rasio:</span>
              <div className="inline-flex items-center p-1 rounded-lg bg-[#12141A] border border-white/[0.08]">
                {STORYBOARD_ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => handleApplyAspectRatio(ratio)}
                    className={`px-3 py-1.5 min-h-[36px] rounded-md text-xs font-mono tabular-nums transition-colors ${
                      aspectRatio === ratio
                        ? 'bg-[#8B5CF6] text-white font-semibold'
                        : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={project.storyboard.length === 0}
              onClick={handleExportTxt}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-medium bg-[#12141A] border border-white/[0.08] text-[#F4F5F7] hover:border-[#E5A93C]/50 disabled:opacity-40 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-[#E5A93C]" />
              Unduh TXT
            </button>
            <button
              type="button"
              disabled={project.storyboard.length === 0}
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-medium bg-[#12141A] border border-white/[0.08] text-[#F4F5F7] hover:border-[#E5A93C]/50 disabled:opacity-40 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-[#E5A93C]" />
              Unduh JSON
            </button>
            <button
              type="button"
              disabled={project.storyboard.length === 0 || exportingSheet}
              onClick={() => void handleExportPngSheet()}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-medium bg-[#12141A] border border-white/[0.08] text-[#F4F5F7] hover:border-[#E5A93C]/50 disabled:opacity-40 whitespace-nowrap"
            >
              {exportingSheet ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5 text-[#E5A93C]" />
              )}
              Ekspor Lembar PNG
            </button>
          </div>
        </div>
      </header>

      {/* Honest Image Generation Capabilities Status */}
      {capabilities && !capabilities.imageGenerationReady ? (
        <div className="p-4 rounded-xl bg-[#12141A] border border-[#E5A93C]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-[#E5A93C] shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <p className="font-semibold text-[#F4F5F7]">
                Layanan Render Gambar AI Belum Aktif (Paid API Key Diperlukan)
              </p>
              <p className="text-[#9CA3AF] leading-relaxed">
                Penyusunan naskah storyboard, komposisi kamera, dan Visual Prompt via {capabilities.textModel} aktif penuh. Untuk pixel gambar per panel, Anda dapat mengunggah gambar sendiri atau menyalin prompt siap pakai di bawah — tidak ada gambar palsu yang dibuat.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateWithContext('image', { visualTab: 'models' })}
            className="px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50 whitespace-nowrap shrink-0"
          >
            Cek Status Model
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="px-4 py-3 rounded-lg bg-[#12141A] border border-[#22C55E]/40 text-xs text-[#F4F5F7] flex items-center gap-2">
          <Check className="w-4 h-4 text-[#22C55E] shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      {error ? (
        <StudioErrorBanner
          error={error}
          onRetry={lastRetryRef.current || undefined}
          isRetrying={generatingScope !== null || renderingFrameNum !== null}
        />
      ) : null}

      {/* Main 3-Area Workspace: Left Scenes | Center Grid | Right Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Pane: Scene Breakdown List */}
        <aside className="lg:col-span-3 rounded-xl bg-[#12141A] border border-white/[0.08] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#F4F5F7] flex items-center gap-2">
              <Film className="w-4 h-4 text-[#E5A93C]" />
              Daftar Adegan
            </h2>
            <span className="font-mono text-xs text-[#9CA3AF] tabular-nums">
              {orderedScenes.length} adegan
            </span>
          </div>

          {orderedScenes.length === 0 ? (
            <div className="p-4 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-3 text-center">
              <p className="text-xs text-[#9CA3AF] leading-relaxed">
                Belum ada adegan dari Scene Breakdown. Buat adegan terlebih dahulu agar storyboard terhubung otomatis.
              </p>
              <button
                type="button"
                onClick={() => onNavigateWithContext('scenes')}
                className="w-full py-2.5 min-h-[44px] rounded-lg text-xs font-semibold bg-[#E5A93C] text-[#0A0B0E] hover:bg-[#F0B94D]"
              >
                Buka Scene Breakdown
              </button>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-0.5">
              <button
                type="button"
                onClick={() => setSelectedSceneFilter('all')}
                className={`w-full text-left px-3 py-2.5 min-h-[44px] rounded-lg border text-xs transition-colors flex items-center justify-between ${
                  selectedSceneFilter === 'all'
                    ? 'bg-[#E5A93C]/15 border-[#E5A93C]/60 text-[#F4F5F7] font-semibold'
                    : 'bg-[#0A0B0E] border-white/[0.06] text-[#9CA3AF] hover:text-[#F4F5F7]'
                }`}
              >
                <span>Semua Adegan</span>
                <span className="font-mono tabular-nums">{project.storyboard.length} panel</span>
              </button>

              {orderedScenes.map((scene) => {
                const count = project.storyboard.filter((f) => f.sceneNumber === scene.sceneNumber).length;
                const scId = resolveSceneId(scene.sceneNumber, orderedScenes, scene.sceneId);
                const selected = selectedSceneFilter === scene.sceneNumber;
                return (
                  <button
                    key={scene.sceneNumber}
                    type="button"
                    onClick={() => setSelectedSceneFilter(scene.sceneNumber)}
                    className={`w-full text-left p-3 min-h-[44px] rounded-lg border text-xs transition-colors space-y-1 ${
                      selected
                        ? 'bg-[#E5A93C]/15 border-[#E5A93C]/60 text-[#F4F5F7]'
                        : 'bg-[#0A0B0E] border-white/[0.06] text-[#9CA3AF] hover:text-[#F4F5F7]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-[#E5A93C] tabular-nums">
                        {scId}
                      </span>
                      <span className="font-mono text-[11px] text-[#9CA3AF] tabular-nums">
                        {count} panel · {scene.estimatedSeconds}s
                      </span>
                    </div>
                    <p className="font-medium text-[#F4F5F7] truncate">{scene.heading}</p>
                    <p className="text-[11px] text-[#6B7280] truncate">
                      {scene.location} · {scene.timeOfDay}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Center Main Area: Storyboard Panels Grid */}
        <section className="lg:col-span-5 space-y-4">
          {visibleFrames.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#12141A] border border-white/[0.08] text-center space-y-4">
              <p className="text-sm text-[#9CA3AF]">
                {selectedSceneFilter === 'all'
                  ? 'Belum ada panel storyboard. Pilih jumlah panel (3, 4, 5, 6, atau 8) lalu tekan Generate Semua Adegan atau Tambah Panel.'
                  : `Belum ada panel storyboard untuk Adegan ${selectedSceneFilter}. Tekan tombol di atas untuk membuat ${panelCount} panel berurutan.`}
              </p>
              {orderedScenes.length > 0 ? (
                <button
                  type="button"
                  disabled={generatingScope !== null}
                  onClick={() =>
                    void handleGenerateStoryboard(
                      selectedSceneFilter === 'all' ? undefined : selectedSceneFilter
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E]"
                >
                  <Sparkles className="w-4 h-4" />
                  {selectedSceneFilter === 'all'
                    ? 'Generate Storyboard Sekarang'
                    : `Buat ${panelCount} Panel Adegan ${selectedSceneFilter}`}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {visibleFrames.map((frame, visibleIdx) => {
                const isSelected = activePanel?.frameNumber === frame.frameNumber;
                const scId = resolveSceneId(frame.sceneNumber, orderedScenes, frame.sceneId);
                const ratio = frame.aspectRatio || '16:9';
                const charList = frame.characters || [];
                const isRegeneratingOne = generatingScope === `panel_${frame.frameNumber}`;
                const isRenderingOne = renderingFrameNum === frame.frameNumber;

                return (
                  <article
                    key={frame.id || frame.frameNumber}
                    className={`p-4 rounded-xl bg-[#12141A] border transition-colors space-y-3 ${
                      isSelected ? 'border-[#E5A93C]/70' : 'border-white/[0.08]'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveFrameNumber(frame.frameNumber)}
                        className="text-left font-mono font-semibold text-[#E5A93C] tabular-nums hover:underline"
                      >
                        Panel #{frame.frameNumber} · {scId} · {frame.durationSeconds}s
                      </button>
                      <span className="font-mono text-[#9CA3AF] tabular-nums">
                        {normalizeShotSize(frame.shotType)} · {frame.cameraAngle} · {ratio}
                      </span>
                    </div>

                    {/* Visual Frame Preview */}
                    <div
                      onClick={() => setActiveFrameNumber(frame.frameNumber)}
                      className={`${getAspectClass(ratio)} rounded-lg bg-[#0A0B0E] border border-white/[0.08] overflow-hidden relative flex items-center justify-center cursor-pointer`}
                    >
                      {frame.imageDataUrl ? (
                        <img
                          src={frame.imageDataUrl}
                          alt={`Panel #${frame.frameNumber} ${scId}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="p-4 text-center space-y-1.5">
                          <ImageIcon className="w-6 h-6 text-[#6B7280] mx-auto" />
                          <p className="text-xs font-medium text-[#9CA3AF]">
                            Frame Visual Belum Diisi
                          </p>
                          <p className="text-[11px] text-[#6B7280] max-w-xs mx-auto">
                            {normalizeShotSize(frame.shotType)} · {frame.cameraMovement || 'Static'} · {frame.lensMm}
                          </p>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxFrameNumber(frame.frameNumber);
                        }}
                        className="absolute top-2 right-2 p-2 rounded-lg bg-[#0A0B0E]/80 border border-white/15 text-[#F4F5F7] hover:border-[#E5A93C]"
                        title="Perbesar Panel"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Summary Details */}
                    <div className="space-y-1.5 text-xs">
                      <p className="text-[#F4F5F7]/95 leading-relaxed">
                        {frame.visualDescription || frame.compositionNotes || '-'}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#9CA3AF]">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-[#E5A93C]" />
                          {frame.location || '-'} ({frame.timeLabel || '-'})
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3 h-3 text-[#8B5CF6]" />
                          {charList.length ? charList.join(', ') : 'Belum ada tokoh'}
                        </span>
                      </div>
                      {frame.dialogue || frame.dialogueCue ? (
                        <p className="text-[11px] text-[#C4B5FD] italic flex items-start gap-1.5">
                          <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>“{frame.dialogue || frame.dialogueCue}”</span>
                        </p>
                      ) : null}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setActiveFrameNumber(frame.frameNumber)}
                        className={`px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium border transition-colors ${
                          isSelected
                            ? 'bg-[#E5A93C]/20 border-[#E5A93C] text-[#F4F5F7]'
                            : 'bg-[#181B22] border-white/[0.08] text-[#F4F5F7] hover:border-[#E5A93C]/50'
                        }`}
                      >
                        {isSelected ? 'Sedang Diedit' : 'Edit Panel'}
                      </button>

                      <button
                        type="button"
                        disabled={visibleIdx === 0}
                        onClick={() => handleMovePanel(frame.frameNumber, 'up')}
                        className="p-2 min-h-[40px] min-w-[40px] rounded-lg bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] disabled:opacity-35 hover:border-[#E5A93C]/50 flex items-center justify-center"
                        title="Naikkan Urutan"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={visibleIdx === visibleFrames.length - 1}
                        onClick={() => handleMovePanel(frame.frameNumber, 'down')}
                        className="p-2 min-h-[40px] min-w-[40px] rounded-lg bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] disabled:opacity-35 hover:border-[#E5A93C]/50 flex items-center justify-center"
                        title="Turunkan Urutan"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={generatingScope !== null}
                        onClick={() => void handleRegenerateSinglePanel(frame)}
                        className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] hover:border-[#E5A93C]/50 disabled:opacity-50"
                        title="Buat Ulang 1 Panel Ini Saja"
                      >
                        {isRegeneratingOne ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 text-[#E5A93C]" />
                        )}
                        Ulang 1 Panel
                      </button>

                      <button
                        type="button"
                        onClick={() => void copyText(`sb_prompt_${frame.frameNumber}`, frame.visualPrompt)}
                        className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] hover:border-[#E5A93C]/50"
                      >
                        {copiedKey === `sb_prompt_${frame.frameNumber}` ? (
                          <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-[#9CA3AF]" />
                        )}
                        Prompt
                      </button>

                      <button
                        type="button"
                        disabled={isRenderingOne}
                        onClick={() => void handleGeneratePanelImage(frame)}
                        className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#E9D5FF] hover:bg-[#8B5CF6]/30 disabled:opacity-50"
                      >
                        {isRenderingOne ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        Buat Gambar
                      </button>

                      <label className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] hover:border-[#E5A93C]/50 cursor-pointer">
                        <ImagePlus className="w-3.5 h-3.5 text-[#E5A93C]" />
                        Unggah
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void handleUploadPanelImage(frame, e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>

                      {frame.imageDataUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              downloadImageDataUrl(
                                frame.imageDataUrl!,
                                `storyboard-panel-${frame.frameNumber}-adegan-${frame.sceneNumber}`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.08] text-[#F4F5F7] hover:border-[#E5A93C]/50"
                          >
                            <Download className="w-3.5 h-3.5 text-[#E5A93C]" />
                            Unduh
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePanelImage(frame)}
                            className="px-2.5 py-2 min-h-[40px] rounded-lg text-xs font-medium bg-[#181B22] border border-white/[0.08] text-[#9CA3AF] hover:text-[#EF4444]"
                            title="Hapus Gambar Saja (Prompt Tetap Aman)"
                          >
                            Hapus Gambar
                          </button>
                        </>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleDeletePanel(frame.frameNumber)}
                        className="p-2 min-h-[40px] min-w-[40px] rounded-lg bg-[#181B22] border border-white/[0.08] text-[#9CA3AF] hover:text-[#EF4444] hover:border-[#EF4444]/40 flex items-center justify-center ml-auto"
                        title="Hapus Panel Ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Pane: Visual Editor & Character Reference Sheet Viewer */}
        <aside className="lg:col-span-4 rounded-xl bg-[#12141A] border border-white/[0.08] p-4 space-y-5">
          {activePanel ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div>
                  <h2 className="text-sm font-semibold text-[#F4F5F7]">
                    Editor Panel #{activePanel.frameNumber}
                  </h2>
                  <p className="text-xs text-[#9CA3AF] font-mono tabular-nums">
                    {resolveSceneId(activePanel.sceneNumber, orderedScenes, activePanel.sceneId)} · Adegan{' '}
                    {activePanel.sceneNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxFrameNumber(activePanel.frameNumber)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]/50"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-[#E5A93C]" />
                  Perbesar
                </button>
              </div>

              {/* Scene, Shot, Camera & Timing */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-[#9CA3AF] block">Scene Breakdown</span>
                  <select
                    value={activePanel.sceneNumber}
                    onChange={(e) => {
                      const nextNum = Number(e.target.value);
                      updatePanelField(activePanel.frameNumber, {
                        sceneNumber: nextNum,
                        sceneId: resolveSceneId(nextNum, orderedScenes),
                      });
                    }}
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                  >
                    {orderedScenes.length > 0 ? (
                      orderedScenes.map((sc) => (
                        <option key={sc.sceneNumber} value={sc.sceneNumber}>
                          {resolveSceneId(sc.sceneNumber, orderedScenes, sc.sceneId)} · Adegan {sc.sceneNumber}
                        </option>
                      ))
                    ) : (
                      <option value={activePanel.sceneNumber}>Adegan {activePanel.sceneNumber}</option>
                    )}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[#9CA3AF] block">Ukuran Shot</span>
                  <select
                    value={normalizeShotSize(activePanel.shotType)}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, { shotType: e.target.value })
                    }
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                  >
                    {STORYBOARD_SHOT_SIZES.map((shot) => (
                      <option key={shot} value={shot}>
                        {shot}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[#9CA3AF] block">Durasi (Detik)</span>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={activePanel.durationSeconds}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, {
                        durationSeconds: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7] font-mono tabular-nums"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#9CA3AF] block">Waktu Kejadian</span>
                  <input
                    type="text"
                    value={activePanel.timeLabel || ''}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, { timeLabel: e.target.value })
                    }
                    placeholder="Malam Hujan / 00:05"
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#9CA3AF] block">Sudut Kamera</span>
                  <input
                    type="text"
                    value={activePanel.cameraAngle}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, { cameraAngle: e.target.value })
                    }
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#9CA3AF] block">Gerakan Kamera</span>
                  <input
                    type="text"
                    value={activePanel.cameraMovement || ''}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, { cameraMovement: e.target.value })
                    }
                    placeholder="Slow Dolly In"
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#9CA3AF] block">Lensa</span>
                  <input
                    type="text"
                    value={activePanel.lensMm}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, { lensMm: e.target.value })
                    }
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7] font-mono"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#9CA3AF] block">Rasio Aspek</span>
                  <select
                    value={activePanel.aspectRatio || aspectRatio}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, {
                        aspectRatio: e.target.value as StoryboardAspectRatio,
                      })
                    }
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7] font-mono"
                  >
                    {STORYBOARD_ASPECT_RATIOS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Location, Lighting, Atmosphere */}
              <div className="space-y-2.5 text-xs">
                <label className="space-y-1 block">
                  <span className="text-[#9CA3AF] block">Lokasi</span>
                  <input
                    type="text"
                    value={activePanel.location || ''}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, { location: e.target.value })
                    }
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                  />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="space-y-1 block">
                    <span className="text-[#9CA3AF] block">Pencahayaan</span>
                    <input
                      type="text"
                      value={activePanel.lighting || ''}
                      onChange={(e) =>
                        updatePanelField(activePanel.frameNumber, { lighting: e.target.value })
                      }
                      className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-[#9CA3AF] block">Suasana & Lingkungan</span>
                    <input
                      type="text"
                      value={activePanel.atmosphere || ''}
                      onChange={(e) =>
                        updatePanelField(activePanel.frameNumber, { atmosphere: e.target.value })
                      }
                      className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                    />
                  </label>
                </div>
              </div>

              {/* Visual Description, Action, Expression, Position, Dialogue */}
              <div className="space-y-2.5 text-xs">
                <label className="space-y-1 block">
                  <span className="text-[#9CA3AF] block">Deskripsi Visual</span>
                  <textarea
                    rows={3}
                    value={activePanel.visualDescription || ''}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, {
                        visualDescription: e.target.value,
                        compositionNotes: e.target.value,
                      })
                    }
                    className="w-full p-2.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7] leading-relaxed"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-[#9CA3AF] block">Aksi Karakter</span>
                  <input
                    type="text"
                    value={activePanel.characterAction || ''}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, { characterAction: e.target.value })
                    }
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="space-y-1 block">
                    <span className="text-[#9CA3AF] block">Ekspresi & Gestur</span>
                    <input
                      type="text"
                      value={activePanel.expressionAndGesture || ''}
                      onChange={(e) =>
                        updatePanelField(activePanel.frameNumber, {
                          expressionAndGesture: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-[#9CA3AF] block">Posisi dalam Frame</span>
                    <input
                      type="text"
                      value={activePanel.characterPosition || ''}
                      onChange={(e) =>
                        updatePanelField(activePanel.frameNumber, {
                          characterPosition: e.target.value,
                        })
                      }
                      className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                    />
                  </label>
                </div>

                <label className="space-y-1 block">
                  <span className="text-[#9CA3AF] block">Dialog / Cue Audio</span>
                  <input
                    type="text"
                    value={activePanel.dialogue ?? activePanel.dialogueCue ?? ''}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, {
                        dialogue: e.target.value,
                        dialogueCue: e.target.value,
                      })
                    }
                    className="w-full px-2.5 py-2 min-h-[42px] rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7]"
                  />
                </label>
              </div>

              {/* Prompts */}
              <div className="space-y-2.5 text-xs pt-2 border-t border-white/[0.08]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#9CA3AF] font-medium">Prompt Gambar (Visual Prompt)</span>
                  <button
                    type="button"
                    onClick={() => handleInjectAnchors(activePanel)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#E5A93C]/15 border border-[#E5A93C]/40 text-[#E5A93C] hover:bg-[#E5A93C]/25"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Sisipkan Identity Anchor
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={activePanel.visualPrompt}
                  onChange={(e) =>
                    updatePanelField(activePanel.frameNumber, { visualPrompt: e.target.value })
                  }
                  className="w-full p-2.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#F4F5F7] font-mono text-[11px] leading-relaxed"
                />

                <label className="space-y-1 block">
                  <span className="text-[#9CA3AF] block">Negative Prompt</span>
                  <textarea
                    rows={2}
                    value={activePanel.negativePrompt || ''}
                    onChange={(e) =>
                      updatePanelField(activePanel.frameNumber, { negativePrompt: e.target.value })
                    }
                    className="w-full p-2.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-[#9CA3AF] font-mono text-[11px] leading-relaxed"
                  />
                </label>
              </div>

              {/* Character Studio Integration & Reference Sheet Viewer */}
              <div className="space-y-3 pt-3 border-t border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#F4F5F7] flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-[#E5A93C]" />
                    Referensi Karakter Studio
                  </h3>
                  <button
                    type="button"
                    onClick={() => onNavigateWithContext('characters')}
                    className="text-[11px] text-[#E5A93C] hover:underline"
                  >
                    Kelola Karakter →
                  </button>
                </div>

                {project.characters.length === 0 ? (
                  <p className="text-xs text-[#6B7280]">
                    Belum ada karakter di Character Studio. Buat karakter di sana agar dapat ditautkan ke panel tanpa membuat karakter palsu.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {project.characters.map((ch) => {
                        const selected =
                          (activePanel.characterIds || []).includes(ch.id) ||
                          (activePanel.characters || []).some(
                            (n) => n.trim().toLowerCase() === ch.name.trim().toLowerCase()
                          );
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() =>
                              handleToggleCharacterOnPanel(activePanel, ch.id, ch.name)
                            }
                            className={`px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs border transition-colors ${
                              selected
                                ? 'bg-[#8B5CF6]/25 border-[#8B5CF6] text-[#F4F5F7] font-medium'
                                : 'bg-[#0A0B0E] border-white/[0.08] text-[#9CA3AF] hover:text-[#F4F5F7]'
                            }`}
                          >
                            {selected ? '✓ ' : '+ '}
                            {ch.name}
                          </button>
                        );
                      })}
                    </div>

                    {inspectedCharacter ? (
                      <div className="p-3 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[#F4F5F7] truncate">
                            Lembar Referensi: {inspectedCharacter.name}
                          </span>
                          <select
                            value={inspectedCharacter.id}
                            onChange={(e) => setRefCharId(e.target.value)}
                            className="px-2 py-1 rounded bg-[#12141A] border border-white/[0.1] text-[11px] text-[#F4F5F7]"
                          >
                            {project.characters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-5 gap-1.5">
                          <div className="space-y-1 text-center">
                            <div className="aspect-square rounded bg-[#12141A] border border-white/[0.08] overflow-hidden flex items-center justify-center">
                              {inspectedCharacter.referenceImageDataUrl ? (
                                <img
                                  src={inspectedCharacter.referenceImageDataUrl}
                                  alt={`${inspectedCharacter.name} utama`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-[9px] text-[#6B7280] px-1">Kosong</span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#9CA3AF] block truncate">Utama</span>
                          </div>

                          {SHEET_VIEW_LABELS.map((v) => {
                            const slot = inspectedCharacter.referenceSheet?.[v.key];
                            return (
                              <div key={v.key} className="space-y-1 text-center">
                                <div className="aspect-square rounded bg-[#12141A] border border-white/[0.08] overflow-hidden flex items-center justify-center">
                                  {slot?.imageDataUrl ? (
                                    <img
                                      src={slot.imageDataUrl}
                                      alt={`${inspectedCharacter.name} ${v.label}`}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-[9px] text-[#6B7280] px-1">Kosong</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-[#9CA3AF] block truncate">
                                  {v.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="py-12 text-center space-y-2">
              <p className="text-xs text-[#9CA3AF]">
                Pilih salah satu panel storyboard untuk mengedit detail shot, kamera, prompt, dan referensi karakter.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Lightbox Expanded Modal */}
      {lightboxPanel ? (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxFrameNumber(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#12141A] border border-white/[0.12] p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-[#F4F5F7]">
                  Panel #{lightboxPanel.frameNumber} ·{' '}
                  {resolveSceneId(lightboxPanel.sceneNumber, orderedScenes, lightboxPanel.sceneId)}
                </h3>
                <p className="text-xs font-mono text-[#9CA3AF] tabular-nums">
                  {normalizeShotSize(lightboxPanel.shotType)} · {lightboxPanel.cameraAngle} ·{' '}
                  {lightboxPanel.cameraMovement || 'Static'} · {lightboxPanel.lensMm} ·{' '}
                  {lightboxPanel.durationSeconds}s
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={lightboxIndex <= 0}
                  onClick={() => {
                    if (lightboxIndex > 0) {
                      setLightboxFrameNumber(visibleFrames[lightboxIndex - 1].frameNumber);
                    }
                  }}
                  className="p-2 min-h-[40px] min-w-[40px] rounded-lg bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] disabled:opacity-35"
                  title="Panel Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={lightboxIndex === -1 || lightboxIndex >= visibleFrames.length - 1}
                  onClick={() => {
                    if (lightboxIndex >= 0 && lightboxIndex < visibleFrames.length - 1) {
                      setLightboxFrameNumber(visibleFrames[lightboxIndex + 1].frameNumber);
                    }
                  }}
                  className="p-2 min-h-[40px] min-w-[40px] rounded-lg bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] disabled:opacity-35"
                  title="Panel Berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxFrameNumber(null)}
                  className="p-2 min-h-[40px] min-w-[40px] rounded-lg bg-[#181B22] border border-white/[0.1] text-[#F4F5F7] hover:border-[#E5A93C]"
                  title="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className={`${getAspectClass(lightboxPanel.aspectRatio)} rounded-xl bg-[#0A0B0E] border border-white/[0.08] overflow-hidden flex items-center justify-center`}>
              {lightboxPanel.imageDataUrl ? (
                <img
                  src={lightboxPanel.imageDataUrl}
                  alt={`Panel #${lightboxPanel.frameNumber}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="p-8 text-center space-y-2">
                  <ImageIcon className="w-8 h-8 text-[#6B7280] mx-auto" />
                  <p className="text-sm font-medium text-[#9CA3AF]">
                    Belum Ada Gambar untuk Panel Ini
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Gunakan Visual Prompt di bawah atau unggah gambar panel dari editor.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-2">
                <p className="text-[#E5A93C] font-semibold">Visual & Aksi</p>
                <p className="text-[#F4F5F7] leading-relaxed">
                  {lightboxPanel.visualDescription || lightboxPanel.compositionNotes}
                </p>
                {lightboxPanel.characterAction ? (
                  <p className="text-[#9CA3AF]">
                    <strong className="text-[#F4F5F7]">Aksi:</strong> {lightboxPanel.characterAction}
                  </p>
                ) : null}
                {lightboxPanel.expressionAndGesture ? (
                  <p className="text-[#9CA3AF]">
                    <strong className="text-[#F4F5F7]">Ekspresi/Gestur:</strong>{' '}
                    {lightboxPanel.expressionAndGesture}
                  </p>
                ) : null}
                {lightboxPanel.characterPosition ? (
                  <p className="text-[#9CA3AF]">
                    <strong className="text-[#F4F5F7]">Posisi Frame:</strong>{' '}
                    {lightboxPanel.characterPosition}
                  </p>
                ) : null}
              </div>

              <div className="p-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-2">
                <p className="text-[#E5A93C] font-semibold">Lokasi, Cahaya & Dialog</p>
                <p className="text-[#9CA3AF]">
                  <strong className="text-[#F4F5F7]">Lokasi:</strong> {lightboxPanel.location || '-'} (
                  {lightboxPanel.timeLabel || '-'})
                </p>
                <p className="text-[#9CA3AF]">
                  <strong className="text-[#F4F5F7]">Pencahayaan:</strong>{' '}
                  {lightboxPanel.lighting || '-'}
                </p>
                <p className="text-[#9CA3AF]">
                  <strong className="text-[#F4F5F7]">Suasana:</strong>{' '}
                  {lightboxPanel.atmosphere || '-'}
                </p>
                <p className="text-[#9CA3AF]">
                  <strong className="text-[#F4F5F7]">Karakter:</strong>{' '}
                  {(lightboxPanel.characters || []).join(', ') || '-'}
                </p>
                {lightboxPanel.dialogue || lightboxPanel.dialogueCue ? (
                  <p className="text-[#C4B5FD] italic">
                    “{lightboxPanel.dialogue || lightboxPanel.dialogueCue}”
                  </p>
                ) : null}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#9CA3AF]">Visual Prompt</span>
                <button
                  type="button"
                  onClick={() => void copyText('modal_vp', lightboxPanel.visualPrompt)}
                  className="inline-flex items-center gap-1 text-xs text-[#E5A93C] hover:underline"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin Prompt
                </button>
              </div>
              <p className="font-mono text-[11px] text-[#F4F5F7] leading-relaxed">
                {lightboxPanel.visualPrompt}
              </p>
              {lightboxPanel.negativePrompt ? (
                <p className="font-mono text-[11px] text-[#6B7280] leading-relaxed">
                  Negative: {lightboxPanel.negativePrompt}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
