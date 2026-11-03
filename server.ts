import compression from 'compression';
import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createApp, securityHeaders } from './server/createApp.ts';
import { youtubeRouter } from './server/youtube.ts';

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
// Videos and files keep their byte ranges, so seeking in a video works.
app.use(compression({ filter: (req, res) => !req.path.startsWith('/api/uploads') && compression.filter(req, res) }));
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  app.use('/api/youtube', youtubeRouter());
  app.use(await createApp());
  // Vite middleware in dev mode
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      // Vite puts a hash of the contents in these names, so a browser can keep them for good.
      setHeaders(res, file) {
        if (/[\\/]assets[\\/][^\\/]+-[\w-]{8}\.(js|css)$/.test(file)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      },
    }));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GymTrack server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
