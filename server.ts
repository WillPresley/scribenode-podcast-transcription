import path from "path";
import fs from "fs";
import os from "os";
import { createServer as createViteServer } from "vite";
import { createApp } from "./server/app";
import { JobsStorage } from "./server/storage";
import { isDisableDefaultItems, formatDockerTag, getAppVersion, getMaxUploadSizeMB } from "./server/config";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const storage = new JobsStorage();

function printStartupBanner() {
  const VERSION = getAppVersion();
  const tag = process.env.DOCKER_TAG || process.env.CONTAINER_TAG || process.env.IMAGE_TAG || "latest";
  
  let rawSha = (process.env.GIT_SHA || process.env.COMMIT_SHA || process.env.GITHUB_SHA || process.env.BUILD_SHA || process.env.IMAGE_SHA || process.env.IMAGE_DIGEST || process.env.SHA || "").trim();

  if (!rawSha) {
    try {
      const buildInfoPath = path.join(process.cwd(), "dist", "build-info.json");
      if (fs.existsSync(buildInfoPath)) {
        const info = JSON.parse(fs.readFileSync(buildInfoPath, "utf-8"));
        if (info.gitSha) rawSha = info.gitSha;
      }
    } catch {}
  }

  const dockerTagOutput = formatDockerTag(tag, rawSha);

  const banner = `
   _____           _ _          _   _           _      
  / ____|         (_) |        | \\ | |         | |     
 | (___   ___ _ __ _| |__   ___|  \\| | ___   __| | ___ 
  \\___ \\ / __| '__| | '_ \\ / _ \\ . \` |/ _ \\ / _\` |/ _ \\
  ____) | (__| |  | | |_) |  __/ |\\  | (_) | (_| |  __/
 |_____/ \\___|_|  |_|_.__/ \\___|_| \\_|\\___/ \\__,_|\\___|
`;
  console.log(banner);
  console.log(`=======================================================`);
  console.log(` ScribeNode - AI Speech & Transcript Engine`);
  console.log(` Version      : v${VERSION}`);
  console.log(` Docker/Tag   : ${dockerTagOutput}`);
  console.log(` Environment  : ${process.env.NODE_ENV || 'development'}`);
  console.log(` Node Runtime : ${process.version} (${process.platform} ${process.arch})`);
  console.log(` Server URL   : http://0.0.0.0:${PORT}`);
  console.log(` Uploads Dir  : ${storage.uploadsDir}`);
  console.log(` Temp Storage : ${os.tmpdir()}`);
  console.log(` Gemini API   : ${process.env.GEMINI_API_KEY ? 'Configured [OK]' : 'NOT CONFIGURED [WARNING]'}`);
  console.log(` Preseed Items: ${isDisableDefaultItems() ? 'Disabled (DISABLE_DEFAULT_ITEMS=true)' : 'Enabled (Default)'}`);
  console.log(` Max Upload   : ${getMaxUploadSizeMB()}MB (Configurable via MAX_UPLOAD_SIZE_MB)`);
  console.log(`=======================================================\n`);
}

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
    printStartupBanner();
  });
}

function expressStaticMiddleware(distPath: string) {
  const express = require("express");
  const router = express.Router();
  router.use(express.static(distPath, { index: false }));
  router.get('*all', (req: any, res: any) => {
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
