const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { URL } = require("node:url");

loadEnvFile();

const PUBLIC_DIR = path.join(__dirname, "public");
const STATUS_FILE = path.join(__dirname, ".seedream-server.json");
const OUTPUT_DIR = path.resolve(__dirname, process.env.OUTPUT_DIR || "generated");
const DEFAULT_MODEL_ID = "dola-seedream-5-0-pro-260628";
const MODEL_ID = String(process.env.ARK_MODEL_ID || DEFAULT_MODEL_ID).trim() || DEFAULT_MODEL_ID;
const DEFAULT_PORT = Number.parseInt(process.env.PORT || "8787", 10);
const MAX_BODY_BYTES = Number.parseInt(process.env.MAX_BODY_BYTES || String(90 * 1024 * 1024), 10);
const MAX_SAVED_IMAGE_BYTES = Number.parseInt(
  process.env.MAX_SAVED_IMAGE_BYTES || String(50 * 1024 * 1024),
  10
);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || "180000", 10);
const STATUS_LOG_INTERVAL_MS = normalizeStatusLogInterval(process.env.STATUS_LOG_INTERVAL_MS);

const RUNTIME_STATE = {
  startedAt: new Date().toISOString(),
  startedAtMs: Date.now(),
  totalRequests: 0,
  activeRequests: 0,
  totalGenerations: 0,
  succeededGenerations: 0,
  failedGenerations: 0,
  cancelledGenerations: 0,
  activeGenerations: new Map()
};

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
  const requestContext = beginHttpRequest(req, res);

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
        outputDir: OUTPUT_DIR,
        defaultBaseUrl: process.env.ARK_BASE_URL || REGION_BASE_URLS["ap-southeast-1"],
        regions: REGION_BASE_URLS,
        runtime: getRuntimeSnapshot({ excludeCurrentRequest: true })
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/generate") {
      const generationController = new AbortController();
      let generationStarted = false;
      const cancelOnDisconnect = () => {
        if (!res.writableEnded && !generationController.signal.aborted) {
          generationController.abort();
          updateGenerationStage(requestContext.id, "cancelling");
          logEvent("WARN", "GENERATE", requestContext.id, "client disconnected; cancelling generation");
        }
      };
      if (typeof res.once === "function") {
        res.once("close", cancelOnDisconnect);
      }

      try {
        const input = await readJsonBody(req);
        const { apiKey, endpoint, providerBody, safeRequest } = buildProviderRequest(input);
        const summary = summarizeGenerationRequest(input, providerBody, endpoint);
        beginGeneration(requestContext.id, summary);
        generationStarted = true;

        updateGenerationStage(requestContext.id, "requesting_byteplus");
        const providerStartedAt = Date.now();
        logEvent("INFO", "UPSTREAM", requestContext.id, "BytePlus request started", {
          endpoint: summary.endpoint,
          model: MODEL_ID,
          size: providerBody.size,
          referenceImages: summary.referenceImages
        });
        const upstream = await callBytePlus(endpoint, apiKey, providerBody, generationController.signal);
        const provider = upstream.payload;
        const generatedImages = Array.isArray(provider && provider.data) ? provider.data.length : 0;
        logEvent("INFO", "UPSTREAM", requestContext.id, "BytePlus response received", {
          status: upstream.status,
          durationMs: Date.now() - providerStartedAt,
          providerRequestId: upstream.requestId,
          generatedImages,
          usage: summarizeProviderUsage(provider)
        });

        updateGenerationStage(requestContext.id, "saving_images");
        const saveStartedAt = Date.now();
        logEvent("INFO", "SAVE", requestContext.id, "saving generated images", {
          images: generatedImages,
          outputDir: OUTPUT_DIR
        });
        const savedResult = await saveGeneratedImages(
          provider,
          providerBody.output_format,
          generationController.signal
        );
        logEvent("INFO", "SAVE", requestContext.id, "image saving finished", {
          durationMs: Date.now() - saveStartedAt,
          saved: savedResult.files.length,
          failed: savedResult.errors.length,
          bytes: savedResult.files.reduce((total, file) => total + (file.bytes || 0), 0),
          files: savedResult.files.map((file) => file.fileName)
        });

        finishGeneration(requestContext.id, "succeeded", {
          generatedImages,
          savedImages: savedResult.files.length,
          saveErrors: savedResult.errors.length
        });
        generationStarted = false;
        sendJson(res, 200, {
          ok: true,
          requestId: requestContext.id,
          model: MODEL_ID,
          endpoint,
          request: safeRequest,
          saved: savedResult.files,
          saveErrors: savedResult.errors,
          outputDir: OUTPUT_DIR,
          provider
        });
      } catch (error) {
        if (generationStarted) {
          const outcome = error.status === 499 || generationController.signal.aborted
            ? "cancelled"
            : "failed";
          finishGeneration(requestContext.id, outcome, { error: error.message });
          generationStarted = false;
        }
        throw error;
      } finally {
        if (typeof res.off === "function") {
          res.off("close", cancelOnDisconnect);
        }
      }
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/generated/")) {
      serveGenerated(requestUrl.pathname, res);
      return;
    }

    if (req.method === "GET") {
      serveStatic(requestUrl.pathname, res);
      return;
    }

    sendJson(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    const status = error.statusCode || error.status || 500;
    logEvent(status >= 500 ? "ERROR" : "WARN", "HTTP", requestContext.id, "request failed", {
      method: requestContext.method,
      path: requestContext.path,
      status,
      error: error.message || "Unknown error"
    });
    if (!error.expose && error.stack) {
      logEvent("ERROR", "SERVER", requestContext.id, "internal error stack", {
        stack: truncateLogText(error.stack, 1200)
      });
    }

    if (res.destroyed || res.writableEnded) return;
    sendJson(res, status, {
      ok: false,
      requestId: requestContext.id,
      error: error.expose ? error.message : "Server error.",
      detail: error.detail
    });
  }
});

listenWithFallback(DEFAULT_PORT);
startStatusHeartbeat();

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

function normalizeStatusLogInterval(value) {
  const parsed = Number.parseInt(value || "10000", 10);
  if (parsed === 0) return 0;
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 10000;
}

function beginHttpRequest(req, res) {
  const id = randomUUID().slice(0, 8);
  const startedAt = Date.now();
  const method = String(req.method || "UNKNOWN").toUpperCase();
  const requestPath = getRequestPath(req.url);
  const rawContentLength = Array.isArray(req.headers["content-length"])
    ? req.headers["content-length"][0]
    : req.headers["content-length"];
  const contentLength = Number.parseInt(rawContentLength || "0", 10);

  RUNTIME_STATE.totalRequests += 1;
  RUNTIME_STATE.activeRequests += 1;
  res.setHeader("X-Request-Id", id);
  logEvent("INFO", "HTTP", id, "request started", {
    method,
    path: requestPath,
    contentLength: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : undefined
  });

  let settled = false;
  const settle = (reason) => {
    if (settled) return;
    settled = true;
    RUNTIME_STATE.activeRequests = Math.max(0, RUNTIME_STATE.activeRequests - 1);
    const status = res.statusCode || 0;
    const level = status >= 500 ? "ERROR" : status >= 400 || reason !== "finished" ? "WARN" : "INFO";
    logEvent(level, "HTTP", id, "request finished", {
      method,
      path: requestPath,
      status,
      durationMs: Date.now() - startedAt,
      reason
    });
  };

  res.once("finish", () => settle("finished"));
  res.once("close", () => settle(res.writableEnded ? "finished" : "connection_closed"));

  return { id, startedAt, method, path: requestPath };
}

function getRequestPath(rawUrl) {
  try {
    return new URL(rawUrl || "/", "http://127.0.0.1").pathname;
  } catch {
    return truncateLogText(rawUrl || "/", 200);
  }
}

function logEvent(level, scope, requestId, message, details) {
  const timestamp = new Date().toISOString();
  const normalizedLevel = String(level || "INFO").toUpperCase();
  const normalizedScope = String(scope || "SERVER").toUpperCase();
  const id = requestId || "--------";
  let suffix = "";
  if (details && Object.values(details).some((value) => value !== undefined)) {
    suffix = ` ${JSON.stringify(details)}`;
  }

  const line = `${timestamp} ${normalizedLevel.padEnd(5)} [${normalizedScope}] [${id}] ${message}${suffix}`;
  if (normalizedLevel === "ERROR") {
    console.error(line);
  } else if (normalizedLevel === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function truncateLogText(value, maxLength = 180) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function sanitizeLogUrl(value) {
  try {
    const parsed = new URL(String(value));
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return truncateLogText(value, 240);
  }
}

function summarizeGenerationRequest(input, providerBody, endpoint) {
  const rawImages = providerBody.image
    ? (Array.isArray(providerBody.image) ? providerBody.image : [providerBody.image])
    : [];
  const referenceSources = rawImages.reduce(
    (counts, image) => {
      if (typeof image === "string" && image.startsWith("data:")) {
        counts.dataUrl += 1;
      } else {
        counts.url += 1;
      }
      return counts;
    },
    { dataUrl: 0, url: 0 }
  );

  return {
    mode: input.mode === "image" ? "image-to-image" : "text-to-image",
    size: providerBody.size,
    outputFormat: providerBody.output_format,
    responseFormat: providerBody.response_format,
    watermark: providerBody.watermark,
    referenceImages: rawImages.length,
    referenceSources,
    promptPreview: truncateLogText(providerBody.prompt, 180),
    extraKeys: input.extra && typeof input.extra === "object" && !Array.isArray(input.extra)
      ? Object.keys(input.extra)
      : [],
    apiKeySource: String(input.apiKey || "").trim() ? "request" : "environment",
    endpoint: sanitizeLogUrl(endpoint)
  };
}

function beginGeneration(requestId, summary) {
  const now = Date.now();
  RUNTIME_STATE.totalGenerations += 1;
  RUNTIME_STATE.activeGenerations.set(requestId, {
    ...summary,
    requestId,
    stage: "accepted",
    startedAt: now,
    updatedAt: now
  });
  logEvent("INFO", "GENERATE", requestId, "generation accepted", summary);
}

function updateGenerationStage(requestId, stage) {
  const generation = RUNTIME_STATE.activeGenerations.get(requestId);
  if (!generation) return;
  generation.stage = stage;
  generation.updatedAt = Date.now();
}

function finishGeneration(requestId, outcome, details = {}) {
  const generation = RUNTIME_STATE.activeGenerations.get(requestId);
  if (!generation) return;
  RUNTIME_STATE.activeGenerations.delete(requestId);

  if (outcome === "succeeded") {
    RUNTIME_STATE.succeededGenerations += 1;
  } else if (outcome === "cancelled") {
    RUNTIME_STATE.cancelledGenerations += 1;
  } else {
    RUNTIME_STATE.failedGenerations += 1;
  }

  const level = outcome === "succeeded" ? "INFO" : outcome === "cancelled" ? "WARN" : "ERROR";
  logEvent(level, "GENERATE", requestId, `generation ${outcome}`, {
    durationMs: Date.now() - generation.startedAt,
    finalStage: generation.stage,
    ...details,
    error: details.error ? truncateLogText(details.error, 500) : undefined
  });
}

function summarizeProviderUsage(provider) {
  const usage = provider && provider.usage;
  if (!usage || typeof usage !== "object") return undefined;
  return {
    generatedImages: usage.generated_images,
    inputImages: usage.input_images,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens
  };
}

function getRuntimeSnapshot({ excludeCurrentRequest = false } = {}) {
  const now = Date.now();
  return {
    startedAt: RUNTIME_STATE.startedAt,
    uptimeSeconds: Math.floor((now - RUNTIME_STATE.startedAtMs) / 1000),
    requests: {
      active: Math.max(0, RUNTIME_STATE.activeRequests - (excludeCurrentRequest ? 1 : 0)),
      total: RUNTIME_STATE.totalRequests
    },
    generations: {
      active: RUNTIME_STATE.activeGenerations.size,
      total: RUNTIME_STATE.totalGenerations,
      succeeded: RUNTIME_STATE.succeededGenerations,
      failed: RUNTIME_STATE.failedGenerations,
      cancelled: RUNTIME_STATE.cancelledGenerations
    },
    activeGenerations: [...RUNTIME_STATE.activeGenerations.values()].map((generation) => ({
      requestId: generation.requestId,
      stage: generation.stage,
      elapsedMs: now - generation.startedAt,
      mode: generation.mode,
      size: generation.size,
      referenceImages: generation.referenceImages
    }))
  };
}

function startStatusHeartbeat() {
  if (STATUS_LOG_INTERVAL_MS <= 0) return;
  const timer = setInterval(() => {
    if (RUNTIME_STATE.activeRequests === 0 && RUNTIME_STATE.activeGenerations.size === 0) return;
    const snapshot = getRuntimeSnapshot();
    logEvent("INFO", "STATUS", null, "runtime heartbeat", {
      uptimeSeconds: snapshot.uptimeSeconds,
      activeRequests: snapshot.requests.active,
      activeGenerations: snapshot.generations.active,
      generations: snapshot.activeGenerations
    });
  }, STATUS_LOG_INTERVAL_MS);
  timer.unref();
}

function listenWithFallback(port, attempts = 0) {
  const nextPort = port + attempts;

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attempts < 20) {
      logEvent("WARN", "SERVER", null, "port is in use; trying the next port", {
        port: nextPort,
        nextPort: nextPort + 1
      });
      listenWithFallback(port, attempts + 1);
      return;
    }

    logEvent("ERROR", "SERVER", null, "server failed to start", {
      error: error.message || String(error)
    });
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

    logEvent("INFO", "SERVER", null, "Seedream frontend ready", {
      url,
      pid: process.pid,
      model: MODEL_ID,
      apiKey: getEnvApiKey() ? "configured" : "not_configured",
      outputDir: OUTPUT_DIR,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      statusLogIntervalMs: STATUS_LOG_INTERVAL_MS
    });
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

function serveGenerated(pathname, res) {
  const relativePath = decodeURIComponent(pathname.slice("/generated/".length));
  const filePath = path.resolve(OUTPUT_DIR, relativePath);
  const outputPrefix = `${OUTPUT_DIR}${path.sep}`;

  if (!filePath.startsWith(outputPrefix)) {
    sendJson(res, 403, { ok: false, error: "Forbidden." });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      const status = error.code === "ENOENT" ? 404 : 500;
      const message = status === 404 ? "Saved image not found." : "Saved image read error.";
      sendJson(res, status, { ok: false, error: message });
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

  if (width % 16 !== 0 || height % 16 !== 0) {
    throw makeHttpError(400, "Custom width and height must be multiples of 16.");
  }

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

async function saveGeneratedImages(provider, outputFormat, signal) {
  const images = Array.isArray(provider && provider.data) ? provider.data : [];
  if (images.length === 0) {
    return { files: [], errors: [] };
  }

  throwIfGenerationCancelled(signal);

  try {
    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    return {
      files: [],
      errors: images.map((_, index) => ({
        index,
        error: error.message || "Unable to create the output directory."
      }))
    };
  }
  const outcomes = await Promise.all(
    images.map((item, index) => saveGeneratedImage(item, index, outputFormat, signal))
  );
  throwIfGenerationCancelled(signal);

  return outcomes.reduce(
    (result, outcome) => {
      if (outcome.error) {
        result.errors.push(outcome);
      } else {
        result.files.push(outcome);
      }
      return result;
    },
    { files: [], errors: [] }
  );
}

async function saveGeneratedImage(item, index, outputFormat, signal) {
  try {
    throwIfGenerationCancelled(signal);
    let content;
    let source;

    if (item && item.b64_json) {
      const encoded = String(item.b64_json).replace(/^data:[^;]+;base64,/i, "");
      content = Buffer.from(encoded, "base64");
      source = "b64_json";
    } else if (item && item.url) {
      content = await downloadGeneratedImage(item.url, signal);
      source = "url";
    } else {
      throw new Error("The provider result does not contain an image URL or b64_json.");
    }

    if (content.length === 0) {
      throw new Error("The generated image is empty.");
    }
    if (content.length > MAX_SAVED_IMAGE_BYTES) {
      throw new Error(`The generated image exceeds ${MAX_SAVED_IMAGE_BYTES} bytes.`);
    }

    const extension = normalizeImageExtension(outputFormat);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `seedream-${timestamp}-${index + 1}-${randomUUID().slice(0, 8)}.${extension}`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    await fs.promises.writeFile(filePath, content, { flag: "wx", signal });

    return {
      index,
      fileName,
      url: `/generated/${encodeURIComponent(fileName)}`,
      bytes: content.length,
      source
    };
  } catch (error) {
    return {
      index,
      error: error.message || "Unable to save generated image."
    };
  }
}

async function downloadGeneratedImage(imageUrl, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;

  try {
    const response = await fetch(imageUrl, { signal });
    if (!response.ok) {
      throw new Error(`Image download failed with status ${response.status}.`);
    }

    const declaredLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
    if (declaredLength > MAX_SAVED_IMAGE_BYTES) {
      throw new Error(`The generated image exceeds ${MAX_SAVED_IMAGE_BYTES} bytes.`);
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error.name === "AbortError") {
      if (externalSignal && externalSignal.aborted) {
        throw makeHttpError(499, "Generation cancelled.");
      }
      throw new Error("Image download timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeImageExtension(outputFormat) {
  return String(outputFormat || "png").toLowerCase() === "jpeg" ? "jpeg" : "png";
}

function throwIfGenerationCancelled(signal) {
  if (signal && signal.aborted) {
    throw makeHttpError(499, "Generation cancelled.");
  }
}

async function callBytePlus(endpoint, apiKey, body, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = extractProviderError(payload) || `BytePlus request failed with status ${response.status}.`;
      throw makeHttpError(response.status, message, payload);
    }

    return {
      payload,
      status: response.status,
      requestId: response.headers.get("x-request-id") || response.headers.get("x-tt-logid") || undefined
    };
  } catch (error) {
    if (error.name === "AbortError") {
      if (externalSignal && externalSignal.aborted) {
        throw makeHttpError(499, "Generation cancelled.");
      }
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
