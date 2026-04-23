import fs from "fs/promises";
import path from "node:path";
const listsStartAndFinish = [
  ["40_Matthew", "43_John"],
  ["01_Genesis", "05_Deuteronomy"],
  ["45_Romans", "58_Hebrews"],
  ["52_I_Thessalonians", "66_Revelation_of_John"],
  ["18_Job", "22_Song_of_Solomon"],
  ["19_Psalms"],
  ["20_Proverbs"],
  ["06_Joshua", "17_Esther"],
  ["23_Isaiah", "39_Malachi"],
  ["44_Acts"],
];

const fullLists = [];

for (let i = 0; i < 10; i++) {
  fullLists.push([]);
}

const allBooks = await fs.readdir("./by_chapter");

async function readFilesInOrder(dirPath, bookName) {
  const filePaths = await fs.readdir(dirPath);
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });

  filePaths.sort(collator.compare);

  const fileContents = [];

  for (const filePath of filePaths) {
    const fullPath = path.join(dirPath, filePath);
    const fileContent = await fs.readFile(fullPath, "utf-8");

    const indexOfHeaderMarkdown = fileContent.indexOf("#");

    const bookNameWithoutNumber = bookName.slice(3);

    const fileContentWithChapter =
      fileContent.slice(0, indexOfHeaderMarkdown + 1) +
      ` ${bookNameWithoutNumber.split("_").join(" ")} -` +
      fileContent.slice(indexOfHeaderMarkdown + 1);

    fileContents.push(fileContentWithChapter);
  }

  return fileContents;
}

try {
  let currentBookIndex = 0;

  for (let i = 0; i < listsStartAndFinish.length; i++) {
    const currentListStartAndFinish = listsStartAndFinish[i];

    const startingBookWithinList = currentListStartAndFinish[0];

    currentBookIndex = allBooks.findIndex(
      (book) => book === startingBookWithinList,
    );

    const endingBookWithinList = currentListStartAndFinish[1];

    if (!endingBookWithinList) {
      const currentBook = allBooks[currentBookIndex];
      const chaptersForCurrentBook = await readFilesInOrder(
        `./by_chapter/${currentBook}`,
        currentBook,
      );

      fullLists[i].push(chaptersForCurrentBook);
      currentBookIndex++;
    } else {
      while (true) {
        const currentBook = allBooks[currentBookIndex];

        if (
          (i === 4 && currentBook === "19_Psalms") ||
          currentBook === "20_Proverbs"
        ) {
          currentBookIndex++;
          continue;
        }

        const chaptersForCurrentBook = await readFilesInOrder(
          `./by_chapter/${currentBook}`,
          currentBook,
        );

        fullLists[i].push(chaptersForCurrentBook);

        if (currentBook === endingBookWithinList) {
          break;
        }

        currentBookIndex++;
      }
    }
  }

  fs.writeFile(
    "./fullLists.js",
    `const fullLists = ${JSON.stringify(fullLists)}`,
  );
} catch (err) {
  console.error(err);
}
