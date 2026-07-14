const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

loadEnvFile();

const PUBLIC_DIR = path.join(__dirname, "public");
const STATUS_FILE = path.join(__dirname, ".seedream-server.json");
const MODEL_ID = "dola-seedream-5-0-pro-260628";
const DEFAULT_PORT = Number.parseInt(process.env.PORT || "8787", 10);
const MAX_BODY_BYTES = Number.parseInt(process.env.MAX_BODY_BYTES || String(90 * 1024 * 1024), 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || "180000", 10);

const REGION_BASE_URLS = {
  "ap-southeast-1": "https://ark.ap-southeast.bytepluses.com/api/v3",
  "eu-west-1": "https://ark.eu-west.bytepluses.com/api/v3"
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendCors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    const requestUrl = new URL(req.url, "http://127.0.0.1");

    if (req.method === "GET" && requestUrl.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        model: MODEL_ID,
        hasEnvKey: Boolean(getEnvApiKey()),
        defaultBaseUrl: process.env.ARK_BASE_URL || REGION_BASE_URLS["ap-southeast-1"],
        regions: REGION_BASE_URLS
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/generate") {
      const input = await readJsonBody(req);
      const { apiKey, endpoint, providerBody, safeRequest } = buildProviderRequest(input);
      const provider = await callBytePlus(endpoint, apiKey, providerBody);
      sendJson(res, 200, {
        ok: true,
        model: MODEL_ID,
        endpoint,
        request: safeRequest,
        provider
      });
      return;
    }

    if (req.method === "GET") {
      serveStatic(requestUrl.pathname, res);
      return;
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    const status = error.statusCode || error.status || 500;
    sendJson(res, status, {
      ok: false,
      error: error.expose ? error.message : "Server error.",
      detail: error.detail
    });
  }
});

listenWithFallback(DEFAULT_PORT);

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function listenWithFallback(port, attempts = 0) {
  const nextPort = port + attempts;

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attempts < 20) {
      listenWithFallback(port, attempts + 1);
      return;
    }

    console.error(error);
    process.exitCode = 1;
  });

  server.listen(nextPort, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${nextPort}`;
    const status = {
      url,
      port: nextPort,
      pid: process.pid,
      model: MODEL_ID,
      startedAt: new Date().toISOString()
    };

    try {
      fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
    } catch {
      // Status file is a convenience only.
    }

    console.log(`Seedream frontend ready at ${url}`);
  });
}

function sendCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, payload) {
  sendCors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function serveStatic(pathname, res) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const decodedPath = decodeURIComponent(cleanPath);
  const filePath = path.resolve(PUBLIC_DIR, `.${decodedPath}`);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { ok: false, error: "Forbidden." });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(res, 404, { ok: false, error: "Not found." });
        return;
      }

      sendJson(res, 500, { ok: false, error: "Static file error." });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(makeHttpError(413, "Request body is too large."));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        reject(makeHttpError(400, "Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function buildProviderRequest(input) {
  const apiKey = String(input.apiKey || getEnvApiKey() || "").trim();
  if (!apiKey) {
    throw makeHttpError(400, "Missing ARK_API_KEY. Set .env or enter an API key in the UI.");
  }

  const prompt = String(input.prompt || "").trim();
  if (!prompt) {
    throw makeHttpError(400, "Prompt is required.");
  }

  const size = normalizeSize(input.size);
  const outputFormat = normalizeChoice(input.output_format, ["png", "jpeg"], "png");
  const responseFormat = normalizeChoice(input.response_format, ["url", "b64_json"], "url");
  const extra = normalizeExtra(input.extra);
  const images = normalizeImages(input.images || input.image || []);

  if (input.mode === "image" && images.length === 0) {
    throw makeHttpError(400, "Image-to-image mode requires at least one reference image.");
  }

  const providerBody = {
    ...extra,
    model: MODEL_ID,
    prompt,
    size,
    output_format: outputFormat,
    response_format: responseFormat,
    watermark: Boolean(input.watermark)
  };

  if (images.length === 1) {
    providerBody.image = images[0];
  } else if (images.length > 1) {
    providerBody.image = images;
  }

  const baseUrl = resolveBaseUrl(input);
  const endpoint = `${baseUrl}/images/generations`;
  const safeRequest = {
    ...providerBody,
    image: summarizeImagesForLog(providerBody.image)
  };

  return { apiKey, endpoint, providerBody, safeRequest };
}

function getEnvApiKey() {
  return process.env.ARK_API_KEY || process.env.BYTEPLUS_API_KEY || "";
}

function resolveBaseUrl(input) {
  const selectedRegion = String(input.region || "ap-southeast-1");
  const rawBaseUrl =
    input.baseUrl ||
    process.env.ARK_BASE_URL ||
    REGION_BASE_URLS[selectedRegion] ||
    REGION_BASE_URLS["ap-southeast-1"];

  let baseUrl = String(rawBaseUrl).trim();
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw makeHttpError(400, "Base URL must start with http:// or https://.");
  }

  baseUrl = baseUrl.replace(/\/images\/generations\/?$/i, "");
  baseUrl = baseUrl.replace(/\/+$/g, "");
  return baseUrl;
}

function normalizeSize(value) {
  const size = String(value || "2K").trim();
  const upper = size.toUpperCase();
  if (upper === "1K" || upper === "2K") {
    return upper;
  }

  const match = size.match(/^(\d{2,5})x(\d{2,5})$/i);
  if (!match) {
    throw makeHttpError(400, "Size must be 1K, 2K, or widthxheight.");
  }

  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  const pixels = width * height;
  const aspect = width / height;

  if (width <= 0 || height <= 0 || pixels < 921600 || pixels > 4624220 || aspect < 1 / 16 || aspect > 16) {
    throw makeHttpError(400, "Custom size is outside Seedream 5.0 Pro limits.");
  }

  return `${width}x${height}`;
}

function normalizeChoice(value, choices, fallback) {
  const candidate = String(value || fallback).toLowerCase();
  return choices.includes(candidate) ? candidate : fallback;
}

function normalizeExtra(extra) {
  if (!extra) return {};
  if (typeof extra !== "object" || Array.isArray(extra)) {
    throw makeHttpError(400, "Advanced JSON must be an object.");
  }

  return extra;
}

function normalizeImages(rawImages) {
  const images = Array.isArray(rawImages) ? rawImages : [rawImages];
  const normalized = images
    .map((image) => String(image || "").trim())
    .filter(Boolean);

  if (normalized.length > 10) {
    throw makeHttpError(400, "Seedream 5.0 Pro supports up to 10 reference images.");
  }

  return normalized;
}

function summarizeImagesForLog(image) {
  if (!image) return undefined;
  const images = Array.isArray(image) ? image : [image];
  const summarized = images.map((item) => {
    if (typeof item !== "string") return "[unsupported image value]";
    if (item.startsWith("data:")) {
      const comma = item.indexOf(",");
      const header = comma > -1 ? item.slice(0, comma) : "data:image";
      return `${header},...`;
    }

    return item;
  });

  return Array.isArray(image) ? summarized : summarized[0];
}

async function callBytePlus(endpoint, apiKey, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = extractProviderError(payload) || `BytePlus request failed with status ${response.status}.`;
      throw makeHttpError(response.status, message, payload);
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw makeHttpError(504, "BytePlus request timed out.");
    }

    if (error.expose) throw error;
    throw makeHttpError(502, "Unable to reach BytePlus ModelArk.", error.message);
  } finally {
    clearTimeout(timeout);
  }
}

function extractProviderError(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload.slice(0, 500);
  if (payload.error && typeof payload.error === "string") return payload.error;
  if (payload.error && payload.error.message) return payload.error.message;
  if (payload.message) return payload.message;
  return "";
}

function makeHttpError(status, message, detail) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  error.detail = detail;
  return error;
}
