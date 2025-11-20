chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel/sidepanel.html' });
  } catch (e) {
    console.error('Failed to open side panel', e);
  }
});

// Messaging: relay selection requests to content script and receive screenshots
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'REQUEST_SELECTION') {
    // Ask the currently active tab to start selection
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await chrome.tabs.sendMessage(tab.id, { type: 'START_SELECTION', requestId: message.requestId, guideRect: message.guideRect || null });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'No active tab' });
        }
      } catch (err) {
        console.error('Failed to start selection', err);
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true; // async response
  }
  if (message && message.type === 'CAPTURE_VISIBLE_TAB') {
    // capture current window's visible tab
    (async () => {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
        sendResponse({ ok: true, dataUrl });
      } catch (err) {
        console.error('captureVisibleTab failed', err);
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true; // async response
  }
  // Forward selection results from content script to the side panel page(s)
  if (message && (message.type === 'SELECTION_DONE' || message.type === 'SELECTION_FAILED' || message.type === 'SELECTION_CANCELED')) {
    chrome.runtime.sendMessage(message);
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
