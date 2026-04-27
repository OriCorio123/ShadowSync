import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const GAMES_DIR = path.join(process.cwd(), 'public', 'games');
  
  try {
    if (!fs.existsSync(GAMES_DIR)) {
      return NextResponse.json([]);
    }

    const entries = fs.readdirSync(GAMES_DIR, { withFileTypes: true });
    const games = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const folderName = entry.name;
      const folderPath = path.join(GAMES_DIR, folderName);

      // Check for game.html
      const htmlFile = path.join(folderPath, 'game.html');
      if (!fs.existsSync(htmlFile)) continue;

      // Build game info
      const game = {
        name: folderName
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase()),
        folder: folderName,
        htmlPath: `/games/${folderName}/game.html`,
        iconPath: fs.existsSync(path.join(folderPath, 'game.png'))
          ? `/games/${folderName}/game.png`
          : null,
      };

      games.push(game);
    }

    return NextResponse.json(games);
  } catch (err) {
    console.error('[ShadowSync API] Error scanning games:', err);
    return NextResponse.json({ error: 'Failed to scan games directory' }, { status: 500 });
  }
}
