// Local auth fallback when the remote backend is unavailable
const LOCAL_AUTH_KEY = "localUsers";
const LOCAL_SESSION_KEY = "localSession";

async function hashPassword(password) {
  const data = new TextEncoder().encode(`${password}:retail-scraper-local-v1`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getLocalUsers() {
  const { [LOCAL_AUTH_KEY]: users } = await chrome.storage.local.get(LOCAL_AUTH_KEY);
  return users || {};
}

async function saveLocalUsers(users) {
  await chrome.storage.local.set({ [LOCAL_AUTH_KEY]: users });
}

async function ensureDefaultLocalAdmin() {
  const users = await getLocalUsers();
  const email = "admin@retailscraper.com";
  if (users[email]) return;

  users[email] = {
    id: "local-admin",
    email,
    firstName: "Admin",
    lastName: "User",
    passwordHash: await hashPassword("admin123"),
    isApproved: true,
    isAdmin: true,
  };
  await saveLocalUsers(users);
}

async function localRegister({ firstName, lastName, email, password }) {
  await ensureDefaultLocalAdmin();
  const users = await getLocalUsers();
  const key = email.toLowerCase().trim();

  if (users[key]) {
    return { ok: false, error: "Email already registered locally." };
  }

  users[key] = {
    id: `local-${Date.now()}`,
    email: key,
    firstName,
    lastName,
    passwordHash: await hashPassword(password),
    isApproved: true,
    isAdmin: false,
  };
  await saveLocalUsers(users);
  return { ok: true, user: users[key] };
}

async function localLogin({ email, password }) {
  await ensureDefaultLocalAdmin();
  const users = await getLocalUsers();
  const key = email.toLowerCase().trim();
  const user = users[key];

  if (!user) {
    return { ok: false, error: "Invalid credentials." };
  }

  const passwordHash = await hashPassword(password);
  if (passwordHash !== user.passwordHash) {
    return { ok: false, error: "Invalid credentials." };
  }

  const token = `local:${user.id}`;
  await chrome.storage.local.set({
    jwtToken: token,
    localSession: { userId: user.id, email: key },
    offlineTestMode: false,
  });

  return {
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isApproved: user.isApproved,
      isAdmin: user.isAdmin,
    },
  };
}

async function getLocalSessionUser() {
  const { localSession, jwtToken } = await chrome.storage.local.get([
    LOCAL_SESSION_KEY,
    "jwtToken",
  ]);

  if (!localSession?.email || !jwtToken?.startsWith("local:")) {
    return null;
  }

  const users = await getLocalUsers();
  return users[localSession.email] || null;
}

async function clearLocalSession() {
  await chrome.storage.local.remove(["jwtToken", LOCAL_SESSION_KEY, "offlineTestMode"]);
}
