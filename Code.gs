const GITHUB_BASE_URL = "https://raw.githubusercontent.com/s2312239-sketch/s2312239game/main/";

/**
 * Helper function to fetch raw file contents from GitHub
 * @param {string} fileName Name or relative path of the file in GitHub
 * @returns {string} Raw text content or error HTML block
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
 * Google Apps Script Web App Entry Point
 */
function doGet() {
  // 1. Fetch the file index JSON from GitHub
  const indexRaw = fetchGithubFile("github_index.json");

  // Check if fetching the index failed
  if (indexRaw.includes("GitHub Fetch Error")) {
    return HtmlService.createHtmlOutput(indexRaw);
  }

  let indexData;
  try {
    indexData = JSON.parse(indexRaw);
  } catch (err) {
    return HtmlService.createHtmlOutput(`Failed to parse github_index.json: ${err.message}`);
  }

  // 2. Fetch primary index.html file
  let htmlContent = fetchGithubFile("index.html");

  if (htmlContent.includes("GitHub Fetch Error")) {
    return HtmlService.createHtmlOutput(htmlContent);
  }

  // 3. Loop through files listed in index and inject CSS/JS into the HTML
  if (Array.isArray(indexData.files)) {
    indexData.files.forEach((fileName) => {
      const fileContent = fetchGithubFile(fileName);

      if (fileName.endsWith(".css")) {
        htmlContent += `\n<style>\n${fileContent}\n</style>`;
      } else if (fileName.endsWith(".js")) {
        htmlContent += `\n<script>\n${fileContent}\n</script>`;
      }
    });
  }

  return HtmlService.createHtmlOutput(htmlContent)
    .setTitle("GitHub Web App")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
