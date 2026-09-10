import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import { createApp } from "./server/app";
import { JobsStorage } from "./server/storage";
import { printStartupBanner } from "./server/banner";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const storage = new JobsStorage();

async function startServer() {
  const app = createApp({ storage });

  // Vite Integration & Static File Serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(expressStaticMiddleware(distPath));
  }

  // Run initial storage & temp directory GC sweep and schedule periodic checks
  storage.cleanOrphanedAndTempFiles();
  setInterval(() => storage.cleanOrphanedAndTempFiles(), 15 * 60 * 1000);

  app.listen(PORT, "0.0.0.0", () => {
    printStartupBanner({
      uploadsDir: storage.uploadsDir,
      serverUrl: `http://0.0.0.0:${PORT}`
    });
  });
}

function expressStaticMiddleware(distPath: string) {
  const express = require("express");
  const router = express.Router();
  const staticLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    limit: 3000,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
  });
  router.use(staticLimiter);
  router.use(express.static(distPath, { index: false }));
  router.get('*all', staticLimiter, (req: any, res: any) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf-8');
      const appTitle = process.env.APP_TITLE || "ScribeNode – Transcription Engine";
      html = html.replace(/<title>.*?<\/title>/i, `<title>${appTitle}</title>`);
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }
    res.sendFile(indexPath);
  });
  return router;
}

startServer();
