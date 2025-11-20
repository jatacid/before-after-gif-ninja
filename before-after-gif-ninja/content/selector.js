(function() {
  let overlay = null;
  let mask = null;
  let rect = null;
  let guide = null;
  let guideBounds = null;
  const SNAP_PX = 6; // snapping threshold in CSS pixels
  let startX = 0, startY = 0;
  let selecting = false;
  let pendingRequestId = null;

  function startSelection(requestId, guideRect) {
    if (overlay) endSelection();
    pendingRequestId = requestId;
    overlay = document.createElement('div');
    overlay.className = 'before-after-gif-overlay';

    mask = document.createElement('div');
    mask.className = 'before-after-gif-mask';

    rect = document.createElement('div');
    rect.className = 'before-after-gif-rect';

  guideBounds = (guideRect && guideRect.width > 0 && guideRect.height > 0) ? { ...guideRect } : null;
  if (guideBounds) {
      guide = document.createElement('div');
      guide.className = 'before-after-gif-guide';
      Object.assign(guide.style, {
    left: guideBounds.left + 'px',
    top: guideBounds.top + 'px',
    width: guideBounds.width + 'px',
    height: guideBounds.height + 'px',
      });
      overlay.appendChild(guide);
    }

    overlay.appendChild(mask);
    overlay.appendChild(rect);

    overlay.addEventListener('mousedown', onMouseDown, { passive: false });
    overlay.addEventListener('mousemove', onMouseMove, { passive: false });
    overlay.addEventListener('mouseup', onMouseUp, { passive: false });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        endSelection();
        chrome.runtime.sendMessage({ type: 'SELECTION_CANCELED', requestId: pendingRequestId });
      }
    });

    document.body.appendChild(overlay);
    overlay.tabIndex = -1;
    overlay.focus();
  }

  function endSelection() {
    selecting = false;
    pendingRequestId = null;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  overlay = mask = rect = guide = null;
  guideBounds = null;
  }

  function onMouseDown(e) {
    e.preventDefault();
    selecting = true;
    const { clientX, clientY } = e;
    startX = clientX; startY = clientY;
    updateRect(clientX, clientY);
  }

  function onMouseMove(e) {
    if (!selecting) return;
    const { clientX, clientY } = e;
    updateRect(clientX, clientY);
  }

  function calcRect(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    return { left, top, width, height };
  }

  function updateRect(x, y) {
    let r = calcRect(startX, startY, x, y);
    r = snapToGuide(r, false);
    Object.assign(rect.style, {
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      height: r.height + 'px'
    });
  }

  async function onMouseUp(e) {
    if (!selecting) return;
    selecting = false;

    const { clientX, clientY } = e;
  let r = calcRect(startX, startY, clientX, clientY);
  // Strong snap on release
  r = snapToGuide(r, true);

    try {
  // Completely detach overlay from DOM and wait for repaints
  const parent = overlay && overlay.parentNode;
  const next = overlay && overlay.nextSibling;
  if (parent) parent.removeChild(overlay);
  await nextPaint();
  await nextPaint();
  await delayMs(50);
  const dataUrl = await captureArea(r);
  // Do not re-attach; endSelection() will clean up references
  chrome.runtime.sendMessage({ type: 'SELECTION_DONE', requestId: pendingRequestId, rect: r, dataUrl });
    } catch (err) {
      console.error('Capture failed', err);
      chrome.runtime.sendMessage({ type: 'SELECTION_FAILED', requestId: pendingRequestId, error: String(err) });
    }

    endSelection();
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function delayMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function snapToGuide(r, strong) {
    if (!guideBounds) return r;
    const t = SNAP_PX;
    const gb = guideBounds;
    const rRight = r.left + r.width;
    const rBottom = r.top + r.height;
    const gRight = gb.left + gb.width;
    const gBottom = gb.top + gb.height;

    // Position snaps
    if (Math.abs(r.left - gb.left) <= t) r.left = gb.left;
    if (Math.abs(r.top - gb.top) <= t) r.top = gb.top;
    // Edge snaps
    let newWidth = r.width;
    let newHeight = r.height;
    if (Math.abs(rRight - gRight) <= t) newWidth = Math.max(1, gRight - r.left);
    if (Math.abs(rBottom - gBottom) <= t) newHeight = Math.max(1, gBottom - r.top);

    // Size snaps
    if (Math.abs(newWidth - gb.width) <= t) newWidth = gb.width;
    if (Math.abs(newHeight - gb.height) <= t) newHeight = gb.height;

    // If strong snapping and both pos and size are near, snap fully
    const nearPos = Math.abs(r.left - gb.left) <= t && Math.abs(r.top - gb.top) <= t;
    const nearSize = Math.abs((r.left + newWidth) - gRight) <= t && Math.abs((r.top + newHeight) - gBottom) <= t
      || (Math.abs(newWidth - gb.width) <= t && Math.abs(newHeight - gb.height) <= t);
    if (strong && nearPos && nearSize) {
      return { left: gb.left, top: gb.top, width: gb.width, height: gb.height };
    }
    return { left: r.left, top: r.top, width: newWidth, height: newHeight };
  }

  async function captureArea(rectPx) {
    // Get full page screenshot via chrome.tabs.captureVisibleTab through background
    // We cannot call it directly here; request background to call captureVisibleTab for this tab
    const screenshot = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }, (res) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
        } else if (!res || !res.dataUrl) {
          reject('No data from capture');
        } else {
          resolve(res.dataUrl);
        }
      });
    });

    // Crop to rect using canvas
    const img = new Image();
    img.src = screenshot;
    await img.decode();

    // Handle device pixel ratio for accurate crop
    const dpr = window.devicePixelRatio || 1;
    const sx = rectPx.left * dpr;
    const sy = rectPx.top * dpr;
    const sw = rectPx.width * dpr;
    const sh = rectPx.height * dpr;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'START_SELECTION') {
      startSelection(message.requestId, message.guideRect);
    }
  });
})();
