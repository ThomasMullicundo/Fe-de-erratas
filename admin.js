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
const statusFilter = document.querySelector("[data-status-filter]");
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

function accountIsEditor() {
  return session?.user?.app_metadata?.role === "editor";
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
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(value));
}

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180);
}

function setEditorMessage(message) {
  editorState.textContent = message;
}

function setRoleVisibility() {
  const isEditor = accountIsEditor();
  document.querySelectorAll("[data-editor-only]").forEach((element) => { element.hidden = !isEditor; });
  document.querySelectorAll("[data-author-only]").forEach((element) => { element.hidden = isEditor; });
  document.querySelector("[data-author-actions]").hidden = isEditor;
  document.querySelector("[data-editor-actions]").hidden = !isEditor;
  document.querySelector("[data-list-title]").textContent = isEditor ? "Mesa editorial" : "Mis notas";
  document.querySelector("[data-account-role]").textContent = isEditor ? "Editor" : "Autor";
  document.querySelector("[data-desk-label]").innerHTML = isEditor ? "Mesa editorial<br>Material enviado" : "Mesa de autores<br>Solo material propio";
  document.querySelector("[data-empty-title]").textContent = isEditor ? "La bandeja está limpia." : "Una hoja en blanco también muerde.";
  document.querySelector("[data-empty-copy]").textContent = isEditor
    ? "Cuando un autor envíe una nota, va a aparecer acá. Los borradores privados nunca entran en esta mesa."
    : "Creá una nota o abrí uno de tus borradores. Nadie desde esta pantalla puede tocar la portada, las secciones ni los textos de otros autores.";
}

function setLoggedIn(loggedIn) {
  loginView.hidden = loggedIn;
  workspace.hidden = !loggedIn;
  if (loggedIn) {
    document.querySelector("[data-account-email]").textContent = session.user.email;
    setRoleVisibility();
  }
}

function filteredNotes() {
  if (!accountIsEditor() || statusFilter.value === "all") return notes;
  return notes.filter((note) => note.status === statusFilter.value);
}

function renderNotes() {
  const visibleNotes = filteredNotes();
  notesList.replaceChildren();
  if (!visibleNotes.length) {
    const message = document.createElement("p");
    message.className = "author-chip";
    message.textContent = accountIsEditor() ? "No hay notas en este estado." : "Todavía no dejaste ningún borrador.";
    notesList.append(message);
    return;
  }
  visibleNotes.forEach((note) => {
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
    button.append(title);
    if (accountIsEditor()) {
      const author = document.createElement("small");
      author.textContent = note.author_email || `Autor ${note.author_id.slice(0, 8)}`;
      button.append(author);
    }
    button.append(meta);
    button.addEventListener("click", () => openNote(note));
    notesList.append(button);
  });
}

function setFormDisabled(disabled) {
  ["title", "excerpt", "category", "content"].forEach((name) => { editorForm.elements[name].disabled = disabled; });
}

function openNote(note) {
  activeNote = note;
  const isEditor = accountIsEditor();
  const authorCanEdit = note.status === "draft" || note.status === "rejected";
  editorEmpty.hidden = true;
  editorForm.hidden = false;
  editorForm.elements.title.value = note.title || "";
  editorForm.elements.excerpt.value = note.excerpt || "";
  editorForm.elements.category.value = note.category || "relato";
  editorForm.elements.content.value = note.content || "";
  editorForm.elements.slug.value = note.slug || "";
  editorForm.elements.editorial_notes.value = note.editorial_notes || "";
  setFormDisabled(!isEditor && !authorCanEdit);
  editorForm.elements.slug.disabled = !isEditor;
  editorForm.elements.editorial_notes.disabled = !isEditor;
  lockedMessage.hidden = isEditor || authorCanEdit;
  document.querySelector("[data-note-status]").textContent = formatStatus(note.status);
  document.querySelector("[data-note-author]").textContent = note.author_email || `Autor ${note.author_id.slice(0, 8)}`;
  const feedback = document.querySelector("[data-author-feedback]");
  feedback.hidden = isEditor || !note.editorial_notes;
  document.querySelector("[data-author-feedback-text]").textContent = note.editorial_notes || "";
  document.querySelector("[data-author-actions]").hidden = isEditor || !authorCanEdit;
  document.querySelector("[data-editor-actions]").hidden = !isEditor;
  document.querySelector("[data-review-note]").hidden = !isEditor || note.status === "submitted";
  setEditorMessage(isEditor ? "Edición abierta" : authorCanEdit ? "Borrador abierto" : "Solo lectura");
  updateWordCount();
  renderNotes();
}

const noteSelection = "id,author_id,author_email,title,excerpt,content,category,status,slug,editorial_notes,created_at,updated_at,submitted_at,published_at,reviewed_at";

async function loadNotes() {
  notes = await api(`notes?select=${noteSelection}&order=updated_at.desc`);
  renderNotes();
}

async function createNote() {
  if (accountIsEditor()) return;
  setEditorMessage("Abriendo una hoja nueva…");
  const created = await api(`notes?select=${noteSelection}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ author_id: session.user.id, category: "relato", status: "draft" })
  });
  notes.unshift(created[0]);
  openNote(created[0]);
}

function authorPayload(status = "draft") {
  const data = new FormData(editorForm);
  return {
    title: String(data.get("title") || "").trim(),
    excerpt: String(data.get("excerpt") || "").trim(),
    category: String(data.get("category") || "relato"),
    content: String(data.get("content") || "").trim(),
    status
  };
}

function editorialPayload(status = activeNote.status) {
  const data = new FormData(editorForm);
  const title = String(data.get("title") || "").trim();
  return {
    title,
    excerpt: String(data.get("excerpt") || "").trim(),
    category: String(data.get("category") || "relato"),
    content: String(data.get("content") || "").trim(),
    editorial_notes: String(data.get("editorial_notes") || "").trim(),
    slug: slugify(String(data.get("slug") || "").trim() || title),
    status
  };
}

async function updateActiveNote(payload, message) {
  const updated = await api(`notes?id=eq.${encodeURIComponent(activeNote.id)}&select=${noteSelection}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  if (!updated?.length) throw new Error("La nota cambió o ya no tenés permiso para editarla.");
  activeNote = updated[0];
  notes = notes.map((note) => note.id === activeNote.id ? activeNote : note).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  openNote(activeNote);
  setEditorMessage(message);
}

async function saveAuthorNote(status = "draft") {
  if (!activeNote || accountIsEditor() || !["draft", "rejected"].includes(activeNote.status)) return;
  const payload = authorPayload(status);
  if (status === "submitted" && (!payload.title || !payload.content)) throw new Error("Faltan el título o el texto.");
  setEditorMessage(status === "submitted" ? "Enviando a edición…" : "Guardando…");
  await updateActiveNote(payload, status === "submitted" ? "Enviada. Ya no puede modificarse." : "Borrador guardado.");
}

async function saveEditorialNote(status = activeNote?.status) {
  if (!activeNote || !accountIsEditor()) return;
  const payload = editorialPayload(status);
  if (!payload.title || !payload.content) throw new Error("La nota necesita título y texto.");
  if (status === "rejected" && !payload.editorial_notes) throw new Error("Escribí una observación antes de devolverla.");
  setEditorMessage(status === "published" ? "Publicando…" : status === "rejected" ? "Devolviendo…" : "Guardando correcciones…");
  const message = status === "published" ? "Marcada como publicada." : status === "rejected" ? "Devuelta al autor con observaciones." : status === "submitted" ? "Devuelta a la cola de edición." : "Correcciones guardadas.";
  await updateActiveNote(payload, message);
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
    loginMessage.textContent = "";
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
  editorForm.hidden = true;
  editorEmpty.hidden = false;
  setLoggedIn(false);
});
editorForm.addEventListener("submit", (event) => { event.preventDefault(); saveAuthorNote().catch((error) => setEditorMessage(error.message)); });
document.querySelector("[data-submit-note]").addEventListener("click", () => {
  if (window.confirm("¿Enviar esta nota a edición? Después no vas a poder cambiarla hasta que la mesa la devuelva.")) saveAuthorNote("submitted").catch((error) => setEditorMessage(error.message));
});
document.querySelector("[data-editor-save]").addEventListener("click", () => saveEditorialNote().catch((error) => setEditorMessage(error.message)));
document.querySelector("[data-return-note]").addEventListener("click", () => {
  if (window.confirm("¿Devolver esta nota al autor con las observaciones escritas?")) saveEditorialNote("rejected").catch((error) => setEditorMessage(error.message));
});
document.querySelector("[data-review-note]").addEventListener("click", () => saveEditorialNote("submitted").catch((error) => setEditorMessage(error.message)));
document.querySelector("[data-publish-note]").addEventListener("click", () => {
  if (window.confirm("¿Marcar esta nota como publicada?")) saveEditorialNote("published").catch((error) => setEditorMessage(error.message));
});
statusFilter.addEventListener("change", renderNotes);
editorForm.elements.content.addEventListener("input", updateWordCount);
editorForm.elements.title.addEventListener("blur", () => {
  if (accountIsEditor() && !editorForm.elements.slug.value) editorForm.elements.slug.value = slugify(editorForm.elements.title.value);
});

(async function boot() {
  if (!session?.access_token) return setLoggedIn(false);
  try {
    await refreshSession();
    setLoggedIn(true);
    await loadNotes();
  } catch {
    writeSession(null);
    setLoggedIn(false);
  }
})();
