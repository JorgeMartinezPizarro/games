import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { requireAuth } from '@/app/lib/auth';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === "true") {
      await requireAuth(request);
    }

    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('file');

    // =========================
    // 1. STREAM AUDIO (legacy)
    // =========================
    if (fileName) {
      if (!fileName.endsWith('.mp3')) {
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
        },
      });
    }

    // =========================
    // 2. GENERATE WORD + AUDIO
    // =========================
    const origin = new URL(request.url).origin;

	const WORD_URL = process.env.NEXT_PUBLIC_WORD_URL
		? process.env.NEXT_PUBLIC_WORD_URL + "/word"
		: process.env.NEXTCLOUD_URL + "/word"
    const wordRes = await fetch(WORD_URL);
    const wordData = await wordRes.json();

    const word: string = wordData.word;

    const url = `/bookmarks/api/audio?file=${word}.mp3`;

    return NextResponse.json({
      word,
      url,
    });

  } catch (error) {
    console.error('Error in audio endpoint:', error);
    return NextResponse.json(
      { error: 'Audio generation failed' },
      { status: 500 }
    );
  }
}