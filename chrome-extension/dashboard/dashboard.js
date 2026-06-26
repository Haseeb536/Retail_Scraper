const API_BASE_URL = typeof getApiBaseUrl === "function"
  ? getApiBaseUrl()
  : "https://retail-scraper-backend-ecxl.onrender.com/api";

document.addEventListener('DOMContentLoaded', async () => {
    const targetUrlInput = document.getElementById('targetUrl');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const progressSection = document.getElementById('progressSection');
    const processedCountEl = document.getElementById('processedCount');
    const currentPageEl = document.getElementById('currentPage');
    const progressBar = document.getElementById('progressBar');
    const terminalOutput = document.getElementById('terminalOutput');

    const userNameEl = document.getElementById('userName');
    const userStatusEl = document.getElementById('userStatus');
    const connectionStatusDot = document.getElementById('connectionStatusDot');
    const connectionStatusText = document.getElementById('connectionStatusText');
    const logoutBtn = document.getElementById('logoutBtn');

    let isScraping = false;
    let jwtToken = null;

    // Toast Function
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${message}`;
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // Terminal Logging
    function log(message, type = 'normal') {
        const line = document.createElement('div');
        line.className = `log-line ${type}`;
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        line.innerText = `[${time}] > ${message}`;
        terminalOutput.appendChild(line);
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }

    // Auth logic
    async function checkAuth() {
        const result = await chrome.storage.local.get(["jwtToken", "offlineTestMode"]);
        jwtToken = result.jwtToken;

        if (!jwtToken) {
            window.location.href = '../popup/popup.html';
            return;
        }

        if (result.offlineTestMode) {
            userNameEl.textContent = "Offline Test";
            userStatusEl.textContent = "APPROVED";
            connectionStatusDot.classList.add('online');
            connectionStatusText.textContent = "Offline test mode";
            return;
        }

        if (typeof getLocalSessionUser === "function") {
            const localUser = await getLocalSessionUser();
            if (localUser) {
                userNameEl.textContent = `${localUser.firstName} ${localUser.lastName}`;
                userStatusEl.textContent = "APPROVED (LOCAL)";
                connectionStatusDot.classList.add('online');
                connectionStatusText.textContent = "Local auth mode";
                return;
            }
        }

        try {
            const response = await fetch(`${API_BASE_URL}/auth/verify`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${jwtToken}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                userNameEl.textContent = `${data.user.firstName} ${data.user.lastName}`;
                userStatusEl.textContent = data.user.isApproved ? "APPROVED" : "PENDING";
                connectionStatusDot.classList.add('online');
                connectionStatusText.textContent = "Secure Connection Active";

                if (!data.user.isApproved) {
                    startBtn.disabled = true;
                    startBtn.title = "Awaiting Admin Approval";
                    log("Account pending approval. Extraction restricted.", "error");
                }
            } else {
                chrome.storage.local.remove("jwtToken");
                window.location.href = '../popup/popup.html';
            }
        } catch (error) {
            connectionStatusDot.classList.remove('online');
            connectionStatusText.textContent = "Offline / Connection Error";
            log("Server unreachable. Checking local cache...", "error");
        }
    }

    // Stats fetching
    async function updateStats() {
        // Implementation for stats could go here, fetching from storage or API
        const { totalScraped = 0, sessions = 0 } = await chrome.storage.local.get(['totalScraped', 'sessions']);
        document.getElementById('totalScrapedStat').textContent = totalScraped;
        document.getElementById('sessionsStat').textContent = sessions;
    }

    // Start Scraping
    startBtn.addEventListener('click', async () => {
        const url = targetUrlInput.value.trim();
        if (!url) {
            showToast("Please provide a target URL", "error");
            return;
        }

        if (!url.includes('realtor.com')) {
            showToast("Invalid URL. Must be a realtor.com link.", "error");
            return;
        }

        isScraping = true;
        startBtn.disabled = true;
        progressSection.classList.remove('hidden');
        log(`Initiating extraction for: ${url.substring(0, 50)}...`, "system");

        // 1. Create/Update tab with the URL
        const tab = await chrome.tabs.create({ url, active: false });
        log(`New tab created (ID: ${tab.id}). Waiting for load...`);

        // 2. Poll for tab status or use onUpdated
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                log("Target page loaded. Injecting scraper engine...");
                executeScraper(tab.id);
            }
        });
    });

    async function executeScraper(tabId) {
        try {
            await new Promise(r => setTimeout(r, 2000));

            async function pingContentScript() {
                return new Promise((resolve) => {
                    chrome.tabs.sendMessage(tabId, { action: "ping" }, (resp) => {
                        resolve(!chrome.runtime.lastError && resp?.ready);
                    });
                });
            }

            let ready = await pingContentScript();
            if (!ready) {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                });
                await new Promise(r => setTimeout(r, 300));
                ready = await pingContentScript();
            }

            if (!ready) {
                log("Could not connect to content script. Refresh the tab and retry.", "error");
                return;
            }

            chrome.tabs.sendMessage(tabId, {
                action: "executeScraperInContent",
                token: jwtToken
            }, (response) => {
                if (chrome.runtime.lastError) {
                    log(`Communication error: ${chrome.runtime.lastError.message}`, "error");
                    return;
                }

                if (response && response.success) {
                    log("Scraper active and running in background.", "system");
                    showToast("Extraction Started Successfully");
                    monitorProgress();
                } else {
                    log(`Scraper failed to start: ${response?.error || 'Unknown error'}`, "error");
                }
            });
        } catch (err) {
            log(`Execution error: ${err.message}`, "error");
        }
    }

    function monitorProgress() {
        const interval = setInterval(async () => {
            const result = await chrome.storage.local.get(["retail_scraper_data", "retail_scraper_page", "retail_scraper_active"]);
            const data = result.retail_scraper_data || [];
            const page = result.retail_scraper_page || 1;
            const active = result.retail_scraper_active;

            processedCountEl.textContent = data.length;
            currentPageEl.textContent = page;

            // Update progress bar (cap at some reasonable number or just animate)
            const progress = Math.min((data.length / 500) * 100, 100);
            progressBar.style.width = `${progress}%`;

            if (data.length > 0) {
                log(`Session Update: ${data.length} records collected (Page ${page})`);
            }

            if (!active) {
                clearInterval(interval);
                isScraping = false;
                startBtn.disabled = false;
                log("Extraction session completed.", "system");
                showToast("Extraction Complete! File Downloaded.");

                // Update persistent stats
                const stats = await chrome.storage.local.get(['totalScraped', 'sessions']);
                chrome.storage.local.set({
                    totalScraped: (stats.totalScraped || 0) + data.length,
                    sessions: (stats.sessions || 0) + 1
                });
                updateStats();
            }
        }, 3000);
    }

    stopBtn.addEventListener('click', () => {
        chrome.storage.local.set({ "retail_scraper_stop_requested": true });
        log("Termination signal sent.", "error");
    });

    logoutBtn.addEventListener('click', async () => {
        await chrome.storage.local.remove("jwtToken");
        window.location.href = '../popup/popup.html';
    });

    // Initialize
    await checkAuth();
    await updateStats();
});
