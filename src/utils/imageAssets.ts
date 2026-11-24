import type { FilmProject, ProductionVisualAsset } from '../types/studio';

export type ImageOptimizationPreset = 'character' | 'scene' | 'video-ref';

const PRESET_CONFIG: Record<
  ImageOptimizationPreset,
  { maxDim: number; jpegQuality: number; maxPngBytes: number }
> = {
  // Pertahankan resolusi cukup tinggi & kualitas 0.90 agar fitur wajah karakter tetap tajam
  character: { maxDim: 896, jpegQuality: 0.9, maxPngBytes: 350 * 1024 },
  scene: { maxDim: 1280, jpegQuality: 0.86, maxPngBytes: 450 * 1024 },
  'video-ref': { maxDim: 1024, jpegQuality: 0.85, maxPngBytes: 350 * 1024 },
};

function canvasHasTransparency(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  try {
    const sampleW = Math.min(width, 128);
    const sampleH = Math.min(height, 128);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function optimizeImageFile(
  file: File,
  preset: ImageOptimizationPreset = 'character'
): Promise<{ dataUrl: string; mimeType: string }> {
  const MAX_RAW_FILE_BYTES = 25 * 1024 * 1024;
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error(
      'Ukuran berkas gambar terlalu besar (maksimal 25 MB). Pilih gambar yang lebih kecil.'
    );
  }
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Berkas yang dipilih bukan gambar yang valid.');
  }

  const config = PRESET_CONFIG[preset];

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error('Berkas yang dipilih tidak dapat dimuat sebagai gambar.'));
      img.onload = () => {
        const scale = Math.min(1, config.maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas browser tidak tersedia untuk memproses gambar.'));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const isPng = file.type === 'image/png';
        const keepPng =
          isPng && (file.size <= config.maxPngBytes || canvasHasTransparency(ctx, canvas.width, canvas.height));

        const mimeType = keepPng ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(
          mimeType,
          keepPng ? undefined : config.jpegQuality
        );
        resolve({ dataUrl, mimeType });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function compressImageFileToDataUrl(
  file: File,
  maxDim = 768
): Promise<{ dataUrl: string; mimeType: string }> {
  const preset: ImageOptimizationPreset =
    maxDim >= 1024 ? 'scene' : 'character';
  return optimizeImageFile(file, preset);
}

export function downloadImageDataUrl(dataUrl: string, filenameBase: string): void {
  const mimeMatch = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/);
  const rawExt = mimeMatch ? mimeMatch[1].toLowerCase() : 'png';
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const safeName =
    filenameBase
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'ai-film-studio-visual';

  // Konversi Data URL menjadi Blob URL agar lebih kompatibel di peramban Android / WebView
  const link = document.createElement('a');
  let objectUrl: string | null = null;
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (dataUrl.startsWith('data:') && commaIdx > 0) {
      const meta = dataUrl.slice(5, commaIdx);
      const mime = meta.split(';')[0] || 'image/png';
      const b64 = dataUrl.slice(commaIdx + 1);
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mime });
      objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
    } else {
      link.href = dataUrl;
    }
  } catch {
    link.href = dataUrl;
  }

  link.download = `${safeName}.${ext}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (objectUrl) {
    setTimeout(() => URL.revokeObjectURL(objectUrl!), 4000);
  }
}

export function collectProjectVisualAssets(project: FilmProject): ProductionVisualAsset[] {
  const result: ProductionVisualAsset[] = [];
  const seenKeys = new Set<string>();

  for (const asset of project.visualAssets || []) {
    if (!asset.imageDataUrl) continue;
    const dedupeKey = `${asset.kind}:${asset.characterId || asset.sceneNumber || asset.id}:${asset.frameNumber || ''}:${asset.imageDataUrl.slice(0, 64)}`;
    if (!seenKeys.has(dedupeKey)) {
      seenKeys.add(dedupeKey);
      result.push(asset);
    }
  }

  for (const char of project.characters) {
    if (char.referenceImageDataUrl) {
      const dedupeKey = `character:${char.id || char.name}:${char.referenceImageDataUrl.slice(0, 64)}`;
      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        result.push({
          id: `asset_char_${char.id || char.name}`,
          kind: 'character',
          title: char.name || 'Karakter Tanpa Nama',
          subtitle: `${char.role || 'Pemeran'} · Usia ${char.age || '-'}`,
          characterId: char.id,
          characterName: char.name,
          promptUsed:
            char.visualPromptAnchor ||
            [
              char.facialDescription,
              char.eyeShape,
              char.noseShape,
              char.lipShape,
              char.skinTone,
              char.hairDescription,
              char.height,
              char.bodyBuild,
              char.physicalTraits,
              char.costume,
            ]
              .filter(Boolean)
              .join(', ') ||
            'Referensi visual karakter',
          aspectRatio: '1:1',
          imageDataUrl: char.referenceImageDataUrl,
          mimeType: char.referenceImageMimeType || 'image/jpeg',
          source: char.referenceImageSource || 'user-upload',
          createdAt: project.updatedAt,
        });
      }
    }

    const sheetLabels = [
      { key: 'front', label: 'Tampak Depan' },
      { key: 'side', label: 'Tampak Samping' },
      { key: 'back', label: 'Tampak Belakang' },
      { key: 'fullBody', label: 'Seluruh Tubuh (Netral)' },
    ] as const;

    for (const view of sheetLabels) {
      const slot = char.referenceSheet?.[view.key];
      if (!slot?.imageDataUrl) continue;
      const sheetKey = `character-sheet:${char.id || char.name}:${view.key}:${slot.imageDataUrl.slice(0, 64)}`;
      if (!seenKeys.has(sheetKey)) {
        seenKeys.add(sheetKey);
        result.push({
          id: `asset_sheet_${char.id || char.name}_${view.key}`,
          kind: 'character',
          title: `${char.name || 'Karakter'} — ${view.label}`,
          subtitle: `Lembar Referensi · ${char.role || 'Pemeran'}`,
          characterId: char.id,
          characterName: char.name,
          promptUsed: slot.promptText || `${view.label} · Referensi karakter ${char.name}`,
          aspectRatio: view.key === 'fullBody' ? '3:4' : '1:1',
          imageDataUrl: slot.imageDataUrl,
          mimeType: slot.mimeType || 'image/jpeg',
          source: slot.source || 'user-upload',
          createdAt: slot.updatedAt || project.updatedAt,
        });
      }
    }
  }

  for (const scene of project.scenes) {
    if (!scene.imageDataUrl) continue;
    const dedupeKey = `scene:${scene.sceneNumber}:${scene.imageDataUrl.slice(0, 64)}`;
    if (!seenKeys.has(dedupeKey)) {
      seenKeys.add(dedupeKey);
      result.push({
        id: `asset_scene_${scene.sceneNumber}`,
        kind: 'scene',
        title: `Adegan ${scene.sceneNumber}: ${scene.heading}`,
        subtitle: `${scene.location} (${scene.timeOfDay}) · ${scene.mood}`,
        sceneNumber: scene.sceneNumber,
        promptUsed: scene.imagePromptUsed || scene.actionSummary,
        aspectRatio: '16:9',
        imageDataUrl: scene.imageDataUrl,
        mimeType: scene.imageMimeType || 'image/jpeg',
        source: scene.imageSource || 'user-upload',
        createdAt: scene.imageUpdatedAt || project.updatedAt,
      });
    }
  }

  for (const frame of project.storyboard) {
    if (!frame.imageDataUrl) continue;
    const dedupeKey = `storyboard:${frame.sceneNumber}:${frame.frameNumber}:${frame.imageDataUrl.slice(0, 64)}`;
    if (!seenKeys.has(dedupeKey)) {
      seenKeys.add(dedupeKey);
      result.push({
        id: `asset_sb_${frame.frameNumber}_${frame.sceneNumber}`,
        kind: 'storyboard',
        title: `Storyboard Panel #${frame.frameNumber} (${frame.sceneId || `Adegan ${frame.sceneNumber}`})`,
        subtitle: `${frame.shotType} · ${frame.lensMm} · ${frame.location || '-'}`,
        sceneNumber: frame.sceneNumber,
        frameNumber: frame.frameNumber,
        promptUsed: frame.visualPrompt,
        aspectRatio: frame.aspectRatio || '16:9',
        imageDataUrl: frame.imageDataUrl,
        mimeType: frame.imageMimeType || 'image/jpeg',
        source: frame.imageSource || 'user-upload',
        createdAt: frame.imageUpdatedAt || project.updatedAt,
      });
    }
  }

  return result;
}
