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
  { swatch: "#ffd60a", value: "rgba(255, 214, 10, 0.4)" },
  { swatch: "#57cc99", value: "rgba(87, 204, 153, 0.4)" },
  { swatch: "#74b9e8", value: "rgba(116, 185, 232, 0.4)" },
  { swatch: "#f48fb1", value: "rgba(244, 143, 177, 0.4)" },
  { swatch: "#ff6b6b", value: "rgba(255, 107, 107, 0.4)" },
  { swatch: "#c084fc", value: "rgba(192, 132, 252, 0.4)" },
  { swatch: "#fb923c", value: "rgba(251, 146, 60, 0.4)" },
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

  const [bookIndexAsString, chapterIndexAsString] =
    parts[currentListIndex].split("_");
  const bookIndex = Number(bookIndexAsString);
  const chapterIndex = Number(chapterIndexAsString);

  let bookCompleted = false;
  let listCompleted = false;

  if (fullLists[currentListIndex][bookIndex][chapterIndex + 1]) {
    parts[currentListIndex] = `${bookIndexAsString}_${chapterIndex + 1}`;
  } else if (fullLists[currentListIndex][bookIndex + 1]?.[0]) {
    parts[currentListIndex] = `${bookIndex + 1}_0`;
    bookCompleted = true;
  } else {
    parts[currentListIndex] = "0_0";
    bookCompleted = true;
    listCompleted = true;
  }

  return {
    nextChapter,
    newChapterCode: `${nextListIndex}-${parts.join("-")}`,
    completedListIndex: currentListIndex,
    completedBookIndex: bookIndex,
    bookCompleted,
    listCompleted,
  };
};

const findPreviousChapter = (chapterCode) => {
  const parts = chapterCode.split("-");
  const currentListIndex = Number(parts.splice(0, 1)[0]);
  const prevListIndex = (currentListIndex - 1 + 10) % 10;

  const [bookIndexAsString, chapterIndexAsString] =
    parts[prevListIndex].split("_");
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
  return {
    previousChapter: findCurrentChapter(newChapterCode),
    newChapterCode,
  };
};

const showError = (message) => {
  const toastEl = document.getElementById("error_toast");
  if (!toastEl) return;
  document.getElementById("error_toast_body").textContent = message;
  bootstrap.Toast.getOrCreateInstance(toastEl).show();
};

const apiFetch = async (url, options) => {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    showError("Network error. Please check your connection and try again.");
    throw err;
  }
  if (!res.ok) {
    showError("Something went wrong. Please try again.");
    throw new Error(`${url} responded ${res.status}`);
  }
  return res;
};

const mapNormToOrig = (origText, normOff) => {
  let start = 0;
  while (start < origText.length && /\s/.test(origText[start])) start++;
  let n = 0,
    inWs = false;
  for (let i = start; i <= origText.length; i++) {
    if (n === normOff) return i;
    if (i === origText.length) break;
    if (/\s/.test(origText[i])) {
      if (!inWs) {
        n++;
        inWs = true;
      }
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

  // Fast path: case-insensitive single-node match
  for (const node of textNodes) {
    const idx = node.textContent.toLowerCase().indexOf(selectedText.toLowerCase());
    if (idx !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + selectedText.length);
      const mark = document.createElement("mark");
      mark.style.backgroundColor = color;
      mark.style.color = "inherit";
      mark.dataset.highlightId = id;
      try {
        range.surroundContents(mark);
      } catch (e) {}
      return;
    }
  }

  // Multi-node path: normalize whitespace and search across nodes
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const target = norm(selectedText);
  const segs = textNodes
    .map((node) => ({ node, normText: norm(node.textContent) }))
    .filter((s) => s.normText.length > 0);

  const joined = segs.map((s) => s.normText).join(" ");
  const matchIdx = joined.toLowerCase().indexOf(target.toLowerCase());
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
        const mark = document.createElement("mark");
        mark.style.backgroundColor = color;
        mark.style.color = "inherit";
        mark.dataset.highlightId = id;
        try {
          range.surroundContents(mark);
        } catch (e) {}
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
    const end =
      node === range.endContainer ? range.endOffset : node.textContent.length;
    if (start < end) segments.push({ node, start, end });
  }
  for (const { node, start, end } of segments) {
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, end);
    const mark = document.createElement("mark");
    mark.style.backgroundColor = color;
    mark.style.color = "inherit";
    mark.dataset.highlightId = id;
    try {
      r.surroundContents(mark);
    } catch (e) {}
  }
};

let previewHighlight = null;

const loadHighlights = async (chapterCode) => {
  const container = document.getElementById("chapter_content");
  try {
    const [highlights] = await Promise.all([
      apiFetch(
        `/api/highlights?chapterCode=${encodeURIComponent(getChapterKey(chapterCode))}`,
      ).then((r) => r.json()),
      new Promise((resolve) =>
        container.addEventListener("md-render", resolve, { once: true }),
      ),
    ]);
    highlights.forEach((h) =>
      applyHighlight(container, h.selected_text, h.color, h.id),
    );
    if (previewHighlight) {
      applyHighlight(
        container,
        previewHighlight.selected_text,
        previewHighlight.color,
        previewHighlight.id,
      );
    }
  } catch (e) {
    // Toast already shown by apiFetch
  }
};

const initializeApp = async () => {
  const nextChapterButton = document.getElementById("next_chapter_button");
  const previousChapterButton = document.getElementById(
    "previous_chapter_button",
  );
  const instructionsButton = document.getElementById("instructions_button");
  const myProgressButton = document.getElementById("my_progress_button");
  const highlightsButton = document.getElementById("highlights_button");
  const searchButton = document.getElementById("search_button");
  const settingsButton = document.getElementById("settings_button");
  const resourcesButton = document.getElementById("resources_button");
  const goToResourceButton = document.getElementById("go_to_resource_button");
  const fontSizeSlider = document.getElementById("font_size_control");
  const themeToggle = document.getElementById("theme_toggle");
  const chapterContent = document.getElementById("chapter_content");
  const popup = document.getElementById("highlight_popup");
  const stickyNav = document.getElementById("sticky_nav");

  // --- Highlight popup setup ---
  let pendingText = null;
  let pendingRange = null;

  HIGHLIGHT_COLORS.forEach(({ swatch, value }) => {
    const btn = document.createElement("button");
    btn.className = "highlight-swatch";
    btn.style.backgroundColor = swatch;
    btn.addEventListener("click", async () => {
      if (!pendingText || !pendingRange) return;
      try {
        const { id } = await apiFetch("/api/highlights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterCode: getChapterKey(displayedChapterCode),
            selectedText: pendingText,
            color: value,
          }),
        }).then((r) => r.json());
        applyHighlightFromRange(chapterContent, pendingRange, value, id);
        window.getSelection().removeAllRanges();
        hidePopup();
      } catch (e) {
        // Toast already shown by apiFetch
      }
    });
    popup.appendChild(btn);
  });

  const removeBtn = document.createElement("span");
  removeBtn.className = "highlight-remove-btn";
  removeBtn.textContent = "Remove Highlight";
  removeBtn.style.display = "none";
  removeBtn.addEventListener("click", async () => {
    const id = removeBtn.dataset.targetId;
    if (!id) return;
    try {
      await apiFetch(`/api/highlights/${id}`, { method: "DELETE" });
      chapterContent
        .querySelectorAll(`mark[data-highlight-id="${id}"]`)
        .forEach((mark) => {
          const parent = mark.parentNode;
          while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
          parent.removeChild(mark);
        });
      hidePopup();
    } catch (e) {
      // Toast already shown by apiFetch
    }
  });
  popup.appendChild(removeBtn);

  let anchorRectFn = null;

  const positionFromAnchor = () => {
    if (!anchorRectFn) return;
    const rect = anchorRectFn();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      popup.classList.remove("visible");
      return;
    }
    popup.classList.add("visible");
    const w = popup.offsetWidth;
    const h = popup.offsetHeight;

    if (window.matchMedia("(pointer: coarse)").matches) {
      popup.style.left = `${Math.max(8, (window.innerWidth - w) / 2)}px`;
      popup.style.top = "auto";
      const navVisible = getComputedStyle(stickyNav).display !== "none";
      const bottomOffset = navVisible ? stickyNav.offsetHeight + 16 : 24;
      popup.style.bottom = `${bottomOffset}px`;
      return;
    }

    popup.style.bottom = "auto";
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    let left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2));
    let top = y - h - 10;
    if (top < 8) top = y + rect.height + 6;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  };

  const showColorPopup = (text) => {
    pendingText = text;
    [...popup.querySelectorAll(".highlight-swatch")].forEach(
      (s) => (s.style.display = ""),
    );
    removeBtn.style.display = "none";
    anchorRectFn = () => pendingRange.getBoundingClientRect();
    popup.classList.add("visible");
    positionFromAnchor();
  };

  const showRemovePopup = (mark, id) => {
    pendingText = null;
    [...popup.querySelectorAll(".highlight-swatch")].forEach(
      (s) => (s.style.display = "none"),
    );
    removeBtn.style.display = "";
    removeBtn.dataset.targetId = id;
    anchorRectFn = () => mark.getBoundingClientRect();
    popup.classList.add("visible");
    positionFromAnchor();
  };

  const hidePopup = () => {
    popup.classList.remove("visible");
    pendingText = null;
    pendingRange = null;
    anchorRectFn = null;
  };

  // Show color popup on text selection (mouseup for desktop, selectionchange for iOS)
  const tryShowSelectionPopup = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!chapterContent.contains(range.commonAncestorContainer)) return;
    const text = selection.toString().trim();
    if (!text) return;
    pendingRange = range.cloneRange();
    if (pendingText) {
      // Popup already visible — update data without repositioning (avoids moving popup during tap)
      pendingText = text;
      anchorRectFn = () => pendingRange.getBoundingClientRect();
    } else {
      showColorPopup(text);
    }
  };

  document.addEventListener("mouseup", (e) => {
    if (popup.contains(e.target)) return;
    setTimeout(tryShowSelectionPopup, 0);
  });

  let selectionChangeTimer = null;
  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionChangeTimer);
    selectionChangeTimer = setTimeout(tryShowSelectionPopup, 300);
  });

  // Show remove popup on mark click (skip transient search preview marks)
  chapterContent.addEventListener("click", (e) => {
    const mark = e.target.closest("mark[data-highlight-id]");
    if (!mark) return;
    if (mark.dataset.highlightId === "search-preview") return;
    showRemovePopup(mark, mark.dataset.highlightId);
  });

  // Hide popup on mousedown outside
  document.addEventListener("mousedown", (e) => {
    if (popup.contains(e.target)) return;
    if (e.target.closest("mark[data-highlight-id]")) return;
    hidePopup();
  });

  // Reposition popup on scroll
  document.addEventListener("scroll", positionFromAnchor, { passive: true });

  let displayedChapterCode = null;

  const setCurrentChapter = (chapterCode) => {
    displayedChapterCode = chapterCode;
    chapterContent.mdContent = findCurrentChapter(chapterCode);
    return loadHighlights(chapterCode);
  };

  const navReading = document.getElementById("nav_reading");
  const navPreview = document.getElementById("nav_preview");
  const navPreviewMessage = document.getElementById("nav_preview_message");

  const enterPreview = async (
    previewCode,
    scrollToId,
    message = "You're previewing a highlight.",
  ) => {
    navPreviewMessage.textContent = message;
    await setCurrentChapter(previewCode);
    navReading.style.setProperty("display", "none", "important");
    navPreview.style.setProperty("display", "flex", "important");
    if (scrollToId) {
      const mark = chapterContent.querySelector(
        `mark[data-highlight-id="${scrollToId}"]`,
      );
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const exitPreview = () => {
    previewHighlight = null;
    setCurrentChapter(currentChapterCode);
    navReading.style.setProperty("display", "flex", "important");
    navPreview.style.setProperty("display", "none", "important");
    previousChapterButton.disabled = currentChapterCode === DEFAULT_CODE;
  };

  document
    .getElementById("resume_reading_banner_button")
    .addEventListener("click", exitPreview);

  goToResourceButton?.addEventListener("click", () => {
    const selectedValue = document.getElementById("resources_dropdown")?.value;
    if (!selectedValue) return;
    window.open(
      "https://github.com/abaransy-business/grant-horner-bible-reading-system/tree/main/resources/" +
        selectedValue,
      "_blank",
    );
  });

  nextChapterButton.addEventListener("click", async () => {
    const {
      newChapterCode,
      completedListIndex,
      completedBookIndex,
      bookCompleted,
      listCompleted,
    } = findNextChapter(currentChapterCode);

    nextChapterButton.disabled = true;
    previousChapterButton.disabled = true;
    try {
      await apiFetch("/api/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newChapterCode,
          bookCompletion: bookCompleted
            ? { listIndex: completedListIndex, bookIndex: completedBookIndex }
            : null,
          listCompletion: listCompleted
            ? { listIndex: completedListIndex }
            : null,
        }),
      });
      currentChapterCode = newChapterCode;
      setCurrentChapter(newChapterCode);
      chapterContent.scrollIntoView({ behavior: "instant" });
    } catch (err) {
      // Toast already shown by apiFetch
    } finally {
      nextChapterButton.disabled = false;
      previousChapterButton.disabled = currentChapterCode === DEFAULT_CODE;
    }
  });

  previousChapterButton.addEventListener("click", async () => {
    const { newChapterCode } = findPreviousChapter(currentChapterCode);
    nextChapterButton.disabled = true;
    previousChapterButton.disabled = true;
    try {
      await apiFetch("/api/back", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterCode: newChapterCode }),
      });
      currentChapterCode = newChapterCode;
      setCurrentChapter(newChapterCode);
      chapterContent.scrollIntoView({ behavior: "instant" });
    } catch (err) {
      // Toast already shown by apiFetch
    } finally {
      nextChapterButton.disabled = false;
      previousChapterButton.disabled = currentChapterCode === DEFAULT_CODE;
    }
  });

  const myProgressModal = new bootstrap.Modal(
    document.getElementById("my_progress_modal"),
  );
  const myProgressBody = document.getElementById("my_progress_body");

  myProgressButton.addEventListener("click", async () => {
    const bookmarks = currentChapterCode.split("-").slice(1);
    myProgressBody.innerHTML = '<p class="text-muted">Loading...</p>';
    myProgressModal.show();
    try {
      const { lists, books } = await apiFetch("/api/completions").then((r) =>
        r.json(),
      );
      const listCounts = new Map(lists.map((l) => [l.list_index, l.count]));
      const bookCounts = new Map(
        books.map((b) => [`${b.list_index}-${b.book_index}`, b.count]),
      );
      const cards = bookmarks.map((bookmark, i) => {
        const [bookIndexStr, chapterIndexStr] = bookmark.split("_");
        const bookIndex = Number(bookIndexStr);
        const chapterIndex = Number(chapterIndexStr);
        const listCount = listCounts.get(i) ?? 0;
        const bookCount = bookCounts.get(`${i}-${bookIndex}`) ?? 0;
        const totalBooks = fullLists[i].length;
        const totalChapters = fullLists[i][bookIndex].length;
        const bookNum = bookIndex + 1;
        const chapterNum = chapterIndex + 1;
        const totalChaptersInList = fullLists[i].reduce(
          (sum, book) => sum + book.length,
          0,
        );
        let chaptersReadInList = chapterIndex;
        for (let b = 0; b < bookIndex; b++) {
          chaptersReadInList += fullLists[i][b].length;
        }
        const listProgressPct =
          (chaptersReadInList / totalChaptersInList) * 100;
        const bookProgressPct = (chapterIndex / totalChapters) * 100;
        const info = getChapterInfo(`${i}-${bookIndex}_${chapterIndex}`);
        const bookName = info?.bookName ?? `Book ${bookIndex + 1}`;
        const listTimes = listCount === 1 ? "time" : "times";
        const bookTimes = bookCount === 1 ? "time" : "times";
        return `
          <div class="col-12 col-md-6">
            <div class="card h-100">
              <div class="card-body p-3 d-flex flex-column gap-3">
                <div>
                  <div class="d-flex justify-content-between align-items-baseline mb-1">
                    <small class="fw-semibold">List ${i + 1}</small>
                    <small class="text-muted">
                      <i class="bi bi-arrow-repeat"></i> Read ${listCount} ${listTimes}
                    </small>
                  </div>
                  <div class="text-muted small">Book ${bookNum} of ${totalBooks}</div>
                  <div class="progress mt-1" style="height: 4px">
                    <div class="progress-bar" style="width: ${listProgressPct}%"></div>
                  </div>
                </div>
                <div class="mt-auto">
                  <div class="d-flex justify-content-between align-items-baseline mb-1">
                    <small class="fw-semibold text-truncate" title="${bookName}">${bookName}</small>
                    <small class="text-muted ms-2 flex-shrink-0">
                      <i class="bi bi-book"></i> Read ${bookCount} ${bookTimes}
                    </small>
                  </div>
                  <div class="text-muted small">Chapter ${chapterNum} of ${totalChapters}</div>
                  <div class="progress mt-1" style="height: 4px">
                    <div class="progress-bar" style="width: ${bookProgressPct}%"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      myProgressBody.innerHTML = `<div class="row g-2">${cards.join("")}</div>`;
    } catch (e) {
      // Toast already shown by apiFetch
      myProgressBody.innerHTML =
        '<p class="text-muted">Failed to load progress.</p>';
    }
  });

  const getChapterInfo = (chapterKey) => {
    const [listIdx, bookmark] = chapterKey.split("-");
    const [bookIdx, chapterIdx] = bookmark.split("_");
    const chapter =
      fullLists[Number(listIdx)]?.[Number(bookIdx)]?.[Number(chapterIdx)];
    if (!chapter) return null;
    const match = chapter.match(/^#\s+(.+?)\s+-\s+Chapter\s+(\d+)/m);
    return match ? { bookName: match[1], chapterNum: Number(match[2]) } : null;
  };

  const getSwatchColor = (rgbaColor) => {
    const match = HIGHLIGHT_COLORS.find((c) => c.value === rgbaColor);
    return match ? match.swatch : rgbaColor;
  };

  const highlightsModal = new bootstrap.Modal(
    document.getElementById("highlights_modal"),
  );
  const highlightsList = document.getElementById("highlights_list");
  const highlightsSearch = document.getElementById("highlights_search");
  let allHighlights = [];

  const renderHighlights = (query = "") => {
    const q = query.toLowerCase();
    highlightsList.innerHTML = "";

    const filtered = allHighlights.filter((h) => {
      if (!q) return true;
      return (
        h.selected_text.toLowerCase().includes(q) ||
        h._bookName.toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      highlightsList.innerHTML = `<p class="text-muted">${allHighlights.length === 0 ? "You have no highlights yet." : "No highlights match your search."}</p>`;
      return;
    }

    const groups = {};
    for (const h of filtered) {
      const key = h._bookName;
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    }

    for (const [bookName, items] of Object.entries(groups)) {
      const header = document.createElement("h6");
      header.className = "fw-bold mt-3 mb-2";
      header.textContent = bookName;
      highlightsList.appendChild(header);

      for (const h of items) {
        const row = document.createElement("div");
        row.className =
          "d-flex align-items-center gap-2 py-2 px-2 rounded mb-1 highlight-list-item";

        const dot = document.createElement("span");
        dot.className = "flex-shrink-0";
        dot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${getSwatchColor(h.color)};display:inline-block`;

        const text = document.createElement("span");
        text.className = "flex-grow-1 text-truncate";
        text.textContent = h.selected_text;

        const chapterLabel = document.createElement("small");
        chapterLabel.className = "text-muted flex-shrink-0";
        chapterLabel.textContent = `Ch. ${h._chapterNum}`;

        row.appendChild(dot);
        row.appendChild(text);
        row.appendChild(chapterLabel);

        row.addEventListener("click", () => {
          const parts = currentChapterCode.split("-");
          const [listIdx, bookmark] = h.chapter_code.split("-");
          parts[0] = listIdx;
          parts[Number(listIdx) + 1] = bookmark;
          highlightsModal.hide();
          previewHighlight = null;
          enterPreview(parts.join("-"), h.id, "You're previewing a highlight.");
        });

        highlightsList.appendChild(row);
      }
    }
  };

  highlightsButton.addEventListener("click", async () => {
    highlightsList.innerHTML = '<p class="text-muted">Loading...</p>';
    highlightsSearch.value = "";
    highlightsModal.show();
    try {
      const raw = await apiFetch("/api/highlights/all").then((r) => r.json());
      allHighlights = raw.flatMap((h) => {
        const info = getChapterInfo(h.chapter_code);
        if (!info) return [];
        return [
          { ...h, _bookName: info.bookName, _chapterNum: info.chapterNum },
        ];
      });
      allHighlights.sort(
        (a, b) =>
          a._bookName.localeCompare(b._bookName) ||
          a._chapterNum - b._chapterNum,
      );
      renderHighlights();
    } catch (e) {
      // Toast already shown by apiFetch
      highlightsList.innerHTML =
        '<p class="text-muted">Failed to load highlights.</p>';
    }
  });

  highlightsSearch.addEventListener("input", () =>
    renderHighlights(highlightsSearch.value),
  );

  // === Search ===

  const searchModal = new bootstrap.Modal(
    document.getElementById("search_modal"),
  );
  const searchInput = document.getElementById("search_input");
  const searchList = document.getElementById("search_list");

  const SEARCH_MIN_CHARS = 2;

  let searchIndex = null;
  const buildSearchIndex = () => {
    if (searchIndex) return searchIndex;
    searchIndex = [];
    for (let l = 0; l < fullLists.length; l++) {
      for (let b = 0; b < fullLists[l].length; b++) {
        for (let c = 0; c < fullLists[l][b].length; c++) {
          const content = fullLists[l][b][c];
          const info = getChapterInfo(`${l}-${b}_${c}`);
          if (!info) continue;
          searchIndex.push({
            listIndex: l,
            bookIndex: b,
            chapterIndex: c,
            bookName: info.bookName,
            chapterNum: info.chapterNum,
            content,
            contentLower: content.toLowerCase(),
          });
        }
      }
    }
    return searchIndex;
  };

  const escapeHtml = (s) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const highlightQueryInText = (text, query) => {
    if (!query) return escapeHtml(text);
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let result = "";
    let i = 0;
    while (i < text.length) {
      const found = lower.indexOf(q, i);
      if (found === -1) {
        result += escapeHtml(text.slice(i));
        break;
      }
      result += escapeHtml(text.slice(i, found));
      result += `<mark class="bg-warning bg-opacity-25 text-body p-0">${escapeHtml(
        text.slice(found, found + query.length),
      )}</mark>`;
      i = found + query.length;
    }
    return result;
  };

  const renderSearchResults = (query) => {
    searchList.innerHTML = "";
    const trimmed = query.trim();
    if (trimmed.length < SEARCH_MIN_CHARS) {
      searchList.innerHTML = `<p class="text-muted">Type at least ${SEARCH_MIN_CHARS} characters to search.</p>`;
      return;
    }
    const index = buildSearchIndex();
    const q = trimmed.toLowerCase();

    const matches = [];
    let truncated = false;
    outer: for (const ch of index) {
      if (ch.contentLower.indexOf(q) === -1) continue;
      const lines = ch.content.split("\n");
      for (const line of lines) {
        if (!line.trim() || line.startsWith("#")) continue;
        if (line.toLowerCase().includes(q)) {
          matches.push({ chapter: ch, line: line.trim() });
        }
      }
    }

    if (matches.length === 0) {
      searchList.innerHTML = `<p class="text-muted">No results found.</p>`;
      return;
    }

    matches.sort(
      (a, b) =>
        a.chapter.bookName.localeCompare(b.chapter.bookName) ||
        a.chapter.chapterNum - b.chapter.chapterNum,
    );

    const groups = {};
    for (const m of matches) {
      const key = m.chapter.bookName;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }

    for (const [bookName, items] of Object.entries(groups)) {
      const header = document.createElement("h6");
      header.className = "fw-bold mt-3 mb-2";
      header.textContent = bookName;
      searchList.appendChild(header);

      for (const m of items) {
        const row = document.createElement("div");
        row.className =
          "d-flex align-items-start gap-2 py-2 px-2 rounded mb-1 highlight-list-item";

        const text = document.createElement("span");
        text.className = "flex-grow-1";
        text.innerHTML = highlightQueryInText(m.line, trimmed);

        const chapterLabel = document.createElement("small");
        chapterLabel.className = "text-muted flex-shrink-0";
        chapterLabel.textContent = `Ch. ${m.chapter.chapterNum}`;

        row.appendChild(text);
        row.appendChild(chapterLabel);

        row.addEventListener("click", () => {
          const parts = currentChapterCode.split("-");
          const ch = m.chapter;
          parts[0] = String(ch.listIndex);
          parts[ch.listIndex + 1] = `${ch.bookIndex}_${ch.chapterIndex}`;
          searchModal.hide();
          const previewId = "search-preview";
          previewHighlight = {
            selected_text: searchInput.value.trim(),
            color: HIGHLIGHT_COLORS[0].value,
            id: previewId,
          };
          enterPreview(
            parts.join("-"),
            previewId,
            "You're previewing a search result.",
          );
        });

        searchList.appendChild(row);
      }
    }
  };

  searchButton.addEventListener("click", () => {
    searchInput.value = "";
    searchList.innerHTML = `<p class="text-muted">Type at least ${SEARCH_MIN_CHARS} characters to search.</p>`;
    searchModal.show();
  });

  let searchDebounceTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      renderSearchResults(searchInput.value);
    }, 250);
  });

  const instructionsModal = new bootstrap.Modal(
    document.getElementById("instructions_modal"),
  );
  instructionsButton.addEventListener("click", () => instructionsModal.show());

  const settingsModal = new bootstrap.Modal(
    document.getElementById("settings_modal"),
  );
  settingsButton.addEventListener("click", () => settingsModal.show());

  const resourcesModal = new bootstrap.Modal(
    document.getElementById("resources_modal"),
  );
  resourcesButton.addEventListener("click", () => resourcesModal.show());

  const fontSizeValue = document.getElementById("font_size_value");

  const applyFontSize = (size) => {
    fontSizeSlider.value = size;
    fontSizeValue.textContent = size;
    chapterContent.style.fontSize = `${size}px`;
  };

  let fontSizeTimer = null;
  fontSizeSlider.addEventListener("input", (e) => {
    applyFontSize(e.target.value);
    clearTimeout(fontSizeTimer);
    fontSizeTimer = setTimeout(() => {
      apiFetch("/api/font-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fontSize: Number(e.target.value) }),
      }).catch(() => {
        // Toast already shown by apiFetch
      });
    }, 500);
  });

  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-bs-theme", theme);
    themeToggle.checked = theme === "dark";
  };

  themeToggle.addEventListener("change", () => {
    const newTheme = themeToggle.checked ? "dark" : "light";
    applyTheme(newTheme);
    apiFetch("/api/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: newTheme }),
    }).catch(() => {
      // Toast already shown by apiFetch
    });
  });

  try {
    const { chapterCode, theme, fontSize } = await apiFetch(
      "/api/chapter-code",
    ).then((r) => r.json());
    applyTheme(theme);
    applyFontSize(fontSize ?? 18);
    currentChapterCode = chapterCode;
    previousChapterButton.disabled = currentChapterCode === DEFAULT_CODE;
    setCurrentChapter(currentChapterCode);
  } catch (e) {
    // Toast already shown by apiFetch
  }
};

document.addEventListener("DOMContentLoaded", initializeApp);
