// @ts-nocheck
/* Ported verbatim from the original Boardroom vanilla JS app; see src/boardroom/AGENTS.md. */
import { navigateTo, replaceUrlSilently } from '../../nav';
/**
 * Settings View Module
 * Route: #/settings
 *
 * Persists provider selection (mock default, openai, anthropic, gemini), API credentials,
 * Base URL, model, temperature, max tokens, test connection ping, security notice,
 * and danger zone database tools.
 */

import { getSetting, setSetting, resetAllData, dbSelfTest } from '../db';
import { testConnection, MockProvider, OpenAIProvider, AnthropicProvider, GeminiProvider } from '../llm';
import { DEFAULT_AGENTS } from '../agents';

// Tracks the active document-level Escape listener so re-renders don't leak listeners.
let escapeKeyHandler = null;

export async function render(container, params = {}) {
  // Update Topbar action slot
  const actionSlot = document.getElementById('topbar-action-slot');
  if (actionSlot) {
    actionSlot.innerHTML = `
      <button id="save-settings-topbar-btn" class="btn btn-primary text-xs py-1.5 px-3">
        <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        Save Settings
      </button>
    `;
  }

  // Load persisted settings (mock default).
  // Prefer the active provider's own slot (what llm.js getProvider() actually uses),
  // then fall back to the generic slot for legacy installs.
  const provider = await getSetting('llm_provider_type', 'mock');
  const apiKey = (await getSetting(`${provider}_api_key`, '')) || (await getSetting('llm_api_key', ''));
  const baseUrl = (await getSetting(`${provider}_base_url`, '')) || (await getSetting('llm_base_url', ''));
  const model = (await getSetting(`${provider}_model`, '')) || (await getSetting('llm_model', ''));
  const temperature = parseFloat(await getSetting('llm_temperature', '0.7'));
  const maxTokens = parseInt(await getSetting('llm_max_tokens', '2048'), 10);

  // Default placeholders per provider
  const defaultsByProvider = {
    mock: { url: 'Local In-Memory (No Network)', model: 'Deterministic Persona Generator' },
    openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o' },
    anthropic: { url: 'https://api.anthropic.com', model: 'claude-3-7-sonnet-20250219' },
    gemini: { url: 'https://generativelanguage.googleapis.com', model: 'gemini-3.8-flash' },
  };

  const currentDefaults = defaultsByProvider[provider] || defaultsByProvider.mock;

  container.innerHTML = `
    <div class="space-y-8 animate-fadeIn max-w-4xl mx-auto">
      <!-- Settings Header -->
      <div class="panel p-6 border-subtle">
        <div class="inline-flex items-center gap-2 chip text-xs bg-brass/10 text-brass-light border-brass/30 mb-2">
          <span class="w-1.5 h-1.5 rounded-full bg-brass-light"></span>
          Inference Engine & Security
        </div>
        <h1 class="font-serif text-3xl sm:text-4xl text-slate-100">
          Executive Settings
        </h1>
        <p class="text-xs sm:text-sm text-muted mt-1 leading-relaxed">
          Configure active LLM inference providers, API credentials, inference temperature, and local IndexedDB storage options.
        </p>
      </div>

      <!-- Prominent Security Notice Banner -->
      <div class="p-4 rounded-xl border border-brass/40 bg-brass/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex items-start gap-3.5">
          <div class="p-2 rounded-lg bg-brass/10 text-brass-light shrink-0 mt-0.5">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div class="min-w-0">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-brass-light mb-1">
              Security Notice
            </h2>
            <p class="text-xs text-slate-300 leading-relaxed">
              Keys are stored in this browser's IndexedDB in plaintext and sent directly from the browser; this is a local/demo tool — use a scoped key and rotate it.
            </p>
          </div>
        </div>
        <button id="forget-key-btn" type="button" class="btn btn-ghost text-xs border border-brass/30 text-brass-light hover:bg-brass/10 shrink-0 self-start sm:self-center" title="Wipe stored API key from IndexedDB">
          Forget Key
        </button>
      </div>

      <!-- Provider & Hyperparameters Form -->
      <form id="settings-form" class="space-y-6">
        <div class="panel p-6 border-subtle space-y-6">
          <div class="flex items-center justify-between pb-4 border-b border-subtle flex-wrap gap-2">
            <div>
              <h2 class="font-serif text-2xl text-slate-100">Inference Provider</h2>
              <p class="text-xs text-muted">Select active engine used across all board deliberations</p>
            </div>
            <span class="chip text-xs bg-base border-subtle text-muted" id="active-provider-chip">
              Selected: ${provider.toUpperCase()}
            </span>
          </div>

          <!-- Provider Select Dropdown & Info -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="provider-select" class="block text-xs font-medium text-slate-300 mb-1.5">
                Active Provider
              </label>
              <select id="provider-select" class="input text-xs font-medium bg-base">
                <option value="mock" ${provider === 'mock' ? 'selected' : ''}>Mock (Offline Demo — No Network/Keys)</option>
                <option value="openai" ${provider === 'openai' ? 'selected' : ''}>OpenAI-Compatible (/chat/completions)</option>
                <option value="anthropic" ${provider === 'anthropic' ? 'selected' : ''}>Anthropic Claude (/v1/messages)</option>
                <option value="gemini" ${provider === 'gemini' ? 'selected' : ''}>Google Gemini (streamGenerateContent)</option>
              </select>
              <span id="provider-hint" class="text-[11px] text-faint mt-1 block leading-relaxed">
                ${provider === 'mock' 
                  ? 'Runs 100% offline with deterministic, persona-aware replies echoing your venture and last message.' 
                  : 'Connects directly to the specified model endpoint via browser fetch and SSE streaming.'}
              </span>
            </div>

            <!-- API Key Input with Masking Toggle -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label for="api-key-input" class="block text-xs font-medium text-slate-300">
                  API Key
                </label>
                <button type="button" id="toggle-key-visibility-btn" class="text-[11px] text-brass-light hover:underline font-medium">
                  Show
                </button>
              </div>
              <div class="relative">
                <input 
                  type="password" 
                  id="api-key-input" 
                  class="input font-mono text-xs pr-20" 
                  value="${apiKey}" 
                  placeholder="${provider === 'mock' ? 'No key required for Mock provider' : 'Paste API key here...'}" 
                  ${provider === 'mock' ? 'disabled' : ''} 
                />
              </div>
              <span id="key-hint" class="text-[11px] text-faint mt-1 block">
                ${provider === 'mock' ? 'Mock engine does not require an API key.' : 'Stored strictly in local client IndexedDB.'}
              </span>
            </div>
          </div>

          <!-- Base URL & Model Parameters -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label for="base-url-input" class="block text-xs font-medium text-slate-300 mb-1.5">
                Base URL
              </label>
              <input 
                type="text" 
                id="base-url-input" 
                class="input font-mono text-xs" 
                value="${baseUrl}" 
                placeholder="${currentDefaults.url}" 
                ${provider === 'mock' ? 'disabled' : ''} 
              />
              <span id="base-url-hint" class="text-[11px] text-faint mt-1 block">
                Default: ${currentDefaults.url}
              </span>
            </div>

            <div>
              <label for="model-input" class="block text-xs font-medium text-slate-300 mb-1.5">
                Model Identifier
              </label>
              <input 
                type="text" 
                id="model-input" 
                class="input font-mono text-xs" 
                value="${model}" 
                placeholder="${currentDefaults.model}" 
                ${provider === 'mock' ? 'disabled' : ''} 
              />
              <span id="model-hint" class="text-[11px] text-faint mt-1 block">
                Default: ${currentDefaults.model}
              </span>
            </div>
          </div>

          <!-- Temperature & Max Tokens -->
          <div class="pt-4 border-t border-subtle grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div class="flex items-center justify-between mb-2">
                <label for="temperature-slider" class="text-xs font-medium text-slate-300">
                  Temperature
                </label>
                <span id="temp-display" class="font-mono text-xs text-brass-light font-bold">
                  ${temperature.toFixed(2)}
                </span>
              </div>
              <input 
                type="range" 
                id="temperature-slider" 
                min="0.0" 
                max="1.0" 
                step="0.05" 
                value="${temperature}" 
                class="w-full accent-brass cursor-pointer" 
              />
              <div class="flex justify-between text-[10px] text-faint mt-1">
                <span>0.0 (Strict / Analytic)</span>
                <span>0.7 (Balanced)</span>
                <span>1.0 (Creative)</span>
              </div>
            </div>

            <div>
              <label for="max-tokens-input" class="block text-xs font-medium text-slate-300 mb-1.5">
                Max Completion Tokens
              </label>
              <input 
                type="number" 
                id="max-tokens-input" 
                class="input font-mono text-xs" 
                value="${maxTokens}" 
                min="256" 
                max="8192" 
                step="256" 
              />
              <span class="text-[11px] text-faint mt-1 block">
                Tokens allocated per director turn (default: 2048).
              </span>
            </div>
          </div>

          <!-- Action Bar: Test Connection & Save -->
          <div class="pt-4 border-t border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-3 flex-wrap">
              <button type="button" id="test-connection-btn" class="btn btn-ghost border border-subtle text-xs">
                <svg class="w-3.5 h-3.5 mr-1 text-brass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Test Connection
              </button>
              <span id="connection-status-pill" class="text-xs text-muted"></span>
            </div>

            <button type="submit" class="btn btn-primary text-xs py-2 px-5">
              Save Settings
            </button>
          </div>
        </div>
      </form>

      <!-- Danger Zone & Database Self-Test -->
      <div class="panel p-6 border-danger/30 bg-danger/[0.02] space-y-5">
        <div class="flex items-center gap-2 text-danger">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <h2 class="font-serif text-xl text-slate-100">Database Tools & Danger Zone</h2>
        </div>

        <p class="text-xs text-muted leading-relaxed">
          Execute storage self-test diagnostics or purge all cached venture state, transcripts, and credentials from IndexedDB.
        </p>

        <div class="flex flex-wrap items-center gap-3 pt-1">
          <!-- DB Self Test Button -->
          <button type="button" id="db-selftest-btn" class="btn btn-ghost text-xs border border-subtle">
            <svg class="w-3.5 h-3.5 mr-1 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run DB Self-Test
          </button>

          <!-- Delete All Data Button (Double Confirmation) -->
          <button type="button" id="delete-all-data-btn" class="btn btn-ghost text-xs border border-danger/40 text-danger hover:bg-danger/10 hover:border-danger">
            Delete All Data
          </button>
        </div>

        <!-- Diagnostic Log Output Container -->
        <div id="diagnostic-log" class="hidden p-3 rounded-lg bg-base border border-subtle font-mono text-xs text-slate-300"></div>
      </div>
    </div>

    <!-- Forget Key Modal -->
    <div id="forget-key-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
      <div class="panel max-w-md w-full border-brass/40 p-6 space-y-4" onclick="event.stopPropagation()">
        <h3 class="font-serif text-xl text-slate-100">Forget Stored API Keys</h3>
        <p class="text-xs text-muted leading-relaxed">
          Are you sure you want to erase all stored API keys for OpenAI, Anthropic, and Gemini from this browser's IndexedDB storage?
        </p>
        <div class="flex justify-end gap-2 pt-2">
          <button id="cancel-forget-key-btn" class="btn btn-ghost text-xs border border-subtle">Cancel</button>
          <button id="confirm-forget-key-btn" class="btn btn-ghost border border-brass/40 text-brass-light hover:bg-brass/10 text-xs">
            Erase Keys
          </button>
        </div>
      </div>
    </div>

    <!-- Delete All Data Modal -->
    <div id="delete-all-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
      <div class="panel max-w-md w-full border-danger/40 p-6 space-y-4" onclick="event.stopPropagation()">
        <div class="flex items-center gap-2 text-danger font-semibold text-sm">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete All Portfolio Data
        </div>
        <p class="text-xs text-muted leading-relaxed">
          WARNING: This will permanently delete all ventures, session transcripts, deliverable memos, and settings.
        </p>
        <div>
          <label for="delete-confirm-input" class="block text-[11px] font-mono text-slate-300 mb-1">
            Type <span class="text-danger font-bold">DELETE</span> to confirm:
          </label>
          <input type="text" id="delete-confirm-input" class="input font-mono text-xs" placeholder="DELETE" />
          <div id="delete-error-msg" class="text-[11px] text-danger font-mono mt-1 hidden">Input does not match "DELETE".</div>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button id="cancel-delete-all-btn" class="btn btn-ghost text-xs border border-subtle">Cancel</button>
          <button id="confirm-delete-all-btn" class="btn btn-ghost border border-danger/40 text-danger hover:bg-danger/10 hover:border-danger text-xs">
            Permanently Erase Everything
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach all interactive event listeners
  wireSettingsEvents(container, defaultsByProvider);
}

/**
 * Attach form event handlers
 */
function wireSettingsEvents(container, defaultsByProvider) {
  const form = document.getElementById('settings-form');
  const topbarSaveBtn = document.getElementById('save-settings-topbar-btn');
  const providerSelect = document.getElementById('provider-select');
  const apiKeyInput = document.getElementById('api-key-input');
  const toggleKeyBtn = document.getElementById('toggle-key-visibility-btn');
  const baseUrlInput = document.getElementById('base-url-input');
  const modelInput = document.getElementById('model-input');
  const tempSlider = document.getElementById('temperature-slider');
  const tempDisplay = document.getElementById('temp-display');
  const activeChip = document.getElementById('active-provider-chip');
  const providerHint = document.getElementById('provider-hint');
  const keyHint = document.getElementById('key-hint');
  const baseUrlHint = document.getElementById('base-url-hint');
  const modelHint = document.getElementById('model-hint');

  // Temperature slider listener
  if (tempSlider && tempDisplay) {
    tempSlider.addEventListener('input', (e) => {
      tempDisplay.textContent = parseFloat(e.target.value).toFixed(2);
    });
  }

  // Provider dropdown change
  if (providerSelect) {
    providerSelect.addEventListener('change', async (e) => {
      const p = e.target.value;
      const defs = defaultsByProvider[p] || defaultsByProvider.mock;

      if (activeChip) activeChip.textContent = `Selected: ${p.toUpperCase()}`;

      if (p === 'mock') {
        apiKeyInput.disabled = true;
        baseUrlInput.disabled = true;
        modelInput.disabled = true;
        apiKeyInput.placeholder = 'No key required for Mock provider';
        if (providerHint) providerHint.textContent = 'Runs 100% offline with deterministic, persona-aware replies echoing your venture and last message.';
        if (keyHint) keyHint.textContent = 'Mock engine does not require an API key.';
      } else {
        apiKeyInput.disabled = false;
        baseUrlInput.disabled = false;
        modelInput.disabled = false;
        apiKeyInput.placeholder = 'Paste API key here...';
        if (providerHint) providerHint.textContent = `Connects directly to ${p} via browser fetch and SSE streaming.`;
        if (keyHint) keyHint.textContent = 'Stored strictly in local client IndexedDB.';
      }

      // Repopulate fields from the selected provider's own slot so keys/URLs/models
      // round-trip per provider instead of leaking across providers.
      const storedKey = await getSetting(`${p}_api_key`, '');
      const storedBase = await getSetting(`${p}_base_url`, '');
      const storedModel = await getSetting(`${p}_model`, '');
      if (apiKeyInput) apiKeyInput.value = p === 'mock' ? '' : storedKey;
      if (baseUrlInput) baseUrlInput.value = storedBase;
      if (modelInput) modelInput.value = storedModel;

      if (baseUrlInput) baseUrlInput.placeholder = defs.url;
      if (modelInput) modelInput.placeholder = defs.model;
      if (baseUrlHint) baseUrlHint.textContent = `Default: ${defs.url}`;
      if (modelHint) modelHint.textContent = `Default: ${defs.model}`;
    });
  }

  // Toggle API key masking
  if (toggleKeyBtn && apiKeyInput) {
    toggleKeyBtn.addEventListener('click', () => {
      if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleKeyBtn.textContent = 'Hide';
      } else {
        apiKeyInput.type = 'password';
        toggleKeyBtn.textContent = 'Show';
      }
    });
  }

  // Save Settings Routine
  async function saveSettings() {
    const selectedProvider = providerSelect ? providerSelect.value : 'mock';
    const keyVal = apiKeyInput ? apiKeyInput.value.trim() : '';
    const baseUrlVal = baseUrlInput ? baseUrlInput.value.trim() : '';
    const modelVal = modelInput ? modelInput.value.trim() : '';
    const tempVal = tempSlider ? tempSlider.value : '0.7';
    const maxTokensVal = document.getElementById('max-tokens-input')?.value || '2048';

    await setSetting('llm_provider_type', selectedProvider);
    await setSetting('llm_api_key', keyVal);
    await setSetting('llm_base_url', baseUrlVal);
    await setSetting('llm_model', modelVal);
    await setSetting('llm_temperature', tempVal);
    await setSetting('llm_max_tokens', maxTokensVal);

    // Also sync provider-specific slots for seamless backward-compatibility
    if (selectedProvider === 'openai') {
      await setSetting('openai_api_key', keyVal);
      if (baseUrlVal) await setSetting('openai_base_url', baseUrlVal);
      if (modelVal) await setSetting('openai_model', modelVal);
    } else if (selectedProvider === 'anthropic') {
      await setSetting('anthropic_api_key', keyVal);
      if (baseUrlVal) await setSetting('anthropic_base_url', baseUrlVal);
      if (modelVal) await setSetting('anthropic_model', modelVal);
    } else if (selectedProvider === 'gemini') {
      await setSetting('gemini_api_key', keyVal);
      if (baseUrlVal) await setSetting('gemini_base_url', baseUrlVal);
      if (modelVal) await setSetting('gemini_model', modelVal);
    }

    showSaveFeedback();
  }

  function showSaveFeedback() {
    const pill = document.getElementById('connection-status-pill');
    if (pill) {
      pill.innerHTML = `
        <span class="text-success inline-flex items-center gap-1 font-medium animate-fadeIn">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          Settings saved to IndexedDB
        </span>
      `;
      setTimeout(() => {
        pill.innerHTML = '';
      }, 3500);
    }
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveSettings();
    });
  }

  if (topbarSaveBtn) {
    topbarSaveBtn.addEventListener('click', async () => {
      await saveSettings();
    });
  }

  // Forget Key Modal Wiring
  const forgetKeyBtn = document.getElementById('forget-key-btn');
  const forgetModal = document.getElementById('forget-key-modal');
  const cancelForgetBtn = document.getElementById('cancel-forget-key-btn');
  const confirmForgetBtn = document.getElementById('confirm-forget-key-btn');

  if (forgetKeyBtn && forgetModal) {
    forgetKeyBtn.addEventListener('click', () => {
      forgetModal.classList.remove('hidden');
    });

    cancelForgetBtn?.addEventListener('click', () => {
      forgetModal.classList.add('hidden');
    });

    // Close on backdrop click (inner panel stops propagation via onclick)
    forgetModal.addEventListener('click', (e) => {
      if (e.target === forgetModal) forgetModal.classList.add('hidden');
    });

    confirmForgetBtn?.addEventListener('click', async () => {
      forgetModal.classList.add('hidden');
      await setSetting('llm_api_key', '');
      await setSetting('openai_api_key', '');
      await setSetting('anthropic_api_key', '');
      await setSetting('gemini_api_key', '');

      if (apiKeyInput) apiKeyInput.value = '';

      const pill = document.getElementById('connection-status-pill');
      if (pill) {
        pill.innerHTML = `<span class="text-brass-light font-medium">✓ API keys wiped from browser storage.</span>`;
        setTimeout(() => { pill.innerHTML = ''; }, 3000);
      }
    });
  }

  // Test Connection Button (1-token ping)
  const testConnBtn = document.getElementById('test-connection-btn');
  if (testConnBtn) {
    testConnBtn.addEventListener('click', async () => {
      const pill = document.getElementById('connection-status-pill');
      if (pill) {
        pill.innerHTML = `<span class="text-slate-300 animate-pulse">Pinging 1-token test probe...</span>`;
      }
      testConnBtn.disabled = true;

      const selectedProvider = providerSelect ? providerSelect.value : 'mock';
      const keyVal = apiKeyInput ? apiKeyInput.value.trim() : '';
      const baseUrlVal = baseUrlInput ? baseUrlInput.value.trim() : '';
      const modelVal = modelInput ? modelInput.value.trim() : '';

      let providerInstance = null;
      if (selectedProvider === 'mock') {
        providerInstance = new MockProvider();
      } else if (selectedProvider === 'openai') {
        providerInstance = new OpenAIProvider({
          baseURL: baseUrlVal || 'https://api.openai.com/v1',
          apiKey: keyVal,
          model: modelVal || 'gpt-4o'
        });
      } else if (selectedProvider === 'anthropic') {
        providerInstance = new AnthropicProvider({
          baseURL: baseUrlVal || 'https://api.anthropic.com',
          apiKey: keyVal,
          model: modelVal || 'claude-3-7-sonnet-20250219'
        });
      } else if (selectedProvider === 'gemini') {
        providerInstance = new GeminiProvider({
          apiKey: keyVal,
          model: modelVal || 'gemini-3.8-flash'
        });
      }

      const res = await testConnection(providerInstance);
      testConnBtn.disabled = false;

      if (pill) {
        if (res.ok) {
          pill.innerHTML = `<span class="text-success font-medium">✓ ${res.message}</span>`;
        } else {
          pill.innerHTML = `<span class="text-danger font-medium">✗ ${res.message}</span>`;
        }
      }
    });
  }

  // DB Self-Test Button
  const dbTestBtn = document.getElementById('db-selftest-btn');
  const diagnosticLog = document.getElementById('diagnostic-log');
  if (dbTestBtn && diagnosticLog) {
    dbTestBtn.addEventListener('click', async () => {
      diagnosticLog.classList.remove('hidden');
      diagnosticLog.innerHTML = `<span class="text-slate-400 animate-pulse">Executing IndexedDB self-test...</span>`;

      const result = await dbSelfTest();
      if (result.ok) {
        diagnosticLog.innerHTML = `
          <div class="text-success font-semibold mb-1">✓ IndexedDB Self-Test Passed (${result.durationMs}ms)</div>
          <div class="text-slate-400 text-[11px]">${result.details}</div>
        `;
      } else {
        diagnosticLog.innerHTML = `
          <div class="text-danger font-semibold mb-1">✗ Self-Test Failed (${result.durationMs}ms)</div>
          <div class="text-danger text-[11px]">${result.error}</div>
        `;
      }
    });
  }

  // Danger Zone: Delete All Data Modal Wiring (Double Confirmation without browser dialogs)
  const deleteAllBtn = document.getElementById('delete-all-data-btn');
  const deleteModal = document.getElementById('delete-all-modal');
  const cancelDeleteBtn = document.getElementById('cancel-delete-all-btn');
  const confirmDeleteBtn = document.getElementById('confirm-delete-all-btn');
  const deleteInput = document.getElementById('delete-confirm-input');
  const deleteErrorMsg = document.getElementById('delete-error-msg');

  if (deleteAllBtn && deleteModal) {
    deleteAllBtn.addEventListener('click', () => {
      if (deleteInput) deleteInput.value = '';
      if (deleteErrorMsg) deleteErrorMsg.classList.add('hidden');
      deleteModal.classList.remove('hidden');
      deleteInput?.focus();
    });

    cancelDeleteBtn?.addEventListener('click', () => {
      deleteModal.classList.add('hidden');
    });

    // Close on backdrop click (inner panel stops propagation via onclick)
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) deleteModal.classList.add('hidden');
    });

    confirmDeleteBtn?.addEventListener('click', async () => {
      const confirmVal = deleteInput?.value.trim();
      if (confirmVal === 'DELETE') {
        deleteModal.classList.add('hidden');
        await resetAllData(DEFAULT_AGENTS);
        window.dispatchEvent(new CustomEvent('boardroom:sync'));
        navigateTo('/');
      } else {
        if (deleteErrorMsg) deleteErrorMsg.classList.remove('hidden');
      }
    });
  }

  // Escape closes whichever settings modal is open (single shared listener, rebind-safe)
  if (escapeKeyHandler) document.removeEventListener('keydown', escapeKeyHandler);
  escapeKeyHandler = (e) => {
    if (e.key !== 'Escape') return;
    if (forgetModal && !forgetModal.classList.contains('hidden')) {
      forgetModal.classList.add('hidden');
    } else if (deleteModal && !deleteModal.classList.contains('hidden')) {
      deleteModal.classList.add('hidden');
    }
  };
  document.addEventListener('keydown', escapeKeyHandler);
}
