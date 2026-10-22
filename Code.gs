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
 * 4. Create Player on Players Sheet
 * Checks if account already exists before creating new entry.
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

  const sheet = getOrCreateSheet(DB_SHEET_PLAYERS, ["Player ID", "Username", "Email", "Password", "Created At"]);
  const data = sheet.getDataRange().getValues();

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

  // Generate unique Player ID and stamp player record
  const playerId = "PLR-" + Utilities.getUuid().substring(0, 8);
  const createdAt = new Date();

  sheet.appendRow([playerId, cleanUsername, cleanEmail, cleanPassword, createdAt]);

  return {
    success: true,
    message: "Player account created successfully!",
    playerId: playerId
  };
}
