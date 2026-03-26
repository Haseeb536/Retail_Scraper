// Popup JavaScript for Retail Scraper Extension

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const dashboard = document.getElementById("dashboard");

  const showRegisterButton = document.getElementById("showRegister");
  const showLoginButton = document.getElementById("showLogin");

  const loginFormElement = document.getElementById("loginFormElement");
  const registerFormElement = document.getElementById("registerFormElement");

  const loginEmailInput = document.getElementById("loginEmail");
  const loginPasswordInput = document.getElementById("loginPassword");

  const registerFirstNameInput = document.getElementById("registerFirstName");
  const registerLastNameInput = document.getElementById("registerLastName");
  const registerEmailInput = document.getElementById("registerEmail");
  const registerPasswordInput = document.getElementById("registerPassword");

  const scrapeButton = document.getElementById("scrapeButton");
  const scraperStatus = document.getElementById("scraperStatus");
  const userNameDisplay = document.getElementById("userName");
  const userStatusDisplay = document.getElementById("userStatus");
  const logoutButton = document.getElementById("logoutButton");
  const openDashboardButton = document.getElementById("openDashboardButton");
  const progressSection = document.getElementById("progressSection");
  const scraperControls = document.getElementById("scraperControls");
  const pPage = document.getElementById("p-page");
  const pValid = document.getElementById("p-valid");
  const stopButton = document.getElementById("stopButton");

  const statusIndicator = document.getElementById("statusIndicator");
  const statusDot = statusIndicator.querySelector(".status-dot");
  const statusText = statusIndicator.querySelector(".status-text");

  const toastContainer = document.getElementById("toastContainer");
  const validRowsDisplay = document.getElementById("validRowsCount");
  const currentPageDisplay = document.getElementById("currentPageNumber");

  const offlineTestButton = document.getElementById("offlineTestButton");

  const STORAGE_KEYS = {
    ACTIVE: "retail_scraper_active",
    DATA: "retail_scraper_data",
    PAGE: "retail_scraper_page"
  };

  const API_BASE_URL = getApiBaseUrl();

  async function completeLocalLogin(email, password) {
    const result = await localLogin({ email, password });
    if (!result.ok) {
      showToast(
        "Server is down. Register a new account first, or use admin@retailscraper.com / admin123",
        false
      );
      return false;
    }
    showDashboard(result.user);
    setOnlineStatus(true);
    showToast("Logged in locally (server unavailable).", true);
    return true;
  }

  async function tryRemoteLogin(email, password) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }
  function showToast(message, isSuccess) {
    console.log(`Toast: ${message} (${isSuccess ? 'success' : 'error'})`);
    const toast = document.createElement("div");
    toast.className = `toast ${isSuccess ? "success" : "error"}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${isSuccess ? "✓" : "✗"}</span>
        <span class="toast-message">${message}</span>
      </div>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 10);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function setOnlineStatus(isOnline) {
    if (isOnline) {
      statusDot.style.backgroundColor = "#00ff41";
      statusText.textContent = "ONLINE";
      statusIndicator.classList.add("online");
      statusIndicator.classList.remove("offline");
    } else {
      statusDot.style.backgroundColor = "#ff0040";
      statusText.textContent = "OFFLINE";
      statusIndicator.classList.add("offline");
      statusIndicator.classList.remove("online");
    }
  }

  // Log scraping session to backend
  async function logScrapingSession(dataCount, status, jwt) {
    try {
      const response = await fetch(`${API_BASE_URL}/scraping/log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ dataCount, status }),
      });

      if (!response.ok) {
        console.error("Failed to log scraping session:", response.status);
      } else {
        console.log("✅ Scraping session logged successfully");
      }
    } catch (err) {
      console.error("Error logging scraping session:", err);
    }
  }

  async function checkAuthStatus() {
    try {
      const result = await chrome.storage.local.get(["jwtToken", "offlineTestMode"]);

      if (result.offlineTestMode && result.jwtToken) {
        showDashboard({
          firstName: "Offline",
          lastName: "Test",
          isApproved: true,
        });
        setOnlineStatus(true);
        return;
      }

      const localUser = await getLocalSessionUser();
      if (localUser) {
        showDashboard(localUser);
        setOnlineStatus(true);
        return;
      }

      if (result.jwtToken && !result.jwtToken.startsWith("local:")) {
        const response = await fetch(`${API_BASE_URL}/auth/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${result.jwtToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            showDashboard(data.user);
            setOnlineStatus(true);
            return;
          }
        } else {
          await chrome.storage.local.remove("jwtToken");
        }
      }
    } catch (error) {
      console.error("Auth check failed:", error);

      const localUser = await getLocalSessionUser();
      if (localUser) {
        showDashboard(localUser);
        setOnlineStatus(true);
        return;
      }
    }

    showLoginForm();
    setOnlineStatus(false);
  }

  function showLoginForm() {
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    dashboard.classList.add("hidden");
  }

  function showRegisterForm() {
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
    dashboard.classList.add("hidden");
  }

  function showDashboard(user) {
    loginForm.classList.add("hidden");
    registerForm.classList.add("hidden");
    dashboard.classList.remove("hidden");
    userNameDisplay.textContent = `${user.firstName} ${user.lastName}`;
    userStatusDisplay.textContent = user.isApproved ? "APPROVED" : "PENDING";
    userStatusDisplay.className = user.isApproved
      ? "user-status approved"
      : "user-status pending";

    if (!user.isApproved) {
      scrapeButton.disabled = true;
      scraperStatus.textContent = "APPROVAL PENDING";
      scraperStatus.className = "scraper-status pending";
    } else {
      scrapeButton.disabled = false;
      scraperStatus.textContent = "READY";
      scraperStatus.className = "scraper-status ready";
    }
  }

  showRegisterButton.addEventListener("click", (e) => {
    e.preventDefault();
    showRegisterForm();
  });

  showLoginButton.addEventListener("click", (e) => {
    e.preventDefault();
    showLoginForm();
  });

  loginFormElement.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    if (!email || !password) {
      showToast("Please fill in all fields.", false);
      return;
    }

    try {
      const { response, data } = await tryRemoteLogin(email, password);

      if (response.ok) {
        await chrome.storage.local.set({ jwtToken: data.token, offlineTestMode: false });
        await chrome.storage.local.remove("localSession");
        showToast("Authentication successful!", true);
        setTimeout(() => checkAuthStatus(), 500);
        return;
      }

      if (EXTENSION_CONFIG.ENABLE_LOCAL_AUTH_FALLBACK && (response.status >= 500 || response.status === 0)) {
        await completeLocalLogin(email, password);
        return;
      }

      showToast(data.error || data.message || "Authentication failed.", false);
    } catch (error) {
      console.error("Login error:", error);
      if (EXTENSION_CONFIG.ENABLE_LOCAL_AUTH_FALLBACK) {
        await completeLocalLogin(email, password);
      } else {
        showToast("Network error. Server offline.", false);
        setOnlineStatus(false);
      }
    }
  });

  registerFormElement.addEventListener("submit", async (event) => {
    event.preventDefault();
    const firstName = registerFirstNameInput.value.trim();
    const lastName = registerLastNameInput.value.trim();
    const email = registerEmailInput.value.trim();
    const password = registerPasswordInput.value;

    if (!firstName || !lastName || !email || !password) {
      showToast("Please fill in all fields.", false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        showToast("Registration successful! Awaiting admin approval.", true);
        registerFormElement.reset();
        setTimeout(() => showLoginForm(), 1000);
        return;
      }

      if (EXTENSION_CONFIG.ENABLE_LOCAL_AUTH_FALLBACK && (response.status >= 500 || response.status === 0)) {
        const localResult = await localRegister({ firstName, lastName, email, password });
        if (localResult.ok) {
          showToast("Registered locally (server down). You can log in now.", true);
          registerFormElement.reset();
          setTimeout(() => showLoginForm(), 1000);
          return;
        }
        showToast(localResult.error, false);
        return;
      }

      showToast(data.error || data.message || "Registration failed.", false);
    } catch (error) {
      console.error("Registration error:", error);
      if (EXTENSION_CONFIG.ENABLE_LOCAL_AUTH_FALLBACK) {
        const localResult = await localRegister({ firstName, lastName, email, password });
        if (localResult.ok) {
          showToast("Registered locally (server down). You can log in now.", true);
          registerFormElement.reset();
          setTimeout(() => showLoginForm(), 1000);
        } else {
          showToast(localResult.error, false);
        }
      } else {
        showToast("Network error. Server offline.", false);
        setOnlineStatus(false);
      }
    }
  });

  logoutButton.addEventListener("click", async (e) => {
    e.preventDefault();
    await clearLocalSession();
    await chrome.storage.local.remove(["jwtToken", "offlineTestMode", "localSession"]);
    showToast("Session terminated.", true);
    showLoginForm();
    setOnlineStatus(false);
  });

  if (offlineTestButton) {
    offlineTestButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await ensureDefaultLocalAdmin();
      showToast("Use admin@retailscraper.com / admin123 or register above.", true);
      loginEmailInput.value = "admin@retailscraper.com";
      loginPasswordInput.value = "admin123";
    });
  }

  openDashboardButton.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  });

  scrapeButton.addEventListener("click", async (e) => {
    e.preventDefault();
    console.log("Scrape button clicked");

    const { jwtToken } = await chrome.storage.local.get("jwtToken");
    console.log("JWT Token exists:", !!jwtToken);

    if (!jwtToken) {
      showToast("Authentication required.", false);
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    console.log("Current tab URL:", tab?.url);

    if (!tab || !tab.url) {
      showToast("Cannot detect current tab.", false);
      return;
    }

    if (!tab.url.includes("realtor.com")) {
      showToast("Navigate to a realtor.com agent search page first.", false);
      return;
    }

    scrapeButton.disabled = true;
    scraperStatus.textContent = "SCRAPING...";
    scraperStatus.className = "scraper-status scraping";
    showToast("Starting scrape...", true);

    async function sendScrapeMessage() {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tab.id,
          { action: "executeScraperInContent", token: jwtToken },
          (resp) => {
            if (chrome.runtime.lastError) {
              resolve({ error: chrome.runtime.lastError.message });
            } else {
              resolve(resp || { error: "No response from content script" });
            }
          }
        );
      });
    }

    async function pingContentScript() {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: "ping" }, (resp) => {
          resolve(!chrome.runtime.lastError && resp?.ready);
        });
      });
    }

    try {
      let ready = await pingContentScript();

      if (!ready) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
          });
          console.log("Content script injected");
          await new Promise((r) => setTimeout(r, 300));
          ready = await pingContentScript();
        } catch (err) {
          console.log("Content script injection failed:", err.message);
        }
      }

      if (!ready) {
        showToast("Communication error. Refresh the realtor.com page and try again.", false);
        scrapeButton.disabled = false;
        scraperStatus.textContent = "READY";
        scraperStatus.className = "scraper-status ready";
        return;
      }

      const resp = await sendScrapeMessage();
      console.log("Response from content script:", resp);

      if (resp.error) {
        showToast(`Scrape failed: ${resp.error}`, false);
        scrapeButton.disabled = false;
        scraperStatus.textContent = "READY";
        scraperStatus.className = "scraper-status ready";
        return;
      }

      if (resp.success) {
        if (resp.alreadyRunning) {
          showToast("Scraper is already running.", true);
        } else {
          showToast("Scrape started! Check progress below.", true);
        }
        if (progressSection) progressSection.classList.remove("hidden");
        if (scraperControls) scraperControls.classList.add("hidden");
        updateLiveStats();
      } else {
        showToast(`Scrape failed: ${resp.error || "Unknown error"}`, false);
        scrapeButton.disabled = false;
        scraperStatus.textContent = "READY";
        scraperStatus.className = "scraper-status ready";
      }
    } catch (err) {
      console.error("Scrape error:", err);
      showToast("Scrape failed. Refresh page and try again.", false);
      scrapeButton.disabled = false;
      scraperStatus.textContent = "READY";
      scraperStatus.className = "scraper-status ready";
    }
  });

  // Live Stats Update
  async function updateLiveStats() {
    const data = await chrome.storage.local.get([STORAGE_KEYS.DATA, STORAGE_KEYS.PAGE, STORAGE_KEYS.ACTIVE]);
    const validCount = (data[STORAGE_KEYS.DATA] || []).length;
    const pageNum = data[STORAGE_KEYS.PAGE] || 1;
    const isActive = data[STORAGE_KEYS.ACTIVE];

    if (validRowsDisplay) validRowsDisplay.textContent = validCount;
    if (currentPageDisplay) currentPageDisplay.textContent = pageNum;

    // Update progress section details
    if (pValid) pValid.textContent = validCount;
    if (pPage) pPage.textContent = pageNum;

    if (isActive) {
      if (progressSection) progressSection.classList.remove("hidden");
      if (scraperControls) scraperControls.classList.add("hidden");
      scrapeButton.disabled = true;
      scraperStatus.textContent = "SCRAPING...";
      scraperStatus.className = "scraper-status scraping";
    } else {
      if (progressSection) progressSection.classList.add("hidden");
      if (scraperControls) scraperControls.classList.remove("hidden");
      scrapeButton.disabled = false;
      scraperStatus.textContent = "READY";
      scraperStatus.className = "scraper-status ready";
    }
  }

  // Handle Stop Button
  if (stopButton) {
    stopButton.addEventListener("click", async () => {
      stopButton.disabled = true;
      stopButton.querySelector(".button-text").textContent = "STOPPING...";
      await chrome.storage.local.set({ "retail_scraper_stop_requested": true });
      showToast("Termination requested...", true);
    });
  }

  // Listen for storage changes to update stats in real-time
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEYS.DATA] || changes[STORAGE_KEYS.PAGE] || changes[STORAGE_KEYS.ACTIVE]) {
      updateLiveStats();
    }
  });

  // Initial stats load
  updateLiveStats();

  ensureDefaultLocalAdmin();
  checkAuthStatus();
});