// Extension configuration — Muhammad Haseeb Ramzan (https://github.com/Haseeb536)
// Set USE_LOCAL_BACKEND to true when running backend from GitHub repo locally
const EXTENSION_CONFIG = {
  REMOTE_API_URL: "https://retail-scraper-backend-ecxl.onrender.com/api",
  LOCAL_API_URL: "http://localhost:3001/api",
  USE_LOCAL_BACKEND: false,
  ENABLE_LOCAL_AUTH_FALLBACK: false,
};

function getApiBaseUrl() {
  return EXTENSION_CONFIG.USE_LOCAL_BACKEND
    ? EXTENSION_CONFIG.LOCAL_API_URL
    : EXTENSION_CONFIG.REMOTE_API_URL;
}
