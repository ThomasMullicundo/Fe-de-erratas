const config = window.FE_DE_RATAS_SUPABASE;
const sessionKey = "fe-de-ratas-author-session";
const loginView = document.querySelector("[data-login-view]");
const workspace = document.querySelector("[data-workspace]");
const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const editorForm = document.querySelector("[data-editor-form]");
const editorEmpty = document.querySelector("[data-editor-empty]");
const notesList = document.querySelector("[data-notes-list]");
const editorState = document.querySelector("[data-editor-state]");
const lockedMessage = document.querySelector("[data-locked-message]");
let session = readSession();
let notes = [];
let activeNote = null;

function readSession() {
  try { return JSON.parse(localStorage.getItem(sessionKey)); } catch { return null; }
}

function writeSession(nextSession) {
  session = nextSession;
  if (nextSession) localStorage.setItem(sessionKey, JSON.stringify(nextSession));
  else localStorage.removeItem(sessionKey);
}

async function authRequest(path, body, token) {
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(payload.msg || payload.error_description || payload.message || "No pudimos abrir la puerta.");
  return payload;
}

async function refreshSession() {
  if (!session?.refresh_token) throw new Error("Tu sesión terminó. Volvé a entrar.");
  const next = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
  writeSession(next);
  return next;
}

async function api(path, options = {}, retry = true) {
  if (!session?.access_token) throw new Error("No hay una sesión activa.");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (response.status === 401 && retry) {
    await refreshSession();
    return api(path, options, false);
  }
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(payload?.message || "La nota no pudo guardarse.");
  return payload;
}

function formatStatus(status) {
  return { draft: "Borrador", submitted: "En edición", published: "Publicada", rejected: "Devuelta" }[status] || status;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(value));
}

function setEditorMessage(message) {
  editorState.textContent = message;
}

function setLoggedIn(loggedIn) {
  loginView.hidden = loggedIn;
  workspace.hidden = !loggedIn;
  if (loggedIn) document.querySelector("[data-author-email]").textContent = session.user.email;
}

function renderNotes() {
  notesList.replaceChildren();
  if (!notes.length) {
    const message = document.createElement("p");
    message.className = "author-chip";
    message.textContent = "Todavía no dejaste ningún borrador.";
    notesList.append(message);
    return;
  }
  notes.forEach((note) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `note-item${activeNote?.id === note.id ? " is-active" : ""}`;
    const title = document.createElement("strong");
    title.textContent = note.title || "Sin título";
    const meta = document.createElement("span");
    const status = document.createElement("b");
    status.className = "status-pill";
    status.textContent = formatStatus(note.status);
    const date = document.createElement("time");
    date.dateTime = note.updated_at;
    date.textContent = formatDate(note.updated_at);
    meta.append(status, date);
    button.append(title, meta);
    button.addEventListener("click", () => openNote(note));
    notesList.append(button);
  });
}

function openNote(note) {
  activeNote = note;
  editorEmpty.hidden = true;
  editorForm.hidden = false;
  editorForm.elements.title.value = note.title || "";
  editorForm.elements.excerpt.value = note.excerpt || "";
  editorForm.elements.category.value = note.category || "relato";
  editorForm.elements.content.value = note.content || "";
  const locked = note.status !== "draft";
  [...editorForm.elements].forEach((field) => field.disabled = locked);
  lockedMessage.hidden = !locked;
  document.querySelector("[data-note-status]").textContent = formatStatus(note.status);
  setEditorMessage(locked ? "Solo lectura" : "Borrador abierto");
  updateWordCount();
  renderNotes();
}

async function loadNotes() {
  notes = await api("notes?select=id,title,excerpt,content,category,status,created_at,updated_at&order=updated_at.desc");
  renderNotes();
}

async function createNote() {
  setEditorMessage("Abriendo una hoja nueva…");
  const created = await api("notes?select=id,title,excerpt,content,category,status,created_at,updated_at", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ author_id: session.user.id, category: "relato", status: "draft" })
  });
  notes.unshift(created[0]);
  openNote(created[0]);
}

function notePayload(status = "draft") {
  const data = new FormData(editorForm);
  return {
    title: String(data.get("title") || "").trim(),
    excerpt: String(data.get("excerpt") || "").trim(),
    category: String(data.get("category") || "relato"),
    content: String(data.get("content") || "").trim(),
    status
  };
}

async function saveNote(status = "draft") {
  if (!activeNote || activeNote.status !== "draft") return;
  const payload = notePayload(status);
  if (status === "submitted" && (!payload.title || !payload.content)) {
    setEditorMessage("Faltan el título o el texto.");
    return;
  }
  setEditorMessage(status === "submitted" ? "Enviando a edición…" : "Guardando…");
  const updated = await api(`notes?id=eq.${encodeURIComponent(activeNote.id)}&select=id,title,excerpt,content,category,status,created_at,updated_at`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  activeNote = updated[0];
  notes = notes.map((note) => note.id === activeNote.id ? activeNote : note).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  openNote(activeNote);
  setEditorMessage(status === "submitted" ? "Enviada. Ya no puede modificarse." : "Borrador guardado.");
}

function updateWordCount() {
  const content = editorForm.elements.content.value.trim();
  const count = content ? content.split(/\s+/).length : 0;
  document.querySelector("[data-word-count]").textContent = `${count} ${count === 1 ? "palabra" : "palabras"}`;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = loginForm.querySelector("button");
  submit.disabled = true;
  loginMessage.textContent = "Revisando la lista…";
  try {
    const data = new FormData(loginForm);
    const next = await authRequest("token?grant_type=password", { email: data.get("email"), password: data.get("password") });
    writeSession(next);
    setLoggedIn(true);
    await loadNotes();
    loginForm.reset();
  } catch (error) {
    loginMessage.textContent = error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message;
  } finally {
    submit.disabled = false;
  }
});

document.querySelectorAll("[data-new-note]").forEach((button) => button.addEventListener("click", () => createNote().catch((error) => setEditorMessage(error.message))));
document.querySelector("[data-logout]").addEventListener("click", async () => {
  try { await authRequest("logout", null, session?.access_token); } catch { /* The local session is still cleared. */ }
  writeSession(null);
  notes = [];
  activeNote = null;
  setLoggedIn(false);
});
editorForm.addEventListener("submit", (event) => { event.preventDefault(); saveNote().catch((error) => setEditorMessage(error.message)); });
document.querySelector("[data-submit-note]").addEventListener("click", () => {
  if (window.confirm("¿Enviar esta nota a edición? Después no vas a poder cambiarla.")) saveNote("submitted").catch((error) => setEditorMessage(error.message));
});
editorForm.elements.content.addEventListener("input", updateWordCount);

(async function boot() {
  if (!session?.access_token) return setLoggedIn(false);
  try {
    setLoggedIn(true);
    await loadNotes();
  } catch {
    writeSession(null);
    setLoggedIn(false);
  }
})();
