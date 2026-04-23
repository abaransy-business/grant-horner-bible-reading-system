import { fullLists } from "./fullLists.js";
const chapterCodeHistory = [];
// 0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0-0_0
const findCurrentChapter = (chapterCode) => {
  const chapterCodeSplit = chapterCode.split("-");
  const currentListIndex = chapterCodeSplit.splice(0, 1)[0];

  const currentListBookmark = chapterCodeSplit[currentListIndex];

  const [bookIndex, chapterIndex] = currentListBookmark.split("_");

  const currentChapter = fullLists[currentListIndex][bookIndex][chapterIndex];

  return currentChapter;
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

  const nextChapterInCurrentBook =
    fullLists[currentListIndex][bookIndex][chapterIndex + 1];

  if (nextChapterInCurrentBook) {
    const newListBookmark = `${bookIndexAsString}_${chapterIndex + 1}`;

    chapterCodeSplit[currentListIndex] = newListBookmark;

    return {
      nextChapter,
      newChapterCode: `${nextListIndex}-${chapterCodeSplit.join("-")}`,
    };
  }

  const firstChapterOfNextBookInCurrentList =
    fullLists[currentListIndex][bookIndex + 1]?.[0];

  if (firstChapterOfNextBookInCurrentList) {
    const newListBookmark = `${bookIndex + 1}_0`;

    chapterCodeSplit[currentListIndex] = newListBookmark;

    return {
      nextChapter,
      newChapterCode: `${nextListIndex}-${chapterCodeSplit.join("-")}`,
    };
  }

  chapterCodeSplit[currentListIndex] = "0_0";

  return {
    nextChapter,
    newChapterCode: `${nextListIndex}-${chapterCodeSplit.join("-")}`,
  };
};

const findPreviousChapter = (chapterCode) => {
  const lastSeenChapterCode = chapterCodeHistory.pop();
  const previousChapter = findCurrentChapter(lastSeenChapterCode);
  return {
    previousChapter,
    newChapterCode: lastSeenChapterCode,
  };
};

const setNewHistory = (newChapterCode) => {
  const url = new URL(window.location.href);
  url.searchParams.set("chapterCode", newChapterCode);
  history.pushState({}, "", url);
};

const getChapterCodeFromSearchParams = () => {
  const url = new URL(window.location.href);
  return url.searchParams.get("chapterCode");
};

const initializeApp = () => {
  const setChapterButton = document.getElementById("set_chapter_button");
  const nextChapterButton = document.getElementById("next_chapter_button");
  const previousChapterButton = document.getElementById(
    "previous_chapter_button",
  );
  const copyChapterCodeButton = document.getElementById(
    "copy_chapter_code_button",
  );

  const downloadChapterCodeButton = document.getElementById(
    "download_chapter_code_button",
  );

  const instructionsButton = document.getElementById("instructions_button");
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
    const currentChapterContent = findCurrentChapter(chapterCode);

    const chapterContent = document.getElementById("chapter_content");

    chapterContent.mdContent = currentChapterContent;
  };

  goToResourceButton.addEventListener("click", () => {
    const selectedValue = document.getElementById("resources_dropdown").value;

    const baseUrl =
      "https://github.com/abaransy-business/grant-horner-bible-reading/tree/main/resources/";
    const fullUrl = baseUrl + selectedValue;

    window.open(fullUrl, "_blank");
  });

  setChapterButton.addEventListener("click", () => {
    const chapterInput = document.getElementById("chapter_code");
    const chapterCodeInputValueTrimmed = chapterInput.value.trim();

    setCurrentChapter(chapterCodeInputValueTrimmed);

    setNewHistory(chapterCodeInputValueTrimmed);
  });

  nextChapterButton.addEventListener("click", () => {
    const chapterCodeInputValue = document.getElementById("chapter_code").value;

    const { nextChapter: nextChapterContent, newChapterCode } = findNextChapter(
      chapterCodeInputValue,
    );

    const chapterContent = document.getElementById("chapter_content");

    chapterContent.mdContent = nextChapterContent;

    document.getElementById("chapter_code").value = newChapterCode;

    setNewHistory(newChapterCode);

    [previousChapterButton].forEach((button) => {
      button.disabled = false;
    });
  });

  previousChapterButton.addEventListener("click", () => {
    const chapterCodeInputValue = document.getElementById("chapter_code").value;

    const { previousChapter: previousChapterContent, newChapterCode } =
      findPreviousChapter(chapterCodeInputValue);

    const chapterContent = document.getElementById("chapter_content");

    chapterContent.mdContent = previousChapterContent;

    document.getElementById("chapter_code").value = newChapterCode;
    setNewHistory(newChapterCode);

    if (chapterCodeHistory.length === 0) {
      previousChapterButton.disabled = true;
    }
  });

  copyChapterCodeButton.addEventListener("click", () => {
    const chapterCodeInputValue = document.getElementById("chapter_code").value;

    navigator.clipboard.writeText(chapterCodeInputValue);

    showAlert(`Copied chapter code: ${chapterCodeInputValue}`, "success");
  });

  downloadChapterCodeButton.addEventListener("click", () => {
    const chapterCodeInputValue = document.getElementById("chapter_code").value;
    const today = new Date().toLocaleDateString("en-GB"); // "02/03/2026"
    const formattedDate = today.replace(/\//g, "_");
    const filename = `chapter_code_${formattedDate}.txt`;

    const blob = new Blob([chapterCodeInputValue], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);

    const element = document.createElement("a");
    element.setAttribute("href", url);

    element.setAttribute("download", filename);
    element.style.display = "none"; // Hide the element

    document.body.appendChild(element);
    element.click();

    document.body.removeChild(element);
    URL.revokeObjectURL(url); // Free up memory
  });

  instructionsButton.addEventListener("click", () => {
    showAlert(
      `<strong>How to use:</strong><br>
      1. Click "Set" to start at a specific chapter code.<br>
      2. Use "Next Chapter" to cycle through your 10 lists.<br>
      3. "Copy" or "Download" your code when finished to save your progress for next time.`,
      "info",
    );
  });

  themeToggleButton.addEventListener("click", () => {
    const htmlElement = document.documentElement;
    const currentTheme = htmlElement.getAttribute("data-bs-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    htmlElement.setAttribute("data-bs-theme", newTheme);
  });

  fontSizeSlider.addEventListener("input", (e) => {
    const newValue = e.target.value;

    const chapterContent = document.getElementById("chapter_content");

    chapterContent.style.fontSize = `${newValue}px`;
  });

  // Set initial font size
  const initialFontSize = fontSizeSlider.value;
  document.getElementById("chapter_content").style.fontSize =
    `${initialFontSize}px`;

  const chpaterCodeFromSearchParams = getChapterCodeFromSearchParams();
  const chapterCodeInput = document.getElementById("chapter_code");

  if (chpaterCodeFromSearchParams) {
    chapterCodeInput.value = chpaterCodeFromSearchParams;

    setCurrentChapter(chpaterCodeFromSearchParams);
  } else {
    setNewHistory(chapterCodeInput.value);
    setCurrentChapter(chapterCodeInput.value);
  }
};

document.addEventListener("DOMContentLoaded", initializeApp);
