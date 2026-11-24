import type {
  ConsistencyGuide,
  FilmProject,
  GeneratedCharacter,
  GeneratedScene,
  StoryboardAspectRatio,
  StoryboardFrame,
  StoryboardShotSize,
} from '../types/studio';
import { formatActiveConsistencyForPrompt } from './characterConsistency';

export const STORYBOARD_PANEL_COUNTS = [3, 4, 5, 6, 8] as const;

export const STORYBOARD_SHOT_SIZES: StoryboardShotSize[] = [
  'Extreme Wide',
  'Wide',
  'Medium',
  'Close-Up',
  'Extreme Close-Up',
];

export const STORYBOARD_ASPECT_RATIOS: StoryboardAspectRatio[] = ['16:9', '9:16', '1:1'];

export function normalizeShotSize(raw?: string): StoryboardShotSize {
  const lower = (raw || '').trim().toLowerCase();
  if (!lower) return 'Medium';
  if (lower.includes('extreme wide') || lower === 'ews' || lower.includes('establishing')) {
    return 'Extreme Wide';
  }
  if (lower.includes('extreme close') || lower === 'ecu') {
    return 'Extreme Close-Up';
  }
  if (lower.includes('close') || lower === 'cu' || lower === 'mcu') {
    return 'Close-Up';
  }
  if (lower.includes('wide') || lower === 'ws' || lower === 'ls' || lower.includes('full shot')) {
    return 'Wide';
  }
  return 'Medium';
}

export function resolveSceneId(sceneNumber: number, scenes: GeneratedScene[], existingSceneId?: string): string {
  if (existingSceneId && existingSceneId.trim()) return existingSceneId.trim();
  const matched = scenes.find((s) => s.sceneNumber === sceneNumber);
  if (matched?.sceneId && matched.sceneId.trim()) return matched.sceneId.trim();
  return `SCN-${String(Math.max(1, sceneNumber)).padStart(3, '0')}`;
}

export function reindexStoryboardFrames(
  frames: StoryboardFrame[],
  scenes: GeneratedScene[] = []
): StoryboardFrame[] {
  return frames.map((frame, index) => ({
    ...frame,
    id: frame.id || `sb_${frame.sceneNumber}_${index + 1}_${Date.now().toString(36)}`,
    frameNumber: index + 1,
    sceneId: resolveSceneId(frame.sceneNumber, scenes, frame.sceneId),
    shotType: normalizeShotSize(frame.shotType),
    aspectRatio: frame.aspectRatio || '16:9',
  }));
}

export function moveStoryboardFrame(
  frames: StoryboardFrame[],
  targetFrameNumber: number,
  direction: 'up' | 'down',
  sceneFilter?: number | 'all',
  scenes: GeneratedScene[] = []
): StoryboardFrame[] {
  const currentIdx = frames.findIndex((f) => f.frameNumber === targetFrameNumber);
  if (currentIdx === -1) return frames;

  let swapIdx = -1;
  if (sceneFilter && sceneFilter !== 'all') {
    const step = direction === 'up' ? -1 : 1;
    for (let i = currentIdx + step; i >= 0 && i < frames.length; i += step) {
      if (frames[i].sceneNumber === sceneFilter) {
        swapIdx = i;
        break;
      }
    }
  } else {
    const candidate = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (candidate >= 0 && candidate < frames.length) {
      swapIdx = candidate;
    }
  }

  if (swapIdx === -1) return frames;

  const copy = [...frames];
  const temp = copy[currentIdx];
  copy[currentIdx] = copy[swapIdx];
  copy[swapIdx] = temp;
  return reindexStoryboardFrames(copy, scenes);
}

export function mergeSceneStoryboardFrames(
  existingFrames: StoryboardFrame[],
  newSceneFrames: StoryboardFrame[],
  sceneNumber: number,
  scenes: GeneratedScene[] = []
): StoryboardFrame[] {
  const before: StoryboardFrame[] = [];
  const after: StoryboardFrame[] = [];
  let passedTarget = false;

  for (const frame of existingFrames) {
    if (frame.sceneNumber === sceneNumber) {
      passedTarget = true;
      continue;
    }
    if (!passedTarget && frame.sceneNumber < sceneNumber) {
      before.push(frame);
    } else {
      after.push(frame);
    }
  }

  const normalizedIncoming = newSceneFrames.map((f, idx) => ({
    ...f,
    id: f.id || `sb_${sceneNumber}_${idx + 1}_${Date.now().toString(36)}`,
    sceneNumber,
    sceneId: resolveSceneId(sceneNumber, scenes, f.sceneId),
    shotType: normalizeShotSize(f.shotType),
    aspectRatio: f.aspectRatio || '16:9',
  }));

  return reindexStoryboardFrames([...before, ...normalizedIncoming, ...after], scenes);
}

export function replaceSingleStoryboardFrame(
  existingFrames: StoryboardFrame[],
  targetFrameNumber: number,
  regeneratedFrame: StoryboardFrame,
  scenes: GeneratedScene[] = []
): StoryboardFrame[] {
  const updated = existingFrames.map((frame) => {
    if (frame.frameNumber !== targetFrameNumber) return frame;
    return {
      ...regeneratedFrame,
      id: frame.id || regeneratedFrame.id || `sb_${frame.sceneNumber}_${frame.frameNumber}`,
      frameNumber: frame.frameNumber,
      sceneNumber: frame.sceneNumber,
      sceneId: resolveSceneId(frame.sceneNumber, scenes, regeneratedFrame.sceneId || frame.sceneId),
      shotType: normalizeShotSize(regeneratedFrame.shotType),
      aspectRatio: regeneratedFrame.aspectRatio || frame.aspectRatio || '16:9',
      imageDataUrl: regeneratedFrame.imageDataUrl ?? frame.imageDataUrl,
      imageMimeType: regeneratedFrame.imageMimeType ?? frame.imageMimeType,
      imageSource: regeneratedFrame.imageSource ?? frame.imageSource,
      imageUpdatedAt: regeneratedFrame.imageUpdatedAt ?? frame.imageUpdatedAt,
    };
  });
  return reindexStoryboardFrames(updated, scenes);
}

export function resolvePanelCharacters(
  panel: StoryboardFrame,
  allCharacters: GeneratedCharacter[]
): GeneratedCharacter[] {
  const idSet = new Set(panel.characterIds || []);
  const nameSet = new Set((panel.characters || []).map((n) => n.trim().toLowerCase()));
  return allCharacters.filter(
    (c) => idSet.has(c.id) || nameSet.has(c.name.trim().toLowerCase())
  );
}

export function injectAnchorsIntoPanelPrompt(
  panel: StoryboardFrame,
  allCharacters: GeneratedCharacter[],
  consistency: ConsistencyGuide[]
): string {
  const selectedChars = resolvePanelCharacters(panel, allCharacters);
  const guides = formatActiveConsistencyForPrompt(consistency, selectedChars.length ? selectedChars : allCharacters);

  const relevantGuides =
    selectedChars.length > 0
      ? guides.filter((g) =>
          selectedChars.some(
            (c) =>
              (g.characterId && g.characterId === c.id) ||
              g.characterName.trim().toLowerCase() === c.name.trim().toLowerCase()
          )
        )
      : [];

  const anchorsBlock = relevantGuides
    .map((g) => `[${g.characterName} Identity Anchor: ${g.promptAnchor}]`)
    .join(' ');

  const basePrompt = (panel.visualPrompt || '').trim();
  if (!anchorsBlock) {
    return basePrompt;
  }

  // Replace previous injected anchor block if present, or prepend/append cleanly
  const cleanedBase = basePrompt.replace(/\n?\[Character Consistency Locks:[\s\S]*$/i, '').trim();
  if (!cleanedBase) {
    return `${panel.visualDescription || 'Cinematic film frame'}, ${panel.shotType || 'Medium'} shot, ${panel.cameraAngle || 'Eye-level'}, ${panel.lighting || 'natural lighting'}. [Character Consistency Locks: ${anchorsBlock}]`;
  }

  const missingAnchor = relevantGuides.some(
    (g) => g.promptAnchor && !cleanedBase.toLowerCase().includes(g.promptAnchor.slice(0, 24).toLowerCase())
  );

  if (!missingAnchor) {
    return basePrompt;
  }

  return `${cleanedBase}\n[Character Consistency Locks: ${anchorsBlock}]`;
}

export function createBlankStoryboardPanel(
  scene: GeneratedScene | undefined,
  nextFrameNumber: number,
  project: FilmProject,
  aspectRatio: StoryboardAspectRatio = '16:9'
): StoryboardFrame {
  const sceneNumber = scene?.sceneNumber || 1;
  const sceneId = resolveSceneId(sceneNumber, project.scenes, scene?.sceneId);
  const charNames = scene?.charactersInvolved || [];
  const matchedChars = project.characters.filter((c) =>
    charNames.some((n) => n.trim().toLowerCase() === c.name.trim().toLowerCase())
  );

  const draft: StoryboardFrame = {
    id: `sb_${sceneNumber}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    frameNumber: nextFrameNumber,
    sceneNumber,
    sceneId,
    timeLabel: scene?.timeOfDay || 'Siang',
    location: scene?.location || 'Lokasi adegan',
    characters: matchedChars.length ? matchedChars.map((c) => c.name) : charNames,
    characterIds: matchedChars.map((c) => c.id),
    visualDescription: scene?.actionSummary || 'Panel visual baru untuk adegan ini.',
    characterAction: scene?.mainAction || scene?.actionSummary || '',
    expressionAndGesture: 'Ekspresi fokus sesuai konteks dramatik adegan',
    characterPosition: 'Subjek berada di sepertiga frame (rule of thirds)',
    dialogue: scene?.dialogue || '',
    shotType: 'Medium',
    cameraAngle: 'Eye-Level',
    cameraMovement: scene?.cameraMovement || 'Static',
    lensMm: '35mm',
    lighting: scene?.lighting || 'Pencahayaan sinematik natural',
    atmosphere: scene?.mood || 'Atmosfer dramatik sinematik',
    compositionNotes: scene?.visualNeeds || 'Komposisi seimbang sesuai arah pandang karakter',
    visualPrompt: '',
    negativePrompt:
      'blurry, low quality, distorted face, extra limbs, inconsistent outfit, watermark, text overlay',
    dialogueCue: scene?.dialogue || '',
    durationSeconds: Math.max(2, Math.round((scene?.estimatedSeconds || 12) / 3)),
    aspectRatio,
  };

  draft.visualPrompt = injectAnchorsIntoPanelPrompt(draft, project.characters, project.consistency);
  return draft;
}

export function formatStoryboardTxt(
  project: FilmProject,
  framesToExport?: StoryboardFrame[]
): string {
  const frames = framesToExport ?? project.storyboard;
  const lines: string[] = [];
  lines.push('AI FILM STUDIO — STORYBOARD PRODUKSI');
  lines.push(`Judul Film   : ${project.input.title || 'Tanpa Judul'}`);
  lines.push(`Genre / Gaya : ${project.input.genre || '-'} · ${project.input.visualStyle || '-'}`);
  lines.push(`Total Panel  : ${frames.length}`);
  lines.push(`Tanggal      : ${new Date().toLocaleString('id-ID')}`);
  lines.push('================================================================');
  lines.push('');

  for (const frame of frames) {
    const matchedScene = project.scenes.find((s) => s.sceneNumber === frame.sceneNumber);
    const sceneId = resolveSceneId(frame.sceneNumber, project.scenes, frame.sceneId);
    const ratio = frame.aspectRatio || '16:9';

    lines.push(
      `PANEL #${frame.frameNumber} | ${sceneId} (Adegan ${frame.sceneNumber}) | ${frame.durationSeconds} detik (${frame.timeLabel || matchedScene?.timeOfDay || '-'}) | Rasio ${ratio}`
    );
    lines.push(
      `Lokasi       : ${frame.location || matchedScene?.location || '-'}`
    );
    lines.push(
      `Karakter     : ${(frame.characters || matchedScene?.charactersInvolved || []).join(', ') || '-'}`
    );
    lines.push(
      `Kamera       : Shot ${frame.shotType} | Sudut ${frame.cameraAngle} | Gerakan ${frame.cameraMovement || '-'} | Lensa ${frame.lensMm}`
    );
    lines.push(
      `Pencahayaan  : ${frame.lighting || matchedScene?.lighting || '-'}`
    );
    lines.push(
      `Suasana      : ${frame.atmosphere || matchedScene?.mood || '-'}`
    );
    lines.push(`Deskripsi    : ${frame.visualDescription || frame.compositionNotes || '-'}`);
    if (frame.characterAction) {
      lines.push(`Aksi         : ${frame.characterAction}`);
    }
    if (frame.expressionAndGesture) {
      lines.push(`Ekspresi     : ${frame.expressionAndGesture}`);
    }
    if (frame.characterPosition) {
      lines.push(`Posisi Frame : ${frame.characterPosition}`);
    }
    if (frame.dialogue || frame.dialogueCue) {
      lines.push(`Dialog       : "${frame.dialogue || frame.dialogueCue}"`);
    }
    lines.push(`Visual Prompt: ${frame.visualPrompt || '-'}`);
    if (frame.negativePrompt) {
      lines.push(`Negative     : ${frame.negativePrompt}`);
    }
    lines.push(`Status Gambar: ${frame.imageDataUrl ? `Tersedia (${frame.imageSource || 'tersimpan'})` : 'Belum tersedia'}`);
    lines.push('----------------------------------------------------------------');
    lines.push('');
  }

  return lines.join('\n');
}

export function formatStoryboardJson(
  project: FilmProject,
  framesToExport?: StoryboardFrame[]
): string {
  const frames = framesToExport ?? project.storyboard;
  return JSON.stringify(
    {
      studio: 'AI FILM STUDIO',
      exportedAt: new Date().toISOString(),
      projectId: project.id,
      filmTitle: project.input.title || 'Tanpa Judul',
      genre: project.input.genre,
      visualStyle: project.input.visualStyle,
      panelCount: frames.length,
      storyboard: frames.map((f) => ({
        ...f,
        sceneId: resolveSceneId(f.sceneNumber, project.scenes, f.sceneId),
      })),
    },
    null,
    2
  );
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = (text || '-').trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.length > 0) {
    const last = lines[maxLines - 1];
    if (last.length > 3 && words.join(' ').length > lines.join(' ').length) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 3))}...`;
    }
  }
  return lines;
}

export async function exportStoryboardSheetPng(
  project: FilmProject,
  framesToExport: StoryboardFrame[],
  filenameBase?: string
): Promise<void> {
  const frames = framesToExport.length ? framesToExport : project.storyboard;
  if (!frames.length) {
    throw new Error('Tidak ada panel storyboard untuk diekspor menjadi gambar lembar.');
  }

  const cols = frames.length === 1 ? 1 : 2;
  const cardW = 680;
  const cardPad = 20;
  const imgBoxW = cardW - cardPad * 2;
  const sampleRatio = frames[0]?.aspectRatio || '16:9';
  const imgBoxH =
    sampleRatio === '9:16' ? 380 : sampleRatio === '1:1' ? 360 : Math.round((imgBoxW * 9) / 16);
  const cardH = cardPad + 36 + imgBoxH + 140 + cardPad;
  const outerPad = 40;
  const gap = 24;
  const headerH = 110;
  const rows = Math.ceil(frames.length / cols);

  const canvasW = outerPad * 2 + cols * cardW + (cols - 1) * gap;
  const canvasH = outerPad * 2 + headerH + rows * cardH + Math.max(0, rows - 1) * gap;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas browser tidak tersedia untuk menyusun lembar storyboard.');
  }

  // Dark cinema background
  ctx.fillStyle = '#0A0B0E';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Header
  ctx.fillStyle = '#E5A93C';
  ctx.font = '600 14px monospace';
  ctx.fillText('AI FILM STUDIO — LEMBAR STORYBOARD PRODUKSI', outerPad, outerPad + 22);

  ctx.fillStyle = '#F4F5F7';
  ctx.font = '700 28px sans-serif';
  ctx.fillText(project.input.title || 'Proyek Film Tanpa Judul', outerPad, outerPad + 58);

  ctx.fillStyle = '#9CA3AF';
  ctx.font = '400 15px sans-serif';
  ctx.fillText(
    `${project.input.genre || 'Drama'} · ${project.input.visualStyle || 'Sinematik'} · ${frames.length} Panel · Rasio ${sampleRatio}`,
    outerPad,
    outerPad + 86
  );

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(outerPad, outerPad + headerH - 12);
  ctx.lineTo(canvasW - outerPad, outerPad + headerH - 12);
  ctx.stroke();

  const loadedImages = await Promise.all(
    frames.map((f) => (f.imageDataUrl ? loadImageElement(f.imageDataUrl) : Promise.resolve(null)))
  );

  frames.forEach((frame, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = outerPad + col * (cardW + gap);
    const y = outerPad + headerH + row * (cardH + gap);
    const sceneId = resolveSceneId(frame.sceneNumber, project.scenes, frame.sceneId);

    // Card surface
    ctx.fillStyle = '#12141A';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeRect(x, y, cardW, cardH);

    // Card header line
    ctx.fillStyle = '#E5A93C';
    ctx.font = '700 15px monospace';
    ctx.fillText(`PANEL #${frame.frameNumber} · ${sceneId}`, x + cardPad, y + cardPad + 16);

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '500 13px monospace';
    const specText = `${frame.shotType} · ${frame.cameraAngle} · ${frame.durationSeconds}s`;
    const specWidth = ctx.measureText(specText).width;
    ctx.fillText(specText, x + cardW - cardPad - specWidth, y + cardPad + 16);

    // Image box
    const imgX = x + cardPad;
    const imgY = y + cardPad + 30;
    ctx.fillStyle = '#07080B';
    ctx.fillRect(imgX, imgY, imgBoxW, imgBoxH);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeRect(imgX, imgY, imgBoxW, imgBoxH);

    const imgEl = loadedImages[index];
    if (imgEl && imgEl.width > 0 && imgEl.height > 0) {
      const scale = Math.min(imgBoxW / imgEl.width, imgBoxH / imgEl.height);
      const drawW = imgEl.width * scale;
      const drawH = imgEl.height * scale;
      const drawX = imgX + (imgBoxW - drawW) / 2;
      const drawY = imgY + (imgBoxH - drawH) / 2;
      ctx.drawImage(imgEl, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = '#6B7280';
      ctx.font = '600 15px sans-serif';
      const emptyLabel = 'Frame Visual Belum Diisi / Menunggu Gambar';
      const labelW = ctx.measureText(emptyLabel).width;
      ctx.fillText(emptyLabel, imgX + (imgBoxW - labelW) / 2, imgY + imgBoxH / 2 - 6);

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '400 13px monospace';
      const subLabel = `${frame.shotType} · ${frame.lensMm} · ${frame.lighting || 'Cahaya natural'}`;
      const subW = ctx.measureText(subLabel).width;
      ctx.fillText(subLabel, imgX + Math.max(12, (imgBoxW - subW) / 2), imgY + imgBoxH / 2 + 20);
    }

    // Description & characters
    const textY = imgY + imgBoxH + 24;
    ctx.fillStyle = '#F4F5F7';
    ctx.font = '500 14px sans-serif';
    const descLines = wrapCanvasText(
      ctx,
      frame.visualDescription || frame.compositionNotes || '-',
      imgBoxW,
      3
    );
    descLines.forEach((line, li) => {
      ctx.fillText(line, imgX, textY + li * 20);
    });

    ctx.fillStyle = '#E5A93C';
    ctx.font = '500 13px sans-serif';
    const charLine = `Tokoh: ${(frame.characters || []).join(', ') || '-'} · Lokasi: ${frame.location || '-'}`;
    const wrappedChar = wrapCanvasText(ctx, charLine, imgBoxW, 1);
    ctx.fillText(wrappedChar[0] || '', imgX, textY + 76);

    if (frame.dialogue || frame.dialogueCue) {
      ctx.fillStyle = '#C4B5FD';
      ctx.font = 'italic 13px sans-serif';
      const dlgWrapped = wrapCanvasText(ctx, `"${frame.dialogue || frame.dialogueCue}"`, imgBoxW, 1);
      ctx.fillText(dlgWrapped[0] || '', imgX, textY + 98);
    }
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) {
    throw new Error('Gagal menghasilkan berkas PNG lembar storyboard.');
  }

  const safeBase =
    (filenameBase || project.input.title || 'storyboard-sheet')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'storyboard-sheet';

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeBase}-storyboard.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
