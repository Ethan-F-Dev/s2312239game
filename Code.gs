// ==========================================
// 1. GITHUB DYNAMIC HTML LOADER
// ==========================================
const GITHUB_BASE_URL = "https://raw.githubusercontent.com/s2312239-sketch/s2312239game/main/";

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

function doGet() {
  let indexHtml = fetchGithubFile('Index.html');
  const stylesheetHtml = fetchGithubFile('Stylesheet.html');

  // Replace inclusion tag with raw CSS from GitHub
  indexHtml = indexHtml.replace(/<\?!=\s*include\(['"]Stylesheet['"]\);\s*\?>/gi, stylesheetHtml);

  return HtmlService.createHtmlOutput(indexHtml)
    .setTitle('巔峰對決')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getGameContent(playerName, viewName) {
  const fileName = (viewName === 'Classic') ? 'ClassicGame.html' : 'OnlineGame.html';
  let gameHtml = fetchGithubFile(fileName);
  const stylesheetHtml = fetchGithubFile('Stylesheet.html');

  gameHtml = gameHtml.replace(/<\?!=\s*include\(['"]Stylesheet['"]\);\s*\?>/gi, stylesheetHtml);
  gameHtml = gameHtml.replace(/<\?=\s*playerName\s*\?>/g, playerName);

  return gameHtml;
}

// Helper to access spreadsheet
function getSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}


// ==========================================
// 2. MATCHMAKING & STATUS ENGINE
// ==========================================

function setPlayerStatus(player, newStatus, gameMode, peerId) {
  try {
    const sheet = getSheet('Online players');
    const data = sheet.getDataRange().getValues();
    const cleanPlayer = player.trim();
    const activeMode = (gameMode || 'Unselected').trim();

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === cleanPlayer.toLowerCase()) {
        rowIndex = i + 1;
        break;
      }
    }

    if (newStatus === 'choosing') {
      if (rowIndex !== -1) {
        sheet.getRange(rowIndex, 2).setValue(activeMode);
        sheet.getRange(rowIndex, 3).setValue('choosing');
        sheet.getRange(rowIndex, 4).setValue('');
        sheet.getRange(rowIndex, 5).setValue('');
      } else {
        sheet.appendRow([cleanPlayer, activeMode, 'choosing', '', '']);
      }
      return { success: true, status: 'choosing', mode: activeMode };
    }

    if (newStatus === 'waiting') {
      const currentData = sheet.getDataRange().getValues();
      let waitingP1RoomId = '';

      for (let i = 1; i < currentData.length; i++) {
        const rowPlayer = currentData[i][0].toString();
        const rowMode = currentData[i][1].toString();
        const rowStatus = currentData[i][2].toString();
        const rowRole = currentData[i][3].toString();

        if (rowPlayer.toLowerCase() !== cleanPlayer.toLowerCase() &&
            rowMode.toLowerCase() === activeMode.toLowerCase() &&
            rowStatus === 'waiting' &&
            rowRole === 'P1') {
          waitingP1RoomId = currentData[i][4].toString();
          break;
        }
      }

      let role = 'P1';
      let roomId = peerId || ('ROOM_' + Date.now());

      if (waitingP1RoomId) {
        role = 'P2';
        roomId = waitingP1RoomId;
      }

      if (rowIndex !== -1) {
        sheet.getRange(rowIndex, 2).setValue(activeMode);
        sheet.getRange(rowIndex, 3).setValue('waiting');
        sheet.getRange(rowIndex, 4).setValue(role);
        sheet.getRange(rowIndex, 5).setValue(roomId);
      } else {
        sheet.appendRow([cleanPlayer, activeMode, 'waiting', role, roomId]);
      }

      return {
        success: true,
        role: role,
        status: 'waiting',
        mode: activeMode,
        roomId: roomId,
        p1PeerId: roomId
      };
    }

    if (newStatus === 'wentOffLine') {
      if (rowIndex !== -1) {
        sheet.deleteRow(rowIndex);
      }
      return { success: true, status: 'offline' };
    }

    return { success: false, message: 'Invalid status.' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function checkRoomStatus(player) {
  try {
    const sheet = getSheet('Online players');
    const data = sheet.getDataRange().getValues();
    const cleanPlayer = player.trim().toLowerCase();

    let playerRow = null;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === cleanPlayer) {
        playerRow = {
          name: data[i][0].toString(),
          mode: data[i][1].toString(),
          status: data[i][2].toString(),
          role: data[i][3].toString(),
          roomId: data[i][4].toString()
        };
        break;
      }
    }

    if (!playerRow || playerRow.status === 'choosing') {
      return { status: playerRow ? playerRow.status : 'offline' };
    }

    if (playerRow.status === 'playing') {
      let opponent = '';
      for (let i = 1; i < data.length; i++) {
        if (data[i][4].toString() === playerRow.roomId && data[i][0].toString().toLowerCase() !== cleanPlayer) {
          opponent = data[i][0].toString();
          break;
        }
      }
      return { 
        status: 'playing', 
        role: playerRow.role, 
        mode: playerRow.mode,
        roomId: playerRow.roomId, 
        p1PeerId: playerRow.roomId,
        opponent: opponent 
      };
    }

    let p1Index = -1, p2Index = -1;
    let p1Name = '', p2Name = '';
    let p1Status = '', p2Status = '';

    for (let i = 1; i < data.length; i++) {
      if (data[i][4].toString() === playerRow.roomId && playerRow.roomId !== '') {
        if (data[i][3].toString() === 'P1') {
          p1Index = i + 1;
          p1Name = data[i][0].toString();
          p1Status = data[i][2].toString();
        } else if (data[i][3].toString() === 'P2') {
          p2Index = i + 1;
          p2Name = data[i][0].toString();
          p2Status = data[i][2].toString();
        }
      }
    }

    if (p1Index !== -1 && p2Index !== -1 && p1Status === 'waiting' && p2Status === 'waiting') {
      sheet.getRange(p1Index, 3).setValue('playing');
      sheet.getRange(p2Index, 3).setValue('playing');

      const opponent = (playerRow.role === 'P1') ? p2Name : p1Name;
      return {
        status: 'playing',
        role: playerRow.role,
        mode: playerRow.mode,
        roomId: playerRow.roomId,
        p1PeerId: playerRow.roomId,
        opponent: opponent
      };
    }

    return { 
      status: 'waiting', 
      role: playerRow.role, 
      mode: playerRow.mode,
      roomId: playerRow.roomId, 
      p1PeerId: playerRow.roomId 
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function leaveRoom(player) {
  try {
    const sheet = getSheet('Online players');
    const data = sheet.getDataRange().getValues();
    const cleanPlayer = player.trim().toLowerCase();

    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0].toString().toLowerCase() === cleanPlayer) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Left room.' };
      }
    }
    return { success: false, message: 'Player not found.' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getOnlineStats() {
  try {
    const sheet = getSheet('Online players');
    const data = sheet.getDataRange().getValues();

    let waitingCount = 0;
    let playingCount = 0;
    let choosingCount = 0;

    for (let i = 1; i < data.length; i++) {
      const status = data[i][2] ? data[i][2].toString().toLowerCase().trim() : '';
      if (status === 'waiting') waitingCount++;
      else if (status === 'playing') playingCount++;
      else if (status === 'choosing') choosingCount++;
    }

    return {
      success: true,
      totalOnline: waitingCount + playingCount + choosingCount,
      waitingCount: waitingCount,
      playingCount: playingCount,
      choosingCount: choosingCount
    };
  } catch (err) {
    return { success: false, totalOnline: 0, waitingCount: 0, playingCount: 0, choosingCount: 0 };
  }
}


// ==========================================
// 3. AUTHENTICATION & GOOGLE ACCOUNTS
// ==========================================

function checkActiveGoogleAccount() {
  try {
    const activeEmail = Session.getActiveUser().getEmail();
    if (!activeEmail) return { exists: false, email: '' };

    const sheet = getSheet('Accounts');
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === activeEmail.toLowerCase()) {
        return { exists: true, email: activeEmail, playerName: data[i][2].toString() };
      }
    }
    return { exists: false, email: activeEmail };
  } catch (err) {
    return { exists: false, email: '' };
  }
}

function signIn(email, password) {
  try {
    const sheet = getSheet('Accounts');
    const data = sheet.getDataRange().getValues();
    const cleanEmail = email.trim().toLowerCase();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === cleanEmail) {
        if (data[i][1].toString() === password) {
          return { success: true, message: 'Login successful!', playerName: data[i][2].toString() };
        } else {
          return { success: false, message: 'Invalid password.' };
        }
      }
    }
    return { success: false, message: 'Email not registered.' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function sendVerificationCode(email) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    const cache = CacheService.getScriptCache();
    cache.put('REG_' + cleanEmail, code, 600); // Code valid for 10 minutes

    MailApp.sendEmail({
      to: cleanEmail,
      subject: '巔峰對決 - Registration Verification Code',
      body: `Your verification code is: ${code}`
    });

    return { success: true, message: 'Verification code sent to Gmail.' };
  } catch (err) {
    return { success: false, message: 'Failed to send email: ' + err.toString() };
  }
}

function completeRegistration(email, password, playerName, code) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const cache = CacheService.getScriptCache();
    const cachedCode = cache.get('REG_' + cleanEmail);

    if (!cachedCode || cachedCode !== code.trim()) {
      return { success: false, message: 'Invalid or expired verification code.' };
    }

    const sheet = getSheet('Accounts');
    sheet.appendRow([cleanEmail, password, playerName.trim(), new Date()]);
    cache.remove('REG_' + cleanEmail);

    return { success: true, message: 'Account created! Please sign in.' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function sendResetCode(email) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    const cache = CacheService.getScriptCache();
    cache.put('RESET_' + cleanEmail, code, 600);

    MailApp.sendEmail({
      to: cleanEmail,
      subject: '巔峰對決 - Password Reset Code',
      body: `Your password reset code is: ${code}`
    });

    return { success: true, message: 'Reset code sent to Gmail.' };
  } catch (err) {
    return { success: false, message: 'Failed to send email: ' + err.toString() };
  }
}

function resetPassword(email, code, newPassword) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const cache = CacheService.getScriptCache();
    const cachedCode = cache.get('RESET_' + cleanEmail);

    if (!cachedCode || cachedCode !== code.trim()) {
      return { success: false, message: 'Invalid or expired reset code.' };
    }

    const sheet = getSheet('Accounts');
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === cleanEmail) {
        sheet.getRange(i + 1, 2).setValue(newPassword);
        cache.remove('RESET_' + cleanEmail);
        return { success: true, message: 'Password updated! Please sign in.' };
      }
    }
    return { success: false, message: 'Account not found.' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}
