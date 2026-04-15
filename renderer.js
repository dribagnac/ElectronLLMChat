/**
 * Electron Chat Controller - Renderer Process
 */

const SELECT_MODEL = document.getElementById("selectModel");
const STATS_BAR = document.getElementById('stats');
const CHAT_INPUT = document.getElementById('myInput');
const RESULT_DISPLAY = document.getElementById('myResult');
const SEND_BUTTON = document.getElementById('btn');
const STREAM_TOGGLE = document.getElementById('streamToggle');
const RETRY_BUTTON = document.getElementById('retryBtn');

/**
 * Listen for streaming updates from the Main process
 */
window.electronAPI.onChatUpdate((content) => {
  // Update the display with the latest parsed markdown
// Trim trailing newlines that often appear while the AI is "typing"
  RESULT_DISPLAY.innerHTML = content.trim();
  // Auto-scroll as the message grows
  RESULT_DISPLAY.scrollTop = RESULT_DISPLAY.scrollHeight;
});

/**
 * Sends chat to the Electron Main process
 */
const sendChat = async () => {
  const selectedModel = SELECT_MODEL.value;
  const userText = CHAT_INPUT.value.trim();
  const isStreaming = STREAM_TOGGLE.checked; // Capture toggle state

  if (!userText) {
    RESULT_DISPLAY.innerText = "Please enter a message.";
    return;
  }

  // Reset UI State
  STATS_BAR.textContent = "";
  RESULT_DISPLAY.innerHTML = "<em>AI is thinking...</em>";
  SEND_BUTTON.disabled = true;
  RETRY_BUTTON.disabled = true;

  if (isStreaming) STATS_BAR.innerHTML = "Calculating...";

  try {
    // This triggers the stream logic in main.js
    await window.electronAPI.sendChat(userText, selectedModel, isStreaming);
  } catch (error) {
    console.error("Communication Error:", error.message);
    RESULT_DISPLAY.innerHTML = `<span style="color: red;">Error: ${error.message}</span>`;
    RETRY_BUTTON.disabled = false;
  } finally {
    SEND_BUTTON.disabled = false;
  }
};

/**
 * Fetches and populates available models
 */
// renderer.js
const getModels = async () => {
  RESULT_DISPLAY.innerHTML = "Loading models...";
  SEND_BUTTON.disabled = true; // Disable interaction during load

  try {
    const options = await window.electronAPI.getModels();
    SELECT_MODEL.innerHTML = ""; 

    options.forEach(modelName => {
      const el = document.createElement("option");
      el.textContent = modelName;
      el.value = modelName;

      // Default model
      if (el.value.includes("lfm")) {
        el.selected = true
      }

      SELECT_MODEL.appendChild(el);
    });

    RESULT_DISPLAY.innerHTML = "System Ready.";
    SEND_BUTTON.disabled = false;
  } catch (error) {
    // The 'error.message' here is what we threw in main.js
    console.error("Model Load Error:", error);
    SEND_BUTTON.disabled = true;
    
    RESULT_DISPLAY.innerHTML = `
      <div style="color: #d9534f; font-weight: bold;">
        ⚠️ Failed to Load Models
      </div>
      <div style="font-size: 0.8rem; margin-top: 5px;">
        ${error.message}
      </div>
    `;
    
    // Optional: Add a "Retry" button to the UI
    SELECT_MODEL.innerHTML = `<option value="">Error: Check Connection</option>`;
  }
};

// --- Event Listeners ---
SEND_BUTTON.addEventListener('click', sendChat);

CHAT_INPUT.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !SEND_BUTTON.disabled) {
    sendChat();
  }
});

// 2. Set up the listener
window.electronAPI.onStatsUpdate((tps) => {
  STATS_BAR.innerHTML = `<strong>Speed:</strong> ${tps} tokens/sec`;
});

// Initialize app
getModels();

RETRY_BUTTON.addEventListener('click', getModels);