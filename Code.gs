const GITHUB_BASE_URL = "https://raw.githubusercontent.com/s2312239-sketch/s2312239game/main/";

/**
 * Helper function to fetch raw file contents from GitHub
 */
function fetchGithubFile(fileName) {
  try {
    const url = GITHUB_BASE_URL + fileName;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      return response.getContentText();
    } else {
      throw new Error(`Failed to load ${fileName} from GitHub (HTTP ${response.getResponseCode()})`);
    }
  } catch (err) {
    return `<div style="color:red; font-family:sans-serif; padding:20px;">
              <h3>GitHub Fetch Error</h3>
              <p>${err.toString()}</p>
            </div>`;
  }
}

/**
 * Loads and returns index data parsed as JSON object
 */
function getGithubIndex() {
  const indexRaw = fetchGithubFile("github_index.json");
  try {
    return JSON.parse(indexRaw);
  } catch (err) {
    return null;
  }
}

/**
 * Web App Entry Point: Loads ONLY "index page" files initially
 */
function doGet() {
  const indexData = getGithubIndex();

  if (!indexData || !indexData["index page"]) {
    return HtmlService.createHtmlOutput("Failed to load or parse github_index.json");
  }

  // 1. Fetch primary HTML from the index page list
  let htmlContent = fetchGithubFile("index.html");

  if (htmlContent.includes("GitHub Fetch Error")) {
    return HtmlService.createHtmlOutput(htmlContent);
  }

  // 2. Load CSS and JS listed under "index page" only
  const initialFiles = indexData["index page"];
  initialFiles.forEach((fileName) => {
    if (fileName === "index.html") return; // Skip index.html since it's already loaded

    const fileContent = fetchGithubFile(fileName);

    if (fileName.endsWith(".css")) {
      htmlContent += `\n<style id="style-${fileName}">\n${fileContent}\n</style>`;
    } else if (fileName.endsWith(".js")) {
      htmlContent += `\n<script id="script-${fileName}">\n${fileContent}\n</script>`;
    }
  });

  return HtmlService.createHtmlOutput(htmlContent)
    .setTitle("GitHub Web App")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Callable from Client-Side JS (e.g. google.script.run.loadPageModule("game page"))
 * Fetches assets for a specific page key on demand.
 */
function loadPageModule(pageKey) {
  const indexData = getGithubIndex();

  if (!indexData || !indexData[pageKey]) {
    return { error: `Page key "${pageKey}" not found in github_index.json` };
  }

  const moduleAssets = {
    css: [],
    js: [],
    html: []
  };

  const fileList = indexData[pageKey];
  fileList.forEach((fileName) => {
    const fileContent = fetchGithubFile(fileName);

    if (fileName.endsWith(".css")) {
      moduleAssets.css.push({ name: fileName, content: fileContent });
    } else if (fileName.endsWith(".js")) {
      moduleAssets.js.push({ name: fileName, content: fileContent });
    } else if (fileName.endsWith(".html")) {
      moduleAssets.html.push({ name: fileName, content: fileContent });
    }
  });

  return moduleAssets;
}
