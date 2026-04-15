const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('node:path');
const image = nativeImage.createFromPath('icon/icon.png')


// Import the markdown parser 
// Ensure your markdown-parser.js ends with: module.exports = { markdown };
const { markdown } = require(path.join(__dirname, 'markdown-parser.js'));

const createWindow = () => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    icon: path.join(__dirname, 'icon/icon.png'), // Only Win and Linux
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
};

// --- IPC Handlers ---

/**
 * Fetches available models from LM Studio
 */
// main.js
ipcMain.handle('getModels', async () => {
  try {
    const response = await fetch('http://127.0.0.1:1234/api/v1/models');

    if (!response.ok) {
      // Handles 404, 500, etc.
      throw new Error(`LM Studio API Error (Status: ${response.status})`);
    }

    const data = await response.json();

    if (!data.models || data.models.length === 0) {
      throw new Error("No models are currently loaded in LM Studio.");
    }

    // Filter first to keep only "llm" types, then map to get the keys
    return data.models
      .filter(m => m.type === 'llm')
      .map(m => m.key);

  } catch (error) {
    console.error("Failed to fetch models:", error);

    // Differentiate between "Server Down" and other errors
    if (error.cause && error.cause.code === 'ECONNREFUSED') {
      throw new Error("LM Studio server is not running. Please start the server on port 1234.");
    }

    // Pass the specific error message back to the renderer
    throw new Error(error.message || "An unexpected error occurred while fetching models.");
  }
});

/**
 * Handles the AI Chat Stream
 */
ipcMain.handle('sendChat', async (event, args) => {
  const { input, model, isStreaming } = args;
  const webContents = event.sender;

  try {
    const response = await fetch('http://127.0.0.1:1234/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model, // LLM model
        input: input, // input given my user
        stream: isStreaming // streaming?
      })
    });

    if (!response.ok) {
      let errorMessage = "LM Studio server unreachable.";

      try {
        const errorData = await response.json();
        // Use the error message provided by the API if it exists
        errorMessage = errorData.error || `Server Error (${response.status})`;
      } catch (parseError) {
        // Fallback if the response isn't JSON
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(errorMessage.message);
    }

    if (isStreaming) {
      // Streaming
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.replace('data: ', '');
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);

            // Delta content
            if (parsed.type === 'message.delta' && parsed.content) {
              fullContent += parsed.content;
              const sanitized = fullContent.replace(/\n{3,}/g, '\n\n');
              webContents.send('chat-reply', markdown(sanitized));
            }

            // The end, send stats
            if (parsed.type === 'chat.end') {
              const tps = parsed.result.stats.tokens_per_second;
              if (tps) webContents.send('chat-stats', tps.toFixed(2));
            }
          } catch (error) { 
            error: error.message 
          }
        }
      }
    } else {
      // Bulk, ie not streamed
      const data = await response.json();

      // LM Studio 
      if (data.output && data.output[0].content) {
        const fullContent = data.output[0].content;
        webContents.send('chat-reply', markdown(fullContent));

        // Handle stats if available in the final object
        if (data.stats && data.stats.tokens_per_second) {
          // Send stats
          const tps = data.stats.tokens_per_second;
          if (tps) webContents.send('chat-stats', tps.toFixed(2));
        }
      }
    }

    return { status: "success" };

  } catch (error) {
    console.error("IPC sendChat Error:", error);
    webContents.send('chat-reply', `<span style="color: red;">Error: ${error.message}</span>`);
    return { error: error.message };
  }
});

// App Lifecycle

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.dock.setIcon(image); // Only for Mac