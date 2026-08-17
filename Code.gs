const SPREADSHEET_ID = '13Cq3iTSu0ijhUt-H_GxrBcTYEvBiCUFTTW1ihQa9uXI';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('巔峰對決 | Arena Terminal')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getGameContent(playerName, view) {
  // 'view' determines which template to open, not the in-game mode
  const templateName = (view === 'Online') ? 'OnlineGame' : 'ClassicGame';
  const template = HtmlService.createTemplateFromFile(templateName);
  template.playerName = playerName;
  return template.evaluate().getContent();
}

function getSheet(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (sheetName === 'Users') {
      sheet.appendRow(['Timestamp', 'Gmail', 'Password', 'PlayerName']);
    } else if (sheetName === 'Verifications') {
      sheet.appendRow(['Timestamp', 'Gmail', 'Code']);
    } else if (sheetName === 'Online players') {
      sheet.appendRow(['Player', 'Mode', 'Status', 'P1/P2?', 'Room ID']);
    }
  }
  return sheet;
}

function isValidGmail(email) {
  const gmailRegex = /^[a-zA-Z0-9._%+-]+@(gmail\.com|googlemail\.com|ccsc\.edu\.hk)$/i;
  return gmailRegex.test(email.trim());
}

// ----------------------------------------------------
// AUTHENTICATION & ACCOUNT SYSTEM
// ----------------------------------------------------

function checkActiveGoogleAccount() {
  try {
    const activeEmail = Session.getActiveUser().getEmail();
    if (!activeEmail) return { exists: false, email: '' };

    const usersSheet = getSheet('Users');
    const data = usersSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][1].toString().toLowerCase() === activeEmail.toLowerCase()) {
        const playerName = data[i][3] ? data[i][3].toString() : activeEmail.split('@')[0];
        return { exists: true, email: activeEmail, playerName: playerName };
      }
    }
    return { exists: false, email: activeEmail };
  } catch (err) {
    return { exists: false, email: '' };
  }
}

function sendVerificationCode(email) {
  try {
    if (!isValidGmail(email)) {
      return { success: false, message: 'Must be a valid @gmail.com address.' };
    }
    
    const cleanEmail = email.trim().toLowerCase();
    const usersSheet = getSheet('Users');
    const userData = usersSheet.getDataRange().getValues();
    
    for (let i = 1; i < userData.length; i++) {
      if (userData[i][1].toString().toLowerCase() === cleanEmail) {
        return { success: false, message: 'This Gmail address is already registered!' };
      }
    }
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const verifySheet = getSheet('Verifications');
    verifySheet.appendRow([new Date(), cleanEmail, code]);
    
    MailApp.sendEmail({
      to: cleanEmail,
      subject: '巔峰對決 - Account Verification Code',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; padding: 24px; background: #0a0c10; color: #fff; border-radius: 12px; border: 1px solid #232938;">
          <h2 style="color: #00f0ff; margin-top: 0;">巔峰對決 Verification Code</h2>
          <p style="color: #8b94a0;">Your security code for account verification is:</p>
          <h1 style="color: #ffd700; letter-spacing: 6px; font-size: 36px; margin: 15px 0;">${code}</h1>
        </div>
      `
    });
    
    return { success: true, message: 'Code sent to ' + cleanEmail + '!' };
  } catch (err) {
    return { success: false, message: 'Error: ' + err.toString() };
  }
}

function completeRegistration(email, password, playerName, code) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const verifySheet = getSheet('Verifications');
    const vData = verifySheet.getDataRange().getValues();
    
    let isCodeValid = false;
    for (let i = vData.length - 1; i >= 1; i--) {
      if (vData[i][1].toString().toLowerCase() === cleanEmail && vData[i][2].toString() === code.trim()) {
        isCodeValid = true;
        break;
      }
    }
    
    if (!isCodeValid) {
      return { success: false, message: 'Invalid or expired verification code!' };
    }
    
    const usersSheet = getSheet('Users');
    usersSheet.appendRow([new Date(), cleanEmail, password, playerName.trim()]);
    
    return { success: true, message: 'Account created! Please log in.' };
  } catch (err) {
    return { success: false, message: 'Error: ' + err.toString() };
  }
}

function sendResetCode(email) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidGmail(cleanEmail)) {
      return { success: false, message: 'Must be a valid @gmail.com address.' };
    }
    
    const usersSheet = getSheet('Users');
    const data = usersSheet.getDataRange().getValues();
    let exists = false;

    for (let i = 1; i < data.length; i++) {
      if (data[i][1].toString().toLowerCase() === cleanEmail) {
        exists = true;
        break;
      }
    }

    if (!exists) {
      return { success: false, message: 'No account found registered under this Gmail address.' };
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const verifySheet = getSheet('Verifications');
    verifySheet.appendRow([new Date(), cleanEmail, code]);

    MailApp.sendEmail({
      to: cleanEmail,
      subject: '巔峰對決 - Password Reset Verification Code',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; padding: 24px; background: #0a0c10; color: #fff; border-radius: 12px; border: 1px solid #232938;">
          <h2 style="color: #ff2a5f; margin-top: 0;">巔峰對決 Password Reset</h2>
          <p style="color: #8b94a0;">Your reset security code is:</p>
          <h1 style="color: #ffd700; letter-spacing: 6px; font-size: 36px; margin: 15px 0;">${code}</h1>
        </div>
      `
    });

    return { success: true, message: 'Reset code sent to ' + cleanEmail + '!' };
  } catch (err) {
    return { success: false, message: 'Error: ' + err.toString() };
  }
}

function resetPassword(email, code, newPassword) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const verifySheet = getSheet('Verifications');
    const vData = verifySheet.getDataRange().getValues();

    let isCodeValid = false;
    for (let i = vData.length - 1; i >= 1; i--) {
      if (vData[i][1].toString().toLowerCase() === cleanEmail && vData[i][2].toString() === code.trim()) {
        isCodeValid = true;
        break;
      }
    }

    if (!isCodeValid) {
      return { success: false, message: 'Invalid or expired reset code!' };
    }

    const usersSheet = getSheet('Users');
    const data = usersSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][1].toString().toLowerCase() === cleanEmail) {
        usersSheet.getRange(i + 1, 3).setValue(newPassword.trim());
        return { success: true, message: 'Password reset successful! You can now sign in.' };
      }
    }
    return { success: false, message: 'Account not found.' };
  } catch (err) {
    return { success: false, message: 'Error: ' + err.toString() };
  }
}

function signIn(email, password) {
  try {
    if (!isValidGmail(email)) {
      return { success: false, message: 'Must be a valid @gmail.com address.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    const usersSheet = getSheet('Users');
    const data = usersSheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1].toString().toLowerCase() === cleanEmail && data[i][2].toString() === password) {
        const nameOnSheet = data[i][3] ? data[i][3].toString() : cleanEmail.split('@')[0];
        return { success: true, message: 'Authenticated!', playerName: nameOnSheet };
      }
    }
    return { success: false, message: 'Incorrect email or password.' };
  } catch (err) {
    return { success: false, message: 'Error: ' + err.toString() };
  }
}

// ----------------------------------------------------
// PEERJS MATCHMAKING & SIGNALING SYSTEM
// ----------------------------------------------------

/**
 * Set Player Status ('choosing', 'waiting', 'wentOffLine')
 */
function setPlayerStatus(player, newStatus, gameMode, peerId) {
  try {
    const sheet = getSheet('Online players');
    const data = sheet.getDataRange().getValues();
    const cleanPlayer = player.trim();
    let activeMode = (gameMode || 'Standard').trim();

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString().toLowerCase() === cleanPlayer.toLowerCase()) {
        rowIndex = i + 1;
        break;
      }
    }

    // 1. STATUS: CHOOSING / CHANGING MODE
    // Clears Role (Col 4) and Room ID (Col 5). Does NOT generate any Room ID.
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

    // 2. STATUS: WAITING
    // Room ID and P1/P2 roles are ONLY assigned when player enters waiting state.
    if (newStatus === 'waiting') {
      const currentData = sheet.getDataRange().getValues();
      let waitingP1RoomId = '';

      // Find an available P1 in the same mode who is 'waiting'
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

    // 3. STATUS: OFFLINE
    if (newStatus === 'wentOffLine') {
      if (rowIndex !== -1) {
        sheet.deleteRow(rowIndex);
      }
      return { success: true, status: 'offline' };
    }

    return { success: false, message: 'Invalid status parameter.' };
  } catch (err) {
    return { success: false, message: 'Error: ' + err.toString() };
  }
}

/**
 * Check Room Status (Ignores players who are still in 'choosing' state)
 */
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

    // Both players must be present AND in 'waiting' status
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
        return { success: true, message: 'Successfully left room.' };
      }
    }
    return { success: false, message: 'Player not found.' };
  } catch (err) {
    return { success: false, message: 'Error: ' + err.toString() };
  }
}

function getOnlineLobby() {
  try {
    const sheet = getSheet('Online players');
    const data = sheet.getDataRange().getValues();
    const players = [];

    for (let i = 1; i < data.length; i++) {
      players.push({
        player: data[i][0].toString(),
        mode: data[i][1].toString(),
        status: data[i][2].toString(),
        role: data[i][3].toString(),
        roomId: data[i][4].toString()
      });
    }

    return { success: true, players: players };
  } catch (err) {
    return { success: false, message: 'Error: ' + err.toString() };
  }
}
