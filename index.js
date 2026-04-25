import { fullLists } from "./fullLists.js";

const DEFAULT_CODE = "0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0";
let currentChapterCode = null;

// Returns just "listIndex-bookIndex_chapterIndex", independent of progress in other lists
const getChapterKey = (chapterCode) => {
  const parts = chapterCode.split("-");
  const listIndex = parts[0];
  return `${listIndex}-${parts.slice(1)[Number(listIndex)]}`;
};

const HIGHLIGHT_COLORS = [
  { swatch: '#ffd60a', value: 'rgba(255, 214, 10, 0.4)' },
  { swatch: '#57cc99', value: 'rgba(87, 204, 153, 0.4)' },
  { swatch: '#74b9e8', value: 'rgba(116, 185, 232, 0.4)' },
  { swatch: '#f48fb1', value: 'rgba(244, 143, 177, 0.4)' },
  { swatch: '#ff6b6b', value: 'rgba(255, 107, 107, 0.4)' },
  { swatch: '#c084fc', value: 'rgba(192, 132, 252, 0.4)' },
  { swatch: '#fb923c', value: 'rgba(251, 146, 60, 0.4)' },
];

const findCurrentChapter = (chapterCode) => {
  const parts = chapterCode.split("-");
  const currentListIndex = parts.splice(0, 1)[0];
  const currentListBookmark = parts[currentListIndex];
  const [bookIndex, chapterIndex] = currentListBookmark.split("_");
  return fullLists[currentListIndex][bookIndex][chapterIndex];
};

const findNextChapter = (chapterCode) => {
  const parts = chapterCode.split("-");
  const currentListIndex = Number(parts.splice(0, 1)[0]);
  const nextListIndex = (currentListIndex + 1) % 10;
  const nextChapter = findCurrentChapter(`${nextListIndex}-${parts.join("-")}`);

  const [bookIndexAsString, chapterIndexAsString] = parts[currentListIndex].split("_");
  const bookIndex = Number(bookIndexAsString);
  const chapterIndex = Number(chapterIndexAsString);

  if (fullLists[currentListIndex][bookIndex][chapterIndex + 1]) {
    parts[currentListIndex] = `${bookIndexAsString}_${chapterIndex + 1}`;
  } else if (fullLists[currentListIndex][bookIndex + 1]?.[0]) {
    parts[currentListIndex] = `${bookIndex + 1}_0`;
  } else {
    parts[currentListIndex] = "0_0";
  }

  return { nextChapter, newChapterCode: `${nextListIndex}-${parts.join("-")}` };
};

const findPreviousChapter = (chapterCode) => {
  const parts = chapterCode.split("-");
  const currentListIndex = Number(parts.splice(0, 1)[0]);
  const prevListIndex = (currentListIndex - 1 + 10) % 10;

  const [bookIndexAsString, chapterIndexAsString] = parts[prevListIndex].split("_");
  const bookIndex = Number(bookIndexAsString);
  const chapterIndex = Number(chapterIndexAsString);

  if (chapterIndex > 0) {
    parts[prevListIndex] = `${bookIndexAsString}_${chapterIndex - 1}`;
  } else if (bookIndex > 0) {
    const lastChapterIndex = fullLists[prevListIndex][bookIndex - 1].length - 1;
    parts[prevListIndex] = `${bookIndex - 1}_${lastChapterIndex}`;
  } else {
    parts[prevListIndex] = "0_0";
  }

  const newChapterCode = `${prevListIndex}-${parts.join("-")}`;
  return { previousChapter: findCurrentChapter(newChapterCode), newChapterCode };
};

const saveChapterCode = (chapterCode) => {
  fetch('/api/chapter-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterCode }),
  });
};

const mapNormToOrig = (origText, normOff) => {
  let start = 0;
  while (start < origText.length && /\s/.test(origText[start])) start++;
  let n = 0, inWs = false;
  for (let i = start; i <= origText.length; i++) {
    if (n === normOff) return i;
    if (i === origText.length) break;
    if (/\s/.test(origText[i])) {
      if (!inWs) { n++; inWs = true; }
    } else {
      n++;
      inWs = false;
    }
  }
  let end = origText.length;
  while (end > 0 && /\s/.test(origText[end - 1])) end--;
  return end;
};

const applyHighlight = (container, selectedText, color, id) => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);

  // Fast path: exact single-node match
  for (const node of textNodes) {
    const idx = node.textContent.indexOf(selectedText);
    if (idx !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + selectedText.length);
      const mark = document.createElement('mark');
      mark.style.backgroundColor = color;
      mark.style.color = 'inherit';
      mark.dataset.highlightId = id;
      try { range.surroundContents(mark); } catch (e) {}
      return;
    }
  }

  // Multi-node path: normalize whitespace and search across nodes
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const target = norm(selectedText);
  const segs = textNodes
    .map(node => ({ node, normText: norm(node.textContent) }))
    .filter(s => s.normText.length > 0);

  const joined = segs.map(s => s.normText).join(' ');
  const matchIdx = joined.indexOf(target);
  if (matchIdx === -1) return;
  const matchEnd = matchIdx + target.length;

  let pos = 0;
  for (const { node, normText } of segs) {
    const segEnd = pos + normText.length;
    if (pos < matchEnd && segEnd > matchIdx) {
      const localStart = Math.max(0, matchIdx - pos);
      const localEnd = Math.min(normText.length, matchEnd - pos);
      const origStart = mapNormToOrig(node.textContent, localStart);
      const origEnd = mapNormToOrig(node.textContent, localEnd);
      if (origStart < origEnd) {
        const range = document.createRange();
        range.setStart(node, origStart);
        range.setEnd(node, origEnd);
        const mark = document.createElement('mark');
        mark.style.backgroundColor = color;
        mark.style.color = 'inherit';
        mark.dataset.highlightId = id;
        try { range.surroundContents(mark); } catch (e) {}
      }
    }
    pos += normText.length + 1;
  }
};

const applyHighlightFromRange = (container, range, color, id) => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const segments = [];
  let node;
  while ((node = walker.nextNode())) {
    if (!range.intersectsNode(node)) continue;
    if (!node.textContent.trim()) continue;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.textContent.length;
    if (start < end) segments.push({ node, start, end });
  }
  for (const { node, start, end } of segments) {
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, end);
    const mark = document.createElement('mark');
    mark.style.backgroundColor = color;
    mark.style.color = 'inherit';
    mark.dataset.highlightId = id;
    try { r.surroundContents(mark); } catch (e) {}
  }
};

const loadHighlights = async (chapterCode) => {
  await new Promise((r) => setTimeout(r, 50));
  try {
    const highlights = await fetch(
      `/api/highlights?chapterCode=${encodeURIComponent(getChapterKey(chapterCode))}`,
    ).then((r) => r.json());
    const container = document.getElementById('chapter_content');
    highlights.forEach((h) => applyHighlight(container, h.selected_text, h.color, h.id));
  } catch (e) {
    // Silently fail
  }
};

const initializeApp = async () => {
  const nextChapterButton = document.getElementById("next_chapter_button");
  const previousChapterButton = document.getElementById("previous_chapter_button");
  const resumeReadingButton = document.getElementById("resume_reading_button");
  const instructionsButton = document.getElementById("instructions_button");
  const myProgressButton = document.getElementById("my_progress_button");
  const highlightsButton = document.getElementById("highlights_button");
  const themeToggleButton = document.getElementById("theme_toggle_button");
  const goToResourceButton = document.getElementById("go_to_resource_button");
  const fontSizeSlider = document.getElementById("font_size_control");
  const chapterContent = document.getElementById("chapter_content");
  const popup = document.getElementById("highlight_popup");

  // --- Highlight popup setup ---
  let pendingText = null;
  let pendingRange = null;

  HIGHLIGHT_COLORS.forEach(({ swatch, value }) => {
    const btn = document.createElement('button');
    btn.className = 'highlight-swatch';
    btn.style.backgroundColor = swatch;
    btn.addEventListener('click', async () => {
      if (!pendingText || !pendingRange) return;
      const { id } = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterCode: getChapterKey(currentChapterCode),
          selectedText: pendingText,
          color: value,
        }),
      }).then((r) => r.json());
      applyHighlightFromRange(chapterContent, pendingRange, value, id);
      window.getSelection().removeAllRanges();
      hidePopup();
    });
    popup.appendChild(btn);
  });

  const removeBtn = document.createElement('span');
  removeBtn.className = 'highlight-remove-btn';
  removeBtn.textContent = '✕';
  removeBtn.style.display = 'none';
  removeBtn.addEventListener('click', async () => {
    const id = removeBtn.dataset.targetId;
    if (!id) return;
    await fetch(`/api/highlights/${id}`, { method: 'DELETE' });
    chapterContent.querySelectorAll(`mark[data-highlight-id="${id}"]`).forEach((mark) => {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    });
    hidePopup();
  });
  popup.appendChild(removeBtn);

  let anchorRectFn = null;

  const positionFromAnchor = () => {
    if (!anchorRectFn) return;
    const rect = anchorRectFn();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      popup.classList.remove('visible');
      return;
    }
    popup.classList.add('visible');
    const w = popup.offsetWidth;
    const h = popup.offsetHeight;
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    const touchDevice = window.matchMedia('(pointer: coarse)').matches;
    let left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2));
    let top = touchDevice ? y + rect.height + 10 : y - h - 10;
    if (!touchDevice && top < 8) top = y + rect.height + 6;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  };

  const showColorPopup = (text) => {
    pendingText = text;
    [...popup.querySelectorAll('.highlight-swatch')].forEach((s) => (s.style.display = ''));
    removeBtn.style.display = 'none';
    anchorRectFn = () => pendingRange.getBoundingClientRect();
    popup.classList.add('visible');
    positionFromAnchor();
  };

  const showRemovePopup = (mark, id) => {
    pendingText = null;
    [...popup.querySelectorAll('.highlight-swatch')].forEach((s) => (s.style.display = 'none'));
    removeBtn.style.display = '';
    removeBtn.dataset.targetId = id;
    anchorRectFn = () => mark.getBoundingClientRect();
    popup.classList.add('visible');
    positionFromAnchor();
  };

  const hidePopup = () => {
    popup.classList.remove('visible');
    pendingText = null;
    pendingRange = null;
    anchorRectFn = null;
  };

  // Show color popup on text selection (mouseup for desktop, selectionchange for iOS)
  const tryShowSelectionPopup = () => {
    if (pendingText) return; // color popup already open — don't interfere
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!chapterContent.contains(range.commonAncestorContainer)) return;
    const text = selection.toString().trim();
    if (!text) return;
    pendingRange = range.cloneRange();
    showColorPopup(text);
  };

  document.addEventListener('mouseup', (e) => {
    if (popup.contains(e.target)) return;
    setTimeout(tryShowSelectionPopup, 0);
  });

  let selectionChangeTimer = null;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionChangeTimer);
    selectionChangeTimer = setTimeout(tryShowSelectionPopup, 300);
  });

  // Show remove popup on mark click
  chapterContent.addEventListener('click', (e) => {
    const mark = e.target.closest('mark[data-highlight-id]');
    if (!mark) return;
    showRemovePopup(mark, mark.dataset.highlightId);
  });

  // Hide popup on mousedown outside
  document.addEventListener('mousedown', (e) => {
    if (popup.contains(e.target)) return;
    if (e.target.closest('mark[data-highlight-id]')) return;
    hidePopup();
  });

  // Reposition popup on scroll
  document.addEventListener('scroll', positionFromAnchor, { passive: true });

  // --- App setup ---
  const showAlert = (message, type = "info") => {
    const alertContainer = document.getElementById("alert_container");
    const wrapper = document.createElement("div");
    wrapper.innerHTML = [
      `<div class="alert alert-${type} alert-dismissible fade show shadow-sm" role="alert">`,
      `   <div>${message}</div>`,
      '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
      "</div>",
    ].join("");
    alertContainer.append(wrapper);
  };

  const setCurrentChapter = (chapterCode) => {
    chapterContent.mdContent = findCurrentChapter(chapterCode);
    loadHighlights(chapterCode);
  };

  const enterPreview = (previewCode) => {
    setCurrentChapter(previewCode);
    nextChapterButton.style.display = 'none';
    previousChapterButton.style.display = 'none';
    resumeReadingButton.style.display = '';
  };

  const exitPreview = () => {
    setCurrentChapter(currentChapterCode);
    nextChapterButton.style.display = '';
    previousChapterButton.style.display = '';
    resumeReadingButton.style.display = 'none';
    previousChapterButton.disabled = currentChapterCode === DEFAULT_CODE;
  };

  resumeReadingButton.addEventListener('click', exitPreview);

  goToResourceButton.addEventListener("click", () => {
    const selectedValue = document.getElementById("resources_dropdown").value;
    window.open(
      "https://github.com/abaransy-business/grant-horner-bible-reading-system/tree/main/resources/" + selectedValue,
      "_blank",
    );
  });

  nextChapterButton.addEventListener("click", () => {
    const { newChapterCode } = findNextChapter(currentChapterCode);
    currentChapterCode = newChapterCode;
    setCurrentChapter(newChapterCode);
    saveChapterCode(newChapterCode);
    previousChapterButton.disabled = false;
  });

  previousChapterButton.addEventListener("click", () => {
    const { newChapterCode } = findPreviousChapter(currentChapterCode);
    currentChapterCode = newChapterCode;
    setCurrentChapter(newChapterCode);
    saveChapterCode(newChapterCode);
    previousChapterButton.disabled = newChapterCode === DEFAULT_CODE;
  });

  myProgressButton.addEventListener("click", () => {
    const bookmarks = currentChapterCode.split("-").slice(1);
    const lines = bookmarks.map((bookmark, i) => {
      const [bookIndex, chapterIndex] = bookmark.split("_");
      return `List ${i + 1}: Book ${Number(bookIndex) + 1}, Chapter ${Number(chapterIndex) + 1}`;
    });
    showAlert(lines.join("<br>"), "info");
  });

  const getChapterInfo = (chapterKey) => {
    const [listIdx, bookmark] = chapterKey.split('-');
    const [bookIdx, chapterIdx] = bookmark.split('_');
    const chapter = fullLists[Number(listIdx)]?.[Number(bookIdx)]?.[Number(chapterIdx)];
    if (!chapter) return null;
    const match = chapter.match(/^#\s+(.+?)\s+-\s+Chapter\s+(\d+)/m);
    return match ? { bookName: match[1], chapterNum: Number(match[2]) } : null;
  };

  const getSwatchColor = (rgbaColor) => {
    const match = HIGHLIGHT_COLORS.find((c) => c.value === rgbaColor);
    return match ? match.swatch : rgbaColor;
  };

  const highlightsModal = new bootstrap.Modal(document.getElementById('highlights_modal'));
  const highlightsList = document.getElementById('highlights_list');
  const highlightsSearch = document.getElementById('highlights_search');
  let allHighlights = [];

  const renderHighlights = (query = '') => {
    const q = query.toLowerCase();
    highlightsList.innerHTML = '';

    const filtered = allHighlights.filter((h) => {
      if (!q) return true;
      return h.selected_text.toLowerCase().includes(q) ||
        h._bookName.toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      highlightsList.innerHTML = `<p class="text-muted">${allHighlights.length === 0 ? 'You have no highlights yet.' : 'No highlights match your search.'}</p>`;
      return;
    }

    const groups = {};
    for (const h of filtered) {
      const key = h._bookName;
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    }

    for (const [bookName, items] of Object.entries(groups)) {
      const header = document.createElement('h6');
      header.className = 'fw-bold mt-3 mb-2';
      header.textContent = bookName;
      highlightsList.appendChild(header);

      for (const h of items) {
        const row = document.createElement('div');
        row.className = 'd-flex align-items-center gap-2 py-2 px-2 rounded mb-1 highlight-list-item';

        const dot = document.createElement('span');
        dot.className = 'flex-shrink-0';
        dot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${getSwatchColor(h.color)};display:inline-block`;

        const text = document.createElement('span');
        text.className = 'flex-grow-1 text-truncate';
        text.textContent = h.selected_text;

        const chapterLabel = document.createElement('small');
        chapterLabel.className = 'text-muted flex-shrink-0';
        chapterLabel.textContent = `Ch. ${h._chapterNum}`;

        row.appendChild(dot);
        row.appendChild(text);
        row.appendChild(chapterLabel);

        row.addEventListener('click', () => {
          const parts = currentChapterCode.split('-');
          const [listIdx, bookmark] = h.chapter_code.split('-');
          parts[0] = listIdx;
          parts[Number(listIdx) + 1] = bookmark;
          enterPreview(parts.join('-'));
          highlightsModal.hide();
        });

        highlightsList.appendChild(row);
      }
    }
  };

  highlightsButton.addEventListener('click', async () => {
    highlightsList.innerHTML = '<p class="text-muted">Loading...</p>';
    highlightsSearch.value = '';
    highlightsModal.show();
    try {
      const raw = await fetch('/api/highlights/all').then((r) => r.json());
      allHighlights = raw.flatMap((h) => {
        const info = getChapterInfo(h.chapter_code);
        if (!info) return [];
        return [{ ...h, _bookName: info.bookName, _chapterNum: info.chapterNum }];
      });
      allHighlights.sort((a, b) => a._bookName.localeCompare(b._bookName) || a._chapterNum - b._chapterNum);
      renderHighlights();
    } catch (e) {
      highlightsList.innerHTML = '<p class="text-muted">Failed to load highlights.</p>';
    }
  });

  highlightsSearch.addEventListener('input', () => renderHighlights(highlightsSearch.value));

  instructionsButton.addEventListener("click", () => {
    showAlert(
      `<strong>Grant Horner's Bible-Reading System</strong><br><br>
      Read 10 chapters per day — one from each of 10 lists organized by biblical genre:
      Gospels, Law, NT Letters (1 &amp; 2), Wisdom, Psalms, Proverbs, OT History, Prophets, and Acts.
      Because each list has a different number of chapters, they cycle independently —
      the combination of readings changes every day and never repeats.<br><br>
      <strong>How to use:</strong><br>
      1. Use "Next" to advance through your 10 reading lists.<br>
      2. Your progress is saved automatically.`,
      "info",
    );
  });

  themeToggleButton.addEventListener("click", () => {
    const html = document.documentElement;
    const newTheme = html.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-bs-theme", newTheme);
    fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme }),
    });
  });

  fontSizeSlider.addEventListener("input", (e) => {
    chapterContent.style.fontSize = `${e.target.value}px`;
  });

  chapterContent.style.fontSize = `${fontSizeSlider.value}px`;

  const { chapterCode, theme } = await fetch('/api/chapter-code').then((r) => r.json());
  document.documentElement.setAttribute('data-bs-theme', theme);
  currentChapterCode = chapterCode;
  previousChapterButton.disabled = currentChapterCode === DEFAULT_CODE;
  setCurrentChapter(currentChapterCode);
};

document.addEventListener("DOMContentLoaded", initializeApp);
