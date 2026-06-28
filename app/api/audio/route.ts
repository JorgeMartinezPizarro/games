import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { requireAuth } from '@/app/lib/auth';

// -------------------------------------------------------
// Tipos compartidos con el frontend
// -------------------------------------------------------
export type ChallengeRound = {
  target:  string;
  audio:   string;       // ruta en app.py, ej. "/audio/forgiver.mp3"
  choices: string[];     // 4 palabras barajadas
};

export type ChallengeResponse = {
  rounds: ChallengeRound[];
};

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
const WORD_BASE_URL = (): string =>
  process.env.NEXT_PUBLIC_WORD_URL
    ? process.env.NEXT_PUBLIC_WORD_URL
    : (process.env.NEXTCLOUD_URL ?? '');

/**
 * Descarga un MP3 desde app.py y lo guarda en caché local.
 * Devuelve la URL pública que el frontend puede usar con <audio>.
 */
async function cacheAudio(wordAudioPath: string): Promise<string> {
  // wordAudioPath llega como "/audio/forgiver.mp3" desde app.py
  const filename = path.basename(wordAudioPath);   // "forgiver.mp3"
  const localPath = path.join(process.cwd(), 'cache', 'audio', filename);

  // Si ya está en caché, no volvemos a descargarlo
  try {
    await fs.access(localPath);
  } catch {
    // No existe → descargar desde app.py
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    const res = await fetch(`${WORD_BASE_URL()}${wordAudioPath}`);
    if (!res.ok) throw new Error(`Failed to fetch audio: ${wordAudioPath}`);
    const buffer = await res.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));
  }

  // URL pública que usará el <audio> en el navegador
  return `/bookmarks/api/audio?file=${filename}`;
}

// -------------------------------------------------------
// GET handler
// -------------------------------------------------------
export async function GET(request: NextRequest): Promise<Response> {
  try {
    if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === 'true') {
      await requireAuth(request);
    }

    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('file');

    // -------------------------------------------------------
    // 1. STREAM AUDIO (el <audio> del frontend llama aquí)
    // -------------------------------------------------------
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

    // -------------------------------------------------------
    // 2. GENERAR PARTIDA COMPLETA
    //    Llama a app.py /challenge y cachea los 10 audios
    // -------------------------------------------------------
    const rounds  = Number(searchParams.get('rounds')  ?? 10);
    const choices = Number(searchParams.get('choices') ?? 4);

    const challengeRes = await fetch(
      `${WORD_BASE_URL()}/challenge?rounds=${rounds}&choices=${choices}`
    );
    if (!challengeRes.ok) {
      throw new Error(`app.py /challenge responded ${challengeRes.status}`);
    }

    const challengeData: ChallengeResponse = await challengeRes.json();

    // Cachear los audios en paralelo y reescribir la URL al proxy local
    const roundsWithLocalAudio = await Promise.all(
      challengeData.rounds.map(async (round) => ({
        ...round,
        audio: await cacheAudio(round.audio),
      }))
    );

    return NextResponse.json({ rounds: roundsWithLocalAudio });

  } catch (error) {
    console.error('Error in audio endpoint:', error);
    return NextResponse.json(
      { error: 'Audio generation failed' },
      { status: 500 }
    );
  }
}