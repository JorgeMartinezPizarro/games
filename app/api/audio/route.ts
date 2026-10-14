import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { requireAuth } from '@/app/lib/auth';

// -------------------------------------------------------
// GET handler
//
// Only serves mp3 files already cached in cache/audio/. Game generation
// (calling app.py /challenge, picking each round's target, caching the
// audio) lives in app/lib/words/challenge.ts and app/api/words/new-game,
// which never expose the target to the client.
// -------------------------------------------------------
export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('file');

    if (!fileName) {
      return NextResponse.json({ error: 'file is required.' }, { status: 400 });
    }

    // path.basename blocks any path traversal attempt (../, absolute paths,
    // etc.), on top of requiring the .mp3 extension.
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
        // The files are immutable (named after the word): caching them
        // aggressively keeps the client's preloading from re-hitting the network.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error in audio endpoint:', error);
    return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
  }
}