import { promises as fs } from "node:fs";
import path from "node:path";

export type WordsRound = {
  target: string;
  audio: string;
  choices: string[];
};

export type PublicWordsRound = {
  audio: string;
  choices: string[];
};

const WORD_BASE_URL = (): string =>
  process.env.NEXT_PUBLIC_WORD_URL
    ? process.env.NEXT_PUBLIC_WORD_URL
    : (process.env.NEXTCLOUD_URL ?? "");

// Downloads an mp3 from app.py and caches it on disk if it wasn't already.
async function cacheAudio(wordAudioPath: string): Promise<string> {
  const filename = path.basename(wordAudioPath);
  const localPath = path.join(process.cwd(), "cache", "audio", filename);

  try {
    await fs.access(localPath);
  } catch {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    const res = await fetch(`${WORD_BASE_URL()}${wordAudioPath}`);
    if (!res.ok) throw new Error(`Failed to fetch audio: ${wordAudioPath}`);
    const buffer = await res.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));
  }

  return `/bookmarks/api/audio?file=${filename}`;
}

export async function fetchChallenge(
  rounds: number,
  choices: number
): Promise<WordsRound[]> {
  const challengeRes = await fetch(
    `${WORD_BASE_URL()}/challenge?rounds=${rounds}&choices=${choices}`
  );
  if (!challengeRes.ok) {
    throw new Error(`app.py /challenge responded ${challengeRes.status}`);
  }

  const challengeData: { rounds: WordsRound[] } = await challengeRes.json();

  // Caches the audio files in parallel, while the player sees the loading screen.
  return Promise.all(
    challengeData.rounds.map(async (round) => ({
      ...round,
      audio: await cacheAudio(round.audio),
    }))
  );
}

export function stripTargets(rounds: WordsRound[]): PublicWordsRound[] {
  return rounds.map(({ audio, choices }) => ({ audio, choices }));
}
