import { fullLists } from "./fullLists.js";

const chapterCodeHistory = [];
let currentChapterCode = null;

const findCurrentChapter = (chapterCode) => {
  const chapterCodeSplit = chapterCode.split("-");
  const currentListIndex = chapterCodeSplit.splice(0, 1)[0];
  const currentListBookmark = chapterCodeSplit[currentListIndex];
  const [bookIndex, chapterIndex] = currentListBookmark.split("_");
  return fullLists[currentListIndex][bookIndex][chapterIndex];
};

const findNextChapter = (chapterCode) => {
  chapterCodeHistory.push(chapterCode);
  const chapterCodeSplit = chapterCode.split("-");
  const currentListIndex = Number(chapterCodeSplit.splice(0, 1)[0]);
  const nextListIndex = (currentListIndex + 1) % 10;
  const nextChapter = findCurrentChapter(
    `${nextListIndex}-${chapterCodeSplit.join("-")}`,
  );

  const currentListBookmark = chapterCodeSplit[currentListIndex];
  const [bookIndexAsString, chapterIndexAsString] =
    currentListBookmark.split("_");
  const bookIndex = Number(bookIndexAsString);
  const chapterIndex = Number(chapterIndexAsString);

  if (fullLists[currentListIndex][bookIndex][chapterIndex + 1]) {
    chapterCodeSplit[currentListIndex] = `${bookIndexAsString}_${chapterIndex + 1}`;
    return { nextChapter, newChapterCode: `${nextListIndex}-${chapterCodeSplit.join("-")}` };
  }

  if (fullLists[currentListIndex][bookIndex + 1]?.[0]) {
    chapterCodeSplit[currentListIndex] = `${bookIndex + 1}_0`;
    return { nextChapter, newChapterCode: `${nextListIndex}-${chapterCodeSplit.join("-")}` };
  }

  chapterCodeSplit[currentListIndex] = "0_0";
  return { nextChapter, newChapterCode: `${nextListIndex}-${chapterCodeSplit.join("-")}` };
};

const findPreviousChapter = () => {
  const lastSeenChapterCode = chapterCodeHistory.pop();
  return {
    previousChapter: findCurrentChapter(lastSeenChapterCode),
    newChapterCode: lastSeenChapterCode,
  };
};

const saveChapterCode = (chapterCode) => {
  fetch('/api/chapter-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapterCode }),
  });
};

const initializeApp = async () => {
  const nextChapterButton = document.getElementById("next_chapter_button");
  const previousChapterButton = document.getElementById("previous_chapter_button");
  const instructionsButton = document.getElementById("instructions_button");
  const myProgressButton = document.getElementById("my_progress_button");
  const themeToggleButton = document.getElementById("theme_toggle_button");
  const goToResourceButton = document.getElementById("go_to_resource_button");
  const fontSizeSlider = document.getElementById("font_size_control");

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
    document.getElementById("chapter_content").mdContent =
      findCurrentChapter(chapterCode);
  };

  goToResourceButton.addEventListener("click", () => {
    const selectedValue = document.getElementById("resources_dropdown").value;
    window.open(
      "https://github.com/abaransy-business/grant-horner-bible-reading/tree/main/resources/" + selectedValue,
      "_blank",
    );
  });

  nextChapterButton.addEventListener("click", () => {
    const { nextChapter, newChapterCode } = findNextChapter(currentChapterCode);
    document.getElementById("chapter_content").mdContent = nextChapter;
    currentChapterCode = newChapterCode;
    saveChapterCode(newChapterCode);
    previousChapterButton.disabled = false;
  });

  previousChapterButton.addEventListener("click", () => {
    const { previousChapter, newChapterCode } = findPreviousChapter();
    document.getElementById("chapter_content").mdContent = previousChapter;
    currentChapterCode = newChapterCode;
    saveChapterCode(newChapterCode);
    if (chapterCodeHistory.length === 0) previousChapterButton.disabled = true;
  });

  myProgressButton.addEventListener("click", () => {
    const bookmarks = currentChapterCode.split("-").slice(1);
    const lines = bookmarks.map((bookmark, i) => {
      const [bookIndex, chapterIndex] = bookmark.split("_");
      return `List ${i + 1}: Book ${Number(bookIndex) + 1}, Chapter ${Number(chapterIndex) + 1}`;
    });
    showAlert(lines.join("<br>"), "info");
  });

  instructionsButton.addEventListener("click", () => {
    showAlert(
      `<strong>How to use:</strong><br>
      1. Use "Next" to advance through your 10 reading lists.<br>
      2. Your progress is saved automatically.`,
      "info",
    );
  });

  themeToggleButton.addEventListener("click", () => {
    const html = document.documentElement;
    html.setAttribute(
      "data-bs-theme",
      html.getAttribute("data-bs-theme") === "dark" ? "light" : "dark",
    );
  });

  fontSizeSlider.addEventListener("input", (e) => {
    document.getElementById("chapter_content").style.fontSize = `${e.target.value}px`;
  });

  document.getElementById("chapter_content").style.fontSize = `${fontSizeSlider.value}px`;

  const { chapterCode } = await fetch('/api/chapter-code').then((r) => r.json());
  currentChapterCode = chapterCode;
  setCurrentChapter(currentChapterCode);
};

document.addEventListener("DOMContentLoaded", initializeApp);
