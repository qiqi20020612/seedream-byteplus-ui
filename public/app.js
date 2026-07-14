const STORAGE_KEY = "seedream.byteplus.apiKey";
const MAX_REFERENCES = 10;
const MAX_REFERENCE_BYTES = 30 * 1024 * 1024;

const regionBaseUrls = {
  "ap-southeast-1": "https://ark.ap-southeast.bytepluses.com/api/v3",
  "eu-west-1": "https://ark.eu-west.bytepluses.com/api/v3"
};

const documentedSizePresets = {
  "1K": {
    "1:1": "1024x1024",
    "4:3": "1152x864",
    "3:4": "864x1152",
    "16:9": "1424x800",
    "9:16": "800x1424",
    "3:2": "1248x832",
    "2:3": "832x1248",
    "21:9": "1568x672"
  },
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2368x1776",
    "3:4": "1776x2368",
    "16:9": "2816x1584",
    "9:16": "1584x2816",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "21:9": "3136x1344"
  }
};
const supportedAspectRatios = Object.keys(documentedSizePresets["2K"]);

const state = {
  mode: "text",
  references: [],
  lastPayload: null,
  modelId: "",
  generations: new Map()
};

const els = {
  form: document.querySelector("#generatorForm"),
  modelName: document.querySelector("#modelName"),
  serverStatus: document.querySelector("#serverStatus"),
  prompt: document.querySelector("#prompt"),
  promptCount: document.querySelector("#promptCount"),
  clearPrompt: document.querySelector("#clearPrompt"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  imagePanel: document.querySelector("#imagePanel"),
  imageFiles: document.querySelector("#imageFiles"),
  imageUrl: document.querySelector("#imageUrl"),
  addImageUrl: document.querySelector("#addImageUrl"),
  referenceList: document.querySelector("#referenceList"),
  imageCount: document.querySelector("#imageCount"),
  apiKey: document.querySelector("#apiKey"),
  rememberKey: document.querySelector("#rememberKey"),
  region: document.querySelector("#region"),
  baseUrlField: document.querySelector("#baseUrlField"),
  baseUrl: document.querySelector("#baseUrl"),
  sizeMode: document.querySelector("#sizeMode"),
  sizeLevel: document.querySelector("#sizeLevel"),
  sizeLevelField: document.querySelector("#sizeLevelField"),
  aspectRatio: document.querySelector("#aspectRatio"),
  aspectField: document.querySelector("#aspectField"),
  width: document.querySelector("#width"),
  height: document.querySelector("#height"),
  widthField: document.querySelector("#widthField"),
  heightField: document.querySelector("#heightField"),
  outputFormat: document.querySelector("#outputFormat"),
  responseFormat: document.querySelector("#responseFormat"),
  watermark: document.querySelector("#watermark"),
  extraJson: document.querySelector("#extraJson"),
  requestPreview: document.querySelector("#requestPreview"),
  generateButton: document.querySelector("#generateButton"),
  resultMeta: document.querySelector("#resultMeta"),
  resultGrid: document.querySelector("#resultGrid"),
  rawResponse: document.querySelector("#rawResponse"),
  notice: document.querySelector("#notice"),
  clearResults: document.querySelector("#clearResults")
};

const icons = {
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V5h16v2"/><path d="M9 20h6"/><path d="M12 5v15"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="m21 16-5-5L5 19"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 21-4-4L14 6a3 3 0 0 1 4 0 3 3 0 0 1 0 4L7 21Z"/><path d="M12 11l5 5"/><path d="M7 21h10"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 14h10l1-14"/><path d="M9 7V4h6v3"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 9 10l-7 3 7 3 4 8 4-8 7-3-7-3-4-8Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
};

document.querySelectorAll("[data-icon]").forEach((node) => {
  node.innerHTML = icons[node.dataset.icon] || "";
});

bootstrap();

function bootstrap() {
  const savedKey = localStorage.getItem(STORAGE_KEY);
  if (savedKey) {
    els.apiKey.value = savedKey;
    els.rememberKey.checked = true;
  }

  bindEvents();
  refreshConditionalFields();
  renderReferences();
  updateRequestPreview();
  checkServer();
}

function bindEvents() {
  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  els.form.addEventListener("submit", handleSubmit);
  els.clearPrompt.addEventListener("click", () => {
    els.prompt.value = "";
    syncPromptCount();
    updateRequestPreview();
  });

  els.clearResults.addEventListener("click", clearResults);
  els.imageFiles.addEventListener("change", handleFileInput);
  els.addImageUrl.addEventListener("click", addImageUrl);
  els.imageUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addImageUrl();
    }
  });

  [
    els.prompt,
    els.apiKey,
    els.rememberKey,
    els.region,
    els.baseUrl,
    els.sizeMode,
    els.sizeLevel,
    els.aspectRatio,
    els.width,
    els.height,
    els.outputFormat,
    els.responseFormat,
    els.watermark,
    els.extraJson
  ].forEach((element) => {
    element.addEventListener("input", () => {
      if (element === els.prompt) syncPromptCount();
      if (element === els.rememberKey || element === els.apiKey) persistKey();
      refreshConditionalFields();
      updateRequestPreview();
    });
    element.addEventListener("change", () => {
      if (element === els.rememberKey || element === els.apiKey) persistKey();
      refreshConditionalFields();
      updateRequestPreview();
    });
  });
}

async function checkServer() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    state.modelId = String(data.model || "").trim();
    els.modelName.textContent = state.modelId || "未配置模型";
    els.serverStatus.textContent = data.hasEnvKey ? "已配置密钥" : "等待密钥";
    els.serverStatus.classList.toggle("is-ready", data.hasEnvKey);
    els.serverStatus.classList.toggle("is-warn", !data.hasEnvKey);
    updateRequestPreview();
  } catch {
    els.modelName.textContent = "模型加载失败";
    els.serverStatus.textContent = "连接失败";
    els.serverStatus.classList.add("is-warn");
  }
}

function setMode(mode) {
  state.mode = mode === "image" ? "image" : "text";
  els.modeButtons.forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  els.imagePanel.classList.toggle("is-hidden", state.mode !== "image");
  updateRequestPreview();
}

function refreshConditionalFields() {
  const customBase = els.region.value === "custom";
  els.baseUrlField.classList.toggle("is-hidden", !customBase);
  if (!customBase && regionBaseUrls[els.region.value]) {
    els.baseUrl.value = regionBaseUrls[els.region.value];
  }

  const customSize = els.sizeMode.value === "custom";
  els.sizeLevelField.classList.toggle("is-hidden", customSize);
  els.aspectField.classList.toggle("is-hidden", customSize);
  els.widthField.classList.toggle("is-hidden", !customSize);
  els.heightField.classList.toggle("is-hidden", !customSize);
}

function syncPromptCount() {
  els.promptCount.textContent = `${els.prompt.value.length} / 8000`;
}

function persistKey() {
  if (els.rememberKey.checked && els.apiKey.value.trim()) {
    localStorage.setItem(STORAGE_KEY, els.apiKey.value.trim());
  } else if (!els.rememberKey.checked) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function handleFileInput(event) {
  const files = [...event.target.files];
  let latestReference = null;
  for (const file of files) {
    if (state.references.length >= MAX_REFERENCES) {
      showNotice("参考图最多 10 张。", "error");
      break;
    }

    if (file.size > MAX_REFERENCE_BYTES) {
      showNotice(`${file.name} 超过 30 MB。`, "error");
      continue;
    }

    if (!file.type.startsWith("image/")) {
      showNotice(`${file.name} 不是图片文件。`, "error");
      continue;
    }

    const value = await fileToDataUrl(file);
    const reference = {
      id: crypto.randomUUID(),
      type: "file",
      name: file.name,
      value
    };
    state.references.push(reference);
    latestReference = reference;
  }

  els.imageFiles.value = "";
  renderReferences();
  updateRequestPreview();
  if (latestReference) {
    void matchReferenceAspectRatio(latestReference);
  }
}

function addImageUrl() {
  const value = els.imageUrl.value.trim();
  if (!value) return;

  if (state.references.length >= MAX_REFERENCES) {
    showNotice("参考图最多 10 张。", "error");
    return;
  }

  if (!/^https?:\/\//i.test(value) && !value.startsWith("data:image/")) {
    showNotice("图片 URL 需要以 http://、https:// 或 data:image/ 开头。", "error");
    return;
  }

  const reference = {
    id: crypto.randomUUID(),
    type: "url",
    name: shortName(value),
    value
  };
  state.references.push(reference);
  els.imageUrl.value = "";
  renderReferences();
  updateRequestPreview();
  void matchReferenceAspectRatio(reference);
}

function renderReferences() {
  els.referenceList.innerHTML = "";
  els.imageCount.textContent = `${state.references.length} / ${MAX_REFERENCES}`;

  for (const reference of state.references) {
    const item = document.createElement("div");
    item.className = "reference-item";

    const image = document.createElement("img");
    image.src = reference.value;
    image.alt = reference.name;
    image.loading = "lazy";
    item.append(image);

    const name = document.createElement("span");
    name.className = "reference-name";
    name.textContent = reference.name;
    item.append(name);

    const remove = document.createElement("button");
    remove.className = "reference-remove";
    remove.type = "button";
    remove.title = "移除";
    remove.setAttribute("aria-label", "移除参考图");
    remove.innerHTML = icons.close;
    remove.addEventListener("click", () => {
      state.references = state.references.filter((candidate) => candidate.id !== reference.id);
      renderReferences();
      updateRequestPreview();
    });
    item.append(remove);

    els.referenceList.append(item);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function matchReferenceAspectRatio(reference) {
  try {
    const { width, height } = await loadImageDimensions(reference.value);
    const latestReference = state.references[state.references.length - 1];
    if (state.mode !== "image" || latestReference?.id !== reference.id) return;

    const closestRatio = findClosestAspectRatio(width, height);
    if (!closestRatio) return;

    els.aspectRatio.value = closestRatio;
    refreshConditionalFields();
    updateRequestPreview();
  } catch {
    // Some remote image hosts block browser loading. Keep the current ratio in that case.
  }
}

function loadImageDimensions(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法读取参考图尺寸。"));
    image.src = source;
  });
}

function findClosestAspectRatio(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const targetRatio = width / height;
  let closestRatio = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const ratio of supportedAspectRatios) {
    const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);
    const candidateRatio = ratioWidth / ratioHeight;
    const distance = Math.abs(Math.log(targetRatio / candidateRatio));
    if (distance < closestDistance) {
      closestRatio = ratio;
      closestDistance = distance;
    }
  }

  return closestRatio;
}

function buildPayload({ preview = false } = {}) {
  const size = els.sizeMode.value === "custom"
    ? getCustomSize()
    : getPresetSize();
  const prompt = els.prompt.value.trim();

  let extra = {};
  const rawExtra = els.extraJson.value.trim();
  if (rawExtra) {
    extra = JSON.parse(rawExtra);
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
      throw new Error("高级 JSON 必须是对象。");
    }
  }

  const payload = {
    apiKey: els.apiKey.value.trim(),
    region: els.region.value,
    baseUrl: els.region.value === "custom" ? els.baseUrl.value.trim() : undefined,
    mode: state.mode,
    model: state.modelId || undefined,
    prompt,
    size,
    output_format: els.outputFormat.value,
    response_format: els.responseFormat.value,
    watermark: els.watermark.checked,
    images: state.mode === "image" ? state.references.map((reference) => reference.value) : [],
    extra
  };

  if (!preview) {
    if (!prompt) throw new Error("请先输入提示词。");
    if (state.mode === "image" && state.references.length === 0) {
      throw new Error("图生图需要至少一张参考图。");
    }
  }

  return payload;
}

function getPresetSize() {
  const level = els.sizeLevel.value.toUpperCase();
  const ratio = els.aspectRatio.value;
  if (ratio === "auto") return level;

  const size = documentedSizePresets[level]?.[ratio];

  if (!size) {
    throw new Error("请选择有效的分辨率档位和图片比例。");
  }

  return size;
}

function getCustomSize() {
  const width = Number(els.width.value);
  const height = Number(els.height.value);

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("请输入有效的自定义宽高。");
  }

  if (width % 16 !== 0 || height % 16 !== 0) {
    throw new Error("自定义宽高必须是 16 的倍数。");
  }

  const pixels = width * height;
  const aspect = width / height;
  if (pixels < 921600 || pixels > 4624220 || aspect < 1 / 16 || aspect > 16) {
    throw new Error("自定义尺寸需满足总像素 921,600–4,624,220，宽高比 1:16–16:1。");
  }

  return `${width}x${height}`;
}

function updateRequestPreview() {
  try {
    const payload = buildPayload({ preview: true });
    els.requestPreview.textContent = JSON.stringify(redactPayload(payload), null, 2);
  } catch (error) {
    els.requestPreview.textContent = error.message;
  }
}

function redactPayload(payload) {
  return {
    ...payload,
    apiKey: payload.apiKey ? "sk-..." : "",
    images: payload.images.map((image) => {
      if (image.startsWith("data:")) {
        const comma = image.indexOf(",");
        return `${image.slice(0, comma)},...`;
      }

      return image;
    })
  };
}

async function handleSubmit(event) {
  event.preventDefault();
  hideNotice();

  let payload;
  try {
    payload = buildPayload();
  } catch (error) {
    showNotice(error.message, "error");
    return;
  }

  const task = createGenerationTask(payload);
  state.lastPayload = payload;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: task.controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(extractError(data, response.status));
    }

    renderResult(data, task);
  } catch (error) {
    if (error.name === "AbortError") {
      showNotice("已取消生成。", "info");
    } else {
      showNotice(error.message, "error");
    }
  } finally {
    removeGenerationTask(task.id);
  }
}

function renderResult(result, task) {
  const provider = result.provider || {};
  const images = Array.isArray(provider.data) ? provider.data : [];
  const saved = Array.isArray(result.saved) ? result.saved : [];
  const saveErrors = Array.isArray(result.saveErrors) ? result.saveErrors : [];
  const savedByIndex = new Map(saved.map((item) => [item.index, item]));
  els.rawResponse.textContent = JSON.stringify(result, null, 2);

  if (saveErrors.length > 0) {
    showNotice(`生成成功，但有 ${saveErrors.length} 张图片未能自动保存。保存目录：${result.outputDir}`, "error");
  } else if (saved.length > 0) {
    showNotice(`已自动保存到 ${result.outputDir}`);
  }

  const fragment = document.createDocumentFragment();
  images.forEach((item, index) => {
    fragment.append(createResultCard(item, savedByIndex.get(index), index, task.outputFormat));
  });

  if (task.card.isConnected) {
    els.resultGrid.insertBefore(fragment, task.card);
  } else {
    els.resultGrid.prepend(fragment);
  }

  removeGenerationTask(task.id);
}

function createResultCard(item, saved, index, outputFormat) {
  const source = normalizeImageSource(item, saved, outputFormat);
  const card = document.createElement("article");
  card.className = "result-card";

  const image = document.createElement("img");
  image.src = source.src;
  image.alt = `Seedream result ${index + 1}`;
  card.append(image);

  const body = document.createElement("div");
  body.className = "result-card-body";

  const meta = document.createElement("code");
  meta.textContent = source.label;
  body.append(meta);

  const actions = document.createElement("div");
  actions.className = "result-actions";

  if (source.src) {
    const open = document.createElement("a");
    open.href = source.src;
    open.target = "_blank";
    open.rel = "noreferrer";
    open.innerHTML = `${icons.external}打开`;
    actions.append(open);
  }

  if (source.copyValue) {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.innerHTML = `${icons.copy}复制`;
    copy.addEventListener("click", () => copyText(source.copyValue));
    actions.append(copy);
  }

  if (source.downloadValue) {
    const download = document.createElement("a");
    download.href = source.downloadValue;
    download.download = source.downloadName || `seedream-${Date.now()}-${index + 1}.${outputFormat}`;
    download.innerHTML = `${icons.download}保存`;
    actions.append(download);
  }

  body.append(actions);
  card.append(body);
  return card;
}

function normalizeImageSource(item, saved, outputFormat) {
  if (item.url) {
    return {
      src: saved ? saved.url : item.url,
      label: saved ? `已保存 · ${saved.fileName}` : (item.size || "url"),
      copyValue: item.url
    };
  }

  if (item.b64_json) {
    const fallbackSrc = `data:image/${outputFormat};base64,${item.b64_json}`;
    const src = saved ? saved.url : fallbackSrc;
    return {
      src,
      label: saved ? `已保存 · ${saved.fileName}` : (item.size || "b64_json"),
      copyValue: "",
      downloadValue: src,
      downloadName: saved ? saved.fileName : ""
    };
  }

  return {
    src: "",
    label: "unsupported response"
  };
}

function extractError(data, status) {
  if (data.error) return data.error;
  if (data.detail && typeof data.detail === "string") return data.detail;
  if (data.detail && data.detail.error && data.detail.error.message) return data.detail.error.message;
  return `请求失败：${status}`;
}

function createGenerationTask(payload) {
  const id = crypto.randomUUID();
  const controller = new AbortController();
  const card = document.createElement("article");
  card.className = "result-card generation-card";
  card.dataset.generationId = id;
  card.setAttribute("role", "status");
  card.setAttribute("aria-live", "polite");

  const visual = document.createElement("div");
  visual.className = "generation-card-visual";

  const status = document.createElement("div");
  status.className = "generation-card-status";
  status.innerHTML = `<span class="generation-card-spark">${icons.spark}</span><strong>正在生成</strong>`;
  visual.append(status);
  card.append(visual);

  const body = document.createElement("div");
  body.className = "result-card-body generation-card-body";

  const prompt = document.createElement("p");
  prompt.textContent = payload.prompt;
  body.append(prompt);

  const footer = document.createElement("div");
  footer.className = "generation-card-footer";

  const time = document.createElement("code");
  time.textContent = "已等待 0 秒";
  footer.append(time);

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "generation-cancel";
  cancel.innerHTML = `${icons.close}取消`;
  cancel.addEventListener("click", () => cancelGeneration(id));
  footer.append(cancel);
  body.append(footer);
  card.append(body);

  const task = {
    id,
    controller,
    card,
    statusNode: status.querySelector("strong"),
    timeNode: time,
    cancelButton: cancel,
    outputFormat: payload.output_format,
    startedAt: Date.now(),
    timer: null
  };
  task.timer = setInterval(() => updateGenerationTaskTime(task), 1000);
  state.generations.set(id, task);
  els.resultGrid.prepend(card);
  updateGenerateButton();
  updateResultMeta();
  return task;
}

function updateGenerationTaskTime(task) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - task.startedAt) / 1000));
  task.timeNode.textContent = `已等待 ${elapsedSeconds} 秒`;
}

function cancelGeneration(id) {
  const task = state.generations.get(id);
  if (!task || task.controller.signal.aborted) return;

  task.statusNode.textContent = "正在取消";
  task.card.classList.add("is-cancelling");
  task.cancelButton.disabled = true;
  task.controller.abort();
}

function removeGenerationTask(id) {
  const task = state.generations.get(id);
  if (!task) return;

  clearInterval(task.timer);
  task.card.remove();
  state.generations.delete(id);
  updateGenerateButton();
  updateResultMeta();
}

function updateGenerateButton() {
  const activeCount = state.generations.size;
  els.generateButton.disabled = false;
  els.generateButton.innerHTML = activeCount > 0
    ? `${icons.spark}继续生成（${activeCount} 个进行中）`
    : `${icons.spark}生成`;
}

function updateResultMeta() {
  const imageCount = els.resultGrid.querySelectorAll(".result-card:not(.generation-card)").length;
  const generationCount = state.generations.size;
  els.resultGrid.classList.toggle("is-empty", imageCount === 0 && generationCount === 0);

  if (generationCount > 0) {
    const resultSummary = imageCount > 0 ? ` · 已有 ${imageCount} 张图片` : "";
    els.resultMeta.textContent = `${generationCount} 个任务生成中${resultSummary}`;
  } else {
    els.resultMeta.textContent = imageCount > 0 ? `${imageCount} 张图片` : "等待生成";
  }
}

function showNotice(message, type = "info") {
  els.notice.textContent = message;
  els.notice.classList.remove("is-hidden");
  els.notice.classList.toggle("is-error", type === "error");
  els.notice.classList.toggle("is-info", type !== "error");
}

function hideNotice() {
  els.notice.textContent = "";
  els.notice.classList.add("is-hidden");
}

function clearResults() {
  const generationCards = [...els.resultGrid.querySelectorAll(".generation-card")];
  els.resultGrid.innerHTML = "";
  for (const card of generationCards) {
    els.resultGrid.append(card);
  }
  updateResultMeta();
  els.rawResponse.textContent = "";
  hideNotice();
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    showNotice("已复制。");
  } catch {
    showNotice("复制失败。", "error");
  }
}

function shortName(value) {
  try {
    const parsed = new URL(value);
    const name = parsed.pathname.split("/").filter(Boolean).pop();
    return name || parsed.hostname;
  } catch {
    return value.slice(0, 36);
  }
}
