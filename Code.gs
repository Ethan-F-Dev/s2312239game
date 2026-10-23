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

  const cleanInput = (usernameOrEmail || "").trim().toLowerCase();
  const cleanPass = (password || "").trim();

  if (!cleanInput || !cleanPass) {
    return { success: false, message: "Username/Email and password are required." };
  }

  const ss = getGameSpreadsheet();
  const sheet = ss.getSheetByName("Players");

  if (!sheet) {
    return { success: false, message: "Players registry sheet not found." };
  }

  const data = sheet.getDataRange().getValues();

  // Search through rows (Skipping header row at index 0)
  for (let i = 1; i < data.length; i++) {
    const rowPlayerId = String(data[i][0]);
    const rowUsername = String(data[i][1]).toLowerCase();
    const rowEmail = String(data[i][2]).toLowerCase();
    const rowPassword = String(data[i][3]);

    if (cleanInput === rowUsername || cleanInput === rowEmail) {
      if (cleanPass === rowPassword) {
        return {
          success: true,
          message: "Login successful!",
          player: {
            playerId: rowPlayerId,
            username: data[i][1],
            email: data[i][2]
          }
        };
      } else {
        return { success: false, message: "Incorrect password." };
      }
    }
  }
/** ===========================================================================
 * PART B & C: JSON-BASED DATA ACCESS & AUTHENTICATION (OPTION 2)
 * =========================================================================== */

const SPREADSHEET_ID = "1eSGVhn6uXIjBNFWaoQabDM9gvYHPRBs-ABB1woc4rHM";
const DB_SHEET_PLAYERS = "Players";

/**
 * Helper to retrieve the target Google Spreadsheet
 */
function getGameSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Helper to locate row index in 'Players' sheet by Username or PlayerID
 */
function findPlayerRow(sheet, usernameOrId) {
  const data = sheet.getDataRange().getValues();
  const cleanInput = String(usernameOrId || "").trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const rowPlayerId = String(data[i][0]).toLowerCase();
    const rowUsername = String(data[i][1]).toLowerCase();

    if (cleanInput === rowPlayerId || cleanInput === rowUsername) {
      return i + 1; // 1-based sheet row index
    }
  }
  return -1;
}

/**
 * 8. Create Player (Option 2 - JSON Storage)
 */
function createPlayer(username, email, password) {
  const cleanUsername = (username || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanPassword = (password || "").trim();

  if (!cleanUsername || !cleanEmail || !cleanPassword) {
    return { success: false, message: "Username, email, and password are required." };
  }

  if (!isValidEmail(cleanEmail)) {
    return { success: false, message: "Invalid email domain. Allowed: @gmail.com or @ccsc.edu.hk" };
  }

  const ss = getGameSpreadsheet();
  const mainSheet = getOrCreateSheet(DB_SHEET_PLAYERS, ["Player ID", "Username", "Email", "Password", "GameData", "Created At"]);
  const data = mainSheet.getDataRange().getValues();

  // Check duplicate username or email
  for (let i = 1; i < data.length; i++) {
    const existingUsername = String(data[i][1]).toLowerCase();
    const existingEmail = String(data[i][2]).toLowerCase();

    if (existingEmail === cleanEmail) {
      return { success: false, message: "An account with this email already exists." };
    }
    if (existingUsername === cleanUsername.toLowerCase()) {
      return { success: false, message: "Username is already taken." };
    }
  }

  const playerId = "PLR-" + Utilities.getUuid().substring(0, 8);
  const createdAt = new Date();

  // Initialize Default Game Data Object
  const defaultGameData = {
    elo: { "1v1": 1000, "2v2": 1000 },
    friends: [],
    friendRequests: [],
    titles: [],
    characters: {},
    matches: { "1v1": [], "2v2": [], "all": [] }
  };

  // Populate character slots 1-100 (Starter IDs 1-3 unlocked)
  for (let i = 1; i <= 100; i++) {
    const isUnlocked = [1, 2, 3].includes(i);
    defaultGameData.characters[i] = {
      name: "",
      status: isUnlocked ? "Unlocked" : "Locked",
      usedTime: 0,
      special1: 0,
      special2: 0,
      skins: [isUnlocked ? "Unlocked" : "Locked", "Locked", "Locked"]
    };
  }

  // Stamp row in Players sheet with JSON string in Column 5
  mainSheet.appendRow([
    playerId,
    cleanUsername,
    cleanEmail,
    cleanPassword,
    JSON.stringify(defaultGameData),
    createdAt
  ]);

  return {
    success: true,
    message: "Player account created successfully!",
    playerId: playerId
  };
}

/**
 * 11. Get Full Player Data Object
 */
function getPlayerData(usernameOrId) {
  const ss = getGameSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEET_PLAYERS);

  if (!sheet) {
    throw new Error(`Sheet tab "${DB_SHEET_PLAYERS}" not found.`);
  }

  const rowIndex = findPlayerRow(sheet, usernameOrId);
  if (rowIndex === -1) {
    throw new Error(`Player "${usernameOrId}" not found.`);
  }

  const jsonString = sheet.getRange(rowIndex, 5).getValue();

  try {
    return JSON.parse(jsonString || "{}");
  } catch (err) {
    throw new Error(`Failed to parse player JSON data: ${err.message}`);
  }
}

/**
 * 12. Save Full Player Data Object
 */
function savePlayerData(usernameOrId, gameDataObject) {
  const ss = getGameSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEET_PLAYERS);

  if (!sheet) {
    return { success: false, message: `Sheet tab "${DB_SHEET_PLAYERS}" not found.` };
  }

  const rowIndex = findPlayerRow(sheet, usernameOrId);
  if (rowIndex === -1) {
    return { success: false, message: `Player "${usernameOrId}" not found.` };
  }

  const jsonString = JSON.stringify(gameDataObject);
  sheet.getRange(rowIndex, 5).setValue(jsonString);

  return { success: true, message: "Player data saved successfully." };
}

/**
 * 13. Set / Add New Key in Player Data ("xx": value)
 * Supports nested dot notation (e.g., "coins" or "inventory.weapons")
 */
function setPlayerDataKey(usernameOrId, keyPath, value) {
  try {
    const playerData = getPlayerData(usernameOrId);

    const keys = keyPath.split(".");
    let current = playerData;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || typeof current[keys[i]] !== "object") {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;

    return savePlayerData(usernameOrId, playerData);
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * 14. Log In Check
 */
function checkLogin(usernameOrEmail, password) {
  const cleanInput = (usernameOrEmail || "").trim().toLowerCase();
  const cleanPass = (password || "").trim();

  if (!cleanInput || !cleanPass) {
    return { success: false, message: "Username/Email and password are required." };
  }

  const ss = getGameSpreadsheet();
  const sheet = ss.getSheetByName(DB_SHEET_PLAYERS);

  if (!sheet) {
    return { success: false, message: "Players registry sheet not found." };
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowPlayerId = String(data[i][0]);
    const rowUsername = String(data[i][1]).toLowerCase();
    const rowEmail = String(data[i][2]).toLowerCase();
    const rowPassword = String(data[i][3]);

    if (cleanInput === rowUsername || cleanInput === rowEmail) {
      if (cleanPass === rowPassword) {
        let parsedGameData = {};
        try {
          parsedGameData = JSON.parse(data[i][4] || "{}");
        } catch (err) {}

        return {
          success: true,
          message: "Login successful!",
          player: {
            playerId: rowPlayerId,
            username: data[i][1],
            email: data[i][2],
            gameData: parsedGameData
          }
        };
      } else {
        return { success: false, message: "Incorrect password." };
      }
    }
  }

  return { success: false, message: "Account not found with provided username or email." };
}
