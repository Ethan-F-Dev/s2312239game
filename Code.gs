const GITHUB_BASE_URL = "https://raw.githubusercontent.com/s2312239-sketch/s2312239game/main/";

/**
 * Helper function to fetch raw file contents from GitHub
 */
function fetchGithubFile(fileName) {
  const url = GITHUB_BASE_URL + fileName;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

  if (response.getResponseCode() === 200) {
    return response.getContentText();
  }

  throw new Error(`Failed to load "${fileName}" (HTTP ${response.getResponseCode()})`);
}

/**
 * Single helper for error HTML formatting
 */
function renderErrorHtml(message) {
  return `<div style="color:red; font-family:sans-serif; padding:20px;">
            <h3>GitHub Fetch Error</h3>
            <p>${message}</p>
          </div>`;
}

/**
 * Module Loader: Fetches github_index.json and gets assets for any page key
 * Can be called by doGet() OR from client JS via google.script.run.loadPageModule("game page")
 */
function loadPageModule(pageKey) {
  let indexRaw;
  try {
    indexRaw = fetchGithubFile("github_index.json");
  } catch (err) {
    return { error: renderErrorHtml(err.message) };
  }

  let indexData;
  try {
    indexData = JSON.parse(indexRaw);
  } catch (err) {
    return { error: renderErrorHtml(`Failed to parse github_index.json: ${err.message}`) };
  }

  if (!indexData || !indexData[pageKey]) {
    return { error: renderErrorHtml(`Page key "${pageKey}" not found in github_index.json`) };
  }

  const moduleAssets = { css: [], js: [], html: [] };

  try {
    indexData[pageKey].forEach((fileName) => {
      const fileContent = fetchGithubFile(fileName);

      if (fileName.endsWith(".css")) {
        moduleAssets.css.push({ name: fileName, content: fileContent });
      } else if (fileName.endsWith(".js")) {
        moduleAssets.js.push({ name: fileName, content: fileContent });
      } else if (fileName.endsWith(".html")) {
        moduleAssets.html.push({ name: fileName, content: fileContent });
      }
    });
  } catch (err) {
    return { error: renderErrorHtml(err.message) };
  }

  return moduleAssets;
}

/**
 * Web App Entry Point: Serves initial page load ("index page")
 */
function doGet() {
  const initialModule = loadPageModule("index page");

  if (initialModule.error) {
    return HtmlService.createHtmlOutput(initialModule.error);
  }

  let htmlContent = "";
  initialModule.html.forEach((item) => {
    htmlContent += item.content + "\n";
  });

  if (!htmlContent) {
    return HtmlService.createHtmlOutput("No HTML file found in 'index page'.");
  }

  initialModule.css.forEach((file) => {
    htmlContent += `\n<style id="style-${file.name}">\n${file.content}\n</style>`;
  });

  initialModule.js.forEach((file) => {
    htmlContent += `\n<script id="script-${file.name}">\n${file.content}\n</script>`;
  });

  return HtmlService.createHtmlOutput(htmlContent)
    .setTitle("GitHub Web App")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
