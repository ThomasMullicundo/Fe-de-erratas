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
const editorPanel = document.querySelector("[data-editor-panel]");
const teamPanel = document.querySelector("[data-team-panel]");
const teamList = document.querySelector("[data-team-list]");
const teamMessage = document.querySelector("[data-team-message]");
const preview = document.querySelector("[data-preview]");
const richEditor = document.querySelector("[data-placeholder]");
const imageInput = document.querySelector("#note-image");
const imageUploadState = document.querySelector("[data-image-upload-state]");
let session = readSession();
let notes = [];
let activeNote = null;
let autosaveTimer = null;
let autosaveRunning = false;
let workDirty = false;
let editRevision = 0;
const backupPrefix = "fe-de-ratas-note-backup:";

function readSession() {
  try { return JSON.parse(localStorage.getItem(sessionKey)); } catch { return null; }
}

function writeSession(nextSession) {
  session = nextSession;
  if (nextSession) localStorage.setItem(sessionKey, JSON.stringify(nextSession));
  else localStorage.removeItem(sessionKey);
}

function accountIsEditor() {
  return ["editor", "owner"].includes(session?.user?.app_metadata?.role);
}

function accountIsOwner() {
  return session?.user?.app_metadata?.role === "owner";
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

function backupKey(noteId) {
  return `${backupPrefix}${noteId}`;
}

function readBackup(noteId) {
  try { return JSON.parse(localStorage.getItem(backupKey(noteId))); } catch { return null; }
}

function clearBackup(noteId) {
  if (noteId) localStorage.removeItem(backupKey(noteId));
}

function captureEditorData() {
  syncEditorSource();
  const data = new FormData(editorForm);
  return {
    title: String(data.get("title") || ""),
    excerpt: String(data.get("excerpt") || ""),
    category: String(data.get("category") || "relato"),
    byline: String(data.get("byline") || ""),
    content: String(data.get("content") || ""),
    slug: String(data.get("slug") || ""),
    editorial_notes: String(data.get("editorial_notes") || ""),
    destination: data.get("destination_archive") === "on" ? "archive" : "section",
    hero_image_url: String(data.get("hero_image_url") || ""),
    hero_image_alt: String(data.get("hero_image_alt") || "")
  };
}

function saveLocalBackup() {
  if (!activeNote || activeNote.deleted_at) return;
  try {
    localStorage.setItem(backupKey(activeNote.id), JSON.stringify({ savedAt: new Date().toISOString(), data: captureEditorData() }));
    setEditorMessage("Copia local guardada");
  } catch {
    setEditorMessage("No pudimos crear la copia local. Guardá el borrador ahora.");
  }
}

function applyBackup(backup) {
  const data = backup?.data;
  if (!data) return;
  ["title", "excerpt", "category", "byline"].forEach((name) => {
    if (data[name] != null) editorForm.elements[name].value = data[name];
  });
  editorForm.elements.content.value = data.content || "";
  richEditor.innerHTML = window.FE_DE_RATAS_RENDER_MARKDOWN(data.content || "");
  if (accountIsEditor()) {
    editorForm.elements.slug.value = data.slug || "";
    editorForm.elements.editorial_notes.value = data.editorial_notes || "";
    editorForm.elements.destination_archive.checked = data.destination === "archive";
    editorForm.elements.hero_image_url.value = data.hero_image_url || "";
    editorForm.elements.hero_image_alt.value = data.hero_image_alt || "";
    renderImagePreview(data.hero_image_url || "", data.hero_image_alt || "");
  }
  updateWordCount();
  refreshPreview();
  document.querySelector("[data-local-recovery]").hidden = true;
  setEditorMessage("Copia recuperada. Guardala para enviarla a la base.");
}

function showBackupRecovery(note) {
  const backup = readBackup(note.id);
  document.querySelector("[data-local-recovery]").hidden = Boolean(note.deleted_at) || !backup?.data;
}

function setRoleVisibility() {
  const isEditor = accountIsEditor();
  const isOwner = accountIsOwner();
  document.querySelectorAll("[data-editor-only]").forEach((element) => { element.hidden = !isEditor; });
  document.querySelectorAll("[data-author-only]").forEach((element) => { element.hidden = isEditor; });
  document.querySelectorAll("[data-owner-only]").forEach((element) => { element.hidden = !isOwner; });
  document.querySelector("[data-author-actions]").hidden = isEditor;
  document.querySelector("[data-editor-actions]").hidden = !isEditor;
  document.querySelector("[data-list-title]").textContent = isEditor ? "Mesa editorial" : "Mis notas";
  document.querySelector("[data-account-role]").textContent = isOwner ? "Propietario" : isEditor ? "Editor" : "Autor";
  document.querySelector("[data-desk-label]").innerHTML = isOwner ? "Dirección editorial<br>Control total" : isEditor ? "Mesa editorial<br>Material enviado" : "Mesa de autores<br>Solo material propio";
  document.querySelector("[data-empty-title]").textContent = isEditor ? "La bandeja está limpia." : "Una hoja en blanco también muerde.";
  document.querySelector("[data-empty-copy]").textContent = isEditor
    ? "Revisá envíos o creá un artículo propio para el Archivo. Los borradores ajenos siguen siendo privados."
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
  if (statusFilter.value === "trash") return notes.filter((note) => note.deleted_at);
  const activeNotes = notes.filter((note) => !note.deleted_at);
  if (statusFilter.value === "all") return activeNotes;
  return activeNotes.filter((note) => note.status === statusFilter.value);
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
    status.textContent = note.deleted_at ? "Papelera" : formatStatus(note.status);
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
  ["title", "excerpt", "category", "byline", "content"].forEach((name) => { editorForm.elements[name].disabled = disabled; });
  richEditor.contentEditable = disabled ? "false" : "true";
  richEditor.classList.toggle("is-disabled", disabled);
}

function canTrashNote(note) {
  if (!note || note.deleted_at) return false;
  if (accountIsEditor()) return note.status !== "draft" || note.author_id === session.user.id;
  return note.author_id === session.user.id && ["draft", "rejected"].includes(note.status);
}

function trashDaysRemaining(deletedAt) {
  const expiresAt = new Date(deletedAt).getTime() + 10 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

function openNote(note) {
  clearTimeout(autosaveTimer);
  workDirty = false;
  editRevision = 0;
  activeNote = note;
  const isEditor = accountIsEditor();
  const isDeleted = Boolean(note.deleted_at);
  const authorCanEdit = !isDeleted && (note.status === "draft" || note.status === "rejected");
  editorEmpty.hidden = true;
  editorForm.hidden = false;
  editorForm.elements.title.value = note.title || "";
  editorForm.elements.excerpt.value = note.excerpt || "";
  editorForm.elements.category.value = note.category || "relato";
  editorForm.elements.byline.value = note.byline || "";
  editorForm.elements.destination_archive.checked = note.destination === "archive";
  editorForm.elements.content.value = note.content || "";
  richEditor.innerHTML = window.FE_DE_RATAS_RENDER_MARKDOWN(note.content || "");
  editorForm.elements.hero_image_url.value = note.hero_image_url || "";
  editorForm.elements.hero_image_alt.value = note.hero_image_alt || "";
  editorForm.elements.slug.value = note.slug || "";
  editorForm.elements.editorial_notes.value = note.editorial_notes || "";
  setFormDisabled(isDeleted || (!isEditor && !authorCanEdit));
  editorForm.elements.slug.disabled = !isEditor || isDeleted;
  editorForm.elements.editorial_notes.disabled = !isEditor || isDeleted;
  editorForm.elements.destination_archive.disabled = !isEditor || isDeleted;
  editorForm.elements.hero_image_alt.disabled = !isEditor || isDeleted;
  imageInput.disabled = !isEditor || isDeleted;
  renderImagePreview(note.hero_image_url || "", note.hero_image_alt || "");
  lockedMessage.hidden = isDeleted || isEditor || authorCanEdit;
  const trashMessage = document.querySelector("[data-trash-message]");
  trashMessage.hidden = !isDeleted;
  document.querySelector("[data-trash-countdown]").textContent = isDeleted
    ? `Se eliminará automáticamente en ${trashDaysRemaining(note.deleted_at)} días.`
    : "";
  document.querySelector("[data-note-status]").textContent = formatStatus(note.status);
  document.querySelector("[data-note-author]").textContent = note.author_email || `Autor ${note.author_id.slice(0, 8)}`;
  const feedback = document.querySelector("[data-author-feedback]");
  feedback.hidden = isEditor || !note.editorial_notes;
  document.querySelector("[data-author-feedback-text]").textContent = note.editorial_notes || "";
  document.querySelector("[data-author-actions]").hidden = isDeleted || isEditor || !authorCanEdit;
  document.querySelector("[data-editor-actions]").hidden = isDeleted || !isEditor;
  document.querySelector("[data-review-note]").hidden = !isEditor || note.status === "submitted";
  document.querySelector("[data-trash-note]").hidden = !canTrashNote(note);
  document.querySelector("[data-restore-note]").hidden = !isDeleted;
  setEditorMessage(isDeleted ? "En papelera" : isEditor ? "Edición abierta" : authorCanEdit ? "Borrador abierto" : "Solo lectura");
  updateWordCount();
  showBackupRecovery(note);
  renderNotes();
}

const noteSelection = "id,author_id,author_email,title,excerpt,content,category,byline,destination,hero_image_url,hero_image_alt,deleted_at,status,slug,editorial_notes,created_at,updated_at,submitted_at,published_at,reviewed_at";

async function loadNotes() {
  notes = await api(`notes?select=${noteSelection}&order=updated_at.desc`);
  renderNotes();
}

async function createNote() {
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
  syncEditorSource();
  const data = new FormData(editorForm);
  return {
    title: String(data.get("title") || "").trim(),
    excerpt: String(data.get("excerpt") || "").trim(),
    category: String(data.get("category") || "relato"),
    byline: String(data.get("byline") || "").trim(),
    content: String(data.get("content") || "").trim(),
    status
  };
}

function editorialPayload(status = activeNote.status) {
  syncEditorSource();
  const data = new FormData(editorForm);
  const title = String(data.get("title") || "").trim();
  return {
    title,
    excerpt: String(data.get("excerpt") || "").trim(),
    category: String(data.get("category") || "relato"),
    byline: String(data.get("byline") || "").trim(),
    destination: data.get("destination_archive") === "on" ? "archive" : "section",
    hero_image_url: String(data.get("hero_image_url") || "").trim(),
    hero_image_alt: String(data.get("hero_image_alt") || "").trim(),
    content: String(data.get("content") || "").trim(),
    editorial_notes: String(data.get("editorial_notes") || "").trim(),
    slug: slugify(String(data.get("slug") || "").trim() || title),
    status
  };
}

async function updateActiveNote(payload, message) {
  clearTimeout(autosaveTimer);
  const updated = await api(`notes?id=eq.${encodeURIComponent(activeNote.id)}&select=${noteSelection}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  if (!updated?.length) throw new Error("La nota cambió o ya no tenés permiso para editarla.");
  activeNote = updated[0];
  workDirty = false;
  clearBackup(activeNote.id);
  document.querySelector("[data-local-recovery]").hidden = true;
  notes = notes.map((note) => note.id === activeNote.id ? activeNote : note).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  openNote(activeNote);
  setEditorMessage(message);
}

async function autosaveDraft() {
  if (autosaveRunning || !activeNote || activeNote.deleted_at || activeNote.status !== "draft") return;
  autosaveRunning = true;
  const noteId = activeNote.id;
  const savedRevision = editRevision;
  try {
    const payload = accountIsEditor() ? editorialPayload("draft") : authorPayload("draft");
    const updated = await api(`notes?id=eq.${encodeURIComponent(noteId)}&select=${noteSelection}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
    if (!updated?.length) throw new Error("No hubo confirmación del guardado.");
    notes = notes.map((note) => note.id === noteId ? updated[0] : note);
    if (activeNote?.id === noteId) activeNote = updated[0];
    const fullySaved = editRevision === savedRevision;
    if (fullySaved) {
      workDirty = false;
      clearBackup(noteId);
    }
    renderNotes();
    setEditorMessage(fullySaved ? "Borrador guardado automáticamente" : "Hay cambios nuevos protegidos localmente");
  } catch {
    setEditorMessage("Sin conexión: la copia local sigue protegida");
  } finally {
    autosaveRunning = false;
    if (workDirty && activeNote?.id === noteId && activeNote.status === "draft") {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(autosaveDraft, 1800);
    }
  }
}

function protectCurrentWork() {
  workDirty = true;
  editRevision += 1;
  saveLocalBackup();
  clearTimeout(autosaveTimer);
  if (activeNote?.status === "draft" && !activeNote.deleted_at) {
    autosaveTimer = setTimeout(autosaveDraft, 1800);
  }
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
  if (status === "published" && payload.hero_image_url && !payload.hero_image_alt) throw new Error("Agregá una descripción para la imagen antes de publicar.");
  if (status === "rejected" && !payload.editorial_notes) throw new Error("Escribí una observación antes de devolverla.");
  setEditorMessage(status === "published" ? "Publicando…" : status === "rejected" ? "Devolviendo…" : "Guardando correcciones…");
  const message = status === "published" ? "Marcada como publicada." : status === "rejected" ? "Devuelta al autor con observaciones." : status === "submitted" ? "Devuelta a la cola de edición." : "Correcciones guardadas.";
  await updateActiveNote(payload, message);
}

async function moveActiveNoteToTrash() {
  if (!canTrashNote(activeNote)) return;
  const payload = accountIsEditor()
    ? { ...editorialPayload(activeNote.status), deleted_at: new Date().toISOString() }
    : { ...authorPayload("draft"), deleted_at: new Date().toISOString() };
  await updateActiveNote(payload, "Movida a la papelera. Podés restaurarla durante 10 días.");
}

async function restoreActiveNote() {
  if (!activeNote?.deleted_at) return;
  await updateActiveNote({ deleted_at: null }, "Nota restaurada.");
}

function updateWordCount() {
  const content = editorForm.elements.content.value.trim();
  const count = content ? content.split(/\s+/).length : 0;
  document.querySelector("[data-word-count]").textContent = `${count} ${count === 1 ? "palabra" : "palabras"}`;
}

function syncEditorSource() {
  editorForm.elements.content.value = window.FE_DE_RATAS_HTML_TO_MARKDOWN(richEditor.innerHTML);
}

function renderImagePreview(url, alt) {
  const wrap = document.querySelector("[data-image-preview-wrap]");
  const image = document.querySelector("[data-image-preview]");
  wrap.hidden = !url;
  image.src = url || "";
  image.alt = alt || "Vista previa de la imagen principal";
}

function refreshPreview() {
  const data = new FormData(editorForm);
  const content = String(data.get("content") || "");
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const category = String(data.get("category") || "Artículo");
  document.querySelector("[data-preview-category]").textContent = data.get("destination_archive") === "on" ? `Archivo · ${category}` : category;
  document.querySelector("[data-preview-title]").textContent = String(data.get("title") || "Artículo sin título");
  document.querySelector("[data-preview-excerpt]").textContent = String(data.get("excerpt") || "");
  document.querySelector("[data-preview-byline]").textContent = `Por ${String(data.get("byline") || "Redacción Fe de ratas")}`;
  document.querySelector("[data-preview-reading]").textContent = `${Math.max(1, Math.ceil(words / 220))} min de lectura`;
  document.querySelector("[data-preview-content]").innerHTML = window.FE_DE_RATAS_RENDER_MARKDOWN(content);
  const imageUrl = String(data.get("hero_image_url") || "");
  const imageAlt = String(data.get("hero_image_alt") || "");
  const hero = document.querySelector("[data-preview-hero]");
  hero.hidden = !imageUrl;
  document.querySelector("[data-preview-image]").src = imageUrl;
  document.querySelector("[data-preview-image]").alt = imageAlt;
  document.querySelector("[data-preview-image-caption]").textContent = imageAlt;
}

function applyFormat(format) {
  if (richEditor.contentEditable !== "true") return;
  richEditor.focus();
  if (format === "bold") document.execCommand("bold");
  if (format === "italic") document.execCommand("italic");
  if (format === "heading") document.execCommand("formatBlock", false, "h2");
  if (format === "quote") document.execCommand("formatBlock", false, "blockquote");
  if (format === "list") document.execCommand("insertUnorderedList");
  if (format === "link") {
    const url = window.prompt("Pegá la dirección del enlace (https://…)", "https://");
    if (url) document.execCommand("createLink", false, url);
  }
  syncEditorSource();
  updateWordCount();
  protectCurrentWork();
  if (!preview.hidden) refreshPreview();
}

async function uploadImage(file, retry = true) {
  if (!accountIsEditor()) throw new Error("Solo la mesa editorial puede subir imágenes.");
  if (!file.type.match(/^image\/(jpeg|png|webp|gif)$/)) throw new Error("Usá una imagen JPG, PNG, WebP o GIF.");
  if (file.size > 8 * 1024 * 1024) throw new Error("La imagen supera el máximo de 8 MB.");
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${session.user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${config.url}/storage/v1/object/article-images/${path}`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": file.type,
      "Cache-Control": "31536000"
    },
    body: file
  });
  if (response.status === 401 && retry) {
    await refreshSession();
    return uploadImage(file, false);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || payload.error || "No pudimos subir la imagen.");
  }
  return `${config.url}/storage/v1/object/public/article-images/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function teamRequest(body, retry = true) {
  if (!accountIsOwner()) throw new Error("Solo el propietario puede administrar el equipo.");
  const response = await fetch(`${config.url}/functions/v1/manage-team`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (response.status === 401 && retry) {
    await refreshSession();
    return teamRequest(body, false);
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No pudimos administrar el equipo.");
  return payload;
}

function roleLabel(role) {
  return { owner: "Propietario", editor: "Editor", author: "Autor" }[role] || "Autor";
}

function renderTeam(users) {
  teamList.replaceChildren();
  users.forEach((user) => {
    const row = document.createElement("article");
    row.className = "team-row";
    const identity = document.createElement("div");
    const email = document.createElement("strong");
    email.textContent = user.email || "Cuenta sin correo";
    const meta = document.createElement("small");
    meta.textContent = user.is_self ? "Tu cuenta · usuario principal" : `Alta: ${formatDate(user.created_at)}`;
    identity.append(email, meta);

    if (user.role === "owner") {
      const badge = document.createElement("b");
      badge.className = "role-chip owner-chip";
      badge.textContent = roleLabel(user.role);
      row.append(identity, badge);
    } else {
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Rol de ${user.email}`);
      [["author", "Autor"], ["editor", "Editor"]].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        option.selected = user.role === value;
        select.append(option);
      });
      select.addEventListener("change", async () => {
        select.disabled = true;
        teamMessage.textContent = "Cambiando permisos…";
        try {
          await teamRequest({ action: "update_role", user_id: user.id, role: select.value });
          teamMessage.textContent = `${user.email} ahora tiene rol de ${roleLabel(select.value).toLowerCase()}. El cambio se verá en su próximo inicio de sesión.`;
        } catch (error) {
          select.value = user.role;
          teamMessage.textContent = error.message;
        } finally {
          select.disabled = false;
        }
      });
      row.append(identity, select);
    }
    teamList.append(row);
  });
}

async function loadTeam() {
  teamMessage.textContent = "Revisando la lista…";
  const { users } = await teamRequest({ action: "list_users" });
  renderTeam(users);
  teamMessage.textContent = `${users.length} ${users.length === 1 ? "cuenta" : "cuentas"} en la redacción.`;
}

async function openTeam() {
  if (!accountIsOwner()) return;
  editorPanel.hidden = true;
  teamPanel.hidden = false;
  await loadTeam();
}

function closeTeam() {
  teamPanel.hidden = true;
  editorPanel.hidden = false;
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
  if (workDirty) saveLocalBackup();
  try { await authRequest("logout", null, session?.access_token); } catch { /* The local session is still cleared. */ }
  writeSession(null);
  notes = [];
  activeNote = null;
  editorForm.hidden = true;
  editorEmpty.hidden = false;
  teamPanel.hidden = true;
  editorPanel.hidden = false;
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
document.querySelector("[data-team-open]").addEventListener("click", () => openTeam().catch((error) => { teamMessage.textContent = error.message; }));
document.querySelector("[data-team-close]").addEventListener("click", closeTeam);
document.querySelector("[data-invite-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector("button");
  submit.disabled = true;
  teamMessage.textContent = "Enviando invitación…";
  try {
    const email = new FormData(form).get("email");
    await teamRequest({ action: "invite_user", email });
    form.reset();
    await loadTeam();
    teamMessage.textContent = `Invitación enviada a ${email}. La cuenta ingresará como autora.`;
  } catch (error) {
    teamMessage.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
statusFilter.addEventListener("change", renderNotes);
richEditor.addEventListener("input", () => {
  syncEditorSource();
  updateWordCount();
});
richEditor.addEventListener("paste", (event) => {
  event.preventDefault();
  document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
});
editorForm.addEventListener("input", () => {
  protectCurrentWork();
  if (!preview.hidden) refreshPreview();
});
document.querySelectorAll("[data-format]").forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => applyFormat(button.dataset.format));
});
imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  imageInput.disabled = true;
  imageUploadState.textContent = "Subiendo imagen…";
  try {
    const url = await uploadImage(file);
    editorForm.elements.hero_image_url.value = url;
    renderImagePreview(url, editorForm.elements.hero_image_alt.value);
    imageUploadState.textContent = "Imagen lista. Se guardará junto con el artículo.";
    protectCurrentWork();
    if (!preview.hidden) refreshPreview();
  } catch (error) {
    imageUploadState.textContent = error.message;
  } finally {
    imageInput.disabled = false;
    imageInput.value = "";
  }
});
editorForm.elements.hero_image_alt.addEventListener("input", () => {
  renderImagePreview(editorForm.elements.hero_image_url.value, editorForm.elements.hero_image_alt.value);
});
document.querySelector("[data-image-remove]").addEventListener("click", () => {
  editorForm.elements.hero_image_url.value = "";
  editorForm.elements.hero_image_alt.value = "";
  renderImagePreview("", "");
  imageUploadState.textContent = "Imagen quitada del artículo.";
  protectCurrentWork();
  if (!preview.hidden) refreshPreview();
});
document.querySelector("[data-preview-toggle]").addEventListener("click", (event) => {
  syncEditorSource();
  preview.hidden = !preview.hidden;
  event.currentTarget.textContent = preview.hidden ? "Ver vista previa" : "Cerrar vista previa";
  if (!preview.hidden) refreshPreview();
});
document.querySelector("[data-trash-note]").addEventListener("click", () => {
  if (window.confirm("¿Mover esta nota a la papelera? Se ocultará del sitio y se eliminará definitivamente dentro de 10 días.")) {
    moveActiveNoteToTrash().catch((error) => setEditorMessage(error.message));
  }
});
document.querySelector("[data-restore-note]").addEventListener("click", () => {
  restoreActiveNote().catch((error) => setEditorMessage(error.message));
});
document.querySelector("[data-local-restore]").addEventListener("click", () => {
  applyBackup(readBackup(activeNote?.id));
  protectCurrentWork();
});
document.querySelector("[data-local-discard]").addEventListener("click", () => {
  clearBackup(activeNote?.id);
  document.querySelector("[data-local-recovery]").hidden = true;
  setEditorMessage("Copia local descartada");
});
window.addEventListener("beforeunload", () => { if (workDirty) saveLocalBackup(); });
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
