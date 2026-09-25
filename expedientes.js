/* ============================================================
   EXPEDIENTES SYSTEM — DELGADO & AVELLANEDA
   Lógica completa del panel de administración
   ============================================================
   CONFIGURACIÓN REQUERIDA:
   Reemplaza SUPABASE_URL y SUPABASE_ANON_KEY con los valores
   de tu proyecto en Supabase → Project Settings → API
   ============================================================ */

const SUPABASE_URL      = 'TU_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'TU_SUPABASE_ANON_KEY';

// === INIT SUPABASE CLIENT ===
const { createClient } = window.supabase;
let db = null;

try {
  db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.warn('Supabase no inicializado. Configura SUPABASE_URL y SUPABASE_ANON_KEY en expedientes.js');
}

// === STATE ===
const State = {
  user:                  null,
  profile:               null,
  expedientes:           [],
  currentExpediente:     null,
  archivos:              [],
  view:                  'grid',
  searchQuery:           '',
  isLoading:             false,
  selectedFile:          null,
  currentSignatureArchivoId: null,
  signaturePad: {
    isDrawing: false,
    isEmpty:   true,
    ctx:       null,
    canvas:    null,
  },
};

// ============================================================
// UTILIDADES
// ============================================================

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function getFileExtension(filename) {
  if (!filename) return '';
  return filename.split('.').pop().toLowerCase();
}

function getFileColor(ext) {
  const map = {
    pdf:  '#EF4444',
    doc:  '#3B82F6', docx: '#3B82F6',
    xls:  '#10B981', xlsx: '#10B981',
    ppt:  '#F97316', pptx: '#F97316',
    jpg:  '#8B5CF6', jpeg: '#8B5CF6',
    png:  '#8B5CF6', gif:  '#8B5CF6', webp: '#8B5CF6',
    mp4:  '#F59E0B', avi:  '#F59E0B', mov:  '#F59E0B',
    mp3:  '#EC4899', wav:  '#EC4899',
    zip:  '#6B7280', rar:  '#6B7280',
  };
  return map[ext] || '#6366F1';
}

function getFileSVGIcon(ext, size = 32) {
  const color = getFileColor(ext);
  const label = (ext || 'FILE').toUpperCase().substring(0, 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="${color}"/>
    <polyline points="14 2 14 8 20 8" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
    <text x="5.5" y="18.5" font-family="system-ui,sans-serif" font-size="4.2" fill="white" font-weight="800">${label}</text>
  </svg>`;
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._\-áéíóúÁÉÍÓÚñÑ]/g, '_');
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    error:   `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-show'));
  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================
// AUTH
// ============================================================

async function loginUser(email, password) {
  if (!db) { showToast('Supabase no configurado', 'error'); return; }

  const errorEl  = document.getElementById('login-error');
  const submitBtn = document.querySelector('#login-form .btn-login');

  errorEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Iniciando sesión...';

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;

    State.user = data.user;

    const { data: profile } = await db
      .from('profiles').select('*').eq('id', data.user.id).single();
    State.profile = profile;

    hideLoginModal();
    showDashboard();
    showToast(`Bienvenido, ${profile?.full_name || email.split('@')[0]}`, 'success');

  } catch (err) {
    errorEl.textContent = err.message.includes('Invalid login credentials')
      ? 'Correo o contraseña incorrectos'
      : err.message;
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Iniciar Sesión';
  }
}

async function logoutUser() {
  if (db) await db.auth.signOut();
  State.user    = null;
  State.profile = null;
  State.currentExpediente = null;
  State.expedientes = [];
  State.archivos    = [];
  hideDashboard();
  showToast('Sesión cerrada', 'info');
}

async function checkAuthState() {
  if (!db) return;
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    State.user = session.user;
    const { data: profile } = await db
      .from('profiles').select('*').eq('id', session.user.id).single();
    State.profile = profile;
    showDashboard();
  }
}

// ============================================================
// EXPEDIENTES CRUD
// ============================================================

async function loadExpedientes() {
  if (!db) return;
  setContentLoading(true);

  try {
    let query = db.from('expedientes')
      .select('*')
      .order('updated_at', { ascending: false });

    if (State.searchQuery) {
      query = query.or(
        `nombre.ilike.%${State.searchQuery}%,` +
        `cliente.ilike.%${State.searchQuery}%,` +
        `numero_radicado.ilike.%${State.searchQuery}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    State.expedientes = data || [];
    renderExpedientesList();

  } catch (err) {
    showToast('Error al cargar expedientes: ' + err.message, 'error');
    setContentLoading(false);
  }
}

async function createExpediente(formData) {
  try {
    const { data, error } = await db.from('expedientes')
      .insert({ ...formData, created_by: State.user.id })
      .select().single();
    if (error) throw error;

    State.expedientes.unshift(data);
    renderExpedientesList();
    hideExpedienteModal();
    showToast('Expediente creado exitosamente', 'success');
  } catch (err) {
    showToast('Error al crear expediente: ' + err.message, 'error');
  }
}

async function updateExpediente(id, formData) {
  try {
    const { data, error } = await db.from('expedientes')
      .update(formData).eq('id', id).select().single();
    if (error) throw error;

    const idx = State.expedientes.findIndex(e => e.id === id);
    if (idx !== -1) State.expedientes[idx] = data;
    if (State.currentExpediente?.id === id) State.currentExpediente = data;

    renderExpedientesList();
    hideExpedienteModal();
    updateBreadcrumb();
    showToast('Expediente actualizado', 'success');
  } catch (err) {
    showToast('Error al actualizar: ' + err.message, 'error');
  }
}

async function deleteExpediente(id, nombre) {
  if (!confirm(`¿Eliminar el expediente "${nombre}" y TODOS sus archivos?\n\nEsta acción NO se puede deshacer.`)) return;

  try {
    // Borrar archivos del storage
    const { data: archivos } = await db.from('archivos').select('storage_path,firma_storage_path').eq('expediente_id', id);
    if (archivos?.length) {
      const paths = archivos.map(a => a.storage_path);
      await db.storage.from('expedientes-archivos').remove(paths);
      const firmas = archivos.filter(a => a.firma_storage_path).map(a => a.firma_storage_path);
      if (firmas.length) await db.storage.from('firmas').remove(firmas);
    }

    const { error } = await db.from('expedientes').delete().eq('id', id);
    if (error) throw error;

    State.expedientes = State.expedientes.filter(e => e.id !== id);
    if (State.currentExpediente?.id === id) {
      State.currentExpediente = null;
    }
    renderExpedientesList();
    showToast('Expediente eliminado', 'info');

  } catch (err) {
    showToast('Error al eliminar: ' + err.message, 'error');
  }
}

// ============================================================
// ARCHIVOS CRUD
// ============================================================

async function loadArchivos(expedienteId) {
  if (!db) return;
  setContentLoading(true);

  try {
    let query = db.from('archivos')
      .select('*')
      .eq('expediente_id', expedienteId)
      .order('created_at', { ascending: false });

    if (State.searchQuery) {
      query = query.ilike('nombre', `%${State.searchQuery}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    State.archivos = data || [];
    renderArchivosList();

  } catch (err) {
    showToast('Error al cargar archivos: ' + err.message, 'error');
    setContentLoading(false);
  }
}

async function uploadArchivos(files, expedienteId) {
  const uploadProgress = document.getElementById('upload-progress');
  const progressBar    = document.getElementById('progress-bar');
  const progressText   = document.getElementById('progress-text');

  uploadProgress.classList.remove('hidden');
  let uploaded = 0;

  for (const file of files) {
    if (file.size > 100 * 1024 * 1024) {
      showToast(`${file.name} supera el límite de 100MB`, 'warning');
      continue;
    }
    try {
      progressText.textContent = `Subiendo ${file.name}… (${uploaded + 1}/${files.length})`;

      const ext         = getFileExtension(file.name);
      const safeName    = sanitizeFilename(file.name);
      const storagePath = `${expedienteId}/${Date.now()}_${safeName}`;

      const { error: upErr } = await db.storage
        .from('expedientes-archivos')
        .upload(storagePath, file, { upsert: false });
      if (upErr) throw upErr;

      const { data: archivoDB, error: dbErr } = await db.from('archivos')
        .insert({
          expediente_id:   expedienteId,
          nombre:          file.name,
          nombre_original: file.name,
          storage_path:    storagePath,
          tipo_mime:       file.type,
          extension:       ext,
          tamano:          file.size,
          uploaded_by:     State.user.id,
        }).select().single();
      if (dbErr) throw dbErr;

      State.archivos.unshift(archivoDB);
      uploaded++;
      progressBar.style.width = `${(uploaded / files.length) * 100}%`;

    } catch (err) {
      showToast(`Error al subir ${file.name}: ${err.message}`, 'error');
    }
  }

  setTimeout(() => {
    uploadProgress.classList.add('hidden');
    progressBar.style.width = '0%';
  }, 800);

  renderArchivosList();
  if (uploaded > 0) {
    await db.from('expedientes')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', expedienteId);
    showToast(`${uploaded} archivo(s) subido(s) exitosamente`, 'success');
  }
}

async function downloadArchivo(archivo) {
  if (!archivo) return;
  try {
    const { data, error } = await db.storage
      .from('expedientes-archivos')
      .createSignedUrl(archivo.storage_path, 60);
    if (error) throw error;

    const a = document.createElement('a');
    a.href     = data.signedUrl;
    a.download = archivo.nombre_original || archivo.nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showToast(`Descargando ${archivo.nombre}`, 'info');
  } catch (err) {
    showToast('Error al descargar: ' + err.message, 'error');
  }
}

async function deleteArchivo(archivo) {
  if (!archivo) return;
  if (!confirm(`¿Eliminar "${archivo.nombre}"?\nEsta acción NO se puede deshacer.`)) return;

  try {
    await db.storage.from('expedientes-archivos').remove([archivo.storage_path]);
    if (archivo.firma_storage_path) {
      await db.storage.from('firmas').remove([archivo.firma_storage_path]);
    }

    const { error } = await db.from('archivos').delete().eq('id', archivo.id);
    if (error) throw error;

    State.archivos = State.archivos.filter(a => a.id !== archivo.id);
    if (State.selectedFile?.id === archivo.id) closePreviewModal();
    renderArchivosList();
    showToast('Archivo eliminado', 'info');

  } catch (err) {
    showToast('Error al eliminar: ' + err.message, 'error');
  }
}

async function updateArchivoNotas(archivoId, notas) {
  try {
    await db.from('archivos').update({ notas }).eq('id', archivoId);
    const idx = State.archivos.findIndex(a => a.id === archivoId);
    if (idx !== -1) State.archivos[idx].notas = notas;
    if (State.selectedFile?.id === archivoId) State.selectedFile.notas = notas;
    showToast('Notas guardadas', 'success');
  } catch (err) {
    showToast('Error al guardar notas: ' + err.message, 'error');
  }
}

async function previewArchivo(archivo) {
  if (!archivo || !archivo.id) return;
  State.selectedFile = archivo;

  const modal       = document.getElementById('preview-modal');
  const titleEl     = document.getElementById('preview-title');
  const contentEl   = document.getElementById('preview-content');
  const metaEl      = document.getElementById('preview-meta');
  const firmaStatus = document.getElementById('preview-firma-status');
  const notesInput  = document.getElementById('preview-notes');

  titleEl.textContent = archivo.nombre;
  metaEl.innerHTML = '';
  notesInput.value = archivo.notas || '';
  contentEl.innerHTML = `
    <div class="preview-loading">
      <div class="spinner-large"></div>
      <p>Cargando vista previa…</p>
    </div>`;

  if (archivo.firmado) {
    firmaStatus.innerHTML = `<span class="badge-firmado">✓ Firmado digitalmente</span>`;
    firmaStatus.classList.remove('hidden');
  } else {
    firmaStatus.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  try {
    const { data, error } = await db.storage
      .from('expedientes-archivos')
      .createSignedUrl(archivo.storage_path, 3600);
    if (error) throw error;
    const url = data.signedUrl;

    const ext = archivo.extension || getFileExtension(archivo.nombre);
    metaEl.innerHTML = `
      <span>${formatFileSize(archivo.tamano || 0)}</span>
      <span>•</span>
      <span>${formatDate(archivo.created_at)}</span>
      ${ext ? `<span>•</span><span>.${ext.toUpperCase()}</span>` : ''}
    `;

    const imageExts = ['jpg','jpeg','png','gif','webp','svg','bmp'];
    const videoExts = ['mp4','webm','ogg','mov','avi'];
    const audioExts = ['mp3','wav','ogg','aac','m4a'];

    if (ext === 'pdf') {
      contentEl.innerHTML = `<iframe src="${url}" class="preview-iframe" title="${escapeAttr(archivo.nombre)}"></iframe>`;
    } else if (imageExts.includes(ext)) {
      contentEl.innerHTML = `<img src="${url}" class="preview-image" alt="${escapeAttr(archivo.nombre)}">`;
    } else if (videoExts.includes(ext)) {
      contentEl.innerHTML = `<video controls class="preview-video"><source src="${url}" type="${archivo.tipo_mime || 'video/mp4'}">Tu navegador no soporta video.</video>`;
    } else if (audioExts.includes(ext)) {
      contentEl.innerHTML = `
        <div class="preview-audio-wrap">
          <div class="preview-audio-icon">🎵</div>
          <p>${escapeAttr(archivo.nombre)}</p>
          <audio controls><source src="${url}" type="${archivo.tipo_mime || 'audio/mpeg'}"></audio>
        </div>`;
    } else {
      contentEl.innerHTML = `
        <div class="preview-no-preview">
          <div class="preview-file-icon">${getFileSVGIcon(ext, 64)}</div>
          <h4>${escapeAttr(archivo.nombre)}</h4>
          <p>Vista previa no disponible para este tipo de archivo</p>
          <button class="btn-download-preview" id="preview-no-preview-dl">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar archivo
          </button>
        </div>`;
      document.getElementById('preview-no-preview-dl')
        ?.addEventListener('click', () => downloadArchivo(State.selectedFile));
    }
  } catch (err) {
    contentEl.innerHTML = `<div class="preview-no-preview"><p style="color:#f87171">Error al cargar vista previa</p></div>`;
    showToast('Error al obtener URL: ' + err.message, 'error');
  }
}

function closePreviewModal() {
  document.getElementById('preview-modal').classList.add('hidden');
  document.body.style.overflow = '';
  State.selectedFile = null;
}

// ============================================================
// FIRMA DIGITAL
// ============================================================

function showSignatureModal(archivoId) {
  State.currentSignatureArchivoId = archivoId;
  document.getElementById('signature-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(initSignaturePad, 80);
}

function hideSignatureModal() {
  document.getElementById('signature-modal').classList.add('hidden');
  document.body.style.overflow = '';
  State.currentSignatureArchivoId = null;
}

function initSignaturePad() {
  const canvas = document.getElementById('signature-canvas');
  if (!canvas) return;

  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a3e';
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  State.signaturePad.ctx     = ctx;
  State.signaturePad.canvas  = canvas;
  State.signaturePad.isEmpty = true;

  // Mouse
  canvas.onmousedown = (e) => {
    State.signaturePad.isDrawing = true;
    State.signaturePad.isEmpty   = false;
    const r = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
  };
  canvas.onmousemove = (e) => {
    if (!State.signaturePad.isDrawing) return;
    const r = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
    ctx.stroke();
  };
  canvas.onmouseup    = () => { State.signaturePad.isDrawing = false; };
  canvas.onmouseleave = () => { State.signaturePad.isDrawing = false; };

  // Touch
  canvas.ontouchstart = (e) => {
    e.preventDefault();
    State.signaturePad.isDrawing = true;
    State.signaturePad.isEmpty   = false;
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    ctx.beginPath();
    ctx.moveTo(t.clientX - r.left, t.clientY - r.top);
  };
  canvas.ontouchmove = (e) => {
    e.preventDefault();
    if (!State.signaturePad.isDrawing) return;
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    ctx.lineTo(t.clientX - r.left, t.clientY - r.top);
    ctx.stroke();
  };
  canvas.ontouchend = () => { State.signaturePad.isDrawing = false; };
}

function clearSignature() {
  const { canvas, ctx } = State.signaturePad;
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  State.signaturePad.isEmpty = true;
}

async function saveSignature() {
  if (State.signaturePad.isEmpty) {
    showToast('Por favor dibuja tu firma primero', 'warning');
    return;
  }
  const archivoId = State.currentSignatureArchivoId;
  if (!archivoId) return;

  const saveBtn = document.getElementById('save-signature-btn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span> Guardando…';

  try {
    const canvas = State.signaturePad.canvas;
    const blob   = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

    const firmaPath = `${archivoId}_${Date.now()}.png`;
    const { error: upErr } = await db.storage
      .from('firmas')
      .upload(firmaPath, blob, { contentType: 'image/png', upsert: true });
    if (upErr) throw upErr;

    const { error: dbErr } = await db.from('archivos').update({
      firmado:            true,
      firma_storage_path: firmaPath,
      firmado_por:        State.user.id,
      firmado_at:         new Date().toISOString(),
    }).eq('id', archivoId);
    if (dbErr) throw dbErr;

    const idx = State.archivos.findIndex(a => a.id === archivoId);
    if (idx !== -1) {
      State.archivos[idx].firmado = true;
      State.archivos[idx].firma_storage_path = firmaPath;
    }
    if (State.selectedFile?.id === archivoId) State.selectedFile.firmado = true;

    renderArchivosList();
    hideSignatureModal();
    showToast('Firma digital guardada exitosamente', 'success');

  } catch (err) {
    showToast('Error al guardar firma: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      Guardar Firma`;
  }
}

// ============================================================
// UI — DASHBOARD
// ============================================================

function showDashboard() {
  const dashboard = document.getElementById('dashboard');
  dashboard.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const profile = State.profile;
  if (profile) {
    const initials = (profile.full_name || profile.email || 'A')
      .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    document.getElementById('sidebar-user-avatar').textContent = initials;
    document.getElementById('sidebar-user-name').textContent   = profile.full_name || profile.email.split('@')[0];
  }

  setActiveNav('expedientes');
  setActionButton('new-exp');
  loadExpedientes();
}

function hideDashboard() {
  document.getElementById('dashboard').classList.add('hidden');
  document.body.style.overflow = '';
}

function setActiveNav(view) {
  document.querySelectorAll('.exp-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
}

function setContentLoading(loading) {
  if (!loading) return;
  document.getElementById('exp-content').innerHTML = `
    <div class="loading-state">
      <div class="spinner-large"></div>
      <p>Cargando…</p>
    </div>`;
}

function updateBreadcrumb() {
  const el = document.getElementById('exp-breadcrumb');
  if (State.currentExpediente) {
    el.innerHTML = `
      <button class="breadcrumb-btn" onclick="backToExpedientes()">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Expedientes
      </button>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${escapeAttr(State.currentExpediente.nombre)}</span>`;
  } else {
    el.innerHTML = `<span class="breadcrumb-current">Todos los Expedientes</span>`;
  }
}

function setActionButton(mode) {
  const btn = document.getElementById('action-btn');
  if (mode === 'new-exp') {
    btn.onclick = () => showExpedienteModal();
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Nuevo Expediente`;
  } else {
    btn.onclick = () => triggerFileUpload();
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Subir Archivos`;
  }
}

// ============================================================
// RENDER — EXPEDIENTES
// ============================================================

function renderExpedientesList() {
  const content = document.getElementById('exp-content');
  setActiveNav('expedientes');
  updateBreadcrumb();
  setActionButton('new-exp');

  const badge = (estado) => {
    const map = { activo: 'badge-activo', cerrado: 'badge-cerrado', archivado: 'badge-archivado' };
    const lbl = { activo: 'Activo', cerrado: 'Cerrado', archivado: 'Archivado' };
    return `<span class="${map[estado] || 'badge-activo'}">${lbl[estado] || estado}</span>`;
  };

  if (State.expedientes.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <h3>${State.searchQuery ? 'Sin resultados' : 'No hay expedientes'}</h3>
        <p>${State.searchQuery ? `No se encontró nada para "${escapeAttr(State.searchQuery)}"` : 'Crea tu primer expediente jurídico para comenzar'}</p>
        ${!State.searchQuery ? `<button class="btn-primary-action" onclick="showExpedienteModal()">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Crear Expediente</button>` : ''}
      </div>`;
    return;
  }

  if (State.view === 'grid') {
    content.innerHTML = `<div class="exp-grid">${State.expedientes.map(exp => `
      <div class="exp-card" onclick="openExpediente('${exp.id}')">
        <div class="exp-card-header">
          <div class="exp-card-folder-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>
          </div>
          ${badge(exp.estado)}
        </div>
        <div class="exp-card-body">
          <h3 class="exp-card-title">${escapeAttr(exp.nombre)}</h3>
          ${exp.cliente ? `<p class="exp-card-client">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            ${escapeAttr(exp.cliente)}</p>` : ''}
          ${exp.numero_radicado ? `<p class="exp-card-radicado">Rad. ${escapeAttr(exp.numero_radicado)}</p>` : ''}
          ${exp.descripcion ? `<p class="exp-card-desc">${escapeAttr(exp.descripcion).substring(0,90)}${exp.descripcion.length > 90 ? '…' : ''}</p>` : ''}
        </div>
        <div class="exp-card-footer">
          <span class="exp-card-date">${formatDate(exp.updated_at)}</span>
          <div class="exp-card-actions" onclick="event.stopPropagation()">
            <button class="icon-btn" title="Editar" onclick="showExpedienteModal('${exp.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn icon-btn-danger" title="Eliminar" onclick="deleteExpediente('${exp.id}','${escapeAttr(exp.nombre)}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>
      </div>`).join('')}</div>`;
  } else {
    content.innerHTML = `
      <div class="exp-list">
        <div class="exp-list-header">
          <span>Nombre</span><span>Cliente</span><span>Estado</span><span>Actualizado</span><span></span>
        </div>
        ${State.expedientes.map(exp => `
        <div class="exp-list-row" onclick="openExpediente('${exp.id}')">
          <span class="exp-list-name">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="#D4A847"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>
            ${escapeAttr(exp.nombre)}
          </span>
          <span class="exp-list-client">${escapeAttr(exp.cliente || '—')}</span>
          <span>${badge(exp.estado)}</span>
          <span class="exp-list-date">${formatDate(exp.updated_at)}</span>
          <span class="exp-list-actions" onclick="event.stopPropagation()">
            <button class="icon-btn" onclick="showExpedienteModal('${exp.id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn icon-btn-danger" onclick="deleteExpediente('${exp.id}','${escapeAttr(exp.nombre)}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </span>
        </div>`).join('')}
      </div>`;
  }
}

async function openExpediente(expedienteId) {
  const exp = State.expedientes.find(e => e.id === expedienteId);
  if (!exp) return;
  State.currentExpediente = exp;
  State.searchQuery = '';
  document.getElementById('exp-search-input').value = '';
  updateBreadcrumb();
  setActionButton('upload');
  await loadArchivos(expedienteId);
}

function backToExpedientes() {
  State.currentExpediente = null;
  State.searchQuery = '';
  document.getElementById('exp-search-input').value = '';
  setActionButton('new-exp');
  loadExpedientes();
}

// ============================================================
// RENDER — ARCHIVOS
// ============================================================

function renderArchivosList() {
  const content = document.getElementById('exp-content');

  const uploadAreaHTML = `
    <div class="upload-area">
      <input type="file" id="file-input" multiple style="display:none" onchange="handleFileInputChange(event)">
      <div class="upload-dropzone" id="upload-dropzone">
        <div class="upload-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <p class="upload-text">Arrastra archivos aquí o <button onclick="triggerFileUpload()" class="upload-link">selecciona archivos</button></p>
        <p class="upload-hint">Cualquier tipo de archivo • Máximo 100 MB por archivo</p>
      </div>
      <div class="upload-progress hidden" id="upload-progress">
        <div class="progress-bar-wrap"><div class="progress-bar" id="progress-bar"></div></div>
        <p class="progress-text" id="progress-text">Subiendo…</p>
      </div>
    </div>`;

  if (State.archivos.length === 0) {
    content.innerHTML = `${uploadAreaHTML}
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.8"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
        </div>
        <h3>${State.searchQuery ? 'Sin resultados' : 'Sin archivos'}</h3>
        <p>${State.searchQuery ? `No se encontró "${escapeAttr(State.searchQuery)}"` : 'Sube el primer archivo a este expediente'}</p>
      </div>`;
    setupDragDrop();
    return;
  }

  const renderCard = (a) => {
    const ext   = a.extension || getFileExtension(a.nombre);
    const icon  = getFileSVGIcon(ext, 32);
    const color = getFileColor(ext);
    const id    = a.id;

    if (State.view === 'grid') {
      return `
        <div class="file-card" onclick="previewArchivoById('${id}')">
          <div class="file-card-icon" style="background:${color}18">
            ${icon}
            ${a.firmado ? '<span class="file-signed-badge">✓</span>' : ''}
          </div>
          <div>
            <p class="file-card-name" title="${escapeAttr(a.nombre)}">${escapeAttr(a.nombre)}</p>
            <p class="file-card-meta">${formatFileSize(a.tamano)} • ${formatDate(a.created_at)}</p>
            ${a.notas ? `<p class="file-card-notes">${escapeAttr(a.notas.substring(0,60))}…</p>` : ''}
          </div>
          <div class="file-card-actions" onclick="event.stopPropagation()">
            <button class="icon-btn" title="Vista previa" onclick="previewArchivoById('${id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="icon-btn" title="Descargar" onclick="downloadArchivoById('${id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="icon-btn" title="Firma digital" onclick="showSignatureModal('${id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
            </button>
            <button class="icon-btn icon-btn-danger" title="Eliminar" onclick="deleteArchivoById('${id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </div>`;
    } else {
      return `
        <div class="file-list-row" onclick="previewArchivoById('${id}')">
          <span class="file-list-icon">${getFileSVGIcon(ext, 20)}</span>
          <span class="file-list-name">${escapeAttr(a.nombre)}${a.firmado ? '<span class="badge-firmado-sm">✓ Firmado</span>' : ''}</span>
          <span class="file-list-size">${formatFileSize(a.tamano)}</span>
          <span class="file-list-date">${formatDate(a.created_at)}</span>
          <span class="file-list-actions" onclick="event.stopPropagation()">
            <button class="icon-btn" onclick="previewArchivoById('${id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="icon-btn" onclick="downloadArchivoById('${id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="icon-btn" onclick="showSignatureModal('${id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
            </button>
            <button class="icon-btn icon-btn-danger" onclick="deleteArchivoById('${id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </span>
        </div>`;
    }
  };

  if (State.view === 'grid') {
    content.innerHTML = `${uploadAreaHTML}<div class="files-grid">${State.archivos.map(renderCard).join('')}</div>`;
  } else {
    content.innerHTML = `${uploadAreaHTML}
      <div class="files-list-wrap">
        <div class="file-list-header">
          <span></span><span>Nombre</span><span>Tamaño</span><span>Fecha</span><span>Acciones</span>
        </div>
        ${State.archivos.map(renderCard).join('')}
      </div>`;
  }
  setupDragDrop();
}

// Helpers para llamadas por ID desde HTML inline
function previewArchivoById(id)  { previewArchivo(State.archivos.find(a => a.id === id)); }
function downloadArchivoById(id) { downloadArchivo(State.archivos.find(a => a.id === id)); }
function deleteArchivoById(id)   { deleteArchivo(State.archivos.find(a => a.id === id)); }

// ============================================================
// FILE UPLOAD
// ============================================================

function triggerFileUpload() {
  document.getElementById('file-input')?.click();
}

function handleFileInputChange(event) {
  const files = Array.from(event.target.files);
  if (files.length && State.currentExpediente) {
    uploadArchivos(files, State.currentExpediente.id);
    event.target.value = '';
  }
}

function setupDragDrop() {
  const dropzone = document.getElementById('upload-dropzone');
  if (!dropzone || !State.currentExpediente) return;

  dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadArchivos(files, State.currentExpediente.id);
  });
}

// ============================================================
// MODALS
// ============================================================

function showLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('login-email')?.focus(), 120);
}

function hideLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
  document.body.style.overflow = '';
  document.getElementById('login-error').classList.add('hidden');
}

function showExpedienteModal(expedienteId = null) {
  const modal    = document.getElementById('expediente-modal');
  const title    = document.getElementById('exp-modal-title');
  const delBtn   = document.getElementById('exp-modal-delete');
  const form     = document.getElementById('expediente-form');
  form.reset();
  modal.dataset.editId = '';

  if (expedienteId) {
    const exp = State.expedientes.find(e => e.id === expedienteId);
    if (!exp) return;
    title.textContent = 'Editar Expediente';
    modal.dataset.editId = expedienteId;
    document.getElementById('exp-nombre').value      = exp.nombre          || '';
    document.getElementById('exp-cliente').value     = exp.cliente         || '';
    document.getElementById('exp-radicado').value    = exp.numero_radicado || '';
    document.getElementById('exp-descripcion').value = exp.descripcion     || '';
    document.getElementById('exp-estado').value      = exp.estado          || 'activo';
    delBtn.classList.remove('hidden');
    delBtn.onclick = () => { hideExpedienteModal(); deleteExpediente(exp.id, exp.nombre); };
  } else {
    title.textContent = 'Nuevo Expediente';
    delBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('exp-nombre')?.focus(), 120);
}

function hideExpedienteModal() {
  document.getElementById('expediente-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// ============================================================
// SEARCH
// ============================================================

let searchTimeout = null;
function handleSearch(q) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    State.searchQuery = q.trim();
    if (State.currentExpediente) loadArchivos(State.currentExpediente.id);
    else loadExpedientes();
  }, 300);
}

// ============================================================
// INIT
// ============================================================

async function initExpedientes() {
  if (!db) {
    console.warn('⚠️ Supabase no configurado. Edita SUPABASE_URL y SUPABASE_ANON_KEY en expedientes.js');
    return;
  }

  // Check active session
  await checkAuthState();

  // Admin button
  document.getElementById('admin-access-btn')?.addEventListener('click', showLoginModal);

  // Login form
  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await loginUser(
      document.getElementById('login-email').value,
      document.getElementById('login-password').value
    );
  });

  // Close login modal on backdrop
  document.getElementById('login-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'login-modal') hideLoginModal();
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', logoutUser);

  // Expediente form
  document.getElementById('expediente-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('expediente-modal').dataset.editId;
    const data = {
      nombre:          document.getElementById('exp-nombre').value.trim(),
      cliente:         document.getElementById('exp-cliente').value.trim(),
      numero_radicado: document.getElementById('exp-radicado').value.trim(),
      descripcion:     document.getElementById('exp-descripcion').value.trim(),
      estado:          document.getElementById('exp-estado').value,
    };
    if (!data.nombre) { showToast('El nombre del expediente es requerido', 'warning'); return; }
    editId ? await updateExpediente(editId, data) : await createExpediente(data);
  });

  document.getElementById('exp-modal-cancel')?.addEventListener('click', hideExpedienteModal);
  document.getElementById('expediente-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'expediente-modal') hideExpedienteModal();
  });

  // Preview modal
  document.getElementById('preview-modal-close')?.addEventListener('click', closePreviewModal);
  document.getElementById('preview-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'preview-modal') closePreviewModal();
  });
  document.getElementById('preview-download-btn')?.addEventListener('click', () => {
    if (State.selectedFile) downloadArchivo(State.selectedFile);
  });
  document.getElementById('preview-sign-btn')?.addEventListener('click', () => {
    if (State.selectedFile) { closePreviewModal(); showSignatureModal(State.selectedFile.id); }
  });
  document.getElementById('preview-delete-btn')?.addEventListener('click', () => {
    if (State.selectedFile) { closePreviewModal(); deleteArchivo(State.selectedFile); }
  });
  document.getElementById('preview-notes-save')?.addEventListener('click', () => {
    if (State.selectedFile) {
      updateArchivoNotas(State.selectedFile.id, document.getElementById('preview-notes').value);
    }
  });

  // Signature modal
  document.getElementById('clear-signature-btn')?.addEventListener('click', clearSignature);
  document.getElementById('save-signature-btn')?.addEventListener('click', saveSignature);
  document.getElementById('cancel-signature-btn')?.addEventListener('click', hideSignatureModal);
  document.getElementById('signature-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'signature-modal') hideSignatureModal();
  });

  // View toggle
  document.getElementById('view-grid-btn')?.addEventListener('click', () => {
    State.view = 'grid';
    document.getElementById('view-grid-btn').classList.add('active');
    document.getElementById('view-list-btn').classList.remove('active');
    State.currentExpediente ? renderArchivosList() : renderExpedientesList();
  });
  document.getElementById('view-list-btn')?.addEventListener('click', () => {
    State.view = 'list';
    document.getElementById('view-list-btn').classList.add('active');
    document.getElementById('view-grid-btn').classList.remove('active');
    State.currentExpediente ? renderArchivosList() : renderExpedientesList();
  });

  // Search
  document.getElementById('exp-search-input')?.addEventListener('input', (e) => handleSearch(e.target.value));

  // Nav items
  document.querySelectorAll('.exp-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      setActiveNav(item.dataset.view);
      if (item.dataset.view === 'expedientes') {
        State.currentExpediente = null;
        State.searchQuery = '';
        document.getElementById('exp-search-input').value = '';
        loadExpedientes();
      }
    });
  });

  // Auth listener
  db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') hideDashboard();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('preview-modal').classList.contains('hidden')) closePreviewModal();
      else if (!document.getElementById('signature-modal').classList.contains('hidden')) hideSignatureModal();
      else if (!document.getElementById('expediente-modal').classList.contains('hidden')) hideExpedienteModal();
      else if (!document.getElementById('login-modal').classList.contains('hidden')) hideLoginModal();
    }
  });
}

document.addEventListener('DOMContentLoaded', initExpedientes);
