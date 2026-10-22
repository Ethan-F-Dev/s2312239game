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
/** ===========================================================================
 * PART B: AUTHENTICATION & ACCOUNT SYSTEM (GOOGLE SHEETS INTEGRATION)
 * =========================================================================== */

// Constants for Database Sheets
const DB_SHEET_VERIFICATION = "VerificationCodes";
const DB_SHEET_PLAYERS = "Players";
const CODE_EXPIRATION_MINUTES = 10; // Code expires after 10 minutes

/**
 * Helper: Gets existing sheet or creates it with header row if missing
 * @param {string} sheetName Name of the sheet tab
 * @param {Array<string>} headers Column headers to initialize if created
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateSheet(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create("GameDatabase");
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
  }
  return sheet;
}

/**
 * 1. Valid Gmail / CCSC Account Checker
 * Accepts standard @gmail.com and school @ccsc.edu.hk accounts.
 * @param {string} email Email address to validate
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;

  const cleanEmail = email.trim().toLowerCase();
  
  // Regex to ensure valid format and restrict to @gmail.com or @ccsc.edu.hk
  const emailRegex = /^[a-zA-Z0-9._%+-]+@(gmail\.com|ccsc\.edu\.hk)$/;
  return emailRegex.test(cleanEmail);
}

/**
 * 2. Generate and Send Verification Code
 * Stamping email, verification code, timestamp, and initial state into sheet.
 * @param {string} email Recipient email address
 * @returns {Object} Result object { success: boolean, message: string }
 */
function sendVerificationCode(email) {
  const cleanEmail = (email || "").trim().toLowerCase();

  // Validate email domain
  if (!isValidEmail(cleanEmail)) {
    return {
      success: false,
      message: "Invalid email. Must be a @gmail.com or @ccsc.edu.hk address."
    };
  }

  // Get or create VerificationCodes sheet
  const sheet = getOrCreateSheet(DB_SHEET_VERIFICATION, ["Email", "Code", "Timestamp", "Status"]);

  // Generate 6-digit verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const timestamp = new Date();
  const status = "PENDING";

  // Stamp into Verification Codes Sheet
  sheet.appendRow([cleanEmail, code, timestamp, status]);

  // Send Email with Verification Code
  try {
    MailApp.sendEmail({
      to: cleanEmail,
      subject: "Your Game Verification Code",
      body: `Your verification code is: ${code}\n\nThis code will expire in ${CODE_EXPIRATION_MINUTES} minutes.`
    });

    return {
      success: true,
      message: `Verification code sent to ${cleanEmail}`
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to send email: ${err.message}`
    };
  }
}

/**
 * 3. Check if Verification Code is Valid
 * Updates state to 'FINISHED' on success, or 'FAIL/EXPIRED' on failure/expiration.
 * @param {string} email User email address
 * @param {string} inputCode 6-digit code entered by user
 * @returns {Object} Result object { success: boolean, message: string }
 */
function verifyCode(email, inputCode) {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanCode = (inputCode || "").trim();

  const sheet = getOrCreateSheet(DB_SHEET_VERIFICATION, ["Email", "Code", "Timestamp", "Status"]);
  const data = sheet.getDataRange().getValues();

  // Search from newest row to oldest row
  for (let i = data.length - 1; i >= 1; i--) {
    const rowEmail = String(data[i][0]).toLowerCase();
    const rowCode = String(data[i][1]);
    const rowTime = new Date(data[i][2]);
    const rowStatus = String(data[i][3]);

    if (rowEmail === cleanEmail && rowStatus === "PENDING") {
      const now = new Date();
      const elapsedMinutes = (now - rowTime) / (1000 * 60);

      // Check if code has expired
      if (elapsedMinutes > CODE_EXPIRATION_MINUTES) {
        sheet.getRange(i + 1, 4).setValue("FAIL/EXPIRED");
        return { success: false, message: "Verification code has expired. Please request a new one." };
      }

      // Check code match
      if (rowCode === cleanCode) {
        sheet.getRange(i + 1, 4).setValue("FINISHED");
        return { success: true, message: "Verification successful!" };
      } else {
        sheet.getRange(i + 1, 4).setValue("FAIL/EXPIRED");
        return { success: false, message: "Invalid verification code." };
      }
    }
  }

  return { success: false, message: "No pending verification code found for this email." };
}
/**
 * 8. Create Player & Generate Individual Player Sheet
 * Registers the player in the main "Players" sheet and creates a dedicated personal sheet tab.
 * @param {string} username Desired player username
 * @param {string} email Validated email
 * @param {string} password Account password
 * @returns {Object} Result object { success: boolean, message: string, playerId?: string }
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
  const mainSheet = getOrCreateSheet(DB_SHEET_PLAYERS, ["Player ID", "Username", "Email", "Password", "Created At"]);
  const data = mainSheet.getDataRange().getValues();

  // Check if Username or Email already exists
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

  // Generate unique Player ID
  const playerId = "PLR-" + Utilities.getUuid().substring(0, 8);
  const createdAt = new Date();

  // 1. Stamp in Main Players Registry Sheet
  mainSheet.appendRow([playerId, cleanUsername, cleanEmail, cleanPassword, createdAt]);

  // 2. Create and setup individual sheet for this player
  setupIndividualPlayerSheet(ss, cleanUsername, cleanPassword, cleanEmail, createdAt);

  return {
    success: true,
    message: "Player account and personal sheet created successfully!",
    playerId: playerId
  };
}

/**
 * 9. Setup Individual Player Sheet
 * Creates and formats a dedicated individual sheet tab for a player with 1000 ELO ranking and 100 character slots.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss Spreadsheet instance
 * @param {string} username Player username
 * @param {string} password Player password
 * @param {string} email Player email
 * @param {Date} createdAt Creation timestamp
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function setupIndividualPlayerSheet(ss, username, password, email, createdAt) {
  const sheetName = "P_" + username;
  let sheet = ss.getSheetByName(sheetName);

  if (sheet) {
    return sheet;
  }

  sheet = ss.insertSheet(sheetName);

  // Helper styles
  const headerBg = "#2B579A";
  const headerFont = "#FFFFFF";
  const subHeaderBg = "#D9E1F2";

  // =========================================================================
  // TABLE 1: BASIC INFORMATION (Initialized to 1000 ELO)
  // =========================================================================
  sheet.getRange("A1:F1").merge()
    .setValue("TABLE 1: BASIC INFORMATION")
    .setFontWeight("bold").setBackground(headerBg).setFontColor(headerFont);

  sheet.getRange("A2:F2")
    .setValues([["Player Name", "Password", "1v1 Ranking (ELO)", "2v2 Ranking (ELO)", "Email", "Created At"]])
    .setFontWeight("bold").setBackground(subHeaderBg);

  const INITIAL_ELO = 1000;
  sheet.getRange("A3:F3")
    .setValues([[username, password, INITIAL_ELO, INITIAL_ELO, email, createdAt]]);

  // =========================================================================
  // SOCIAL & ACHIEVEMENTS (LIST 1, LIST 2, LIST 3)
  // =========================================================================
  // List 1: Friends
  sheet.getRange("A5:B5").merge()
    .setValue("LIST 1: FRIENDS")
    .setFontWeight("bold").setBackground(headerBg).setFontColor(headerFont);
  sheet.getRange("A6:B6")
    .setValues([["Friend Username", "Status"]])
    .setFontWeight("bold").setBackground(subHeaderBg);

  // List 2: Friend Requests
  sheet.getRange("D5:E5").merge()
    .setValue("LIST 2: FRIEND REQUESTS")
    .setFontWeight("bold").setBackground(headerBg).setFontColor(headerFont);
  sheet.getRange("D6:E6")
    .setValues([["Username", "Type (Incoming/Outgoing)"]])
    .setFontWeight("bold").setBackground(subHeaderBg);

  // List 3: Titles / Achievements Unlocked
  sheet.getRange("G5:I5").merge()
    .setValue("LIST 3: TITLES / ACHIEVEMENTS UNLOCKED")
    .setFontWeight("bold").setBackground(headerBg).setFontColor(headerFont);
  sheet.getRange("G6:I6")
    .setValues([["Title / Achievement", "Date Unlocked", "Description"]])
    .setFontWeight("bold").setBackground(subHeaderBg);

  // =========================================================================
  // TABLE 2: CHARACTERS (1 to 100 initialized, unlocked except certain ones, names empty)
  // =========================================================================
  sheet.getRange("A15:I15").merge()
    .setValue("TABLE 2: CHARACTERS")
    .setFontWeight("bold").setBackground(headerBg).setFontColor(headerFont);

  sheet.getRange("A16:I16")
    .setValues([[
      "Char #", "Character", "Status", "Used Time (s)",
      "Special Slot 1 Count", "Special Slot 2 Count",
      "Skin 1 Status", "Skin 2 Status", "Skin 3 Status"
    ]])
    .setFontWeight("bold").setBackground(subHeaderBg);

  // Default unlocked characters: Chars 1, 2, 3 are unlocked by default; Chars 4-100 are locked
  const DEFAULT_UNLOCKED_IDS = [1, 2, 3];
  const characterRows = [];

  for (let i = 1; i <= 100; i++) {
    const isUnlocked = DEFAULT_UNLOCKED_IDS.includes(i);
    characterRows.push([
      i,                                   // Char # (1 to 100)
      "",                                  // Character Name (Empty)
      isUnlocked ? "Unlocked" : "Locked",   // Status
      0,                                   // Used Time (s)
      0,                                   // Special Slot 1 Count
      0,                                   // Special Slot 2 Count
      isUnlocked ? "Unlocked" : "Locked",   // Skin 1 Status
      "Locked",                            // Skin 2 Status
      "Locked"                             // Skin 3 Status
    ]);
  }

  sheet.getRange(17, 1, 100, 9).setValues(characterRows);

  // =========================================================================
  // MATCH HISTORIES (LIST 4, LIST 5, LIST 6)
  // Shifted row positions down to accommodate 100 character rows (Row 17 - 116)
  // =========================================================================
  // List 4: Recent 10 match of 1v1
  sheet.getRange("A120:F120").merge()
    .setValue("LIST 4: RECENT 10 MATCHES (1v1)")
    .setFontWeight("bold").setBackground(headerBg).setFontColor(headerFont);
  sheet.getRange("A121:F121")
    .setValues([["Opponent", "Opponent Ranking", "Match Rank", "Win / Lose", "Date", "Time"]])
    .setFontWeight("bold").setBackground(subHeaderBg);

  // List 5: Recent 10 match of 2v2
  sheet.getRange("A134:F134").merge()
    .setValue("LIST 5: RECENT 10 MATCHES (2v2)")
    .setFontWeight("bold").setBackground(headerBg).setFontColor(headerFont);
  sheet.getRange("A135:F135")
    .setValues([["Opponent(s)", "Opponent Ranking", "Match Rank", "Win / Lose", "Date", "Time"]])
    .setFontWeight("bold").setBackground(subHeaderBg);

  // List 6: Recent 30 match of any mode
  sheet.getRange("A148:G148").merge()
    .setValue("LIST 6: RECENT 30 MATCHES (ALL MODES)")
    .setFontWeight("bold").setBackground(headerBg).setFontColor(headerFont);
  sheet.getRange("A149:G149")
    .setValues([["Mode", "Opponent(s)", "Opponent Ranking", "Match Rank", "Win / Lose", "Date", "Time"]])
    .setFontWeight("bold").setBackground(subHeaderBg);

  return sheet;
}
/** ===========================================================================
 * PART C: DATA ACCESS & AUTHENTICATION
 * =========================================================================== */

const SPREADSHEET_ID = "1eSGVhn6uXIjBNFWaoQabDM9gvYHPRBs-ABB1woc4rHM";

/**
 * Helper to retrieve the target Google Spreadsheet
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getGameSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Finds the top-left cell coordinate of a specified Table or List header inside a sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Target sheet object
 * @param {string} sectionName Name or title of the table/list (e.g. "TABLE 1", "LIST 1", "CHARACTERS")
 * @returns {Object|null} Object containing { startRow, startCol } or null if not found
 */
function findSectionStart(sheet, sectionName) {
  if (!sectionName) return null;

  const data = sheet.getDataRange().getValues();
  const searchKey = sectionName.toString().trim().toLowerCase();

  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      const cellValue = String(data[r][c]).trim().toLowerCase();
      if (cellValue.includes(searchKey)) {
        return { startRow: r + 1, startCol: c + 1 }; // 1-based indices
      }
    }
  }
  return null;
}

/**
 * 11. Get Data From Sheet
 * Reads data from a specific sheet tab. Supports section relative offsets or absolute cell coordinates.
 * @param {string} sheetName Name of the sheet tab (e.g., "Players", "P_ShadowNinja")
 * @param {string|null} sectionName Name of the table or list (e.g., "TABLE 1", "TABLE 2", "LIST 1") or null for absolute coordinates
 * @param {number} row 1-based row index (relative to section or absolute sheet row)
 * @param {number} column 1-based column index (relative to section or absolute sheet column)
 * @returns {*} Cell value at the target coordinate
 */
function getDataFromSheet(sheetName, sectionName, row, column) {
  const ss = getGameSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Sheet tab "${sheetName}" not found in spreadsheet.`);
  }

  let targetRow = row;
  let targetCol = column;

  if (sectionName) {
    const sectionLoc = findSectionStart(sheet, sectionName);
    if (!sectionLoc) {
      throw new Error(`Section "${sectionName}" not found in sheet "${sheetName}".`);
    }
    // Calculate offset relative to section header
    targetRow = sectionLoc.startRow + row;
    targetCol = sectionLoc.startCol + column - 1;
  }

  return sheet.getRange(targetRow, targetCol).getValue();
}

/**
 * 12. Update Data To Sheet
 * Writes/updates a cell value in a sheet tab. Supports section relative offsets or absolute cell coordinates.
 * @param {string} sheetName Name of the sheet tab (e.g., "Players", "P_ShadowNinja")
 * @param {string|null} sectionName Name of the table or list (e.g., "TABLE 1", "TABLE 2") or null for absolute coordinates
 * @param {number} row 1-based row index (relative to section or absolute sheet row)
 * @param {number} column 1-based column index (relative to section or absolute sheet column)
 * @param {*} newValue The new value to set in the cell
 * @returns {Object} { success: boolean, message: string }
 */
function updateDataInSheet(sheetName, sectionName, row, column, newValue) {
  const ss = getGameSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return { success: false, message: `Sheet tab "${sheetName}" not found.` };
  }

  let targetRow = row;
  let targetCol = column;

  if (sectionName) {
    const sectionLoc = findSectionStart(sheet, sectionName);
    if (!sectionLoc) {
      return { success: false, message: `Section "${sectionName}" not found in sheet "${sheetName}".` };
    }
    targetRow = sectionLoc.startRow + row;
    targetCol = sectionLoc.startCol + column - 1;
  }

  sheet.getRange(targetRow, targetCol).setValue(newValue);

  return {
    success: true,
    message: `Updated [${sheetName}] row ${targetRow}, column ${targetCol} successfully.`
  };
}

/**
 * 13. Log In Check
 * Validates player credentials against the "Players" sheet.
 * @param {string} usernameOrEmail Player's registered username or email
 * @param {string} password Player's account password
 * @returns {Object} Result object containing authentication status and player details
 */
function checkLogin(usernameOrEmail, password) {
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

  return { success: false, message: "Account not found with provided username or email." };
}
