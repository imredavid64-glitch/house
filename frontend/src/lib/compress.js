import { pb, api } from './lib/pb.js';

export async function compressImage(file, maxDim = 1400, quality = 0.82) {
  try {
    try {
      const bmp = await createImageBitmap(file);
      const w = Math.min(bmp.width, maxDim);
      const h = Math.round((bmp.height / bmp.width) * w);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const blob = await new Promise((res) =>
        canvas.toBlob(res, 'image/webp', quality)
      );
      if (blob && blob.size < file.size) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
          type: 'image/webp',
          lastModified: Date.now(),
        });
      }
      return file;
    } catch {
      return file;
    }
  } catch {
    return file;
  }
}

export async function gzip(bytes) {
  const cs = new CompressionStream('gzip');
  const stream = blobsToStream([bytes]);
  return new Response(stream.pipeThrough(cs)).blob();
}

function blobsToStream(blobs) {
  let start = 0;
  return new ReadableStream({
    async pull(controller) {
      if (start >= blobs.length) {
        controller.close();
        return;
      }
      controller.enqueue(await blobs[start].arrayBuffer());
      start++;
    },
  });
}

const TEXTISH = new Set([
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'application/json',
  'application/xml', 'text/x-log', 'text/javascript', 'text/css',
]);

export async function compressFile(file) {
  const algorithm = 'none';
  let stored = file;

  if (file.type.startsWith('image/')) {
    const img = await compressImage(file);
    if (img !== file) {
      stored = img;
      return { file: stored, algorithm: 'webp', original_size: file.size, stored_size: stored.size };
    }
  } else if (TEXTISH.has(file.type) || /\.(txt|md|log|json|xml|csv|html|js|css)$/i.test(file.name)) {
    try {
      const gz = await gzip(await file.arrayBuffer());
      if (gz.size < file.size) {
        stored = new File([gz], file.name + '.gz', {
          type: 'application/gzip',
          lastModified: Date.now(),
        });
        return { file: stored, algorithm: 'gzip', original_size: file.size, stored_size: stored.size };
      }
    } catch {}
  }

  return { file: stored, algorithm, original_size: file.size, stored_size: stored.size };
}