// sidepanel logic for Before After Gif

const state = {
  slides: [], // [{name:'A', dataUrl, rect}]
  gifBlob: null,
  selectingIndex: null, // index being captured
};

const els = {};

function $(id) { return document.getElementById(id); }

function setStatus(msg) {
  els.status.textContent = msg || '';
}

function enableBuildIfReady() {
  els.buildBtn.disabled = state.slides.length < 2 || state.slides.some(s => !s.dataUrl);
}

function setCardThumb(cardEl, dataUrl) {
  const el = cardEl.querySelector('.thumb');
  el.innerHTML = '';
  if (dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    el.appendChild(img);
  }
}

async function requestSelectionByIndex(index) {
  state.selectingIndex = index;
  const requestId = `${Date.now()}-${index}`;
  // Guide: use previous captured rect if exists
  const prev = state.slides[index - 1];
  const guideRect = prev?.rect || null;
  await chrome.runtime.sendMessage({ type: 'REQUEST_SELECTION', requestId, guideRect });
}

function dataURLToImageData(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ imageData: id, canvas });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function wipeFrames(imageDataA, imageDataB, durationMs, direction, stepMs = 33) {
  // direction: 'left' (A->B) or 'right' (B->A)
  const frames = [];
  const w = imageDataA.width;
  const h = imageDataA.height;
  const steps = Math.max(2, Math.round(durationMs / stepMs));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0..1
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

  if (direction === 'left') {
      // Start with A fully, then reveal B from right->left (wipe left)
      ctx.putImageData(imageDataA, 0, 0);
      const revealWidth = Math.round(w * t);
      if (revealWidth > 0) {
        const sx = w - revealWidth;
        ctx.putImageData(cropImageData(imageDataB, sx, 0, revealWidth, h), sx, 0);
      }
    } else {
      // wipe right: reveal A from left->right over B
      ctx.putImageData(imageDataB, 0, 0);
      const revealWidth = Math.round(w * t);
      if (revealWidth > 0) {
        ctx.putImageData(cropImageData(imageDataA, 0, 0, revealWidth, h), 0, 0);
      }
    }

  frames.push(ctx.getImageData(0, 0, w, h));
  }

  return frames;
}

function crossfadeFrames(imageDataA, imageDataB, durationMs, stepMs = 33) {
  const frames = [];
  const w = imageDataA.width;
  const h = imageDataA.height;
  const steps = Math.max(2, Math.round(durationMs / stepMs));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0..1
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const ca = document.createElement('canvas');
    ca.width = w; ca.height = h;
    ca.getContext('2d').putImageData(imageDataA, 0, 0);
    ctx.drawImage(ca, 0, 0);
    const cb = document.createElement('canvas');
    cb.width = w; cb.height = h;
    cb.getContext('2d').putImageData(imageDataB, 0, 0);
    ctx.globalAlpha = t;
    ctx.drawImage(cb, 0, 0);
    ctx.globalAlpha = 1;
    frames.push(ctx.getImageData(0, 0, w, h));
  }
  return frames;
}

function slideFrames(imageDataA, imageDataB, durationMs, direction, stepMs = 33) {
  // Slide B over A (left means B comes from right to left)
  const frames = [];
  const w = imageDataA.width;
  const h = imageDataA.height;
  const steps = Math.max(2, Math.round(durationMs / stepMs));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const ca = document.createElement('canvas');
    ca.width = w; ca.height = h;
    ca.getContext('2d').putImageData(imageDataA, 0, 0);
    ctx.drawImage(ca, 0, 0);
    const cb = document.createElement('canvas');
    cb.width = w; cb.height = h;
    cb.getContext('2d').putImageData(imageDataB, 0, 0);
    let x;
    if (direction === 'left') {
      x = Math.round((1 - t) * w); // from w to 0
    } else {
      x = Math.round((t - 1) * w); // from -w to 0
    }
    ctx.drawImage(cb, x, 0);
    frames.push(ctx.getImageData(0, 0, w, h));
  }
  return frames;
}

function zoomCrossfadeFrames(imageDataA, imageDataB, durationMs, stepMs = 33) {
  // Zoom A slightly out while B zooms in and crossfades
  const frames = [];
  const w = imageDataA.width;
  const h = imageDataA.height;
  const steps = Math.max(2, Math.round(durationMs / stepMs));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const ca = document.createElement('canvas');
    ca.width = w; ca.height = h;
    ca.getContext('2d').putImageData(imageDataA, 0, 0);
    const cb = document.createElement('canvas');
    cb.width = w; cb.height = h;
    cb.getContext('2d').putImageData(imageDataB, 0, 0);
    // A scales from 1.0 to 0.98, B from 1.02 to 1.0
    const scaleA = 1 - 0.02 * t;
    const scaleB = 1.02 - 0.02 * t;
    const drawScaled = (src, scale, alpha) => {
      const dw = Math.round(w * scale);
      const dh = Math.round(h * scale);
      const dx = Math.round((w - dw) / 2);
      const dy = Math.round((h - dh) / 2);
      if (alpha != null) ctx.globalAlpha = alpha;
      ctx.drawImage(src, 0, 0, w, h, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    };
    drawScaled(ca, scaleA, 1 - t);
    drawScaled(cb, scaleB, t);
  frames.push(ctx.getImageData(0, 0, w, h));
  }
  return frames;
}

function dipFrames(imageDataA, imageDataB, durationMs, color = 'white', stepMs = 33) {
  // Fade to solid color then fade into B
  const frames = [];
  const w = imageDataA.width;
  const h = imageDataA.height;
  const steps = Math.max(2, Math.round(durationMs / stepMs));
  const half = Math.floor(steps / 2);
  const ca = document.createElement('canvas');
  ca.width = w; ca.height = h;
  ca.getContext('2d').putImageData(imageDataA, 0, 0);
  const cb = document.createElement('canvas');
  cb.width = w; cb.height = h;
  cb.getContext('2d').putImageData(imageDataB, 0, 0);
  for (let i = 0; i <= steps; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (i <= half) {
      const t = i / half;
      ctx.drawImage(ca, 0, 0);
      ctx.fillStyle = color;
      ctx.globalAlpha = t;
      ctx.fillRect(0, 0, w, h);
    } else {
      const t = (i - half) / (steps - half);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = t;
      ctx.drawImage(cb, 0, 0);
    }
    ctx.globalAlpha = 1;
    frames.push(ctx.getImageData(0, 0, w, h));
  }
  return frames;
}

function overlayNameOnImageData(id, name) {
  // Draw the slide name in the top-left corner with a background box
  // whose width is always 5% of the image width (auto height).
  const w = id.width;
  const h = id.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // Base
  ctx.putImageData(id, 0, 0);

  const text = String(name || '').trim();
  if (!text) return ctx.getImageData(0, 0, w, h);

  // Target background width is 5% of image width
  const rectW = Math.max(12, Math.round(w * 0.05));
  // Start with a reasonable font size and adjust to fit into rectW padding box
  let fontSize = Math.max(8, Math.round(Math.min(h * 0.12, rectW))); // initial guess
  let padding = Math.max(2, Math.round(fontSize * 0.25));
  const maxIters = 6;
  for (let iter = 0; iter < maxIters; iter++) {
    ctx.font = `bold ${fontSize}px -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    const textW = ctx.measureText(text).width;
    const innerW = rectW - padding * 2;
    if (textW > innerW && textW > 0) {
      const scale = innerW / textW;
      const newSize = Math.max(8, Math.floor(fontSize * scale));
      if (Math.abs(newSize - fontSize) < 1) break;
      fontSize = newSize;
      padding = Math.max(2, Math.round(fontSize * 0.25));
    } else {
      break;
    }
  }
  // Recompute metrics with final size
  ctx.font = `bold ${fontSize}px -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;
  ctx.textBaseline = 'top';
  const finalTextW = ctx.measureText(text).width;
  const rectH = fontSize + padding * 2; // auto height

  // Background box
  const x = 4;
  const y = 4;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(x, y, rectW, rectH);

  // Text (left aligned inside the box)
  ctx.fillStyle = '#111827';
  ctx.fillText(text, x + padding, y + padding);

  return ctx.getImageData(0, 0, w, h);
}

function cropImageData(id, sx, sy, sw, sh) {
  const canvas = document.createElement('canvas');
  canvas.width = sw; canvas.height = sh;
  const ctx = canvas.getContext('2d');
  const tmp = document.createElement('canvas');
  tmp.width = id.width; tmp.height = id.height;
  const tctx = tmp.getContext('2d');
  tctx.putImageData(id, 0, 0);
  ctx.drawImage(tmp, sx, sy, sw, sh, 0, 0, sw, sh);
  return ctx.getImageData(0, 0, sw, sh);
}

function buildGifFramesForSequence(imageDatas, names) {
  // imageDatas: [ImageData, ImageData, ...]; loop A>B>C>...>A
  const frames = [];
  const holdSeconds = parseFloat(els.holdSeconds.value || '2');
  const wipeSeconds = parseFloat(els.wipeSeconds.value || '0.5');
  const animType = (els.animType?.value || 'wipe');
  const showNames = !!els.showNames?.checked;
  const waitMs = Math.max(0, Math.round(holdSeconds * 1000));
  const wipeMs = Math.max(100, Math.round(wipeSeconds * 1000));

  const stepMs = 50; // ~20 fps for transitions
  const addAnim = (ids, delay = stepMs) => ids.forEach(id => frames.push({ id, delay }));
  const pushHold = (imageData, durationMs) => {
    // Use a single frame with the total delay to minimize GIF size
    frames.push({ id: imageData, delay: Math.max(20, durationMs) });
  };

  const n = imageDatas.length;
  if (n === 0) return frames;

  for (let i = 0; i < n; i++) {
    let current = imageDatas[i];
    const next = imageDatas[(i + 1) % n];
    const currentName = names?.[i];
    const nextName = names?.[(i + 1) % n];
    if (showNames && currentName) current = overlayNameOnImageData(current, currentName);
    pushHold(current, waitMs);
    // Transition frames may need names on endpoints; to keep it simple, add name on start frame
    let transFrames;
    if (animType === 'wipe') {
      transFrames = wipeFrames(current, next, wipeMs, 'left', stepMs);
    } else if (animType === 'crossfade') {
      transFrames = crossfadeFrames(current, next, wipeMs, stepMs);
    } else if (animType === 'slide') {
      transFrames = slideFrames(current, next, wipeMs, 'left', stepMs);
    } else if (animType === 'zoom') {
      transFrames = zoomCrossfadeFrames(current, next, wipeMs, stepMs);
    } else if (animType === 'dip') {
      transFrames = dipFrames(current, next, wipeMs, 'white', stepMs);
    } else {
      transFrames = wipeFrames(current, next, wipeMs, 'left', stepMs);
    }
    if (showNames && currentName) {
      transFrames = transFrames.map((id, idx) => idx === 0 ? overlayNameOnImageData(id, currentName) : id);
    }
    addAnim(transFrames);
  }

  return frames;
}

async function generateGifSequence(imageDatas, names) {
  setStatus('Building GIF...');
  els.buildBtn.disabled = true;

  // Use vendor gif.js
  // eslint-disable-next-line no-undef
  const w = imageDatas[0].width;
  const h = imageDatas[0].height;
  const gif = new GIF({
    workers: 2,
    quality: 10,
    repeat: 0, // loop forever
    workerScript: chrome.runtime.getURL('vendor/gif.worker.js'),
    width: w,
    height: h,
  });

  const frames = buildGifFramesForSequence(imageDatas, names);
  frames.forEach(({ id, delay }) => gif.addFrame(id, { delay, copy: true }));

  const blob = await new Promise((resolve, reject) => {
    gif.on('finished', resolve);
    gif.on('abort', () => reject(new Error('GIF aborted')));
    gif.on('error', reject);
    gif.render();
  });

  setStatus('');
  els.buildBtn.disabled = false;
  return blob;
}

async function onBuild() {
  if (state.slides.length < 2 || state.slides.some(s => !s.dataUrl)) return;
  setStatus('Processing...');

  // Decode all slides
  const decoded = await Promise.all(state.slides.map(s => dataURLToImageData(s.dataUrl)));
  // Normalize to the first slide's size
  const baseW = decoded[0].imageData.width;
  const baseH = decoded[0].imageData.height;
  const normalized = decoded.map((d) => {
    const id = d.imageData;
    return (id.width === baseW && id.height === baseH) ? id : resizeImageData(id, baseW, baseH);
  });
  // Optional downscale
  const scale = Math.max(0.1, Math.min(2, parseFloat(els.scalePercent?.value || '100') / 100));
  const imageDatas = (scale === 1)
    ? normalized
    : normalized.map(id => resizeImageData(id, Math.round(baseW * scale), Math.round(baseH * scale)));

  const names = state.slides.map(s => s.name);
  const blob = await generateGifSequence(imageDatas, names);
  state.gifBlob = blob;

  const url = URL.createObjectURL(blob);
  els.gifPreview.innerHTML = '';
  const img = document.createElement('img');
  img.src = url;
  els.gifPreview.appendChild(img);

  els.gifActions.hidden = false;
  els.downloadBtn.href = url;
}

function resizeImageData(id, w, h) {
  if (id.width === w && id.height === h) return id;
  const src = document.createElement('canvas');
  src.width = id.width; src.height = id.height;
  const sctx = src.getContext('2d');
  sctx.putImageData(id, 0, 0);

  const dst = document.createElement('canvas');
  dst.width = w; dst.height = h;
  const dctx = dst.getContext('2d');
  dctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, w, h);
  return dctx.getImageData(0, 0, w, h);
}

function init() {
  els.buildBtn = $('buildBtn');
  els.status = $('status');
  els.gifPreview = $('gifPreview');
  els.gifActions = $('gifActions');
  els.downloadBtn = $('downloadBtn');
  els.holdSeconds = $('holdSeconds');
  els.wipeSeconds = $('wipeSeconds');
  els.animType = $('animType');
  els.showNames = $('showNames');
  els.scalePercent = $('scalePercent');
  els.slidesContainer = $('slidesContainer');
  els.addSlideBtn = $('addSlideBtn');
  els.addSlideBtn.onclick = () => addSlide();
  els.buildBtn.onclick = onBuild;

  // Seed with A and B but do not auto-capture; user captures as needed
  if (state.slides.length === 0) {
    addSlide(true); // A
    addSlide(true); // B
    renderSlides();
    enableBuildIfReady();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return;
    if (message.type === 'SELECTION_DONE') {
      if (state.selectingIndex == null) return;
      const idx = state.selectingIndex;
      state.selectingIndex = null;
      const slide = state.slides[idx];
      if (!slide) return;
      slide.dataUrl = message.dataUrl;
      slide.rect = message.rect || null;
      renderSlides();
      enableBuildIfReady();
    } else if (message.type === 'SELECTION_FAILED') {
      state.selectingIndex = null;
      setStatus('Selection failed');
      setTimeout(() => setStatus(''), 1500);
    } else if (message.type === 'SELECTION_CANCELED') {
      state.selectingIndex = null;
      setStatus('Selection canceled');
      setTimeout(() => setStatus(''), 1000);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

// Slides management
function nextName() {
  const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const used = new Set(state.slides.map(s => s.name));
  for (let i = 0; i < base.length; i++) {
    const ch = base[i];
    if (!used.has(ch)) return ch;
  }
  // fallback to numbered names after Z
  let n = 1;
  while (used.has(`S${n}`)) n++;
  return `S${n}`;
}

function addSlide(initial = false) {
  const name = nextName();
  state.slides.push({ name, dataUrl: null, rect: null });
  renderSlides();
  const index = state.slides.length - 1;
  if (!initial) requestSelectionByIndex(index);
}

function deleteSlide(index) {
  state.slides.splice(index, 1);
  renderSlides();
  enableBuildIfReady();
}

function renderSlides() {
  const container = els.slidesContainer;
  container.innerHTML = '';
  state.slides.forEach((s, index) => {
    const card = document.createElement('div');
    card.className = 'slide-card';
    card.innerHTML = `
      <div class="slide-header">
        <div class="slide-title" title="Click to rename">${s.name}</div>
        <div class="slide-actions">
          <button class="inline-btn selectBtn">Capture</button>
          <button class="inline-btn danger deleteBtn">Delete</button>
        </div>
      </div>
      <div class="thumb"></div>
    `;
    container.appendChild(card);
    setCardThumb(card, s.dataUrl);
    card.querySelector('.selectBtn').onclick = () => requestSelectionByIndex(index);
    card.querySelector('.deleteBtn').onclick = () => deleteSlide(index);
    const titleEl = card.querySelector('.slide-title');
    titleEl.onclick = () => beginEditName(titleEl, index);
  });
}

function beginEditName(titleEl, index) {
  const slide = state.slides[index];
  if (!slide) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'name-input';
  input.value = slide.name;
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const v = (input.value || '').trim();
    if (v) slide.name = v;
    renderSlides();
  };
  const cancel = () => { renderSlides(); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', () => commit());
}

// (initial slides are created in init)
