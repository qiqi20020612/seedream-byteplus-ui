const STORAGE_KEY = "seedream.byteplus.apiKey";
const THEME_STORAGE_KEY = "seedream.ui.theme";
const THEME_PREFERENCES = ["system", "light", "dark"];
const MAX_REFERENCES = 10;
const MAX_REFERENCE_BYTES = 30 * 1024 * 1024;
const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
const mobileDrawerMediaQuery = window.matchMedia("(max-width: 640px)");

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
let referenceDragDepth = 0;

const state = {
  mode: "text",
  references: [],
  lastPayload: null,
  modelId: "",
  generations: new Map(),
  themePreference: "system",
  settingsOpen: false,
  previewTrigger: null,
  previewLabel: ""
};

const els = {
  form: document.querySelector("#generatorForm"),
  themeColor: document.querySelector("#themeColor"),
  themeToggle: document.querySelector("#themeToggle"),
  themeIcon: document.querySelector("#themeIcon"),
  themeLabel: document.querySelector("#themeLabel"),
  settingsDrawer: document.querySelector("#settingsDrawer"),
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsToggleLabel: document.querySelector("#settingsToggleLabel"),
  closeSettings: document.querySelector("#closeSettings"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  imagePreviewDialog: document.querySelector("#imagePreviewDialog"),
  imagePreviewStage: document.querySelector("#imagePreviewStage"),
  imagePreviewZoom: document.querySelector("#imagePreviewZoom"),
  imagePreviewImage: document.querySelector("#imagePreviewImage"),
  imagePreviewMeta: document.querySelector("#imagePreviewMeta"),
  imagePreviewResponse: document.querySelector("#imagePreviewResponse"),
  closeImagePreview: document.querySelector("#closeImagePreview"),
  modelName: document.querySelector("#modelName"),
  serverStatus: document.querySelector("#serverStatus"),
  prompt: document.querySelector("#prompt"),
  promptCount: document.querySelector("#promptCount"),
  clearPrompt: document.querySelector("#clearPrompt"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  imagePanel: document.querySelector("#imagePanel"),
  referenceDropzone: document.querySelector("#referenceDropzone"),
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
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.4 15.4A8.5 8.5 0 0 1 8.6 3.6 8.5 8.5 0 1 0 20.4 15.4Z"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>'
};

document.querySelectorAll("[data-icon]").forEach((node) => {
  node.innerHTML = icons[node.dataset.icon] || "";
});

bootstrap();

function bootstrap() {
  initializeTheme();

  const savedKey = localStorage.getItem(STORAGE_KEY);
  if (savedKey) {
    els.apiKey.value = savedKey;
    els.rememberKey.checked = true;
  }

  bindEvents();
  syncSettingsDrawerMode();
  refreshConditionalFields();
  renderReferences();
  updateRequestPreview();
  checkServer();
}

function bindEvents() {
  els.themeToggle.addEventListener("click", () => {
    applyTheme(getNextThemePreference(), { persist: true });
  });

  const handleSystemThemeChange = () => {
    applyTheme(state.themePreference);
  };
  if (typeof themeMediaQuery.addEventListener === "function") {
    themeMediaQuery.addEventListener("change", handleSystemThemeChange);
  } else {
    themeMediaQuery.addListener(handleSystemThemeChange);
  }

  els.settingsToggle.addEventListener("click", toggleSettingsDrawer);
  els.closeSettings.addEventListener("click", () => closeSettingsDrawer());
  els.drawerBackdrop.addEventListener("click", () => closeSettingsDrawer());
  els.closeImagePreview.addEventListener("click", closeImagePreview);
  els.imagePreviewZoom.addEventListener("click", toggleImagePreviewZoom);
  els.imagePreviewZoom.addEventListener("keydown", handleImagePreviewZoomKeydown);
  els.imagePreviewDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeImagePreview();
  });
  els.imagePreviewDialog.addEventListener("click", (event) => {
    if (event.target === els.imagePreviewDialog) closeImagePreview();
  });
  els.imagePreviewDialog.addEventListener("close", resetImagePreview);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    if (els.imagePreviewDialog.open) {
      event.preventDefault();
      closeImagePreview();
      return;
    }

    if (state.settingsOpen) {
      closeSettingsDrawer();
    }
  });

  const handleDrawerBreakpointChange = () => syncSettingsDrawerMode();
  if (typeof mobileDrawerMediaQuery.addEventListener === "function") {
    mobileDrawerMediaQuery.addEventListener("change", handleDrawerBreakpointChange);
  } else {
    mobileDrawerMediaQuery.addListener(handleDrawerBreakpointChange);
  }

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
  els.referenceDropzone.addEventListener("click", () => els.imageFiles.click());
  els.referenceDropzone.addEventListener("dragenter", handleReferenceDragEnter);
  els.referenceDropzone.addEventListener("dragover", handleReferenceDragOver);
  els.referenceDropzone.addEventListener("dragleave", handleReferenceDragLeave);
  els.referenceDropzone.addEventListener("drop", handleReferenceDrop);
  document.addEventListener("paste", handleReferencePaste);
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

function initializeTheme() {
  let preference = "system";
  try {
    const savedPreference = localStorage.getItem(THEME_STORAGE_KEY);
    if (THEME_PREFERENCES.includes(savedPreference)) {
      preference = savedPreference;
    }
  } catch {
    // Keep following the system theme when storage is unavailable.
  }

  applyTheme(preference);
}

function applyTheme(preference, { persist = false } = {}) {
  const normalizedPreference = THEME_PREFERENCES.includes(preference) ? preference : "system";
  const resolvedTheme = normalizedPreference === "system"
    ? (themeMediaQuery.matches ? "dark" : "light")
    : normalizedPreference;

  state.themePreference = normalizedPreference;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = normalizedPreference;
  els.themeColor.content = resolvedTheme === "dark" ? "#0c1112" : "#f4f6f4";

  if (persist) {
    try {
      if (normalizedPreference === "system") {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, normalizedPreference);
      }
    } catch {
      // The theme still applies for this session when storage is unavailable.
    }
  }

  updateThemeControl(resolvedTheme);
}

function getNextThemePreference() {
  const systemTheme = themeMediaQuery.matches ? "dark" : "light";
  const oppositeTheme = systemTheme === "dark" ? "light" : "dark";

  if (state.themePreference === "system") return oppositeTheme;
  if (state.themePreference === oppositeTheme) return systemTheme;
  return "system";
}

function updateThemeControl(resolvedTheme) {
  const themeDetails = {
    system: { label: "跟随系统", icon: "system" },
    light: { label: "浅色模式", icon: "sun" },
    dark: { label: "深色模式", icon: "moon" }
  };
  const current = themeDetails[state.themePreference];
  const next = themeDetails[getNextThemePreference()];

  els.themeIcon.innerHTML = icons[current.icon];
  els.themeLabel.textContent = current.label;
  els.themeToggle.dataset.resolvedTheme = resolvedTheme;
  els.themeToggle.title = `当前：${current.label}。点击切换到${next.label}`;
  els.themeToggle.setAttribute("aria-label", els.themeToggle.title);
}

function syncSettingsDrawerMode() {
  if (mobileDrawerMediaQuery.matches) {
    els.settingsDrawer.setAttribute("role", "dialog");
    els.settingsDrawer.setAttribute("aria-hidden", String(!state.settingsOpen));
    els.settingsDrawer.inert = !state.settingsOpen;
    els.drawerBackdrop.setAttribute("aria-hidden", "true");
    els.settingsToggle.setAttribute("aria-expanded", String(state.settingsOpen));
    els.settingsToggle.setAttribute("aria-label", state.settingsOpen ? "收起生成参数" : "打开生成参数");
    els.settingsToggleLabel.textContent = state.settingsOpen ? "收起" : "参数";
    return;
  }

  setSettingsDrawerOpen(false, { restoreFocus: false });
  els.settingsDrawer.removeAttribute("role");
  els.settingsDrawer.removeAttribute("aria-hidden");
  els.settingsDrawer.inert = false;
  els.drawerBackdrop.setAttribute("aria-hidden", "true");
}

function toggleSettingsDrawer() {
  setSettingsDrawerOpen(!state.settingsOpen);
}

function closeSettingsDrawer({ restoreFocus = true } = {}) {
  setSettingsDrawerOpen(false, { restoreFocus });
}

function setSettingsDrawerOpen(open, { restoreFocus = false } = {}) {
  const wasOpen = state.settingsOpen;
  const shouldOpen = Boolean(open && mobileDrawerMediaQuery.matches);
  state.settingsOpen = shouldOpen;

  els.settingsDrawer.classList.toggle("is-drawer-open", shouldOpen);
  els.drawerBackdrop.classList.toggle("is-visible", shouldOpen);
  document.body.classList.toggle("drawer-open", shouldOpen);
  els.settingsToggle.setAttribute("aria-expanded", String(shouldOpen));
  els.settingsToggle.setAttribute("aria-label", shouldOpen ? "收起生成参数" : "打开生成参数");
  els.settingsToggleLabel.textContent = shouldOpen ? "收起" : "参数";

  if (mobileDrawerMediaQuery.matches) {
    els.settingsDrawer.setAttribute("aria-hidden", String(!shouldOpen));
    els.settingsDrawer.inert = !shouldOpen;
    els.drawerBackdrop.setAttribute("aria-hidden", "true");
  }

  if (shouldOpen) {
    requestAnimationFrame(() => els.closeSettings.focus({ preventScroll: true }));
  } else if (restoreFocus && wasOpen && mobileDrawerMediaQuery.matches) {
    els.settingsToggle.focus({ preventScroll: true });
  }
}

function openImagePreview(source, alt, trigger) {
  if (!source || !source.src) return;

  state.previewTrigger = trigger instanceof HTMLElement ? trigger : null;
  state.previewLabel = source.label || "Seedream 生成结果";
  resetImagePreviewZoom();
  els.imagePreviewImage.src = source.src;
  els.imagePreviewImage.alt = alt || "Seedream 生成结果大图";
  els.rawResponse.textContent = source.rawResponse || "";
  els.imagePreviewResponse.hidden = !source.rawResponse;
  els.imagePreviewDialog.removeAttribute("aria-hidden");
  document.body.classList.add("image-preview-open");

  if (!els.imagePreviewDialog.open) {
    if (typeof els.imagePreviewDialog.showModal === "function") {
      els.imagePreviewDialog.showModal();
    } else {
      els.imagePreviewDialog.setAttribute("open", "");
    }
  }

  requestAnimationFrame(() => els.closeImagePreview.focus({ preventScroll: true }));
}

function toggleImagePreviewZoom(event) {
  if (els.imagePreviewStage.classList.contains("is-zoomed")) {
    resetImagePreviewZoom();
    return;
  }

  const naturalWidth = els.imagePreviewImage.naturalWidth;
  const naturalHeight = els.imagePreviewImage.naturalHeight;
  if (!naturalWidth || !naturalHeight) return;

  const stageStyle = getComputedStyle(els.imagePreviewStage);
  const paddingLeft = Number.parseFloat(stageStyle.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(stageStyle.paddingRight) || 0;
  const paddingTop = Number.parseFloat(stageStyle.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(stageStyle.paddingBottom) || 0;
  const availableWidth = Math.max(
    1,
    els.imagePreviewStage.clientWidth - paddingLeft - paddingRight
  );
  const availableHeight = Math.max(
    1,
    els.imagePreviewStage.clientHeight - paddingTop - paddingBottom
  );
  const fittedScale = Math.min(
    1,
    availableWidth / naturalWidth,
    availableHeight / naturalHeight
  );
  const zoomScale = fittedScale < 0.999 ? 1 : 2;
  const zoomWidth = Math.max(1, Math.round(naturalWidth * zoomScale));
  const zoomHeight = Math.max(1, Math.round(naturalHeight * zoomScale));
  const fittedWidth = naturalWidth * fittedScale;
  const fittedHeight = naturalHeight * fittedScale;
  let focusX = 0.5;
  let focusY = 0.5;

  if (event instanceof MouseEvent && event.detail > 0) {
    const stageRect = els.imagePreviewStage.getBoundingClientRect();
    const imageLeft = stageRect.left + paddingLeft + (availableWidth - fittedWidth) / 2;
    const imageTop = stageRect.top + paddingTop + (availableHeight - fittedHeight) / 2;
    focusX = clamp((event.clientX - imageLeft) / fittedWidth, 0, 1);
    focusY = clamp((event.clientY - imageTop) / fittedHeight, 0, 1);
  }

  els.imagePreviewStage.style.setProperty("--preview-zoom-width", `${zoomWidth}px`);
  els.imagePreviewStage.style.setProperty("--preview-zoom-height", `${zoomHeight}px`);
  els.imagePreviewStage.classList.add("is-zoomed");
  updateImagePreviewZoomControl(true);

  requestAnimationFrame(() => {
    els.imagePreviewStage.scrollLeft = Math.max(
      0,
      paddingLeft + focusX * zoomWidth - els.imagePreviewStage.clientWidth / 2
    );
    els.imagePreviewStage.scrollTop = Math.max(
      0,
      paddingTop + focusY * zoomHeight - els.imagePreviewStage.clientHeight / 2
    );
  });
}

function handleImagePreviewZoomKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  toggleImagePreviewZoom(event);
}

function resetImagePreviewZoom({ updateMeta = true } = {}) {
  els.imagePreviewStage.classList.remove("is-zoomed");
  els.imagePreviewStage.style.removeProperty("--preview-zoom-width");
  els.imagePreviewStage.style.removeProperty("--preview-zoom-height");
  els.imagePreviewStage.scrollLeft = 0;
  els.imagePreviewStage.scrollTop = 0;
  updateImagePreviewZoomControl(false, { updateMeta });
}

function updateImagePreviewZoomControl(zoomed, { updateMeta = true } = {}) {
  const label = zoomed ? "缩小图片以适应窗口" : "放大图片以查看细节";
  els.imagePreviewZoom.setAttribute("aria-pressed", String(zoomed));
  els.imagePreviewZoom.setAttribute("aria-label", label);
  els.imagePreviewZoom.title = zoomed ? "点击还原图片" : "点击放大图片";

  if (updateMeta && state.previewLabel) {
    const hint = zoomed ? "滚动查看细节，点击图片还原" : "点击图片放大";
    els.imagePreviewMeta.textContent = `${state.previewLabel} · ${hint}`;
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function closeImagePreview() {
  if (els.imagePreviewDialog.open && typeof els.imagePreviewDialog.close === "function") {
    els.imagePreviewDialog.close();
    return;
  }

  els.imagePreviewDialog.removeAttribute("open");
  resetImagePreview();
}

function resetImagePreview() {
  const trigger = state.previewTrigger;
  state.previewTrigger = null;
  resetImagePreviewZoom({ updateMeta: false });
  state.previewLabel = "";
  document.body.classList.remove("image-preview-open");
  els.imagePreviewDialog.setAttribute("aria-hidden", "true");
  els.imagePreviewImage.removeAttribute("src");
  els.imagePreviewImage.alt = "";
  els.imagePreviewMeta.textContent = "Seedream 生成结果";
  els.imagePreviewResponse.open = false;
  els.imagePreviewResponse.hidden = false;
  els.rawResponse.textContent = "";

  if (trigger && trigger.isConnected) {
    trigger.focus({ preventScroll: true });
  }
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
  event.target.value = "";
  await addReferenceFiles(files, { source: "picker" });
}

function handleReferenceDragEnter(event) {
  if (!hasFileTransfer(event.dataTransfer)) return;

  event.preventDefault();
  referenceDragDepth += 1;
  els.referenceDropzone.classList.add("is-dragging");
}

function handleReferenceDragOver(event) {
  if (!hasFileTransfer(event.dataTransfer)) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
}

function handleReferenceDragLeave() {
  referenceDragDepth = Math.max(0, referenceDragDepth - 1);
  if (referenceDragDepth === 0) {
    els.referenceDropzone.classList.remove("is-dragging");
  }
}

function handleReferenceDrop(event) {
  if (!hasFileTransfer(event.dataTransfer)) return;

  event.preventDefault();
  referenceDragDepth = 0;
  els.referenceDropzone.classList.remove("is-dragging");
  void addReferenceFiles([...event.dataTransfer.files], { source: "drop" });
}

function handleReferencePaste(event) {
  if (state.mode !== "image" || !event.clipboardData) return;

  const imageFiles = getClipboardImageFiles(event.clipboardData);
  if (imageFiles.length === 0) return;

  const target = event.target;
  const isEditingText = target instanceof HTMLElement
    && (target.matches("input, textarea") || target.isContentEditable);
  if (isEditingText && event.clipboardData.getData("text/plain").trim()) return;

  event.preventDefault();
  void addReferenceFiles(imageFiles, { source: "clipboard" });
}

function hasFileTransfer(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes("Files");
}

function getClipboardImageFiles(clipboardData) {
  const itemFiles = Array.from(clipboardData.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);

  if (itemFiles.length > 0) return itemFiles;

  return Array.from(clipboardData.files || [])
    .filter((file) => file.type.startsWith("image/"));
}

async function addReferenceFiles(fileList, { source = "picker" } = {}) {
  const files = Array.from(fileList || []);
  if (files.length === 0) {
    if (source === "drop") {
      showNotice("未找到可上传的图片文件。", "error");
    }
    return;
  }

  let latestReference = null;
  let addedCount = 0;
  const problems = [];

  for (const file of files) {
    if (state.references.length >= MAX_REFERENCES) {
      problems.push("参考图最多 10 张。");
      break;
    }

    const name = getReferenceFileName(file, source, state.references.length + 1);
    if (file.size > MAX_REFERENCE_BYTES) {
      problems.push(`${name} 超过 30 MB。`);
      continue;
    }

    if (!file.type.startsWith("image/")) {
      problems.push(`${name} 不是图片文件。`);
      continue;
    }

    let value;
    try {
      value = await fileToDataUrl(file);
    } catch {
      problems.push(`${name} 读取失败。`);
      continue;
    }

    const reference = {
      id: createClientId(),
      type: "file",
      name,
      value
    };
    state.references.push(reference);
    latestReference = reference;
    addedCount += 1;
  }

  renderReferences();
  updateRequestPreview();
  if (latestReference) {
    void matchReferenceAspectRatio(latestReference);
  }

  showReferenceImportNotice(source, addedCount, problems);
}

function getReferenceFileName(file, source, position) {
  if (source === "clipboard") return `剪贴板图片 ${position}`;
  return String(file.name || "").trim() || `参考图 ${position}`;
}

function showReferenceImportNotice(source, addedCount, problems) {
  if (problems.length > 0) {
    const addedMessage = addedCount > 0 ? `已添加 ${addedCount} 张；` : "";
    const extraMessage = problems.length > 1 ? `（另有 ${problems.length - 1} 个问题）` : "";
    showNotice(`${addedMessage}${problems[0]}${extraMessage}`, "error");
    return;
  }

  const sourceLabels = {
    drop: "拖拽",
    clipboard: "粘贴"
  };
  if (addedCount > 0 && sourceLabels[source]) {
    showNotice(`已通过${sourceLabels[source]}添加 ${addedCount} 张参考图。`);
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
    id: createClientId(),
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

    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "reference-preview";
    preview.title = "点击预览";
    preview.setAttribute("aria-label", `预览参考图：${reference.name}`);
    preview.setAttribute("aria-haspopup", "dialog");

    const image = document.createElement("img");
    image.src = reference.value;
    image.alt = reference.name;
    image.loading = "lazy";
    image.decoding = "async";
    preview.append(image);
    preview.addEventListener("click", () => {
      openImagePreview(
        { src: reference.value, label: `参考图 · ${reference.name}` },
        `参考图：${reference.name}`,
        preview
      );
    });
    item.append(preview);

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
    if (mobileDrawerMediaQuery.matches) {
      closeSettingsDrawer({ restoreFocus: false });
    }
    return;
  }

  let task;
  try {
    task = createGenerationTask(payload);
  } catch (error) {
    showNotice(`无法开始生成：${error.message}`, "error");
    return;
  }
  state.lastPayload = payload;
  if (mobileDrawerMediaQuery.matches) {
    closeSettingsDrawer({ restoreFocus: false });
  }

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
  const promptMetadataErrors = Array.isArray(result.promptMetadataErrors)
    ? result.promptMetadataErrors
    : [];
  const savedByIndex = new Map(saved.map((item) => [item.index, item]));
  const rawResponse = JSON.stringify(result, null, 2);

  if (saveErrors.length > 0 || promptMetadataErrors.length > 0) {
    const failures = [];
    if (saveErrors.length > 0) failures.push(`${saveErrors.length} 张图片未能自动保存`);
    if (promptMetadataErrors.length > 0) failures.push(`${promptMetadataErrors.length} 份提示词参数记录写入失败`);
    showNotice(`生成成功，但${failures.join("，")}。保存目录：${result.outputDir}`, "error");
  } else if (saved.length > 0) {
    const savedContent = result.savePromptMetadata ? "图片及同名参数记录" : "图片";
    showNotice(`已自动保存${savedContent}到 ${result.outputDir}`);
  } else if (result.autoSaveImages === false) {
    showNotice("生成完成，自动保存图片已关闭。", "info");
  }

  const fragment = document.createDocumentFragment();
  images.forEach((item, index) => {
    fragment.append(
      createResultCard(item, savedByIndex.get(index), index, task.outputFormat, rawResponse)
    );
  });

  if (task.card.isConnected) {
    els.resultGrid.insertBefore(fragment, task.card);
  } else {
    els.resultGrid.prepend(fragment);
  }

  removeGenerationTask(task.id);
}

function createResultCard(item, saved, index, outputFormat, rawResponse) {
  const source = {
    ...normalizeImageSource(item, saved, outputFormat),
    rawResponse
  };
  const card = document.createElement("article");
  card.className = "result-card";

  const image = document.createElement("img");
  image.src = source.src;
  image.alt = `Seedream result ${index + 1}`;
  image.loading = "lazy";
  image.decoding = "async";

  if (source.src) {
    const imageButton = document.createElement("button");
    imageButton.type = "button";
    imageButton.className = "result-image-button";
    imageButton.setAttribute("aria-label", `全屏预览第 ${index + 1} 张生成图片`);
    imageButton.setAttribute("aria-haspopup", "dialog");
    imageButton.title = "全屏预览";
    imageButton.append(image);
    imageButton.addEventListener("click", () => openImagePreview(source, image.alt, imageButton));
    card.append(imageButton);
  } else {
    card.append(image);
  }

  const body = document.createElement("div");
  body.className = "result-card-body";

  const meta = document.createElement("code");
  meta.textContent = source.label;
  body.append(meta);

  const actions = document.createElement("div");
  actions.className = "result-actions";

  if (source.src) {
    const download = document.createElement("a");
    download.href = source.downloadValue || source.src;
    download.download =
      source.downloadName || `seedream-${Date.now()}-${index + 1}.${outputFormat}`;
    download.innerHTML = `${icons.download}下载`;
    actions.append(download);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.innerHTML = `${icons.copy}复制`;
    copy.addEventListener("click", () =>
      copyImage(source.src, source.copyValue || source.src, copy)
    );
    actions.append(copy);
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
      downloadValue: saved ? saved.url : item.url,
      downloadName: saved ? saved.fileName : "",
      copyValue: item.url
    };
  }

  if (item.b64_json) {
    const fallbackSrc = `data:image/${outputFormat};base64,${item.b64_json}`;
    const src = saved ? saved.url : fallbackSrc;
    return {
      src,
      label: saved ? `已保存 · ${saved.fileName}` : (item.size || "b64_json"),
      downloadValue: src,
      downloadName: saved ? saved.fileName : "",
      copyValue: src
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
  const id = createClientId();
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
  hideNotice();
}

async function copyImage(source, fallbackValue, trigger) {
  trigger.disabled = true;
  trigger.setAttribute("aria-busy", "true");

  try {
    if (canCopyImage(source)) {
      try {
        const pngBlob = fetchClipboardImage(source);
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": pngBlob
          })
        ]);
        showNotice("图片已复制到剪贴板。");
        return;
      } catch {
        // Fall back to the image link when binary clipboard access fails.
      }
    }

    const link = resolveCopyLink(fallbackValue || source);
    await copyTextToClipboard(link);
    showNotice("当前环境无法复制图片，已复制链接。");
  } catch (error) {
    const detail = error && error.message ? `：${error.message}` : "";
    showNotice(`复制失败${detail}`, "error");
  } finally {
    trigger.disabled = false;
    trigger.removeAttribute("aria-busy");
  }
}

function canCopyImage(source) {
  if (
    !window.isSecureContext ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== "function" ||
    typeof ClipboardItem !== "function"
  ) {
    return false;
  }

  try {
    const sourceUrl = new URL(source, window.location.href);
    return (
      sourceUrl.origin === window.location.origin ||
      sourceUrl.protocol === "data:" ||
      sourceUrl.protocol === "blob:"
    );
  } catch {
    return false;
  }
}

function resolveCopyLink(value) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    throw new Error("没有可复制的图片链接");
  }

  try {
    return new URL(candidate, window.location.href).href;
  } catch {
    return candidate;
  }
}

async function copyTextToClipboard(value) {
  if (
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the selection-based copy path.
    }
  }

  const previousFocus = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  }

  if (!copied) {
    throw new Error("浏览器未允许访问剪贴板");
  }
}

async function fetchClipboardImage(source) {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`图片读取失败（${response.status}）`);
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("图片数据为空");
  }
  if (blob.type === "image/png") {
    return blob;
  }

  return convertImageBlobToPng(blob);
}

async function convertImageBlobToPng(blob) {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();

  try {
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener(
        "error",
        () => reject(new Error("无法读取图片数据")),
        { once: true }
      );
      image.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("无法转换图片格式");
    }
    context.drawImage(image, 0, 0);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (pngBlob) => {
          if (pngBlob) {
            resolve(pngBlob);
          } else {
            reject(new Error("无法生成可复制的 PNG 图片"));
          }
        },
        "image/png"
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createClientId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    try {
      const values = new Uint32Array(2);
      cryptoApi.getRandomValues(values);
      return `local-${Date.now().toString(36)}-${[...values]
        .map((value) => value.toString(36))
        .join("")}`;
    } catch {
      // Fall through for browsers that restrict Web Crypto on plain HTTP.
    }
  }

  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
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
