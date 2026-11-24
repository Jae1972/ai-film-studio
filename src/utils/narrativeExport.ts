import type {
  ConsistencyGuide,
  FilmProject,
  GeneratedCharacter,
  GeneratedScene,
  ScriptBlock,
  StoryResult,
} from '../types/studio';
import {
  buildCharacterIdentityAnchor,
  buildForbiddenChangesText,
  resolveConsistencyLocks,
} from './characterConsistency';

export function parseVideoDurationSeconds(duration?: string): number {
  const raw = (duration || '60 detik').trim().toLowerCase();
  const numMatch = raw.match(/(\d+(?:[.,]\d+)?)/);
  const val = numMatch ? Number(numMatch[1].replace(',', '.')) : 60;
  if (!Number.isFinite(val) || val <= 0) return 60;
  if (raw.includes('menit') || raw.includes('min')) {
    return Math.round(val * 60);
  }
  return Math.round(val);
}

export interface ResolvedCharacterNarrativeContext {
  character: GeneratedCharacter;
  guide?: ConsistencyGuide;
  isLocked: boolean;
  identityAnchor: string;
  forbiddenChanges: string;
}

export function buildEffectiveCharacterContext(
  characters: GeneratedCharacter[],
  consistency: ConsistencyGuide[]
): ResolvedCharacterNarrativeContext[] {
  const guideById = new Map(
    consistency.filter((g) => g.characterId).map((g) => [g.characterId!, g])
  );
  const guideByName = new Map(
    consistency.map((g) => [g.characterName.trim().toLowerCase(), g])
  );

  return characters.map((char, idx) => {
    const guide =
      guideById.get(char.id) || guideByName.get(char.name.trim().toLowerCase());
    const locks = resolveConsistencyLocks(guide);
    const isLocked = guide ? guide.locked !== false : true;
    const identityAnchor =
      isLocked && guide?.promptAnchor?.trim()
        ? guide.promptAnchor.trim()
        : buildCharacterIdentityAnchor(
            char,
            locks,
            guide?.identitySeed || `SEED-${String(idx + 1).padStart(2, '0')}`
          );
    const forbiddenChanges =
      guide?.forbiddenChanges?.trim() || buildForbiddenChangesText(locks, isLocked);

    return {
      character: char,
      guide,
      isLocked,
      identityAnchor,
      forbiddenChanges,
    };
  });
}

export function buildEffectiveConsistencyPayload(
  characters: GeneratedCharacter[],
  consistency: ConsistencyGuide[]
): ConsistencyGuide[] {
  const contexts = buildEffectiveCharacterContext(characters, consistency);
  const result: ConsistencyGuide[] = [];

  for (const ctx of contexts) {
    if (!ctx.isLocked) continue;
    if (ctx.guide) {
      result.push({
        ...ctx.guide,
        characterId: ctx.guide.characterId || ctx.character.id,
        promptAnchor: ctx.identityAnchor,
        forbiddenChanges: ctx.forbiddenChanges,
      });
    } else {
      result.push({
        characterId: ctx.character.id,
        characterName: ctx.character.name,
        identitySeed: `SEED-${String(result.length + 1).padStart(2, '0')}`,
        facialFeatures: ctx.character.facialDescription || ctx.character.appearance,
        hairAndBuild: [ctx.character.hairDescription, ctx.character.height, ctx.character.bodyBuild]
          .filter(Boolean)
          .join(' · '),
        signatureOutfit: ctx.character.costume,
        colorPaletteHex: ['#181B22', '#8B5CF6', '#3B82F6'],
        forbiddenChanges: ctx.forbiddenChanges,
        promptAnchor: ctx.identityAnchor,
        locked: true,
        locks: resolveConsistencyLocks(),
      });
    }
  }

  return result;
}

export function buildSlugline(
  interiorExterior?: string,
  location?: string,
  timeOfDay?: string
): string {
  const ie = (interiorExterior || 'INT').trim().toUpperCase();
  const loc = (location || 'LOKASI').trim().toUpperCase();
  const tod = (timeOfDay || 'MALAM').trim().toUpperCase();
  return `${ie}. ${loc} - ${tod}`;
}

export function formatStoryTxt(project: FilmProject, story: StoryResult | null): string {
  const title = story?.storyTitle || project.input.title || 'Tanpa Judul';
  const lines: string[] = [
    '========================================',
    `AI FILM STUDIO — DOKUMEN CERITA`,
    '========================================',
    `Judul Cerita   : ${title}`,
    `Genre          : ${project.input.genre}`,
    `Tema           : ${project.input.storyTheme || story?.themes?.join(', ') || '-'}`,
    `Gaya Cerita    : ${project.input.storytellingStyle || project.input.visualStyle || '-'}`,
    `Target Penonton: ${project.input.targetAudience || '-'}`,
    `Bahasa         : ${project.input.storyLanguage || project.input.dialogueLanguage}`,
    `Episode / Durasi: ${project.input.episodeCount} Episode · ${project.input.videoDuration}`,
    '',
  ];

  if (!story) {
    lines.push('Belum ada cerita yang dihasilkan.');
    return lines.join('\n');
  }

  lines.push(
    'LOGLINE:',
    story.logline || '-',
    '',
    'SINOPSIS SINGKAT:',
    story.shortSynopsis || '-',
    '',
    'SINOPSIS LENGKAP:',
    story.fullSynopsis || story.synopsis || '-',
    '',
    'LATAR BELAKANG DUNIA CERITA:',
    story.worldBackground || '-',
    '',
    'KONFLIK UTAMA:',
    story.mainConflict || '-',
    '',
    'KONFLIK PENDUKUNG:',
    story.supportingConflict || '-',
    '',
    'KLIMAKS:',
    story.climax || '-',
    '',
    'PENYELESAIAN CERITA:',
    story.resolution || '-',
    '',
    'ENDING:',
    story.ending || '-',
    '',
    'STRUKTUR TIGA BABAK:',
    `Babak 1: ${story.threeActStructure?.act1 || '-'}`,
    `Babak 2: ${story.threeActStructure?.act2 || '-'}`,
    `Babak 3: ${story.threeActStructure?.act3 || '-'}`,
    '',
    'GARIS BESAR EPISODE:'
  );

  for (const ep of story.episodeOutlines || []) {
    lines.push(
      `- Episode ${ep.episodeNumber}: ${ep.title}`,
      `  Ringkasan : ${ep.summary}`,
      `  Cliffhanger: ${ep.cliffhanger}`
    );
  }

  return lines.join('\n');
}

export function formatScreenplayTxt(project: FilmProject, scriptBlocks?: ScriptBlock[]): string {
  const blocks = scriptBlocks || project.script || [];
  const story = project.story;
  const lines: string[] = [
    `JUDUL: ${story?.storyTitle || project.input.title || 'Tanpa Judul'}`,
    `GENRE: ${project.input.genre} | BAHASA DIALOG: ${project.input.dialogueLanguage} | DURASI TARGET: ${project.input.videoDuration}`,
    '',
  ];

  if (story) {
    lines.push(
      'LOGLINE:',
      story.logline,
      '',
      'SINOPSIS:',
      story.fullSynopsis || story.synopsis,
      ''
    );
  }

  for (const block of blocks) {
    const slug =
      block.slugline?.trim() ||
      buildSlugline(block.interiorExterior, block.location, block.timeOfDay);
    lines.push(`=== ADEGAN ${block.sceneNumber}${block.sceneTitle ? `: ${block.sceneTitle}` : ''} ===`);
    lines.push(slug);
    if (block.characters?.length) {
      lines.push(`KARAKTER: ${block.characters.join(', ')}`);
    }
    if (block.visualDescription) {
      lines.push(`[VISUAL] ${block.visualDescription}`);
    }
    if (block.characterActions || block.action) {
      lines.push(`[AKSI] ${block.characterActions || block.action}`);
    }
    if (block.cameraDirection) {
      lines.push(`[KAMERA] ${block.cameraDirection}`);
    }
    if (block.lighting) {
      lines.push(`[PENCAHAYAAN] ${block.lighting}`);
    }
    if (block.audioMood) {
      lines.push(`[SUASANA AUDIO] ${block.audioMood}`);
    }
    lines.push('');
    for (const dlg of block.dialogues || []) {
      lines.push(`  ${dlg.character.toUpperCase()}`);
      const expr = [dlg.expression, dlg.parenthetical].filter(Boolean).join(' · ');
      if (expr) {
        lines.push(`  (${expr})`);
      }
      lines.push(`  ${dlg.line}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatScenesTxt(project: FilmProject, scenes?: GeneratedScene[]): string {
  const list = scenes || project.scenes || [];
  const lines: string[] = [
    `SCENE BREAKDOWN — ${project.input.title || 'Tanpa Judul'}`,
    `Target Jumlah Adegan: ${project.input.sceneCount} | Target Durasi: ${project.input.videoDuration}`,
    '',
  ];

  for (const s of list) {
    lines.push(
      `[${s.sceneId || `SCN-${String(s.sceneNumber).padStart(3, '0')}`}] Adegan ${s.sceneNumber}: ${s.heading}`,
      `Durasi     : ${s.duration || `${s.estimatedSeconds} detik`} (${s.estimatedSeconds}s)`,
      `Lokasi     : ${s.location} (${s.timeOfDay})`,
      `Karakter   : ${s.charactersInvolved.join(', ') || '-'}`,
      `Aksi Utama : ${s.mainAction || s.actionSummary || '-'}`,
      `Dialog     : ${s.dialogue || '-'}`,
      `Visual     : ${s.visualNeeds || s.lighting || '-'} | Kamera: ${s.cameraMovement}`,
      `Audio      : ${s.audioNeeds || s.mood || '-'}`,
      `Transisi   : ${s.transitionToNext || 'Cut ke adegan berikutnya'}`,
      ''
    );
  }

  return lines.join('\n');
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function reindexScenes(scenes: GeneratedScene[]): GeneratedScene[] {
  return scenes.map((scene, index) => {
    const newNumber = index + 1;
    const autoId = `SCN-${String(newNumber).padStart(3, '0')}`;
    const hasAutoId = !scene.sceneId || /^SCN-\d+$/i.test(scene.sceneId.trim());
    return {
      ...scene,
      sceneNumber: newNumber,
      sceneId: hasAutoId ? autoId : scene.sceneId,
      duration: scene.duration || `${scene.estimatedSeconds || 15} detik`,
    };
  });
}

export function moveSceneInList(
  scenes: GeneratedScene[],
  index: number,
  direction: 'up' | 'down'
): GeneratedScene[] {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= scenes.length || targetIndex < 0 || targetIndex >= scenes.length) {
    return scenes;
  }
  const copy = [...scenes];
  const [item] = copy.splice(index, 1);
  copy.splice(targetIndex, 0, item);
  return reindexScenes(copy);
}
