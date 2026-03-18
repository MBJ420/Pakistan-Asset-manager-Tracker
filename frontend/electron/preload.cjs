const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    send: (channel, data) => {
        // whitelist channels
        let validChannels = ['toMain'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    receive: (channel, func) => {
        let validChannels = ['fromMain'];
        if (validChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender` 
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },
    openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (filePath, bank, username) => ipcRenderer.invoke('file:save', { filePath, bank, username }),
    exportPDF: (title) => ipcRenderer.invoke('exportPDF', title)
});
