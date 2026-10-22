/**
 * Configuration & Constants
 */
const CONFIG = {
  GITHUB_OWNER: 'YOUR_GITHUB_USERNAME',
  GITHUB_REPO: 'YOUR_REPOSITORY_NAME',
  GITHUB_BRANCH: 'main',
  INDEX_FILE_PATH: 'github_index.json',
  CACHE_EXPIRATION_SEC: 21600, // 6 hours (Max allowed by CacheService)
  USE_CACHE: true
};

/**
 * Web App Entry Point - Serves HTML content fetched from GitHub
 * @param {Object} e Event object
 * @returns {HtmlOutput}
 */
function doGet(e) {
  try {
    // Sync/verify cache before serving
    const filesMap = syncGithubFiles();
    
    // Get primary HTML layout content
    let htmlContent = filesMap['index_html'];
    if (!htmlContent) {
      throw new Error("Target file 'index_html' not found in fetched GitHub index.");
    }

    // Process inline inclusions for CSS and JS
    htmlContent = injectDependencies(htmlContent, filesMap);

    return HtmlService.createHtmlOutput(htmlContent)
      .setTitle('Dynamic Apps Script App')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput(`<h3>Error loading application:</h3><p>${err.message}</p>`);
  }
}

/**
 * Fetch file index from GitHub repository
 * @returns {Object} Parsed JSON index file containing repository file mappings
 */
function fetchFileIndex() {
  const url = `https://raw.githubusercontent.com/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/${CONFIG.GITHUB_BRANCH}/${CONFIG.INDEX_FILE_PATH}`;
  const response = fetchFromGithubRaw(url);
  return JSON.parse(response);
}

/**
 * Syncs and updates all indexed files from GitHub into CacheService / PropertiesService
 * @returns {Object} Key-value map of { file_id: content }
 */
function syncGithubFiles() {
  const cache = CacheService.getScriptCache();
  const indexData = fetchFileIndex();
  const fileMap = {};

  indexData.files.forEach(file => {
    const cacheKey = `gh_file_${file.id}`;
    let content = null;

    if (CONFIG.USE_CACHE) {
      content = cache.get(cacheKey);
    }

    if (!content) {
      const fileUrl = `https://raw.githubusercontent.com/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/${CONFIG.GITHUB_BRANCH}/${file.path}`;
      content = fetchFromGithubRaw(fileUrl);
      
      // Cache the content (CacheService limit is 100KB per string)
      if (content.length < 100000) {
        cache.put(cacheKey, content, CONFIG.CACHE_EXPIRATION_SEC);
      } else {
        // Fallback for larger files: Store in ScriptProperties
        PropertiesService.getScriptProperties().setProperty(cacheKey, content);
      }
    }

    fileMap[file.id] = content;
  });

  return fileMap;
}

/**
 * Helper to fetch raw content from GitHub URL with authentication headers if required
 * @param {string} url Target Raw URL
 * @returns {string} Text content of requested file
 */
function fetchFromGithubRaw(url) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_PAT');
  const options = {
    method: 'get',
    muteHttpExceptions: true,
    headers: {}
  };

  if (token) {
    options.headers['Authorization'] = `token ${token}`;
  }

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    throw new Error(`Failed to fetch ${url} - HTTP ${response.getResponseCode()}: ${response.getContentText()}`);
  }

  return response.getContentText();
}

/**
 * Injects CSS and JS dependencies into the HTML string
 * replaces custom tags like <?!= include('styles_css') ?> or placeholders
 */
function injectDependencies(html, filesMap) {
  // Replace <style data-include="styles_css"></style> or inject directly
  return html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/gi, (match, path) => {
    const matchedFile = findFileByPath(path, filesMap);
    return matchedFile ? `<style>${matchedFile}</style>` : match;
  }).replace(/<script\s+src="([^"]+)"><\/script>/gi, (match, path) => {
    const matchedFile = findFileByPath(path, filesMap);
    return matchedFile ? `<script>${matchedFile}</script>` : match;
  });
}

/**
 * Matches asset URL path to cached file content
 */
function findFileByPath(path, filesMap) {
  // Match path ending (e.g., 'src/styles.css' or 'styles.css')
  if (path.includes('styles.css') && filesMap['styles_css']) return filesMap['styles_css'];
  if (path.includes('app.js') && filesMap['app_js']) return filesMap['app_js'];
  return null;
}

/**
 * Webhook Endpoint - Allows GitHub Webhook to trigger auto-update/cache invalidation
 */
function doPost(e) {
  try {
    // Clear CacheService
    const cache = CacheService.getScriptCache();
    const indexData = fetchFileIndex();
    
    indexData.files.forEach(file => {
      cache.remove(`gh_file_${file.id}`);
    });

    // Re-fetch fresh contents
    syncGithubFiles();

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Cache updated successfully' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Set up time-driven trigger for automatic polling update (e.g., hourly)
 */
function setupAutoUpdateTrigger() {
  // Remove existing triggers to prevent duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncGithubFiles') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create hourly sync trigger
  ScriptApp.newTrigger('syncGithubFiles')
    .timeBased()
    .everyHours(1)
    .create();
}
