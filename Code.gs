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

function getGameContent(playerName, mode) {
  const templateName = (mode === 'Online') ? 'OnlineGame' : 'ClassicGame';
  const template = HtmlService.createTemplateFromFile(templateName);
  template.playerName = playerName;
  template.mode = mode;
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
    }
  }
  return sheet;
}

function isValidGmail(email) {
  const gmailRegex = /^[a-zA-Z0-9._%+-]+@(gmail\.com|googlemail\.com)$/i;
  return gmailRegex.test(email.trim());
}

// Check if current Google session account exists in database
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
          <p style="color: #8b94a0; font-size: 0.85rem;">Enter this code along with your new password to complete the reset.</p>
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
