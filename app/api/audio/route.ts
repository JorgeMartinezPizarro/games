import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { requireAuth } from '@/app/lib/auth';

// -------------------------------------------------------
// GET handler
//
// Solo sirve mp3 ya cacheados en cache/audio/. La generación de la partida
// (llamar a app.py /challenge, decidir el target de cada ronda, cachear los
// audios) vive en app/lib/words/challenge.ts y app/api/words/new-game, que
// nunca exponen el target al cliente.
// -------------------------------------------------------
export async function GET(request: NextRequest): Promise<Response> {
  try {
    if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === 'true') {
      await requireAuth(request);
    }

    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('file');

    if (!fileName) {
      return NextResponse.json({ error: 'file is required.' }, { status: 400 });
    }

    // path.basename evita cualquier intento de path traversal (../, rutas
    // absolutas, etc.) además de exigir la extensión .mp3.
    if (!fileName.endsWith('.mp3') || path.basename(fileName) !== fileName) {
      return NextResponse.json(
        { error: 'Only MP3 files are allowed' },
        { status: 403 }
      );
    }

    const filePath = path.join(process.cwd(), 'cache', 'audio', fileName);
    const fileData = await fs.readFile(filePath);

    return new Response(new Uint8Array(fileData), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Accept-Ranges': 'bytes',
        // Los archivos son inmutables (nombrados por palabra): cachear
        // agresivamente ayuda a que la precarga del cliente no repita red.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error in audio endpoint:', error);
    return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
  }
}