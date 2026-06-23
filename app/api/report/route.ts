// app/api/stats/route.ts
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireAuth } from "@/app/lib/auth";

const WATCH_DIR = "/var/www/html";
let lastModified = 0; // memoria simple en backend

export async function GET(req: Request) {
  
	try {

	if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === "true")
		await requireAuth(req);

    	
    const files = await fs.readdir(WATCH_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    let newestTimestamp = lastModified;
    const data: Record<string, any> = {}; // objeto con claves = nombres de fichero

    for (const file of jsonFiles) {
      const fullPath = path.join(WATCH_DIR, file);
      const stats = await fs.stat(fullPath);

      if (stats.mtimeMs > lastModified) {
        newestTimestamp = Math.max(newestTimestamp, stats.mtimeMs);

        const content = await fs.readFile(fullPath, "utf8");
        data[file] = {
          timestamp: stats.mtimeMs,
          content: JSON.parse(content),
        };
      }
    }

    if (Object.keys(data).length === 0) {
      // Nada nuevo → devolvemos solo timestamp
      return NextResponse.json({ changed: false, timestamp: lastModified });
    }

    lastModified = newestTimestamp;

    return NextResponse.json({
      changed: true,
      timestamp: lastModified,
      data, // ahora es un objeto { "fichero.json": {timestamp, content}, ... }
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Error reading files" },
      { status: 500 }
    );
  }
}
