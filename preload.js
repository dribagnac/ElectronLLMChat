const { contextBridge, ipcRenderer } = require('electron')

/**
 * The Context Bridge securely exposes specific Electron APIs to the 
 * renderer process without exposing the entire 'ipcRenderer' module.
 */
contextBridge.exposeInMainWorld('electronAPI', {

  /**
   * Sends user input and the selected model to the Main process.
   * returns a Promise that resolves when the request is sent.
   */
  sendChat: (input, model, isStreaming) => {
    // Basic validation before sending to Main process
    if (typeof input !== 'string') return Promise.reject("Input must be a string");
    
    return ipcRenderer.invoke('sendChat', { input, model, isStreaming });
  },

  /**
   * Requests the list of available AI models from the local server via the Main process.
   */
  getModels: () => ipcRenderer.invoke('getModels'),

  /**
   * Sets up a listener for streaming text updates (tokens) from the AI.
   * The callback function is triggered every time a new 'chat-reply' event is received.
   */
  onChatUpdate: (callback) => ipcRenderer.on('chat-reply', (event, value) => callback(value)),
  
  /**
   * Sets up a listener for performance statistics (like tokens per second).
   * Usually triggered by the 'chat.end' event logic in the Main process.
   */
  onStatsUpdate: (callback) => ipcRenderer.on('chat-stats', (event, value) => callback(value))
})