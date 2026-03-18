const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  const startUrl = isDev
    ? 'http://localhost:5174'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  win.loadURL(startUrl);

  // if (isDev) {
  //   win.webContents.openDevTools();
  // }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('dialog:openFile', async () => {
  const { dialog } = require('electron');
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PDFs', extensions: ['pdf'] }]
  });
  return filePaths[0]; // Return the first selected file path
});

ipcMain.handle('exportPDF', async (event, title) => {
  const { dialog } = require('electron');
  const fs = require('fs');
  const win = BrowserWindow.fromWebContents(event.sender);

  const { filePath } = await dialog.showSaveDialog(win, {
    title: 'Save PDF Report',
    defaultPath: title,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (!filePath) return false;

  try {
    const pdfData = await win.webContents.printToPDF({
      landscape: true,
      printBackground: true,
      margins: { marginType: 'printableArea' }
    });
    fs.writeFileSync(filePath, pdfData);
    return true;
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    return false;
  }
});


