import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./public", import.meta.url));
const port = Number(process.env.PORT || 4173);
const execFile = promisify(execFileCallback);
const localVoices = new Set(["Lekha", "Tara", "Aman", "Rishi"]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  if (body.length > 1_000_000) throw new Error("Request is too large.");
  return JSON.parse(body || "{}");
}

function slugify(value) {
  return String(value || "poem")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "poem";
}

async function durationOf(filePath) {
  const { stdout } = await execFile("/opt/homebrew/bin/ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath,
  ]);
  return Number(stdout.trim());
}

async function generateLocalAudio({ id: requestedId, title, language, voice, lines }) {
  if (!localVoices.has(voice)) throw new Error("That local voice is not available.");
  if (!Array.isArray(lines) || !lines.length || lines.some((line) => typeof line !== "string" || !line.trim())) {
    throw new Error("Add at least one non-empty lyric line.");
  }
  if (lines.join("\n").length > 25_000) throw new Error("This poem is too long for one preparation pass.");

  const id = slugify(requestedId || title);
  const workingDirectory = await mkdtemp(join(tmpdir(), "ojas-poem-"));
  const lineFiles = [];
  const lineGap = 0.22;
  try {
    for (let index = 0; index < lines.length; index += 1) {
      const linePath = join(workingDirectory, `line-${String(index).padStart(3, "0")}.aiff`);
      await execFile("/usr/bin/say", ["-v", voice, "-r", "150", "-o", linePath, lines[index]]);
      lineFiles.push(linePath);
    }

    const durations = await Promise.all(lineFiles.map(durationOf));
    const silencePath = join(workingDirectory, "line-gap.aiff");
    await execFile("/opt/homebrew/bin/ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=22050", "-t", String(lineGap), "-c:a", "pcm_s16le", silencePath]);
    const cues = [];
    let cursor = 0;
    lines.forEach((text, index) => {
      const start = cursor;
      cursor += durations[index];
      cues.push({ text, start: Number(start.toFixed(3)), end: Number(cursor.toFixed(3)) });
      if (index < lines.length - 1) cursor += lineGap;
    });

    const concatFile = join(workingDirectory, "concat.txt");
    const concatEntries = [];
    lineFiles.forEach((filePath, index) => {
      concatEntries.push(`file '${filePath}'`);
      if (index < lineFiles.length - 1) concatEntries.push(`file '${silencePath}'`);
    });
    await writeFile(concatFile, concatEntries.join("\n"));
    const audioDirectory = join(root, "audio");
    await mkdir(audioDirectory, { recursive: true });
    const outputPath = join(audioDirectory, `${id}.mp3`);
    await execFile("/opt/homebrew/bin/ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c:a", "libmp3lame", "-q:a", "3", outputPath]);
    return { id, title: title || "Untitled poem", language, voice, audio: `audio/${id}.mp3`, cues };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

const server = createServer(async (request, response) => {
  const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (request.method === "POST" && requestPath === "/api/generate-audio") {
    try {
      const result = await generateLocalAudio(await readJsonBody(request));
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Audio generation failed." }));
    }
    return;
  }

  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const filePath = join(root, normalize(relativePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Ojas Poem Recite is running at http://127.0.0.1:${port}`);
});
