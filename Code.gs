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
 * Combined function: Fetches github_index.json and loads assets for any specified pageKey.
 * Callable from doGet() on initial load or from client-side JS via google.script.run.
 */
function loadPageModule(pageKey) {
  // 1. Fetch and parse index directly inside module loader
  const indexRaw = fetchGithubFile("github_index.json");
  if (indexRaw.includes("GitHub Fetch Error")) {
    return { error: indexRaw };
  }

  let indexData;
  try {
    indexData = JSON.parse(indexRaw);
  } catch (err) {
    return { error: `Failed to parse github_index.json: ${err.message}` };
  }

  if (!indexData || !indexData[pageKey]) {
    return { error: `Page key "${pageKey}" not found in github_index.json` };
  }

  // 2. Fetch assets for the given key
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

/**
 * Web App Entry Point: Loads "index page" using loadPageModule()
 */
function doGet() {
  const initialModule = loadPageModule("index page");

  if (initialModule.error) {
    return HtmlService.createHtmlOutput(initialModule.error);
  }

  // Combine HTML files
  let htmlContent = "";
  initialModule.html.forEach((item) => {
    htmlContent += item.content + "\n";
  });

  if (!htmlContent) {
    return HtmlService.createHtmlOutput("No HTML file found in 'index page'.");
  }

  // Inject CSS
  initialModule.css.forEach((file) => {
    htmlContent += `\n<style id="style-${file.name}">\n${file.content}\n</style>`;
  });

  // Inject JS
  initialModule.js.forEach((file) => {
    htmlContent += `\n<script id="script-${file.name}">\n${file.content}\n</script>`;
  });

  return HtmlService.createHtmlOutput(htmlContent)
    .setTitle("GitHub Web App")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
