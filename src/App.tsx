import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clapperboard,
  Film,
  LayoutGrid,
  Loader2,
  Menu,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { StudioSidebar } from './components/StudioSidebar';
import { ProductionFormView } from './components/ProductionFormView';
import { ProductionResultView } from './components/ProductionResultView';
import { StudioFeatureViews, type StudioJumpContext } from './components/StudioFeatureViews';
import { GalleryProductionView } from './components/GalleryProductionView';
import { KotlinExportView, ProjectsView } from './components/ProjectsAndKotlinViews';
import { StorageStatusBanner } from './components/StorageStatusBanner';
import {
  apiGenerateFullFilm,
  apiGenerateVoice,
  createNewProject,
  fetchCapabilities,
  toStudioErrorDetails,
} from './services/studioApi';
import {
  StudioStorageError,
  studioStorage,
  type StorageCapacityInfo,
  type StorageStatusAlert,
} from './services/studioStorage';
import type {
  FilmFormInput,
  FilmProject,
  NavSection,
  StudioCapabilities,
  StudioErrorDetails,
  VoiceTrack,
} from './types/studio';

const SECTION_LABELS: Record<NavSection, string> = {
  'production-form': 'Formulir Produksi',
  'production-result': 'Hasil Produksi',
  story: '01. Story Generator',
  script: '02. Script Writer',
  characters: '03. Character Studio',
  consistency: '04. Character Consistency',
  scenes: '05. Scene Generator',
  image: '06. AI Visual Production',
  video: '07. Video Generator',
  voice: '08. Voice Studio',
  storyboard: '09. Storyboard Visual',
  gallery: '10. Galeri Produksi',
  projects: '11. My Projects',
  'kotlin-export': 'Kode Kotlin Compose',
};

export default function App() {
  const [projects, setProjects] = useState<FilmProject[]>(() => [createNewProject()]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [isStorageLoading, setIsStorageLoading] = useState(true);
  const [storageCapacity, setStorageCapacity] = useState<StorageCapacityInfo | null>(null);
  const [storageAlert, setStorageAlert] = useState<StorageStatusAlert | null>(null);

  const [activeSection, setActiveSection] = useState<NavSection>('production-form');
  const [jumpContext, setJumpContext] = useState<StudioJumpContext | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<StudioCapabilities | null>(null);
  const [isGeneratingFilm, setIsGeneratingFilm] = useState(false);
  const [generationStep, setGenerationStep] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<StudioErrorDetails | null>(null);
  const [resultError, setResultError] = useState<StudioErrorDetails | null>(null);
  const [synthesizingScene, setSynthesizingScene] = useState<number | null>(null);
  const lastDialogueRetryRef = useRef<(() => void) | null>(null);

  const isHydratedRef = useRef(false);
  const latestProjectsRef = useRef<FilmProject[]>(projects);
  const activeProjectIdRef = useRef<string>(activeProjectId);
  const pendingSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dirtyProjectIdsRef = useRef<Set<string>>(new Set());

  activeProjectIdRef.current = activeProjectId;

  const persistProjectImmediate = useCallback(async (project: FilmProject) => {
    const existingTimer = pendingSaveTimersRef.current.get(project.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      pendingSaveTimersRef.current.delete(project.id);
    }
    dirtyProjectIdsRef.current.delete(project.id);

    try {
      await studioStorage.saveProjectToDb(project);
      const cap = await studioStorage.estimateStorageCapacity();
      setStorageCapacity(cap);

      if (cap.isNearFull) {
        setStorageAlert({
          level: 'warning',
          code: 'NEAR_FULL',
          capacity: cap,
          message: `Penyimpanan browser hampir penuh (${cap.percentUsed}% terpakai). Sebaiknya unduh atau rapikan aset visual/audio lama agar proyek berikutnya tetap tersimpan lancar.`,
        });
      } else {
        setStorageAlert((prev) =>
          prev &&
          (prev.code === 'NEAR_FULL' ||
            prev.code === 'QUOTA_EXCEEDED' ||
            prev.code === 'WRITE_FAILED')
            ? null
            : prev
        );
      }
    } catch (err) {
      const storageErr =
        err instanceof StudioStorageError
          ? err
          : new StudioStorageError(
              'WRITE_FAILED',
              err instanceof Error ? err.message : 'Gagal menyimpan proyek ke IndexedDB.'
            );
      setStorageAlert({
        level: 'error',
        code: storageErr.code,
        message: storageErr.message,
      });
    }
  }, []);

  const schedulePersistProject = useCallback(
    (prev: FilmProject, next: FilmProject) => {
      if (!isHydratedRef.current) return;

      const mediaOrStructureChanged =
        prev.characters !== next.characters ||
        prev.storyboard !== next.storyboard ||
        prev.scenes !== next.scenes ||
        prev.visualAssets !== next.visualAssets ||
        prev.voiceTracks !== next.voiceTracks ||
        prev.consistency !== next.consistency ||
        prev.visualPrompts !== next.visualPrompts ||
        prev.story !== next.story ||
        prev.script !== next.script;

      const existingTimer = pendingSaveTimersRef.current.get(next.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      dirtyProjectIdsRef.current.add(next.id);

      const delayMs = mediaOrStructureChanged ? 0 : 350;
      const timer = setTimeout(() => {
        pendingSaveTimersRef.current.delete(next.id);
        const current =
          latestProjectsRef.current.find((p) => p.id === next.id) || next;
        void persistProjectImmediate(current);
      }, delayMs);

      pendingSaveTimersRef.current.set(next.id, timer);
    },
    [persistProjectImmediate]
  );

  const flushPendingSaves = useCallback(() => {
    if (!isHydratedRef.current || dirtyProjectIdsRef.current.size === 0) return;
    const idsToFlush = Array.from(dirtyProjectIdsRef.current);
    for (const id of idsToFlush) {
      const timer = pendingSaveTimersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        pendingSaveTimersRef.current.delete(id);
      }
      const proj = latestProjectsRef.current.find((p) => p.id === id);
      if (proj) {
        void persistProjectImmediate(proj);
      }
    }
  }, [persistProjectImmediate]);

  useEffect(() => {
    let cancelled = false;
    studioStorage
      .initializeStudioStorage(createNewProject)
      .then((res) => {
        if (cancelled) return;
        latestProjectsRef.current = res.projects;
        setProjects(res.projects);
        const resolvedActiveId = res.activeProjectId || res.projects[0]?.id || '';
        activeProjectIdRef.current = resolvedActiveId;
        setActiveProjectId(resolvedActiveId);
        setStorageCapacity(res.capacity);
        if (res.alert) {
          setStorageAlert(res.alert);
        } else if (res.migratedCount > 0) {
          setStorageAlert({
            level: 'info',
            code: 'MIGRATION_DONE',
            capacity: res.capacity,
            message: `${res.migratedCount} proyek lama dari localStorage berhasil dimigrasikan ke IndexedDB dan telah diverifikasi keutuhannya.`,
          });
        }
        isHydratedRef.current = true;
        setIsStorageLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : 'Gagal menginisialisasi penyimpanan IndexedDB.';
        setStorageAlert({
          level: 'error',
          code: 'READ_FAILED',
          message: msg,
        });
        isHydratedRef.current = true;
        setIsStorageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSaves();
      }
    };
    const handlePageHide = () => {
      flushPendingSaves();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      for (const timer of pendingSaveTimersRef.current.values()) {
        clearTimeout(timer);
      }
      pendingSaveTimersRef.current.clear();
    };
  }, [flushPendingSaves]);

  useEffect(() => {
    fetchCapabilities()
      .then(setCapabilities)
      .catch(() => setCapabilities(null));
  }, []);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0],
    [projects, activeProjectId]
  );

  const updateActiveProject = useCallback(
    (updater: (prev: FilmProject) => FilmProject) => {
      setProjects((prevList) => {
        const targetId = activeProjectIdRef.current || prevList[0]?.id;
        let prevTarget: FilmProject | null = null;
        let nextTarget: FilmProject | null = null;
        const nextList = prevList.map((proj) => {
          if (proj.id !== targetId) return proj;
          prevTarget = proj;
          nextTarget = updater(proj);
          return nextTarget;
        });
        latestProjectsRef.current = nextList;
        if (prevTarget && nextTarget) {
          schedulePersistProject(prevTarget, nextTarget);
        }
        return nextList;
      });
    },
    [schedulePersistProject]
  );

  const handleNavigateWithContext = useCallback(
    (section: NavSection, ctx?: StudioJumpContext) => {
      if (ctx) {
        setJumpContext(ctx);
      }
      setActiveSection(section);
    },
    []
  );

  const clearJumpContext = useCallback(() => {
    setJumpContext(null);
  }, []);

  const handleFormChange = (nextInput: FilmFormInput) => {
    updateActiveProject((prev) => ({
      ...prev,
      input: nextInput,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleGenerateFilm = async () => {
    if (!activeProject.input.title.trim() || !activeProject.input.premise.trim()) {
      setActiveSection('production-form');
      setGenerationError({
        category: 'BAD_REQUEST',
        message: 'Judul film dan cerita/premis wajib diisi sebelum menekan Generate Film.',
        retryable: false,
      });
      return;
    }

    setGenerationError(null);
    setIsGeneratingFilm(true);
    setGenerationStep(
      'Menyusun cerita, karakter, konsistensi visual, adegan, naskah, dan storyboard melalui Gemini...'
    );

    try {
      const result = await apiGenerateFullFilm(activeProject.input, {
        existingCharacters: activeProject.characters,
        existingConsistency: activeProject.consistency,
      });
      updateActiveProject((prev) => {
        const existingCharsByName = new Map(
          prev.characters.map((c) => [c.name.toLowerCase(), c])
        );
        const existingConsistencyByName = new Map(
          prev.consistency.map((g) => [g.characterName.toLowerCase(), g])
        );
        const existingSceneImages = new Map(
          prev.scenes.map((s) => [
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
        const existingStoryboardImages = new Map(
          prev.storyboard.map((sb) => [
            `${sb.sceneNumber}_${sb.frameNumber}`,
            {
              imageDataUrl: sb.imageDataUrl,
              imageMimeType: sb.imageMimeType,
              imageSource: sb.imageSource,
              imageUpdatedAt: sb.imageUpdatedAt,
            },
          ])
        );
        const mergedChars = result.characters.map((c, idx) => {
          const prevChar = existingCharsByName.get(c.name.toLowerCase());
          return {
            ...c,
            id: c.id || prevChar?.id || `char_${Date.now()}_${idx}`,
            gender: c.gender || prevChar?.gender,
            eyeShape: c.eyeShape || prevChar?.eyeShape,
            noseShape: c.noseShape || prevChar?.noseShape,
            lipShape: c.lipShape || prevChar?.lipShape,
            skinTone: c.skinTone || prevChar?.skinTone,
            height: c.height || prevChar?.height,
            bodyBuild: c.bodyBuild || prevChar?.bodyBuild,
            physicalTraits: c.physicalTraits || prevChar?.physicalTraits,
            referenceImageDataUrl: c.referenceImageDataUrl || prevChar?.referenceImageDataUrl,
            referenceImageMimeType: c.referenceImageMimeType || prevChar?.referenceImageMimeType,
            referenceImageSource: c.referenceImageSource || prevChar?.referenceImageSource,
            visualPromptAnchor: c.visualPromptAnchor || prevChar?.visualPromptAnchor,
            referenceSheet: c.referenceSheet || prevChar?.referenceSheet,
          };
        });
        const mergedCharByName = new Map(
          mergedChars.map((c) => [c.name.toLowerCase(), c])
        );
        const mergedConsistency = result.consistency.map((g) => {
          const matchedChar = mergedCharByName.get(g.characterName.toLowerCase());
          const prevGuide = existingConsistencyByName.get(g.characterName.toLowerCase());
          return {
            ...g,
            characterId: matchedChar?.id || prevGuide?.characterId,
            skinTone: g.skinTone || matchedChar?.skinTone,
            heightAndBody:
              g.heightAndBody ||
              [matchedChar?.height, matchedChar?.bodyBuild].filter(Boolean).join(' · ') ||
              undefined,
            specialTraits: g.specialTraits || matchedChar?.physicalTraits,
            locked: prevGuide?.locked ?? true,
            locks: prevGuide?.locks ?? { face: true, hair: true, body: true, costume: true },
            referenceImageDataUrl:
              g.referenceImageDataUrl || matchedChar?.referenceImageDataUrl,
          };
        });
        const mergedScenes = result.scenes.map((s) => {
          const prevScene = existingSceneImages.get(s.sceneNumber);
          return prevScene?.imageDataUrl
            ? { ...s, ...prevScene }
            : s;
        });
        const mergedStoryboard = result.storyboard.map((sb) => {
          const prevSb = existingStoryboardImages.get(`${sb.sceneNumber}_${sb.frameNumber}`);
          const sceneImg = existingSceneImages.get(sb.sceneNumber);
          const imageDataUrl = sb.imageDataUrl || prevSb?.imageDataUrl || sceneImg?.imageDataUrl;
          return imageDataUrl
            ? {
                ...sb,
                imageDataUrl,
                imageMimeType: prevSb?.imageMimeType || sceneImg?.imageMimeType,
                imageSource: prevSb?.imageSource || sceneImg?.imageSource,
                imageUpdatedAt: prevSb?.imageUpdatedAt || sceneImg?.imageUpdatedAt,
              }
            : sb;
        });
        return {
          ...prev,
          story: result.story,
          characters: mergedChars,
          consistency: mergedConsistency,
          scenes: mergedScenes,
          script: result.script,
          storyboard: mergedStoryboard,
          visualAssets: prev.visualAssets || [],
          lastGeneratedAt: result.generatedAt,
          updatedAt: new Date().toISOString(),
        };
      });
      setActiveSection('production-result');
    } catch (err) {
      setGenerationError(toStudioErrorDetails(err));
      setActiveSection('production-form');
    } finally {
      setIsGeneratingFilm(false);
      setGenerationStep(null);
    }
  };

  const handleSynthesizeSceneDialogue = async (
    sceneNumber: number,
    text: string,
    character: string
  ) => {
    lastDialogueRetryRef.current = () => {
      void handleSynthesizeSceneDialogue(sceneNumber, text, character);
    };
    setSynthesizingScene(sceneNumber);
    setResultError(null);
    try {
      const res = await apiGenerateVoice({
        mode: 'single',
        text,
        voiceName: 'Kore',
        style: `Pengisi suara untuk karakter ${character}, dramatis dan alami`,
      });
      const newTrack: VoiceTrack = {
        id: `voice_scene_${sceneNumber}_${Date.now()}`,
        label: `Dialog Adegan ${sceneNumber}`,
        mode: 'single',
        voiceName: 'Kore',
        scriptText: text,
        audioBase64Wav: res.audioBase64Wav,
        mimeType: res.mimeType,
        createdAt: new Date().toISOString(),
      };
      updateActiveProject((prev) => ({
        ...prev,
        voiceTracks: [newTrack, ...prev.voiceTracks],
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setResultError(toStudioErrorDetails(err));
    } finally {
      setSynthesizingScene(null);
    }
  };

  const handleSelectProject = (id: string) => {
    activeProjectIdRef.current = id;
    setActiveProjectId(id);
    if (isHydratedRef.current) {
      void studioStorage.saveActiveProjectIdToDb(id).catch((err) => {
        const storageErr =
          err instanceof StudioStorageError
            ? err
            : new StudioStorageError('WRITE_FAILED', 'Gagal menyimpan pilihan proyek aktif.');
        setStorageAlert({
          level: 'error',
          code: storageErr.code,
          message: storageErr.message,
        });
      });
    }
  };

  const handleCreateProject = () => {
    const fresh = createNewProject();
    setProjects((prev) => {
      const next = [fresh, ...prev];
      latestProjectsRef.current = next;
      return next;
    });
    activeProjectIdRef.current = fresh.id;
    setActiveProjectId(fresh.id);
    setActiveSection('production-form');
    setGenerationError(null);
    setResultError(null);
    if (isHydratedRef.current) {
      void persistProjectImmediate(fresh);
      void studioStorage.saveActiveProjectIdToDb(fresh.id).catch(() => {});
    }
  };

  const handleDeleteProject = (id: string) => {
    const timer = pendingSaveTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      pendingSaveTimersRef.current.delete(id);
    }
    dirtyProjectIdsRef.current.delete(id);

    let replacementFallback: FilmProject | null = null;
    let nextActiveId = activeProjectIdRef.current;

    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== id);
      if (remaining.length === 0) {
        replacementFallback = createNewProject();
        nextActiveId = replacementFallback.id;
        latestProjectsRef.current = [replacementFallback];
        return [replacementFallback];
      }
      if (id === activeProject.id) {
        nextActiveId = remaining[0].id;
      }
      latestProjectsRef.current = remaining;
      return remaining;
    });

    activeProjectIdRef.current = nextActiveId;
    setActiveProjectId(nextActiveId);

    if (isHydratedRef.current) {
      void (async () => {
        try {
          await studioStorage.deleteProjectFromDb(id);
          if (replacementFallback) {
            await studioStorage.saveProjectToDb(replacementFallback);
          }
          await studioStorage.saveActiveProjectIdToDb(nextActiveId);
          const cap = await studioStorage.estimateStorageCapacity();
          setStorageCapacity(cap);
          setStorageAlert((prev) =>
            prev &&
            (prev.code === 'QUOTA_EXCEEDED' ||
              (prev.code === 'NEAR_FULL' && !cap.isNearFull))
              ? null
              : prev
          );
        } catch (err) {
          const storageErr =
            err instanceof StudioStorageError
              ? err
              : new StudioStorageError(
                  'WRITE_FAILED',
                  'Gagal menghapus proyek dari IndexedDB.'
                );
          setStorageAlert({
            level: 'error',
            code: storageErr.code,
            message: storageErr.message,
          });
        }
      })();
    }
  };

  const hasProductionResult = Boolean(
    activeProject.story ||
      activeProject.characters.length ||
      activeProject.scenes.length ||
      activeProject.script.length ||
      activeProject.storyboard.length ||
      activeProject.visualPrompts.length ||
      activeProject.voiceTracks.length ||
      (activeProject.visualAssets && activeProject.visualAssets.length > 0)
  );

  return (
    <div className="min-h-screen bg-[#0A0B0E] text-[#F4F5F7] flex">
      <StudioSidebar
        activeSection={activeSection}
        onSelectSection={(sec) => handleNavigateWithContext(sec)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        projectTitle={activeProject.input.title}
        hasProductionResult={hasProductionResult}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 sm:h-16 px-4 sm:px-8 border-b border-white/[0.08] bg-[#0A0B0E]/95 backdrop-blur-sm lg:sticky lg:top-0 z-30 flex items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Buka navigasi studio"
              className="lg:hidden p-2 rounded-lg text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.06] shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-[#6B7280] hidden sm:inline whitespace-nowrap">AI FILM STUDIO</span>
              <span className="text-[#6B7280] hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-medium text-[#F4F5F7] truncate">
                {SECTION_LABELS[activeSection]}
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              disabled={isGeneratingFilm}
              onClick={() => {
                if (activeSection !== 'production-form') {
                  if (!activeProject.input.title.trim() || !activeProject.input.premise.trim()) {
                    setActiveSection('production-form');
                    return;
                  }
                }
                void handleGenerateFilm();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 min-h-[40px]"
            >
              {isGeneratingFilm ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproduksi...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Film</span>
                </>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 pb-20 lg:pb-8">
          {storageAlert ? (
            <div className="max-w-5xl mx-auto mb-5">
              <StorageStatusBanner
                alert={storageAlert}
                onDismiss={() => setStorageAlert(null)}
              />
            </div>
          ) : null}

          {isStorageLoading ? (
            <div className="max-w-3xl mx-auto py-16 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-7 h-7 animate-spin text-[#E5A93C]" />
              <p className="text-sm font-medium text-[#F4F5F7]">
                Memuat proyek &amp; memverifikasi penyimpanan IndexedDB...
              </p>
              <p className="text-xs text-[#9CA3AF]">
                Memastikan seluruh karakter, foto referensi, storyboard, dan audio tetap utuh.
              </p>
            </div>
          ) : activeSection === 'production-form' ? (
            <ProductionFormView
              input={activeProject.input}
              onChange={handleFormChange}
              onGenerateFilm={() => void handleGenerateFilm()}
              isGenerating={isGeneratingFilm}
              generationStep={generationStep}
              error={generationError}
              hasExistingResult={hasProductionResult}
              onViewResults={() => setActiveSection('production-result')}
            />
          ) : activeSection === 'production-result' ? (
            <ProductionResultView
              project={activeProject}
              onNavigate={(sec) => handleNavigateWithContext(sec)}
              onSynthesizeDialogue={handleSynthesizeSceneDialogue}
              synthesizingScene={synthesizingScene}
              error={resultError}
              onRetryError={lastDialogueRetryRef.current ? () => lastDialogueRetryRef.current?.() : undefined}
            />
          ) : activeSection === 'gallery' ? (
            <GalleryProductionView
              project={activeProject}
              onUpdateProject={updateActiveProject}
              onNavigate={(sec) => handleNavigateWithContext(sec)}
            />
          ) : activeSection === 'projects' ? (
            <ProjectsView
              projects={projects}
              activeProjectId={activeProject.id}
              storageCapacity={storageCapacity}
              onSelectProject={handleSelectProject}
              onCreateProject={handleCreateProject}
              onDeleteProject={handleDeleteProject}
              onNavigate={(sec) => handleNavigateWithContext(sec)}
            />
          ) : activeSection === 'kotlin-export' ? (
            <KotlinExportView />
          ) : (
            <StudioFeatureViews
              section={activeSection}
              project={activeProject}
              capabilities={capabilities}
              jumpContext={jumpContext}
              onClearJumpContext={clearJumpContext}
              onUpdateProject={updateActiveProject}
              onNavigateWithContext={handleNavigateWithContext}
            />
          )}
        </main>

        {/* Navigasi Bawah Mobile Android (Thumb-Friendly, tinggi 56px) */}
        <nav
          aria-label="Navigasi Cepat Android"
          className="lg:hidden fixed bottom-0 inset-x-0 h-14 bg-[#12141A]/95 backdrop-blur-md border-t border-white/[0.08] z-40 grid grid-cols-5"
        >
          <MobileTabButton
            icon={Clapperboard}
            label="Produksi"
            active={activeSection === 'production-form'}
            onClick={() => handleNavigateWithContext('production-form')}
          />
          <MobileTabButton
            icon={UserCheck}
            label="Karakter"
            active={activeSection === 'characters' || activeSection === 'consistency'}
            onClick={() => handleNavigateWithContext('characters')}
          />
          <MobileTabButton
            icon={Film}
            label="Adegan"
            active={activeSection === 'scenes' || activeSection === 'storyboard'}
            onClick={() => handleNavigateWithContext('scenes')}
          />
          <MobileTabButton
            icon={LayoutGrid}
            label="Hasil"
            active={activeSection === 'production-result'}
            onClick={() => handleNavigateWithContext('production-result')}
          />
          <MobileTabButton
            icon={Menu}
            label="Semua"
            active={mobileOpen}
            onClick={() => setMobileOpen(true)}
          />
        </nav>
      </div>
    </div>
  );
}

function MobileTabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
        active ? 'text-[#E5A93C]' : 'text-[#9CA3AF]'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate max-w-[64px]">{label}</span>
    </button>
  );
}
