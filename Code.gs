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

/** ===========================================================================
 * PART C: MATCHMAKING SYSTEM (ALL-IN-ONE WAITING ROOM)
 * =========================================================================== */

const DB_SHEET_WAITING_ROOM = "WaitingRoom";

/**
 * Helper: Gets or creates the single WaitingRoom sheet tab
 */
function getWaitingRoomSheet() {
  return getOrCreateSheet(DB_SHEET_WAITING_ROOM, [
    "Player ID", "Username", "Mode", "ELO", "Status", "Match ID", "Joined At", "Matched At"
  ]);
}

/**
 * 15. Join Matchmaking Queue
 * Adds player to the WaitingRoom sheet and attempts immediate match pairing.
 * @param {string} usernameOrId Player username or Player ID
 * @param {string} mode Game mode ("1v1" or "2v2")
 * @returns {Object} { success: boolean, message: string, status: string, matchId?: string }
 */
function joinMatchmaking(usernameOrId, mode) {
  const cleanMode = (mode || "").trim();
  if (cleanMode !== "1v1" && cleanMode !== "2v2") {
    return { success: false, message: "Invalid mode. Allowed modes: '1v1', '2v2'." };
  }

  // Get player data to fetch current ELO
  let playerData, username, playerId;
  try {
    playerData = getPlayerData(usernameOrId);
    username = usernameOrId;
    
    // Find basic account details from Players sheet
    const mainSheet = getGameSpreadsheet().getSheetByName(DB_SHEET_PLAYERS);
    const rowIdx = findPlayerRow(mainSheet, usernameOrId);
    const rowData = mainSheet.getRange(rowIdx, 1, 1, 2).getValues()[0];
    playerId = rowData[0];
    username = rowData[1];
  } catch (err) {
    return { success: false, message: `Failed to join queue: ${err.message}` };
  }

  const sheet = getWaitingRoomSheet();
  const data = sheet.getDataRange().getValues();

  // Check if player is already waiting or matched
  for (let i = 1; i < data.length; i++) {
    const rowPlayerId = String(data[i][0]);
    const rowStatus = String(data[i][4]);

    if (rowPlayerId === playerId) {
      if (rowStatus === "WAITING") {
        // Update mode and re-attempt matching
        sheet.getRange(i + 1, 3).setValue(cleanMode);
        sheet.getRange(i + 1, 7).setValue(new Date());
        tryCreateMatches(cleanMode);
        return { success: true, message: "Updated existing queue ticket.", status: "WAITING" };
      } else if (rowStatus === "MATCHED") {
        return { 
          success: true, 
          message: "Match already found!", 
          status: "MATCHED", 
          matchId: String(data[i][5]) 
        };
      }
    }
  }

  // Get ELO for selected mode
  const currentElo = (playerData.elo && playerData.elo[cleanMode]) ? playerData.elo[cleanMode] : 1000;
  const joinedAt = new Date();

  // Stamp queue row: [Player ID, Username, Mode, ELO, Status, Match ID, Joined At, Matched At]
  sheet.appendRow([playerId, username, cleanMode, currentElo, "WAITING", "", joinedAt, ""]);

  // Trigger match creation check immediately
  const matchResult = tryCreateMatches(cleanMode);

  return {
    success: true,
    message: "Joined matchmaking queue successfully.",
    status: matchResult.matchedPlayerIds.includes(playerId) ? "MATCHED" : "WAITING",
    matchId: matchResult.matchId || null
  };
}

/**
 * 16. Leave Matchmaking Queue
 * Cancels active waiting status in the queue.
 * @param {string} usernameOrId Player username or Player ID
 * @returns {Object} { success: boolean, message: string }
 */
function leaveMatchmaking(usernameOrId) {
  const sheet = getWaitingRoomSheet();
  const data = sheet.getDataRange().getValues();
  const cleanInput = String(usernameOrId || "").trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const rowPlayerId = String(data[i][0]).toLowerCase();
    const rowUsername = String(data[i][1]).toLowerCase();
    const rowStatus = String(data[i][4]);

    if ((cleanInput === rowPlayerId || cleanInput === rowUsername) && rowStatus === "WAITING") {
      sheet.getRange(i + 1, 5).setValue("CANCELLED");
      return { success: true, message: "Left matchmaking queue successfully." };
    }
  }

  return { success: false, message: "No active waiting ticket found to cancel." };
}

/**
 * 17. Check Matchmaking Status
 * Polling function called by frontend to check if player has been matched.
 * @param {string} usernameOrId Player username or Player ID
 * @returns {Object} Queue status and match details
 */
function checkMatchmakingStatus(usernameOrId) {
  const sheet = getWaitingRoomSheet();
  const data = sheet.getDataRange().getValues();
  const cleanInput = String(usernameOrId || "").trim().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const rowPlayerId = String(data[i][0]).toLowerCase();
    const rowUsername = String(data[i][1]).toLowerCase();
    const rowStatus = String(data[i][4]);
    const rowMode = String(data[i][2]);

    if (cleanInput === rowPlayerId || cleanInput === rowUsername) {
      if (rowStatus === "WAITING") {
        // Trigger matching attempt in case another player joined
        tryCreateMatches(rowMode);
      }

      // Re-read status after potential matching
      const currentStatus = sheet.getRange(i + 1, 5).getValue();
      const matchId = sheet.getRange(i + 1, 6).getValue();

      return {
        success: true,
        inQueue: currentStatus === "WAITING",
        status: currentStatus,
        matchId: matchId || null,
        mode: rowMode
      };
    }
  }

  return { success: true, inQueue: false, status: "NONE", matchId: null };
}

/**
 * 18. Match Generator Logic (Internal Helper)
 * Pairs waiting players together when minimum group count is met (2 for 1v1, 4 for 2v2).
 * @param {string} mode Game mode ("1v1" or "2v2")
 * @returns {Object} { matchedPlayerIds: Array, matchId?: string }
 */
function tryCreateMatches(mode) {
  const sheet = getWaitingRoomSheet();
  const data = sheet.getDataRange().getValues();
  const requiredPlayers = mode === "1v1" ? 2 : 4;

  const waitingRows = [];

  // Gather waiting players for target mode
  for (let i = 1; i < data.length; i++) {
    const rowStatus = String(data[i][4]);
    const rowMode = String(data[i][2]);

    if (rowStatus === "WAITING" && rowMode === mode) {
      waitingRows.push({
        rowIndex: i + 1,
        playerId: data[i][0],
        username: data[i][1],
        elo: data[i][3]
      });
    }
  }

  // Check if enough players are waiting
  if (waitingRows.length < requiredPlayers) {
    return { matchedPlayerIds: [] };
  }

  // Generate unique Match ID
  const matchId = "MATCH-" + Utilities.getUuid().substring(0, 8);
  const matchedAt = new Date();
  const matchedPlayerIds = [];

  // Pair top candidates
  for (let k = 0; k < requiredPlayers; k++) {
    const candidate = waitingRows[k];
    matchedPlayerIds.push(candidate.playerId);

    // Update WaitingRoom row status to MATCHED and assign Match ID
    sheet.getRange(candidate.rowIndex, 5).setValue("MATCHED");
    sheet.getRange(candidate.rowIndex, 6).setValue(matchId);
    sheet.getRange(candidate.rowIndex, 8).setValue(matchedAt);
  }

  return {
    matchedPlayerIds: matchedPlayerIds,
    matchId: matchId
  };
}
