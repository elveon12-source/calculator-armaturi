/* ============================================
   CALCULATOR ARMATURI PRO - Logic v6.6
   Steel reinforcement & metal materials engine
   With Cache Busing & Emergency Reset
   ============================================ */

const APP_VERSION = "10.4 (Multi-User)";

// ========================
// GLOBAL DATA STORES
// ========================
const tableData = {
    etrieri: [], agrafe: [], arcade: [], profileU: [],
    bare: [], sarma: [], tabla: [], cornier: [], personalizat: []
};

let rowCounters = {
    etrieri: 0, agrafe: 0, arcade: 0, profileU: 0,
    bare: 0, sarma: 0, tabla: 0, cornier: 0, personalizat: 0
};

let deferredPrompt;

// ========================
// MULTI-USER MANAGEMENT
// ========================
// currentUser = display name only (shown in badge)
// currentUserKey = name_pin (used for storage isolation)
let currentUser = null;
let currentUserKey = null;
let editingProjectId = null;

function getUserStorageKey() {
    return currentUserKey ? `arm_projects_${currentUserKey}` : 'arm_projects';
}

function getUserCloudCollection() {
    return currentUserKey ? `arm_projects_${currentUserKey}` : 'arm_projects';
}

function initUserSession() {
    const savedName = localStorage.getItem('arm_current_user');
    const savedPin  = localStorage.getItem('arm_current_pin');
    if (savedName && savedName.trim() && savedPin && savedPin.trim()) {
        currentUser    = savedName.trim();
        currentUserKey = savedName.trim() + '_' + savedPin.trim();
        hideLoginOverlay();
        updateUserBadge();
        setTimeout(() => {
            if (db) {
                cloudReady = true;
                updateCloudUI('connected');
                initCloudSync();
            }
            // Admin check for returning users
            setTimeout(() => checkAdminAccess(), 1000);
        }, 1500);
    } else {
        showLoginOverlay();
    }
}


function showLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        setTimeout(() => {
            const inp = document.getElementById('loginUsernameInput');
            if (inp) inp.focus();
        }, 300);
    }
}

function hideLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.add('hidden');
}

function confirmLogin() {
    const nameInp = document.getElementById('loginUsernameInput');
    const pinInp  = document.getElementById('loginPinInput');
    if (!nameInp || !pinInp) return;

    const name = nameInp.value.trim();
    const pin  = pinInp.value.trim();

    // Validate name
    if (!name || name.length < 1) {
        nameInp.style.borderColor = '#ef4444';
        nameInp.placeholder = 'Introdu un nume valid!';
        setTimeout(() => { nameInp.style.borderColor = ''; nameInp.placeholder = 'Numele tău (ex: Ion, Lucian, Echipa1)'; }, 2000);
        return;
    }
    // Validate PIN (4-6 digits)
    if (!pin || !/^\d{4,6}$/.test(pin)) {
        pinInp.style.borderColor = '#ef4444';
        pinInp.value = '';
        pinInp.placeholder = 'PIN invalid! (4-6 cifre)';
        setTimeout(() => { pinInp.style.borderColor = ''; pinInp.placeholder = 'Cod PIN (4-6 cifre)'; }, 2500);
        pinInp.focus();
        return;
    }

    currentUser    = name;
    currentUserKey = name + '_' + pin;
    localStorage.setItem('arm_current_user', name);
    localStorage.setItem('arm_current_pin',  pin);

    hideLoginOverlay();
    updateUserBadge();

    // Auto-migrate from old key (arm_projects_Name) to new (arm_projects_Name_PIN)
    autoMigrateFromOldKey(name, pin);

    renderHistory();
    if (db) {
        cloudReady = true;
        updateCloudUI('connected');
        initCloudSync();
        // Firestore migration after DB ready
        setTimeout(() => migrateFirestoreOldKey(name, pin), 2000);
        // Admin check and user registration after Firestore is ready
        setTimeout(() => {
            checkAdminAccess();
            registerUserInRegistry();
        }, 2500);
    }
    showToast(`Bun venit, ${name}! 🔐`);
}

/**
 * Migrates localStorage from old format 'arm_projects_Name'
 * to new format 'arm_projects_Name_PIN' — runs silently on first PIN login.
 */
function autoMigrateFromOldKey(name, pin) {
    const oldKey = `arm_projects_${name}`;
    const newKey = `arm_projects_${name}_${pin}`;
    if (oldKey === newKey) return; // same, nothing to do

    let oldData = [];
    try { oldData = JSON.parse(localStorage.getItem(oldKey) || '[]'); } catch(e) {}
    if (!Array.isArray(oldData) || oldData.length === 0) return;

    let newData = [];
    try { newData = JSON.parse(localStorage.getItem(newKey) || '[]'); } catch(e) {}

    // Only migrate if new key is empty
    if (newData.length > 0) return;

    localStorage.setItem(newKey, JSON.stringify(oldData));
    showToast(`✅ ${oldData.length} proiect(e) migrate automat la contul tău!`);
}

/**
 * Copies Firestore collection from 'arm_projects_Name' to 'arm_projects_Name_PIN'.
 * Runs once silently after DB is ready.
 */
function migrateFirestoreOldKey(name, pin) {
    if (!db) return;
    const oldCol = `arm_projects_${name}`;
    const newCol = `arm_projects_${name}_${pin}`;
    if (oldCol === newCol) return;

    // Check new collection first — only migrate if empty
    db.collection(newCol).limit(1).get().then(snap => {
        if (!snap.empty) return; // already has data, skip
        db.collection(oldCol).get().then(oldSnap => {
            if (oldSnap.empty) return;
            let count = 0;
            oldSnap.forEach(doc => {
                db.collection(newCol).doc(doc.id).set(doc.data(), { merge: true })
                  .then(() => { count++; })
                  .catch(() => {});
            });
            setTimeout(() => {
                if (count > 0) showToast(`☁️ ${count} proiecte migrate în Cloud!`);
            }, 2000);
        }).catch(() => {});
    }).catch(() => {});
}

function switchUser() {
    if (!confirm(`Ești sigur că vrei să schimbi utilizatorul?\n\nProiectele tale sunt salvate și vei putea reveni cu același Nume + PIN.`)) return;
    localStorage.removeItem('arm_current_user');
    localStorage.removeItem('arm_current_pin');
    currentUser    = null;
    currentUserKey = null;
    editingProjectId = null;
    cancelEditProject();
    showLoginOverlay();
    const nameInp = document.getElementById('loginUsernameInput');
    const pinInp  = document.getElementById('loginPinInput');
    if (nameInp) nameInp.value = '';
    if (pinInp)  pinInp.value  = '';
}

function updateUserBadge() {
    const badge = document.getElementById('userBadgeText');
    if (badge && currentUser) {
        // Show display name only (not PIN)
        badge.textContent = currentUser;
    }
}

// ========================
// ADMIN SYSTEM
// ========================
let isAdmin = false;
const ADMIN_CONFIG_DOC = 'arm_config/settings';

/**
 * Check if currentUser is admin by reading Firestore arm_config/settings.adminKeys
 * Called after login. Shows/hides the Admin tab.
 */
async function checkAdminAccess() {
    if (!db || !currentUserKey) return;
    try {
        const doc = await db.doc(ADMIN_CONFIG_DOC).get();
        const settings = doc.exists ? doc.data() : {};
        const adminKeys = settings.adminKeys || [];
        isAdmin = adminKeys.includes(currentUserKey);

        const tabAdmin = document.getElementById('tabAdmin');
        if (tabAdmin) tabAdmin.style.display = isAdmin ? '' : 'none';

        // Load global prices for non-admins who have no custom prices
        if (!isAdmin) loadGlobalPricesIfNeeded(settings.globalPrices);

        // Show broadcast message if any
        checkBroadcastMessage(settings.appMessage);
    } catch(e) {
        console.warn('Admin check failed (offline?):', e);
        // Fallback: if Firestore unreachable, no admin access
        isAdmin = false;
    }
}

/**
 * For new users: if they have no custom prices, use global prices from Firestore
 */
function loadGlobalPricesIfNeeded(globalPrices) {
    if (!globalPrices) return;
    const existing = localStorage.getItem('arm_prices');
    if (existing) return; // user already has custom prices
    categoryPrices = { ...globalPrices };
    localStorage.setItem('arm_prices', JSON.stringify(categoryPrices));
    recalcAll();
}

/**
 * Show a broadcast message from admin (if any) as an info banner
 */
function checkBroadcastMessage(msg) {
    if (!msg || !msg.trim()) return;
    const existing = sessionStorage.getItem('arm_msg_seen');
    if (existing === msg) return; // already shown this session
    sessionStorage.setItem('arm_msg_seen', msg);
    showToast(`📢 ${msg}`);
    // Also show as a persistent banner if longer than 60 chars
    const banner = document.createElement('div');
    banner.style.cssText = `
        position:fixed; top:70px; left:50%; transform:translateX(-50%);
        background:linear-gradient(135deg,#92400e,#78350f); color:#fef3c7;
        padding:10px 20px; border-radius:8px; font-size:13px; font-weight:600;
        z-index:5000; box-shadow:0 4px 20px rgba(0,0,0,0.4);
        display:flex; align-items:center; gap:10px; max-width:90vw;`;
    banner.innerHTML = `<span>📢 ${msg}</span><button onclick="this.parentElement.remove()"
        style="background:none;border:none;color:#fef3c7;cursor:pointer;font-size:16px;">✕</button>`;
    document.body.appendChild(banner);
    setTimeout(() => { if(banner.parentElement) banner.remove(); }, 10000);
}

/**
 * Load and render the admin panel content
 */
async function loadAdminPanel() {
    if (!isAdmin) return;

    // Update admin badge
    const adminBadge = document.getElementById('adminUserBadge');
    if (adminBadge) adminBadge.textContent = `Admin: ${currentUser}`;

    // Load current global prices from Firestore
    try {
        const doc = await db.doc(ADMIN_CONFIG_DOC).get();
        const settings = doc.exists ? doc.data() : {};
        const globalPrices = settings.globalPrices || {};

        // Render global prices list
        const list = document.getElementById('adminGlobalPricesList');
        if (list) {
            list.innerHTML = PRICE_CATEGORIES.map(c => `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; gap:10px;">
                    <label style="font-size:12px; color:#94a3b8; flex:1;">${c.label}</label>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="number" id="adminPrice_${c.key}"
                            value="${(globalPrices[c.key] || categoryPrices[c.key] || 5.50).toFixed(2)}"
                            step="0.10" min="0"
                            style="width:80px; background:#1e293b; border:1px solid rgba(255,255,255,0.15);
                                   border-radius:6px; color:#f1f5f9; padding:4px 8px; font-size:13px; font-weight:700; text-align:right;">
                        <span style="font-size:11px; color:#64748b;">lei/kg</span>
                    </div>
                </div>`).join('');
        }

        // Load broadcast message
        const msgEl = document.getElementById('adminBroadcastMsg');
        if (msgEl) msgEl.value = settings.appMessage || '';

    } catch(e) {
        showToast('Eroare la încărcarea setărilor admin!');
    }
}

/**
 * Save global prices to Firestore — applies to all new users
 */
async function saveGlobalPrices() {
    if (!isAdmin || !db) return;
    const globalPrices = {};
    PRICE_CATEGORIES.forEach(c => {
        const el = document.getElementById(`adminPrice_${c.key}`);
        if (el) globalPrices[c.key] = parseFloat(el.value) || 5.50;
    });
    try {
        await db.doc(ADMIN_CONFIG_DOC).set({ globalPrices }, { merge: true });
        showToast('✅ Prețuri globale salvate în Cloud!');
    } catch(e) {
        showToast('❌ Eroare la salvare: ' + e.message);
    }
}

/**
 * Save broadcast message to Firestore — all users see it on next login
 */
async function saveBroadcastMessage() {
    if (!isAdmin || !db) return;
    const msg = document.getElementById('adminBroadcastMsg')?.value?.trim() || '';
    try {
        await db.doc(ADMIN_CONFIG_DOC).set({ appMessage: msg }, { merge: true });
        showToast(msg ? `📢 Mesaj trimis tuturor utilizatorilor!` : `🔕 Mesaj dezactivat.`);
    } catch(e) {
        showToast('❌ Eroare: ' + e.message);
    }
}

/**
 * List all active users from Firestore by scanning collection names
 */
async function loadUsersList() {
    if (!isAdmin || !db) return;
    const container = document.getElementById('adminUsersList');
    if (!container) return;
    container.innerHTML = '<p style="color:#64748b;">Se încarcă...</p>';

    try {
        // Read user registry from arm_config/users_registry
        const doc = await db.doc('arm_config/users_registry').get();
        const registry = doc.exists ? (doc.data().users || []) : [];

        if (registry.length === 0) {
            container.innerHTML = '<p style="color:#64748b; font-size:13px;">Nu există utilizatori înregistrați în registru. Utilizatorii se înregistrează automat la primul login.</p>';
            return;
        }

        container.innerHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead>
                    <tr style="color:#64748b; text-align:left; border-bottom:1px solid rgba(255,255,255,0.1);">
                        <th style="padding:6px;">Utilizator</th>
                        <th style="padding:6px;">Dispozitiv</th>
                        <th style="padding:6px;">Ultima activitate</th>
                    </tr>
                </thead>
                <tbody>
                    ${registry.map(u => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:6px; color:#f1f5f9; font-weight:600;">${u.displayName || u.key}</td>
                            <td style="padding:6px; color:#94a3b8;">${u.device || '-'}</td>
                            <td style="padding:6px; color:#64748b;">${u.lastSeen ? new Date(u.lastSeen).toLocaleString('ro-RO') : '-'}</td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    } catch(e) {
        container.innerHTML = `<p style="color:#ef4444; font-size:13px;">Eroare la încărcare: ${e.message}</p>`;
    }
}

/**
 * Register user in the Firestore users registry (called on login)
 */
async function registerUserInRegistry() {
    if (!db || !currentUser || !currentUserKey) return;
    try {
        const registry = db.doc('arm_config/users_registry');
        const doc = await registry.get();
        const existing = doc.exists ? (doc.data().users || []) : [];
        const idx = existing.findIndex(u => u.key === currentUserKey);
        const entry = {
            key: currentUserKey,
            displayName: currentUser,
            device: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop',
            lastSeen: Date.now()
        };
        if (idx >= 0) existing[idx] = entry;
        else existing.push(entry);
        await registry.set({ users: existing }, { merge: true });
    } catch(e) { /* silent fail */ }
}

// ========================
// FIREBASE SAFE CLOUD SYNC
// ========================
const firebaseConfig = {
  apiKey: "AIzaSyBh5TUwVvWjedKSyriQZoeuPTLTMXV3Tqk",
  authDomain: "calculator-armaturi.firebaseapp.com",
  projectId: "calculator-armaturi",
  storageBucket: "calculator-armaturi.firebasestorage.app",
  messagingSenderId: "714017559084",
  appId: "1:714017559084:web:ce9886df69585a8527b789",
  measurementId: "G-905KHYNB5H"
};

let db = null;
let isCloudActive = false;
let cloudSyncUnsubscribe = null; // Track active listener for cleanup
let cloudReady = false; // True once Firebase has confirmed connection

function updateCloudUI(status) {
    const el = document.getElementById('cloudStatus');
    const txt = document.getElementById('cloudStatusText');
    if (!el || !txt) return;
    
    el.classList.remove('active', 'error');
    if (status === 'connected') {
        el.classList.add('active');
        txt.textContent = 'Sincronizat';
        isCloudActive = true;
    } else if (status === 'not-created') {
        el.classList.add('error');
        txt.textContent = 'Bază de date lipsă';
        isCloudActive = false;
        alert("Sincronizarea NU este activă!\n\nMotiv: Nu ai creat baza de date în consola Firebase.\n\nTe rog intră în consola Firebase -> Firestore Database și apasă pe butonul 'Create Database'!");
    } else if (status === 'error') {
        el.classList.add('error');
        txt.textContent = 'Eroare (Vezi Consola)';
        isCloudActive = false;
    } else {
        txt.textContent = 'Mod Local';
        isCloudActive = false;
    }
}

try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        db.enablePersistence().catch(() => {});
        
        // Safety check: if we can't read after 5s, we are probably not configured in console
        const timeout = setTimeout(() => {
            if (!isCloudActive) updateCloudUI('local');
        }, 5000);

        // Use generic collection for connection test (currentUser not set yet at this point)
        db.collection('arm_projects_test').limit(1).get()
          .then(() => {
              clearTimeout(timeout);
              cloudReady = true;
              updateCloudUI('connected');
              // initCloudSync will be called by initUserSession once currentUser is known
          })
          .catch(() => {
              // Also try the base collection for backwards compatibility
              db.collection('arm_projects').limit(1).get()
                .then(() => {
                    clearTimeout(timeout);
                    cloudReady = true;
                    updateCloudUI('connected');
                })
                .catch(err => {
                    clearTimeout(timeout);
                    if (err.code === 'not-found' || err.message.includes('not exist')) {
                        updateCloudUI('not-created');
                    } else {
                        updateCloudUI('local');
                    }
                });
          });
    }
} catch(e) {
    console.error("Firebase init failed:", e);
}

function initCloudSync() {
    if (!db || !currentUser) return;
    
    // Unsubscribe from previous listener if any (handles user switch)
    if (cloudSyncUnsubscribe) {
        cloudSyncUnsubscribe();
        cloudSyncUnsubscribe = null;
    }
    
    const collection = getUserCloudCollection();
    const storageKey = getUserStorageKey();
    console.log(`Cloud Sync: Starting for user "${currentUser}" (collection: ${collection})`);
    
    // 1. LISTEN for changes from Cloud
    cloudSyncUnsubscribe = db.collection(collection).onSnapshot(snapshot => {
        // Process deletions first
        let localProjects = getProjectsFromStorage();
        let wasDeleted = false;
        
        snapshot.docChanges().forEach(change => {
            if (change.type === 'removed') {
                localProjects = localProjects.filter(p => p.id.toString() !== change.doc.id);
                wasDeleted = true;
            }
        });
        
        if (wasDeleted) {
            localStorage.setItem(storageKey, JSON.stringify(localProjects));
        }

        const cloudProjects = [];
        snapshot.forEach(doc => cloudProjects.push(doc.data()));
        console.log(`Cloud Sync: Received ${cloudProjects.length} projects from cloud.`);
        
        // Reload local projects
        localProjects = getProjectsFromStorage();
        const mergedMap = new Map();
        
        // Add local projects to map first
        localProjects.forEach(p => mergedMap.set(p.id.toString(), p));
        
        // Overwrite/Add with cloud projects
        cloudProjects.forEach(cp => {
            const lp = mergedMap.get(cp.id.toString());
            // Merge logic: use cloud if local is missing or if cloud is newer
            if (!lp || (cp.lastUpdated || 0) >= (lp.lastUpdated || 0)) {
                mergedMap.set(cp.id.toString(), cp);
            }
        });
        
        const finalProjects = Array.from(mergedMap.values()).sort((a, b) => b.id - a.id);
        console.log(`Cloud Sync: Merged total of ${finalProjects.length} projects.`);
        
        localStorage.setItem(storageKey, JSON.stringify(finalProjects));
        renderHistory();
        updateCloudUI('connected');
    }, error => {
        console.error("Cloud Sync: Error:", error);
        updateCloudUI('error');
    });

    // 2. MIGRATE Local data to Cloud (upload local-only projects)
    setTimeout(() => {
        const localProjects = getProjectsFromStorage();
        if (localProjects.length > 0) {
            console.log(`Cloud Sync: Migrating ${localProjects.length} local projects...`);
            localProjects.forEach(proj => {
                db.collection(getUserCloudCollection()).doc(proj.id.toString()).set(proj, { merge: true })
                  .catch(e => console.warn("Cloud Sync: Migration skip:", e));
            });
        }
    }, 3000);
}



// ========================
// INITIALIZATION
// ========================
document.addEventListener('DOMContentLoaded', () => {
    initUserSession();
    initTabs();
    initParticles();
    initPWA();
    loadPrices();
    loadFromLocalStorage();
    loadOwnSettings();
    renderHistory();
    recalcAll();
    ['etrieri', 'agrafe', 'arcade', 'profileU', 'bare', 'sarma', 'tabla', 'cornier'].forEach(type => renderTable(type));

    const verEl = document.getElementById('appVersion');
    if (verEl) verEl.textContent = `v${APP_VERSION}`;
});

/**
 * PWA & SERVICE WORKER LOGIC
 */
function initPWA() {
    const installBtn = document.getElementById('btnInstall');
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) installBtn.style.display = 'flex';
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(`./sw.js?v=102`).then(reg => {
            console.log('SW Registered - auto-update active');

            // If there's already a waiting SW, activate it immediately
            if (reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }

            // When a new SW is found during this session, activate it immediately
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed') {
                        // Skip waiting → triggers controllerchange → auto reload
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

            // Poll for updates every 5 minutes silently
            setInterval(() => reg.update(), 5 * 60 * 1000);
        });

        // When the active SW changes, reload the page automatically
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }
}

/**
 * ACTIVATE UPDATE
 * Forces the waiting Service Worker to become active
 */
let waitingWorker;
function activateUpdate() {
    if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
        window.location.reload(true);
    }
}

/**
 * FORCE UPDATE LOGIC
 */
function manualUpdateCheck() {
    const btn = document.getElementById('btnUpdateManual');
    if (btn) btn.classList.add('loading');
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg) {
                reg.update().then(() => {
                    setTimeout(() => {
                        if (btn) btn.classList.remove('loading');
                        if (!reg.waiting && !reg.installing) {
                            showToast("Aplicatia este deja la zi!");
                        }
                    }, 1000);
                });
            } else {
                initPWA();
            }
        });
    } else {
        window.location.reload(true);
    }
}

function emergencyReset() {
    if (!confirm("ATENȚIE! Această acțiune va șterge cache-ul browserului și va forța descărcarea versiunii noi de pe server. Datele tale salvate în Cloud sunt în siguranță.\n\nContinui?")) return;
    
    // Clear all storage
    localStorage.clear();
    sessionStorage.clear();
    
    // Unregister all service workers
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for(let registration of registrations) {
                registration.unregister();
            }
        });
    }

    // Clear Cache Storage
    if ('caches' in window) {
        caches.keys().then(names => {
            for (let name of names) caches.delete(name);
        });
    }

    showToast("Resetare completă! Se reîncarcă...");
    setTimeout(() => {
        window.location.reload(true);
    }, 1500);
}

function shareResults(method) {
    const tg = document.getElementById('grandTotalWeight').textContent;
    const tp = document.getElementById('grandTotalPrice').textContent;
    const tr = document.getElementById('grandTotalRows').textContent;
    const url = window.location.href;
    const text = `PROIECT ARMATURI PRO v10.0\n\nRezumat:\n📈 Greutate: ${tg}\n📈 Cost estimat: ${tp}\n📈 Total pozitii: ${tr}\n\nAcceseaza proiectul aici:\n${url}`;

    if (method === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast("Link copiat in clipboard!");
        });
    }
}

function installPWA() {
    const installBtn = document.getElementById('btnInstall');
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                if (installBtn) installBtn.style.display = 'none';
            }
            deferredPrompt = null;
        });
    }
}

// showUpdateToast kept for emergencyReset badge only
function showUpdateToast() {
    const updateBadge = document.getElementById('updateBadge');
    if (updateBadge) updateBadge.style.display = 'inline-flex';
}

// ========================
// RECALC ALL
// ========================
function recalcAll() {
    // Each calc wrapped in try/catch: some tabs may not have DOM elements
    // mounted yet (e.g. Tablă tab never visited), which would throw TypeError
    [calcEtrieri, calcAgrafe, calcArcade, calcProfileU, calcBare, calcSarma, calcTabla, calcCornier].forEach(fn => {
        try { fn(); } catch(e) { /* tab not rendered yet, skip */ }
    });

    Object.keys(tableData).forEach(type => {
        tableData[type].forEach(row => calcRowValues(type, row));
        updateTableTotals(type);
    });

    updateGrandTotal();
    saveToLocalStorage();
}

// ========================
// PER-CATEGORY PRICE SYSTEM
// ========================
const PRICE_CATEGORIES = [
    { key: 'etrieri',     label: 'Etrieri (fasonat)' },
    { key: 'agrafe',      label: 'Agrafe (fasonat)' },
    { key: 'arcade',      label: 'Arcade (țeavă)' },
    { key: 'profileU',    label: 'Profile U (fasonat)' },
    { key: 'bare',        label: 'Bare drepte' },
    { key: 'sarma',       label: 'Sârmă' },
    { key: 'tabla',       label: 'Tablă' },
    { key: 'cornier',     label: 'Cornier' },
    { key: 'personalizat',label: 'Personalizat' },
];

let categoryPrices = {};

function loadPrices() {
    try {
        const saved = localStorage.getItem('arm_prices');
        categoryPrices = saved ? JSON.parse(saved) : {};
    } catch(e) { categoryPrices = {}; }
    // Fill defaults for missing categories
    PRICE_CATEGORIES.forEach(c => {
        if (!categoryPrices[c.key]) categoryPrices[c.key] = 5.50;
    });
}

function savePrices() {
    PRICE_CATEGORIES.forEach(c => {
        const el = document.getElementById(`price_${c.key}`);
        if (el) categoryPrices[c.key] = parseFloat(el.value) || 5.50;
    });
    localStorage.setItem('arm_prices', JSON.stringify(categoryPrices));
    recalcAll();
    showToast('✅ Prețuri salvate!');
    document.getElementById('pricesPanel').style.display = 'none';
}

function renderPricesPanel() {
    const list = document.getElementById('pricesList');
    if (!list) return;
    list.innerHTML = PRICE_CATEGORIES.map(c => `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; gap:10px;">
            <label style="font-size:12px; color:#94a3b8; flex:1;">${c.label}</label>
            <div style="display:flex; align-items:center; gap:4px;">
                <input type="number" id="price_${c.key}" value="${(categoryPrices[c.key]||5.50).toFixed(2)}"
                    step="0.10" min="0"
                    style="width:70px; background:#1e293b; border:1px solid rgba(255,255,255,0.15);
                           border-radius:6px; color:#f1f5f9; padding:4px 6px; font-size:13px; font-weight:700; text-align:right;"
                    onkeydown="if(event.key==='Enter') savePrices()">
                <span style="font-size:11px; color:#64748b;">lei/kg</span>
            </div>
        </div>`).join('');
}

function togglePricesPanel() {
    const panel = document.getElementById('pricesPanel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) renderPricesPanel();
}

// Close panel when clicking outside
document.addEventListener('click', e => {
    const panel = document.getElementById('pricesPanel');
    const btn   = document.getElementById('btnPrices');
    if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.style.display = 'none';
    }
});

function getPretKg(category) {
    if (category && categoryPrices[category] !== undefined) return categoryPrices[category];
    // fallback to first category price or 5.5
    return categoryPrices['etrieri'] || 5.50;
}

// ========================
// TAB SWITCHING
// ========================
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const indicator = document.getElementById('tabIndicator');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(`panel-${tabId}`);
            if (panel) panel.classList.add('active');
            
            if (tabId === 'proiecte') renderHistory();
            if (tabId === 'admin') loadAdminPanel();
            if (tabId === 'personalizat') {
                setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
            }

            if (indicator) {
                indicator.style.width = `${btn.offsetWidth}px`;
                indicator.style.left = `${btn.offsetLeft}px`;
            }
        });
    });
}

// ========================
// UTILITY & FORMULAS
// ========================
function greutateSpecifica(diamMm) {
    const dMetri = diamMm / 1000;
    return Math.round(((dMetri * dMetri) * Math.PI / 4) * 7850 * 1000) / 1000;
}

function greutateSpecificaBare(diamMm) {
    const overrides = { 8: 5/12, 10: 7.62/12, 12: 11/12, 14: 15.2/12 };
    if (overrides[diamMm]) return Math.round(overrides[diamMm] * 1000) / 1000;
    return greutateSpecifica(diamMm);
}

const weightsSarma = { "1.2": 0.0089, "1.6": 0.0158, "2.0": 0.0247, "3.0": 0.0555, "4.0": 0.0986, "5.0": 0.1541 };
const weightsTablaCutata = { "H12": 4.2, "H18": 4.8, "H35": 5.5 };
const weightsCornier = { "20x3": 0.88, "25x3": 1.12, "30x3": 1.36, "40x4": 2.42, "50x5": 3.77 };

function animateValue(elementId, newValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = newValue;
    el.classList.add('changed');
    setTimeout(() => el.classList.remove('changed'), 300);
}

function showToast(message) {
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toastText');
    if (!toast || !toastText || toast.classList.contains('update-toast')) return;
    toastText.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Dropdown Options
function diameterOptions(selected) { return [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32].map(d => `<option value="${d}" ${d == selected ? 'selected' : ''}>Diam${d}</option>`).join(''); }
function clasaOptions(selected) { return ['BST500S', 'PC52', 'OB37', 'S500'].map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join(''); }
function sarmaTipOptions(selected) { return [{v:'moale_neagra', t:'Moale Neagra'}, {v:'galvanizata', t:'Galvanizata'}, {v:'ghimpata', t:'Ghimpata'}].map(o => `<option value="${o.v}" ${o.v === selected ? 'selected' : ''}>${o.t}</option>`).join(''); }
function sarmaDiamOptions(selected) { return Object.keys(weightsSarma).map(d => `<option value="${d}" ${d == selected ? 'selected' : ''}>${d} mm</option>`).join(''); }
function tablaModOptions(selected) { return [{v:'dreapta', t:'Dreapta'}, {v:'cutata', t:'Cutata'}].map(o => `<option value="${o.v}" ${o.v === selected ? 'selected' : ''}>${o.t}</option>`).join(''); }
function tablaModelOptions(selected) { return Object.keys(weightsTablaCutata).map(m => `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`).join(''); }
function cornierDimOptions(selected) { return Object.keys(weightsCornier).map(d => `<option value="${d}" ${d === selected ? 'selected' : ''}>${d} mm</option>`).join(''); }

// ========================
// CALCULATORS
// ========================
function updateDimText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }

function calcEtrieri() {
    const d = parseFloat(document.getElementById('etrDiam').value);
    const A = parseFloat(document.getElementById('etrA').value) || 0;
    const B = parseFloat(document.getElementById('etrB').value) || 0;
    const c = parseFloat(document.getElementById('etrCioc').value) || 0;
    const n = parseInt(document.getElementById('etrBuc').value) || 0;
    const lb = (2*(A+B) + 2*c)/100; const lt = lb*n; const gs = greutateSpecifica(d);
    const gt = lt*gs; const p = gt*getPretKg('etrieri');
    animateValue('etrLungBuc', lb.toFixed(2)); animateValue('etrLungTot', lt.toFixed(2));
    animateValue('etrGSp', gs.toFixed(3)); animateValue('etrGTot', gt.toFixed(2)); animateValue('etrPret', p.toFixed(2));
    updateDimText('dimEtrierA', A); updateDimText('dimEtrierB', B); updateDimText('dimEtrierCioc', c); updateDimText('dimEtrierDiam', d);
}

function calcAgrafe() {
    const d = parseFloat(document.getElementById('agrDiam').value);
    const L = parseFloat(document.getElementById('agrL').value) || 0;
    const c = parseFloat(document.getElementById('agrCioc').value) || 0;
    const n = parseInt(document.getElementById('agrBuc').value) || 0;
    const lb = (L + 2*c)/100; const lt = lb*n; const gs = greutateSpecifica(d);
    const gt = lt*gs; const p = gt*getPretKg('agrafe');
    animateValue('agrLungBuc', lb.toFixed(2)); animateValue('agrLungTot', lt.toFixed(2));
    animateValue('agrGSp', gs.toFixed(3)); animateValue('agrGTot', gt.toFixed(2)); animateValue('agrPret', p.toFixed(2));
    updateDimText('dimAgrafaL', L); updateDimText('dimAgrafaCioc', c); updateDimText('dimAgrafaCioc2', c); updateDimText('dimAgrafaDiam', d);
}

function calcArcade() {
    const dExt = parseFloat(document.getElementById('arcDiam').value) || 33.7;
    const gros = parseFloat(document.getElementById('arcGrosime').value) || 2.0;
    const D = parseFloat(document.getElementById('arcD').value) || 0;
    const H = parseFloat(document.getElementById('arcH').value) || 0;
    const n = parseInt(document.getElementById('arcBuc').value) || 0;
    const hLeg = Math.max(0, H - (D/2));
    const lb = (Math.PI*(D/2) + 2*hLeg)/100; const lt = lb*n; 
    const gs = (dExt - gros) * gros * 0.0246615;
    const gt = lt*gs; const p = gt*getPretKg('arcade');
    animateValue('arcLungBuc', lb.toFixed(2)); animateValue('arcLungTot', lt.toFixed(2));
    animateValue('arcGSp', gs.toFixed(3)); animateValue('arcGTot', gt.toFixed(2));
    animateValue('arcPret', p.toFixed(2));
    updateDimText('dimArcadaD', D); updateDimText('dimArcadaH', H); 
    updateDimText('dimArcadaDiam', dExt); updateDimText('dimArcadaGros', gros);
}

function calcProfileU() {
    const d = parseFloat(document.getElementById('profilUDiam').value);
    const A = parseFloat(document.getElementById('profilUA').value) || 0;
    const B = parseFloat(document.getElementById('profilUB').value) || 0;
    const C = parseFloat(document.getElementById('profilUC').value) || 0;
    const n = parseInt(document.getElementById('profilUBuc').value) || 0;
    const lb = (A+B+C)/100; const lt = lb*n; const gs = greutateSpecifica(d);
    const gt = lt*gs; const p = gt*getPretKg('profileU');
    animateValue('profilULungBuc', lb.toFixed(2)); animateValue('profilULungTot', lt.toFixed(2));
    animateValue('profilUGSp', gs.toFixed(3)); animateValue('profilUGTot', gt.toFixed(2)); animateValue('profilUPret', p.toFixed(2));
    updateDimText('dimProfilUA', A); updateDimText('dimProfilUB', B); updateDimText('dimProfilUC', C); updateDimText('dimProfilUDiam', d);
}

function calcBare() {
    const d = parseFloat(document.getElementById('barDiam').value);
    const L = parseFloat(document.getElementById('barL').value) || 0;
    const n = parseInt(document.getElementById('barBuc').value) || 0;
    const lb = L/100; const lt = lb*n; const gs = greutateSpecificaBare(d);
    const gt = lt*gs; const p = gt*getPretKg('bare');
    animateValue('barLungBuc', lb.toFixed(2)); animateValue('barLungTot', lt.toFixed(2));
    animateValue('barGSp', gs.toFixed(3)); animateValue('barGTot', gt.toFixed(2)); animateValue('barPret', p.toFixed(2));
    updateDimText('dimBaraL', L); updateDimText('dimBaraDiam', d);
}

function calcSarma() {
    const dStr = document.getElementById('sarDiam').value;
    const L = parseFloat(document.getElementById('sarL').value) || 0;
    const n = parseInt(document.getElementById('sarBuc').value) || 0;
    const gs = weightsSarma[dStr] || 0; const gt = L * n * gs; const p = gt * getPretKg('sarma');
    animateValue('sarGSp', gs.toFixed(3)); animateValue('sarMassBuc', (L*gs).toFixed(2));
    animateValue('sarGTot', gt.toFixed(2)); animateValue('sarPret', p.toFixed(2));
}

function toggleTablaFields() {
    const mod = document.getElementById('tabMod').value;
    document.getElementById('grpTabGrosime').style.display = mod === 'dreapta' ? 'flex' : 'none';
    document.getElementById('grpTabModel').style.display = mod === 'cutata' ? 'flex' : 'none';
    document.getElementById('rowDimDreapta').style.display = mod === 'dreapta' ? 'flex' : 'none';
    document.getElementById('rowDimCutata').style.display = mod === 'cutata' ? 'flex' : 'none';
    calcTabla();
}

function calcTabla() {
    const mod = document.getElementById('tabMod').value;
    const n = parseInt(document.getElementById('tabBuc').value) || 0;
    let wMp = 0, mpB = 0;
    if (mod === 'dreapta') {
        const g = parseFloat(document.getElementById('tabGrosime').value) || 0;
        const lat = parseFloat(document.getElementById('tabLatime').value) || 0;
        const lung = parseFloat(document.getElementById('tabLungime').value) || 0;
        wMp = g * 7.85; mpB = (lat * lung) / 1000000;
    } else {
        const m = document.getElementById('tabModel').value;
        const s = parseFloat(document.getElementById('tabMp').value) || 0;
        wMp = weightsTablaCutata[m] || 0; mpB = s / n;
    }
    const gt = wMp * mpB * n; const p = gt * getPretKg('tabla');
    animateValue('tabGUnit', wMp.toFixed(2)); animateValue('tabMpBuc', mpB.toFixed(2));
    animateValue('tabGTot', gt.toFixed(2)); animateValue('tabPret', p.toFixed(2));
}

function calcCornier() {
    const dim = document.getElementById('corDim').value;
    const L = parseFloat(document.getElementById('corL').value) || 0;
    const n = parseInt(document.getElementById('corBuc').value) || 0;
    const gs = weightsCornier[dim] || 0; const weightBuc = L * gs; const gt = weightBuc * n; const p = gt * getPretKg('cornier');
    animateValue('corGSp', gs.toFixed(3)); animateValue('corMassBuc', weightBuc.toFixed(2));
    animateValue('corGTot', gt.toFixed(2)); animateValue('corPret', p.toFixed(2));
}

// ========================
// TABLE ENGINE
// ========================
function calcRowValues(type, row) {
    switch(type) {
        case 'etrieri': row.lungBuc = (2*(row.A+row.B) + 2*row.cioc)/100; row.gSp = greutateSpecifica(row.diam); break;
        case 'agrafe': row.lungBuc = (row.L + 2*row.cioc)/100; row.gSp = greutateSpecifica(row.diam); break;
        case 'arcade': {
            const hLeg = Math.max(0, (parseFloat(row.H)||0) - ((parseFloat(row.D)||0)/2));
            row.lungBuc = (Math.PI*(row.D/2) + 2*hLeg)/100; 
            row.gSp = ((row.diamExt||33.7) - (row.grosime||2)) * (row.grosime||2) * 0.0246615; 
            break;
        }
        case 'profileU': row.lungBuc = (row.A+row.B+row.C)/100; row.gSp = greutateSpecifica(row.diam); break;
        case 'bare': row.lungBuc = row.L/100; row.gSp = greutateSpecificaBare(row.diam); break;
        case 'sarma': row.gSp = weightsSarma[row.diam]||0; row.gTot = row.L*row.buc*row.gSp; break;
        case 'tabla': 
            if(row.mod==='dreapta'){ row.gMp = row.gros*7.85; row.mpTot = (row.lat*row.lung*row.buc)/1000000; }
            else { row.gMp = weightsTablaCutata[row.model]||0; row.mpTot = row.mpTotal; }
            row.gTot = row.gMp*row.mpTot; break;
        case 'cornier': row.gSp = weightsCornier[row.dim]||0; row.gTot = row.L*row.buc*row.gSp; break;
        case 'personalizat': 
            row.lungBuc = (row.segments || []).reduce((s, seg) => s + (parseFloat(seg.L)||0), 0) / 100;
            row.gSp = greutateSpecifica(row.diam);
            break;
    }
    if(!['sarma','tabla','cornier'].includes(type)){ row.lungTot = row.lungBuc*row.buc; row.gTot = row.lungTot*row.gSp; }
    row.gTot = Math.round(row.gTot*100)/100; row.pret = Math.round(row.gTot*getPretKg(type)*100)/100;
}

function addRow(type) {
    rowCounters[type]++; const nr = rowCounters[type]; let row;
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const getNum = (id) => parseFloat(getVal(id)) || 0;
    
    // Default brand logic: user input or auto-increment ID
    const customMarca = getVal(`${type === 'profileU' ? 'profilU' : type.slice(0,3)}Marca`);
    const finalMarca = customMarca || `${type.charAt(0).toUpperCase()}${nr}`;

    switch(type) {
        case 'etrieri': 
            row = { id: nr, marca: finalMarca, 
                diam: parseInt(getVal('etrDiam'))||8, 
                clasa: getVal('etrClasa')||'BST500S', 
                A: getNum('etrA')||25, 
                B: getNum('etrB')||40, 
                cioc: getNum('etrCioc')||7, 
                buc: parseInt(getVal('etrBuc'))||1 
            }; break;
        case 'agrafe': 
            row = { id: nr, marca: finalMarca, 
                diam: parseInt(getVal('agrDiam'))||8, 
                clasa: getVal('agrClasa')||'BST500S', 
                L: getNum('agrL')||25, 
                cioc: getNum('agrCioc')||10, 
                buc: parseInt(getVal('agrBuc'))||30 
            }; break;
        case 'arcade': 
            row = { id: nr, marca: finalMarca, 
                diamExt: getNum('arcDiam')||33.7, 
                grosime: getNum('arcGrosime')||2.0, 
                D: getNum('arcD')||60, 
                H: getNum('arcH')||40, 
                buc: parseInt(getVal('arcBuc'))||20 
            }; break;
        case 'profileU': 
            row = { id: nr, marca: finalMarca, 
                diam: parseInt(getVal('profilUDiam'))||10, 
                clasa: getVal('profilUClasa')||'BST500S', 
                A: getNum('profilUA')||20, 
                B: getNum('profilUB')||100, 
                C: getNum('profilUC')||20, 
                buc: parseInt(getVal('profilUBuc'))||20 
            }; break;
        case 'bare': 
            row = { id: nr, marca: finalMarca, 
                diam: parseInt(getVal('barDiam'))||16, 
                clasa: getVal('barClasa')||'BST500S', 
                L: getNum('barL')||500, 
                buc: parseInt(getVal('barBuc'))||10 
            }; break;
        case 'sarma': 
            row = { id: nr, marca: finalMarca, 
                tip: getVal('sarTip')||'moale_neagra', 
                diam: getVal('sarDiam')||'1.2', 
                L: getNum('sarL')||100, 
                buc: parseInt(getVal('sarBuc'))||10 
            }; break;
        case 'tabla': 
            row = { id: nr, marca: finalMarca, 
                mod: getVal('tabMod')||'dreapta', 
                gros: getNum('tabGrosime')||0.5, 
                lat: getNum('tabLatime')||1000, 
                lung: getNum('tabLungime')||2000, 
                model: getVal('tabModel')||'H18', 
                mpTotal: getNum('tabMp')||10, 
                buc: parseInt(getVal('tabBuc'))||1 
            }; break;
        case 'cornier': 
            row = { id: nr, marca: finalMarca, 
                dim: getVal('corDim')||'20x3', 
                L: getNum('corL')||6, 
                buc: parseInt(getVal('corBuc'))||1 
            }; break;
        case 'personalizat':
            row = { id: nr, marca: finalMarca,
                diam: parseInt(getVal('persDiam'))||8,
                clasa: getVal('persClasa')||'BST500S',
                segments: JSON.parse(JSON.stringify(persSegments || [])),
                buc: parseInt(getVal('persBuc'))||10
            }; break;
    }
    calcRowValues(type, row); tableData[type].push(row);
    renderTable(type); updateTableTotals(type); updateGrandTotal(); saveToLocalStorage();
}

function updateTableRow(type, id, field, value) {
    const row = tableData[type].find(r => r.id === id); if (!row) return;
    if (['marca', 'clasa', 'tip', 'diam', 'mod', 'model', 'dim'].includes(field)) row[field] = value;
    else row[field] = parseFloat(value) || 0;
    calcRowValues(type, row);
    
    const p = `${type}_${id}`;
    const setEl = (sfx, val) => { const e = document.getElementById(`${p}_${sfx}`); if (e) e.textContent = val; };
    if (['etrieri','agrafe','profileU','bare','arcade', 'personalizat'].includes(type)) {
        setEl('lungBuc', row.lungBuc.toFixed(2)); setEl('lungTot', row.lungTot.toFixed(2));
        setEl('gSp', row.gSp.toFixed(3));
    } else if (type==='sarma') { setEl('lungTot', (row.L*row.buc).toFixed(2)); setEl('gSp', row.gSp.toFixed(3)); }
    else if (type==='tabla') setEl('mpTot', row.mpTot.toFixed(2));
    else if (type==='cornier') { setEl('lungTot', (row.L*row.buc).toFixed(2)); setEl('gSp', row.gSp.toFixed(3)); }
    setEl('gTot', row.gTot.toFixed(2)); setEl('pret', row.pret.toFixed(2));
    
    updateTableTotals(type); updateGrandTotal(); saveToLocalStorage();
    if (['tip', 'diam', 'mod', 'model', 'dim'].includes(field)) renderTable(type);
}

function deleteRow(type, id) {
    tableData[type] = tableData[type].filter(r => r.id !== id);
    renderTable(type); updateTableTotals(type); updateGrandTotal(); saveToLocalStorage();
}

function renderTable(type) {
    const tbody = document.getElementById(`tbody${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (!tbody) return;
    if (tableData[type].length === 0) {
        tbody.innerHTML = `<tr><td colspan="15" class="empty-state">Apasa pe "Adauga rand" pentru a incepe</td></tr>`;
        return;
    }
    let html = '';
    tableData[type].forEach((row, idx) => {
        const p = `${type}_${row.id}`;
        const inp = (f, v, s) => `<input type="number" value="${v}" step="${s||1}" onchange="updateTableRow('${type}', ${row.id}, '${f}', this.value)" oninput="updateTableRow('${type}', ${row.id}, '${f}', this.value)">`;
        const inpTxt = (f, v) => `<input type="text" value="${v}" onchange="updateTableRow('${type}', ${row.id}, '${f}', this.value)" style="min-width:60px">`;
        const comp = (sfx, val) => `<span class="computed" id="${p}_${sfx}">${val}</span>`;
        html += '<tr>'; html += `<td>${idx + 1}</td>`; html += `<td>${inpTxt('marca', row.marca)}</td>`;
        if (type === 'sarma') {
            html += `<td><select onchange="updateTableRow('${type}', ${row.id}, 'tip', this.value)">${sarmaTipOptions(row.tip)}</select></td>`;
            html += `<td><select onchange="updateTableRow('${type}', ${row.id}, 'diam', this.value)">${sarmaDiamOptions(row.diam)}</select></td>`;
            html += `<td>${inp('L', row.L, 5)}</td><td>${inp('buc', row.buc, 1)}</td>`;
            html += `<td>${comp('lungTot', (row.L*row.buc).toFixed(2))} m</td><td>${comp('gSp', row.gSp.toFixed(3))}</td>`;
        } else if (type === 'tabla') {
            html += `<td><select onchange="updateTableRow('${type}', ${row.id}, 'mod', this.value)">${tablaModOptions(row.mod)}</select></td>`;
            if (row.mod==='dreapta'){ html += `<td>${inp('gros', row.gros, 0.1)} mm</td><td>${row.lat}x${row.lung}</td>`; }
            else { html += `<td><select onchange="updateTableRow('${type}', ${row.id}, 'model', this.value)">${tablaModelOptions(row.model)}</select></td><td>${inp('mpTotal', row.mpTotal, 1)} mp</td>`; }
            html += `<td>${inp('buc', row.buc, 1)}</td><td>${comp('mpTot', row.mpTot.toFixed(2))} mp</td>`;
        } else if (type === 'cornier') {
            html += `<td colspan="2"><select onchange="updateTableRow('${type}', ${row.id}, 'dim', this.value)">${cornierDimOptions(row.dim)}</select></td>`;
            html += `<td>${inp('L', row.L, 1)}</td><td>${inp('buc', row.buc, 1)}</td>`;
            html += `<td>${comp('lungTot', (row.L*row.buc).toFixed(2))} m</td><td>${comp('gSp', row.gSp.toFixed(3))}</td>`;
        } else if (type === 'personalizat') {
            html += `<td><select onchange="updateTableRow('${type}', ${row.id}, 'diam', this.value)">${diameterOptions(row.diam)}</select></td>`;
            html += `<td><select onchange="updateTableRow('${type}', ${row.id}, 'clasa', this.value)">${clasaOptions(row.clasa)}</select></td>`;
            const segStr = (row.segments || []).map(s => `${s.L}cm(${s.angle}&deg;)`).join(', ');
            html += `<td style="font-size: 11px;">${segStr}</td>`;
            html += `<td>${comp('lungBuc', row.lungBuc.toFixed(2))}</td><td>${inp('buc', row.buc, 1)}</td>`;
            html += `<td>${comp('lungTot', row.lungTot.toFixed(2))} m</td><td>${comp('gSp', row.gSp.toFixed(3))}</td>`;
        } else {
            if (type === 'arcade') {
                html += `<td>${inp('diamExt', row.diamExt||33.7, 0.1)}</td>`;
                html += `<td>${inp('grosime', row.grosime||2, 0.1)}</td>`;
            } else {
                html += `<td><select onchange="updateTableRow('${type}', ${row.id}, 'diam', this.value)">${diameterOptions(row.diam)}</select></td>`;
                html += `<td><select onchange="updateTableRow('${type}', ${row.id}, 'clasa', this.value)">${clasaOptions(row.clasa)}</select></td>`;
            }
            if (type==='etrieri') html += `<td>${inp('A', row.A)}</td><td>${inp('B', row.B)}</td><td>${inp('cioc', row.cioc)}</td>`;
            if (type==='agrafe') html += `<td>${inp('L', row.L)}</td><td>${inp('cioc', row.cioc)}</td>`;
            if (type==='arcade') html += `<td>${inp('D', row.D)}</td><td>${inp('H', row.H)}</td>`;
            if (type==='profileU') html += `<td>${inp('A', row.A)}</td><td>${inp('B', row.B)}</td><td>${inp('C', row.C)}</td>`;
            if (type==='bare') html += `<td>${inp('L', row.L, 10)}</td>`;
            html += `<td>${comp('lungBuc', row.lungBuc.toFixed(2))}</td><td>${inp('buc', row.buc, 1)}</td>`;
            html += `<td>${comp('lungTot', row.lungTot.toFixed(2))} m</td><td>${comp('gSp', row.gSp.toFixed(3))}</td>`;
        }
        html += `<td>${comp('gTot', row.gTot.toFixed(2))} kg</td><td>${comp('pret', row.pret.toFixed(2))} lei</td>`;
        html += `<td class="actions-cell"><button class="btn-delete-row" onclick="deleteRow('${type}', ${row.id})">X</button></td>`;
        html += '</tr>';
    }); tbody.innerHTML = html;
}

// ========================
// PERSISTENCE & TOTALS
// ========================
function saveToLocalStorage() { localStorage.setItem('armaturiData_v6', JSON.stringify({ tableData, rowCounters, pretKg: getPretKg() })); }
function loadFromLocalStorage() {
    const saved = localStorage.getItem('armaturiData_v6') || localStorage.getItem('armaturiData');
    if (saved) { try { const p = JSON.parse(saved); Object.keys(tableData).forEach(k => { if(p.tableData[k]) tableData[k]=p.tableData[k]; }); Object.assign(rowCounters, p.rowCounters); if (p.pretKg) document.getElementById('pretKg').value = p.pretKg; } catch(e){} }
}

function updateTableTotals(type) {
    const data = tableData[type]; const g = data.reduce((s, r)=>s+r.gTot, 0); const p = data.reduce((s, r)=>s+r.pret, 0);
    const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v.toFixed(2); };
    setT(`total${type.charAt(0).toUpperCase()+type.slice(1)}Greut`, g); setT(`total${type.charAt(0).toUpperCase()+type.slice(1)}Pret`, p);
    
    const summaryEl = document.getElementById(`diamSummary${type.charAt(0).toUpperCase()+type.slice(1)}`);
    if (summaryEl) {
        if (data.length === 0) summaryEl.innerHTML = '';
        else {
            const gr = {}; 
            data.forEach(r => { 
                const d = type === 'arcade' ? (r.diamExt + "x" + r.grosime) : r.diam; 
                gr[d] = (gr[d]||0) + r.gTot; 
            });
            const pts = Object.keys(gr).sort().map(d => `<span class="summary-chip"><b>${type === 'arcade' ? 'Țeavă ' : 'Diam'}${d}</b>: ${gr[d].toFixed(2)} kg</span>`);
            summaryEl.innerHTML = `<span class="summary-title">Rezumat Diametre:</span> ${pts.join(' ')}`;
        }
    }
}

function updateGrandTotal() {
    const tg = Object.keys(tableData).reduce((s, t)=>s + tableData[t].reduce((ss, r)=>ss+r.gTot, 0),0);
    const tp = Object.keys(tableData).reduce((s, t)=>s + tableData[t].reduce((ss, r)=>ss+r.pret, 0),0);
    const tr = Object.keys(tableData).reduce((s, t)=>s + tableData[t].length, 0);
    const weightEl = document.getElementById('grandTotalWeight');
    const priceEl = document.getElementById('grandTotalPrice');
    const rowsEl = document.getElementById('grandTotalRows');
    if (weightEl) weightEl.textContent = `${tg.toFixed(2)} kg`;
    if (priceEl) priceEl.textContent = `${tp.toFixed(2)} lei`;
    if (rowsEl) rowsEl.textContent = tr;
}

function initParticles() {
    const c = document.getElementById('bgParticles'); if (!c) return;
    for (let i=0; i<20; i++) {
        const p = document.createElement('div'); p.className='bg-particle';
        p.style.cssText=`left:${Math.random()*100}%; top:${Math.random()*100}%; animation-delay:${Math.random()*10}s; width:${Math.random()*4+2}px`;
        c.appendChild(p);
    }
}

async function exportAllToExcel() {
    try {
        const wb = new ExcelJS.Workbook();
        
        Object.keys(tableData).forEach(t => { 
            if(tableData[t].length > 0){ 
                const ws = wb.addWorksheet(t.toUpperCase());
                
                // Set page setup for A4
                ws.pageSetup.paperSize = 9; // A4
                ws.pageSetup.orientation = 'landscape';
                ws.pageSetup.fitToPage = true;
                ws.pageSetup.fitToWidth = 1;
                ws.pageSetup.fitToHeight = 0;
                ws.pageSetup.margins = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };

                // Define headers based on type
                let headers = [];
                if (t === 'etrieri') headers = ['Nr', 'Marca', 'Diam', 'Clasa', 'A (cm)', 'B (cm)', 'Cioc (cm)', 'Buc', 'Lung/Buc (m)', 'Lung Tot (m)', 'G Spec (kg/m)', 'G Tot (kg)', 'Pret (lei)'];
                else if (t === 'agrafe') headers = ['Nr', 'Marca', 'Diam', 'Clasa', 'L (cm)', 'Cioc (cm)', 'Buc', 'Lung/Buc (m)', 'Lung Tot (m)', 'G Spec (kg/m)', 'G Tot (kg)', 'Pret (lei)'];
                else if (t === 'arcade') headers = ['Nr', 'Marca', 'D.Ext (mm)', 'Grosime (mm)', 'D (cm)', 'H Total (cm)', 'Buc', 'Lung/Buc (m)', 'Lung Tot (m)', 'G Spec (kg/m)', 'G Tot (kg)', 'Pret (lei)'];
                else if (t === 'profileU') headers = ['Nr', 'Marca', 'Diam', 'Clasa', 'A (cm)', 'B (cm)', 'C (cm)', 'Buc', 'Lung/Buc (m)', 'Lung Tot (m)', 'G Spec (kg/m)', 'G Tot (kg)', 'Pret (lei)'];
                else if (t === 'bare') headers = ['Nr', 'Marca', 'Diam', 'Clasa', 'L (cm)', 'Buc', 'Lung/Buc (m)', 'Lung Tot (m)', 'G Spec (kg/m)', 'G Tot (kg)', 'Pret (lei)'];
                else if (t === 'sarma') headers = ['Nr', 'Marca', 'Tip', 'Diam', 'Lung (m)', 'Buc', 'Lung Tot (m)', 'G Spec (kg/m)', 'G Tot (kg)', 'Pret (lei)'];
                else if (t === 'tabla') headers = ['Nr', 'Marca', 'Mod', 'Spec/Model', 'Dim/Mp', 'Buc', 'Mp Tot (mp)', 'G Tot (kg)', 'Pret (lei)'];
                else if (t === 'cornier') headers = ['Nr', 'Marca', 'Dim', 'Lung (m)', 'Buc', 'Lung Tot (m)', 'G Spec (kg/m)', 'G Tot (kg)', 'Pret (lei)'];
                else if (t === 'personalizat') headers = ['Nr', 'Marca', 'Diam', 'Clasa', 'Segmente', 'Buc', 'Lung/Buc (m)', 'Lung Tot (m)', 'G Spec (kg/m)', 'G Tot (kg)', 'Pret (lei)'];

                const headerRow = ws.addRow(headers);
                headerRow.eachCell((cell) => {
                    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                });

                tableData[t].forEach((r, idx) => {
                    let rowVals = [];
                    if (t === 'etrieri') rowVals = [idx+1, r.marca, r.diam, r.clasa, r.A, r.B, r.cioc, r.buc, r.lungBuc, r.lungTot, r.gSp, r.gTot, r.pret];
                    else if (t === 'agrafe') rowVals = [idx+1, r.marca, r.diam, r.clasa, r.L, r.cioc, r.buc, r.lungBuc, r.lungTot, r.gSp, r.gTot, r.pret];
                    else if (t === 'arcade') rowVals = [idx+1, r.marca, r.diamExt, r.grosime, r.D, r.H, r.buc, r.lungBuc, r.lungTot, r.gSp, r.gTot, r.pret];
                    else if (t === 'profileU') rowVals = [idx+1, r.marca, r.diam, r.clasa, r.A, r.B, r.C, r.buc, r.lungBuc, r.lungTot, r.gSp, r.gTot, r.pret];
                    else if (t === 'bare') rowVals = [idx+1, r.marca, r.diam, r.clasa, r.L, r.buc, r.lungBuc, r.lungTot, r.gSp, r.gTot, r.pret];
                    else if (t === 'sarma') rowVals = [idx+1, r.marca, r.tip, r.diam, r.L, r.buc, (r.L*r.buc), r.gSp, r.gTot, r.pret];
                    else if (t === 'tabla') rowVals = [idx+1, r.marca, r.mod, r.mod==='dreapta'?r.gros:r.model, r.mod==='dreapta'?`${r.lat}x${r.lung}`:r.mpTotal, r.buc, r.mpTot, r.gTot, r.pret];
                    else if (t === 'cornier') rowVals = [idx+1, r.marca, r.dim, r.L, r.buc, (r.L*r.buc), r.gSp, r.gTot, r.pret];
                    else if (t === 'personalizat') {
                        const segStr = (r.segments || []).map(s => `${s.L}cm(${s.angle}°)`).join(', ');
                        rowVals = [idx+1, r.marca, r.diam, r.clasa, segStr, r.buc, r.lungBuc, r.lungTot, r.gSp, r.gTot, r.pret];
                    }
                    
                    const addedRow = ws.addRow(rowVals);
                    addedRow.eachCell((cell) => {
                        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                        cell.alignment = { horizontal: 'center' };
                    });
                });

                // Auto-fit columns (rough estimation)
                ws.columns.forEach(col => { col.width = 12; });
            } 
        });

        const buf = await wb.xlsx.writeBuffer();
        const d = new Date().toISOString().slice(0,10);
        saveAs(new Blob([buf]), `Calculator_Armaturi_${d}.xlsx`);
        showToast("Excel optimizat A4 generat!");
    } catch(e) { 
        console.error(e);
        showToast("Eroare Export Excel"); 
    }
}

function printToPDF() {
    const style = document.createElement('style');
    style.innerHTML = `
        @page {
            margin: 15mm 12mm 15mm 12mm;
            size: A4 portrait;
        }
        @media print {
            /* Reset everything that's not the print area */
            html, body {
                height: auto !important;
                overflow: visible !important;
                background: #fff !important;
            }
            /* Hide ALL page elements by default */
            body > *:not(#print-area) {
                display: none !important;
            }
            /* Also explicitly hide fixed/sticky elements that can create phantom pages */
            nav, header, footer, .summary-footer, #summaryFooter,
            .tab-nav, #loginOverlay, #editModeTopBanner,
            .toast-container, [id^="tabIndicator"] {
                display: none !important;
            }

            #print-area {
                display: block !important;
                position: static !important;
                left: 0; top: 0;
                width: 100%;
                color: #1e293b;
                background: #fff;
                font-family: 'Segoe UI', Arial, sans-serif;
                padding: 0;
                margin: 0;
            }

            .print-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e40af; padding-bottom: 10px; margin-bottom: 20px; }
            .logo-container { width: 60px; height: 60px; background: #f1f5f9; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
            .logo-container img { width: 100%; height: auto; }
            .header-info { text-align: right; }
            .header-info h1 { margin: 0; color: #1e40af; font-size: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
            .header-info p { margin: 2px 0 0 0; color: #64748b; font-size: 11px; }

            .section-title { background: #1e3a8a !important; color: #ffffff !important; padding: 5px 12px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin-top: 15px; margin-bottom: 0; border-radius: 4px 4px 0 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

            table { width: 100%; border-collapse: collapse; margin-bottom: 0; page-break-inside: auto; }
            thead { display: table-header-group; }
            th { background: #f8fafc !important; color: #475569 !important; font-weight: bold; text-transform: uppercase; font-size: 10px; padding: 6px 4px; border: 1px solid #e2e8f0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            td { padding: 4px; text-align: center; font-size: 10.5px; border: 1px solid #e2e8f0; color: #1e293b; }

            tr:nth-child(even) { background: #fdfdfd !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            tr { page-break-inside: avoid; }

            .group-total-row { background: #eff6ff !important; font-weight: bold; color: #1e40af !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10.5px; }
            .group-total-row td { border-top: 1.5px solid #1e40af; padding: 6px 4px; }

            .grand-summary { margin-top: 20px; background: #f8fafc; border: 2px solid #1e40af; border-radius: 6px; padding: 15px; page-break-inside: avoid; }
            .grand-summary h2 { margin: 0 0 10px 0; font-size: 16px; color: #1e40af; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; }
            .summary-item { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #cbd5e1; font-size: 11px; }
            .summary-item:last-child { border-bottom: none; font-size: 15px; font-weight: bold; color: #1e40af; padding-top: 8px; }

            .footer { margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; page-break-after: avoid; }
        }
    `;
    document.head.appendChild(style);

    const printArea = document.createElement('div');
    printArea.id = 'print-area';
    
    let content = `
        <div class="print-header">
            <div class="logo-container">
                <img src="construction_steel_logo.png" onerror="this.src='https://via.placeholder.com/60/1e40af/ffffff?text=ELV'">
            </div>
            <div class="header-info">
                <h1>${document.getElementById('ownName').value || 'Extras Armatura Pro'}</h1>
                <p>${document.getElementById('ownCUI').value || ''} | ${document.getElementById('ownJ').value || ''}</p>
                <p>IBAN: ${document.getElementById('ownIBAN').value || ''} | Banca: ${document.getElementById('ownBanca').value || ''}</p>
            </div>
            <div style="text-align: right; border-left: 2px solid #1e40af; padding-left: 15px;">
                <h2 style="margin:0; font-size: 14px; color: #1e40af;">BENEFICIAR</h2>
                <p style="margin:2px 0; font-weight:bold; font-size:12px;">${document.getElementById('projClient').value || 'Client General'}</p>
                <p style="margin:2px 0; font-size:10px;">${document.getElementById('projAdresa').value || '-'}</p>
                <p style="margin:5px 0 0 0; font-size:10px; color: #64748b;">Proiect: ${document.getElementById('projName').value || 'Nesalvat'}</p>
                <p style="margin:0; font-size:9px;">Data: ${new Date().toLocaleDateString('ro-RO')}</p>
            </div>
        </div>
    `;

    const globalDiamSums = {};
    let totalWeight = 0;

    Object.keys(tableData).forEach(type => {
        if (tableData[type].length > 0) {
            const grouped = {};
            tableData[type].forEach(r => {
                const d = type === 'arcade' ? (r.diamExt + "x" + r.grosime) : (r.diam || r.dim || "Diverse");
                if (!grouped[d]) grouped[d] = [];
                grouped[d].push(r);
            });

            const sortedDiams = Object.keys(grouped).sort((a,b) => parseFloat(a) - parseFloat(b));

            sortedDiams.forEach(diam => {
                content += `<div class="section-title">${type.toUpperCase()} | DIAMETRU ${diam} MM</div>`;
                content += `<table>
                    <thead>
                        <tr><th>Nr</th><th>Marca</th><th style="width:80px;">Diam</th><th>Schiță</th><th>Dimensiuni Detaliate</th><th style="width:60px;">Buc</th><th>Greutate (kg)</th></tr>
                    </thead>
                    <tbody>`;
                
                let subtotal = 0;
                grouped[diam].forEach((r, idx) => {
                    let detalii = "";
                    if (type === 'etrieri') detalii = `${r.A}x${r.B} cm (c:${r.cioc} cm)`;
                    else if (type === 'agrafe') detalii = `L:${r.L} cm | Ciocauri:${r.cioc} cm`;
                    else if (type === 'arcade') detalii = `Teava ${r.diamExt}x${r.grosime} | D:${r.D} cm H.Tot:${r.H} cm`;
                    else if (type === 'profileU') detalii = `${r.A}+${r.B}+${r.C} cm`;
                    else if (type === 'bare') detalii = `Bara dreapta L=${r.L} cm`;
                    else detalii = r.tip || r.model || r.dim || "-";

                    let schita = "";
                    if (type === 'etrieri') {
                        schita = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="35" style="display:inline-block; vertical-align:middle; visibility:visible !important;"><rect x="5" y="5" width="40" height="25" fill="none" stroke="#1e40af" stroke-width="2" rx="2" style="visibility:visible !important;"/></svg>`;
                    } else if (type === 'agrafe') {
                        schita = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="35" style="display:inline-block; vertical-align:middle; visibility:visible !important;"><path d="M 5,25 L 5,10 L 45,10 L 45,25" fill="none" stroke="#1e40af" stroke-width="2" style="visibility:visible !important;"/></svg>`;
                    } else if (type === 'profileU') {
                        schita = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="35" style="display:inline-block; vertical-align:middle; visibility:visible !important;"><path d="M 5,10 L 5,30 L 45,30 L 45,10" fill="none" stroke="#1e40af" stroke-width="2" style="visibility:visible !important;"/></svg>`;
                    } else if (type === 'arcade') {
                        schita = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="35" style="display:inline-block; vertical-align:middle; visibility:visible !important;"><path d="M 5,28 A 20,20 0 0,1 45,28" fill="none" stroke="#1e40af" stroke-width="2" style="visibility:visible !important;"/></svg>`;
                    } else if (type === 'bare') {
                        schita = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="35" style="display:inline-block; vertical-align:middle; visibility:visible !important;"><line x1="5" y1="18" x2="45" y2="18" stroke="#1e40af" stroke-width="2" style="visibility:visible !important;"/></svg>`;
                    } else if (type === 'personalizat') {
                        let segs = r.segments || [];
                        if (segs.length === 0 && r.segmentsStr) {
                            try {
                                segs = r.segmentsStr.split(',').map(s => {
                                    let parts = s.trim().match(/([\d.]+)\s*cm\s*\(([-\d.]+)\s*°\)/);
                                    if (parts) return { L: parseFloat(parts[1]), angle: parseFloat(parts[2]) };
                                    return null;
                                }).filter(Boolean);
                            } catch(e) {}
                        }
                        if (segs.length > 0) {
                            let pts = [{x: 0, y: 0}];
                            let curX = 0, curY = 0;
                            let globA = 0;
                            segs.forEach(s => {
                                globA += (s.angle || 0);
                                const rad = globA * Math.PI / 180;
                                curX += (s.L || 0) * Math.cos(rad);
                                curY += (s.L || 0) * Math.sin(rad);
                                pts.push({x: curX, y: curY});
                            });
                            let minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
                            let minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
                            let rw = maxX - minX || 1;
                            let rh = maxY - minY || 1;
                            let sc = Math.min(40 / rw, 25 / rh);
                            if (sc > 4) sc = 4;
                            let finalPts = pts.map(p => ({
                                x: 5 + (p.x - minX) * sc,
                                y: 5 + (p.y - minY) * sc
                            }));
                            let dStr = `M ${finalPts[0].x},${finalPts[0].y} ` + finalPts.slice(1).map(p => `L ${p.x},${p.y}`).join(' ');
                            schita = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="35" style="display:inline-block; vertical-align:middle; visibility:visible !important;"><path d="${dStr}" fill="none" stroke="#1e40af" stroke-width="2" stroke-linecap="round" style="visibility:visible !important;"/></svg>`;
                        } else {
                            schita = `-`;
                        }
                    } else {
                        schita = `-`;
                    }

                    content += `<tr>
                        <td>${idx + 1}</td>
                        <td style="font-weight:bold;">${r.marca}</td>
                        <td>${diam} mm</td>
                        <td style="text-align:center;">${schita}</td>
                        <td style="text-align:left; padding-left:10px;">${detalii}</td>
                        <td>${r.buc}</td>
                        <td style="font-weight:600;">${r.gTot.toFixed(2)}</td>
                    </tr>`;
                    subtotal += r.gTot;
                });
                
                content += `<tr class="group-total-row">
                    <td colspan="6" style="text-align:right; text-transform:uppercase;">Subtotal Grosime ${diam} mm:</td>
                    <td>${subtotal.toFixed(2)} kg</td>
                </tr>`;
                content += `</tbody></table>`;
                globalDiamSums[diam] = (globalDiamSums[diam] || 0) + subtotal;
                totalWeight += subtotal;
            });
        }
    });

    content += `<div class="grand-summary"><h2>REZUMAT TOTAL DIAMETRE</h2>`;
    Object.keys(globalDiamSums).sort().forEach(d => {
        const isArcade = d.includes('x');
        content += `<div class="summary-item"><span>${isArcade ? 'Teava Rotunda' : 'Fier Diametru'} ${isArcade ? '' : 'Ø'}${d}</span><span>${globalDiamSums[d].toFixed(2)} kg</span></div>`;
    });
    content += `<div class="summary-item"><span>TOTAL GENERAL PROIECT</span><span>${totalWeight.toFixed(2)} kg</span></div></div>`;
    content += `<div class="footer"><p>Raport Tehnic Profesional - Automatizat</p></div>`;

    printArea.innerHTML = content;
    document.body.appendChild(printArea);
    window.print();
    setTimeout(() => {
        try { document.body.removeChild(printArea); } catch(e) {}
        try { document.head.removeChild(style); } catch(e) {}
    }, 1000);
}

function printProjectToPDF(id) {
    console.log("Attempting to print project with ID:", id);
    const projects = getProjectsFromStorage();
    const p = projects.find(x => x.id && x.id.toString() === id.toString());
    if (!p) { 
        alert('Proiectul nu a fost găsit în baza de date locală!'); 
        return; 
    }
    
    const origData = JSON.parse(JSON.stringify(tableData));
    
    // Clear and fill tableData without reassigning
    Object.keys(tableData).forEach(k => delete tableData[k]);
    Object.keys(p.data || {}).forEach(k => { tableData[k] = p.data[k]; });
    
    const origClient = document.getElementById('projClient').value;
    const origAdresa = document.getElementById('projAdresa').value;
    const origName = document.getElementById('projName').value;
    
    document.getElementById('projClient').value = p.client || '';
    document.getElementById('projAdresa').value = p.adresa || '';
    document.getElementById('projName').value = p.name || '';
    
    printToPDF();
    
    // Restore origData
    Object.keys(tableData).forEach(k => delete tableData[k]);
    Object.keys(origData).forEach(k => { tableData[k] = origData[k]; });
    
    document.getElementById('projClient').value = origClient;
    document.getElementById('projAdresa').value = origAdresa;
    document.getElementById('projName').value = origName;
}

// ========================
// PROJECT MANAGEMENT & CUI LOOKUP
// ========================

function saveOwnSettings() {
    const settings = {
        name: document.getElementById('ownName').value,
        cui: document.getElementById('ownCUI').value,
        j: document.getElementById('ownJ').value,
        iban: document.getElementById('ownIBAN').value,
        banca: document.getElementById('ownBanca').value
    };
    localStorage.setItem('arm_own_settings', JSON.stringify(settings));
}

function loadOwnSettings() {
    const saved = localStorage.getItem('arm_own_settings');
    if (saved) {
        const s = JSON.parse(saved);
        document.getElementById('ownName').value = s.name || '';
        document.getElementById('ownCUI').value = s.cui || '';
        document.getElementById('ownJ').value = s.j || '';
        document.getElementById('ownIBAN').value = s.iban || '';
        document.getElementById('ownBanca').value = s.banca || '';
    }
}

async function lookupCUI() {
    const cuiInput = document.getElementById('projCUI').value.trim();
    if (!cuiInput) { showToast('Introdu un CUI valid!'); return; }
    
    const cleanCUI = parseInt(cuiInput.toUpperCase().replace('RO', '').trim());
    if (isNaN(cleanCUI)) { showToast('CUI invalid!'); return; }
    
    showToast('Cautare firma (ANAF)...');

    const today = new Date().toISOString().split('T')[0];
    const payload = JSON.stringify([{ cui: cleanCUI, data: today }]);
    
    // Primary: direct ANAF API
    const targetUrl = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';
    
    try {
        let response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        const data = await response.json();
        
        if (data.found && data.found.length > 0) {
            const firm = data.found[0].date_generale;
            document.getElementById('projClient').value = firm.denumire || '';
            document.getElementById('projAdresa').value = firm.adresa || '';
            showToast('Firma gasita (ANAF)!');
            return;
        } else {
            showToast('CUI inexistent.');
            return;
        }
    } catch (err) {
        console.warn("Direct ANAF CORS/Network failed, trying proxy...");
    }

    try {
        // Fallback: ANAF through Proxy
        const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(targetUrl);
        let proxyResponse = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        const data2 = await proxyResponse.json();
        
        if (data2.found && data2.found.length > 0) {
            const firm = data2.found[0].date_generale;
            document.getElementById('projClient').value = firm.denumire || '';
            document.getElementById('projAdresa').value = firm.adresa || '';
            showToast('Firma gasita (Proxy)!');
        } else {
            showToast('CUI inexistent.');
        }
    } catch (err2) {
        console.error("Lookup failed completely", err2);
        showToast('Eroare retea ANAF. Introdu manual.');
    }
}

function saveQuickPF() {
    const nume = document.getElementById('etrQuickNume').value.trim();
    if (!nume) { showToast('Introdu numele clientului / lucrării!'); return; }
    
    // Set the global project details (syncing with the Proiecte tab)
    document.getElementById('projClient').value = nume;
    document.getElementById('projAdresa').value = document.getElementById('etrQuickAdresa').value.trim();
    document.getElementById('projCUI').value = '';
    
    // Auto-generate project name
    const dateStr = new Date().toLocaleDateString('ro-RO');
    document.getElementById('projName').value = `Proiect ${nume} - ${dateStr}`;
    
    // Save to history
    saveCurrentProject();
    
    // Optional feedback
    document.getElementById('etrQuickNume').value = '';
    document.getElementById('etrQuickAdresa').value = '';
}

function getProjectsFromStorage() {
    try {
        const key = getUserStorageKey();
        const saved = localStorage.getItem(key);
        if (!saved) return [];
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("Storage error:", e);
        return [];
    }
}

function saveCurrentProject() {
    const nameInput = document.getElementById('projName');
    const name = nameInput ? nameInput.value.trim() : '';
    
    if (!name) { 
        showToast('Nume proiect obligatoriu!'); 
        return; 
    }
    
    const projects = getProjectsFromStorage();
    const timestamp = Date.now();
    const isEditing = editingProjectId !== null;

    let projObj;
    if (isEditing) {
        // UPDATE existing project
        const existIdx = projects.findIndex(p => p.id && p.id.toString() === editingProjectId.toString());
        if (existIdx === -1) { showToast('Proiectul nu mai exista!'); return; }
        projObj = {
            ...projects[existIdx],
            lastUpdated: timestamp,
            name: name,
            client: document.getElementById('projClient').value,
            cui: document.getElementById('projCUI').value,
            adresa: document.getElementById('projAdresa').value,
            data: JSON.parse(JSON.stringify(tableData)),
            totalWeight: parseFloat(document.getElementById('grandTotalWeight').textContent) || 0
        };
        projects[existIdx] = projObj;
        localStorage.setItem(getUserStorageKey(), JSON.stringify(projects));
        if (isCloudActive && db) {
            db.collection(getUserCloudCollection()).doc(projObj.id.toString()).set(projObj)
              .catch(() => {});
        }
        showToast('Proiect actualizat cu succes!');
        renderHistory();
        cancelEditProject();
        return;
    }

    // CREATE new project
    projObj = {
        id: timestamp,
        lastUpdated: timestamp,
        date: new Date().toLocaleString('ro-RO'),
        name: name,
        client: document.getElementById('projClient').value,
        cui: document.getElementById('projCUI').value,
        adresa: document.getElementById('projAdresa').value,
        data: JSON.parse(JSON.stringify(tableData)),
        totalWeight: parseFloat(document.getElementById('grandTotalWeight').textContent) || 0,
        completed: false
    };

    if (isCloudActive && db) {
        db.collection(getUserCloudCollection()).doc(projObj.id.toString()).set(projObj)
          .then(() => {
              projects.push(projObj);
              localStorage.setItem(getUserStorageKey(), JSON.stringify(projects));
              showToast('✅ Salvat în Cloud și Local!');
              renderHistory();
              resetForNewProject();
          })
          .catch(() => saveLocalOnly(projObj, projects));
    } else {
        saveLocalOnly(projObj, projects);
    }
}

function saveLocalOnly(newProj, projects) {
    projects.push(newProj);
    localStorage.setItem(getUserStorageKey(), JSON.stringify(projects));
    showToast('✅ Proiect salvat local!');
    renderHistory();
    resetForNewProject();
}

/**
 * Clears all tables and form fields after saving a project.
 * Allows immediately starting a new project without manual cleanup.
 */
function resetForNewProject() {
    // Clear all table data
    Object.keys(tableData).forEach(k => { tableData[k] = []; });
    // Reset row counters
    Object.keys(rowCounters).forEach(k => { rowCounters[k] = 0; });
    // Clear project form fields
    ['projName', 'projClient', 'projCUI', 'projAdresa'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    // Re-render all tables (now empty)
    Object.keys(tableData).forEach(t => { try { renderTable(t); } catch(e) {} });
    // Recalculate totals (will show 0)
    try { updateGrandTotal(); } catch(e) {}
    try { saveToLocalStorage(); } catch(e) {}
}

let openHistoryDetailsId = null;

function toggleProjectDetails(id) {
    if (openHistoryDetailsId === id) {
        openHistoryDetailsId = null;
    } else {
        openHistoryDetailsId = id;
    }
    renderHistory();
}

function toggleItemComplete(projId, cat, idx, isCompleted, event) {
    if(event) event.stopPropagation();
    let projects = getProjectsFromStorage();
    const proj = projects.find(x => x.id && x.id.toString() === projId.toString());
    if (!proj || !proj.data || !proj.data[cat] || !proj.data[cat][idx]) return;
    
    proj.data[cat][idx].completed = isCompleted;
    localStorage.setItem(getUserStorageKey(), JSON.stringify(projects));
    renderHistory();

    if (isCloudActive && db) {
        db.collection(getUserCloudCollection()).doc(projId.toString()).update({
            [`data.${cat}`]: proj.data[cat],
            lastUpdated: Date.now()
        }).catch(e => console.error("Cloud sync failed", e));
    }
}

function renderHistory() {
    try {
        const projects = getProjectsFromStorage();
        console.log(`renderHistory: Rendering ${projects.length} projects.`);
        const body = document.getElementById('historyTableBody');
        if (!body) {
            console.error("renderHistory: Element 'historyTableBody' not found!");
            return;
        }
        if (projects.length === 0) {
            body.innerHTML = '<tr><td colspan="6" style="padding:20px; color:rgba(255,255,255,0.4); text-align:center;">Nu există proiecte salvate.</td></tr>';
            return;
        }
    body.innerHTML = projects.map(p => {
        const isComp = p.completed ? 'checked' : '';
        const rowStyle = p.completed ? 'opacity: 0.6; background-color: rgba(16, 185, 129, 0.05);' : '';
        const textStyle = p.completed ? 'text-decoration: line-through; color: #94a3b8;' : '';
        const isExpanded = openHistoryDetailsId === p.id;
        const toggleIcon = isExpanded ? '▼' : '▶';
        
        let detailsHTML = `<tr class="history-details-row" style="display: ${isExpanded ? 'table-row' : 'none'}; background: rgba(0,0,0,0.2);">
            <td colspan="6" style="padding: 0;">
                <div style="max-height: 300px; overflow-y: auto; padding: 10px; border-bottom: 2px solid #3b82f6;">`;
                
        const validCats = Object.keys(p.data || {}).filter(cat => p.data[cat] && p.data[cat].length > 0);
        
        if (validCats.length === 0) {
            detailsHTML += `<span style="color: #64748b; font-size: 13px;">Nu există materiale în acest proiect.</span>`;
        } else {
            detailsHTML += `<table style="width: 100%; font-size: 12px; background: transparent; margin: 0; box-shadow: none;">
                <thead><tr style="background: rgba(255,255,255,0.05); color: #94a3b8;"><th style="width: 40px; text-align:center;">Gata</th><th>Cat.</th><th>Marcă</th><th>Detalii</th><th>Buc</th><th>Greutate</th></tr></thead>
                <tbody>`;
            validCats.forEach(cat => {
                if (!Array.isArray(p.data[cat])) return;
                p.data[cat].forEach((item, idx) => {
                    if (!item) return;
                    const checked = item.completed ? 'checked' : '';
                    const opac = item.completed ? 'opacity: 0.4; text-decoration: line-through;' : 'opacity: 1;';
                    
                    let desc = '';
                    if(cat==='etrieri') desc = `${item.A}x${item.B} c:${item.cioc}`;
                    else if(cat==='agrafe') desc = `L:${item.L} c:${item.cioc}`;
                    else if(cat==='arcade') desc = `D:${item.D} H:${item.H}`;
                    else if(cat==='profileU') desc = `${item.A}+${item.B}+${item.C}`;
                    else if(cat==='bare') desc = `L:${item.L}`;
                    else desc = item.dim || item.diamExt || item.tip || '-';
                    
                    detailsHTML += `<tr style="${opac} cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.02);" onclick="toggleItemComplete(${p.id}, '${cat}', ${idx}, !${item.completed || false}, event)">
                        <td style="text-align:center;" onclick="event.stopPropagation()"><input type="checkbox" ${checked} style="transform: scale(1.2); accent-color: #3b82f6; cursor:pointer;" onchange="toggleItemComplete(${p.id}, '${cat}', ${idx}, this.checked, event)"></td>
                        <td style="text-transform: capitalize; color: #60a5fa;">${cat}</td>
                        <td style="font-weight: 600;">${item.marca || '-'}</td>
                        <td style="color: #cbd5e1;">${desc}</td>
                        <td>${item.buc}</td>
                        <td style="color: #fbbf24;">${(item.gTot || 0).toFixed(2)} kg</td>
                    </tr>`;
                });
            });
            detailsHTML += `</tbody></table>`;
        }
        
        detailsHTML += `</div></td></tr>`;

        const projDate = (p.date || '').split(',')[0] || '-';
        const projWeight = typeof p.totalWeight === 'number' ? p.totalWeight.toFixed(2) : '0.00';

        return `
        <tr style="${rowStyle} cursor: pointer; transition: 0.2s;" onclick="toggleProjectDetails(${p.id})" title="Apasă pentru detalii">
            <td style="${textStyle}"><span style="color: #64748b; margin-right: 5px; font-size: 10px;">${toggleIcon}</span> ${projDate}</td>
            <td style="font-weight:bold; ${textStyle}">${p.name || 'Proiect Fără Nume'}</td>
            <td style="${textStyle}">${p.client || '-'}</td>
            <td style="${textStyle}">${projWeight} kg</td>
            <td onclick="event.stopPropagation()">
                <label style="display:flex; align-items:center; justify-content:center; gap:5px; cursor:pointer; color: #10b981; font-weight: 600; font-size: 13px;">
                    <input type="checkbox" ${isComp} onchange="toggleProjectComplete(${p.id}, this.checked)" style="transform: scale(1.3); accent-color: #10b981; cursor: pointer;">
                    ${p.completed ? 'Terminat' : ''}
                </label>
            </td>
            <td style="display:flex; gap:5px; justify-content:center;" onclick="event.stopPropagation()">
                <button class="btn-add" style="padding: 4px 8px; background:#8b5cf6;" onclick="startEditProject('${p.id}')" title="Modifică proiect">✏️</button>
                <button class="btn-add" style="padding: 4px 8px; background:#3b82f6;" onclick="printProjectToPDF('${p.id}')" title="Tipărește PDF">🖨️</button>
                <button class="btn-share" style="padding: 4px 8px; background:#ef4444;" onclick="deleteProjectFromHistory('${p.id}')" title="Șterge">🗑️</button>
            </td>
        </tr>
        ${detailsHTML}`;
    }).reverse().join('');
    } catch (err) {
        console.error("renderHistory CRASH:", err);
    }
}

function toggleProjectComplete(id, isCompleted) {
    let projects = getProjectsFromStorage();
    const proj = projects.find(x => x.id && x.id.toString() === id.toString());
    if (proj) {
        proj.completed = isCompleted;
        proj.lastUpdated = Date.now();
        localStorage.setItem(getUserStorageKey(), JSON.stringify(projects));
        renderHistory();
        if (isCloudActive && db) {
            db.collection(getUserCloudCollection()).doc(id.toString()).update({ 
                completed: isCompleted,
                lastUpdated: proj.lastUpdated
            }).catch(() => {});
        }
    }
}

function loadProjectFromHistory(id) {
    const projects = getProjectsFromStorage();
    const p = projects.find(x => x.id === id);
    if (!p || !confirm(`Încarci proiectul "${p.name}"?`)) return;
    
    // Clear current data and load saved data
    Object.keys(tableData).forEach(k => {
        tableData[k] = p.data[k] || [];
    });
    
    document.getElementById('projName').value = p.name;
    document.getElementById('projClient').value = p.client || '';
    document.getElementById('projCUI').value = p.cui || '';
    document.getElementById('projAdresa').value = p.adresa || '';
    
    Object.keys(tableData).forEach(t => renderTable(t));
    recalcAll();
    showToast('Proiect încărcat!');
    document.getElementById('tabEtrieri').click();
}

function deleteProjectFromHistory(id) {
    if (!confirm('Ștergei proiectul?')) return;
    let projects = getProjectsFromStorage();
    localStorage.setItem(getUserStorageKey(), JSON.stringify(projects.filter(x => x.id.toString() !== id.toString())));
    renderHistory();
    if (isCloudActive && db) {
        db.collection(getUserCloudCollection()).doc(id.toString()).delete().catch(() => {});
    }
}

// ========================
// EDIT PROJECT FUNCTIONS
// ========================

function startEditProject(id) {
    const projects = getProjectsFromStorage();
    const p = projects.find(x => x.id && x.id.toString() === id.toString());
    if (!p) { showToast('Proiectul nu a fost găsit!'); return; }

    if (!confirm(`Încarci proiectul "${p.name}" pentru modificare?`)) return;

    // Load data into tables
    Object.keys(tableData).forEach(k => {
        tableData[k] = (p.data && p.data[k]) ? [...p.data[k]] : [];
    });
    document.getElementById('projName').value = p.name;
    document.getElementById('projClient').value = p.client || '';
    document.getElementById('projCUI').value = p.cui || '';
    document.getElementById('projAdresa').value = p.adresa || '';
    Object.keys(tableData).forEach(t => renderTable(t));
    recalcAll();

    // Activate edit mode
    editingProjectId = id.toString();

    // Show the Proiecte tab banner
    const banner = document.getElementById('editBanner');
    const bannerName = document.getElementById('editBannerName');
    const saveBtn = document.getElementById('btnSaveProject');
    if (banner) banner.classList.add('active');
    if (bannerName) bannerName.textContent = p.name;
    if (saveBtn) saveBtn.style.display = 'none';

    // Show the sticky TOP banner (always visible on all tabs)
    const topBanner = document.getElementById('editModeTopBanner');
    const topBannerName = document.getElementById('editTopBannerName');
    if (topBanner) topBanner.style.display = 'flex';
    if (topBannerName) topBannerName.textContent = p.name;

    // Go directly to Etrieri for editing
    const tabEtr = document.getElementById('tabEtrieri');
    if (tabEtr) tabEtr.click();
    showToast(`✏️ Editează: "${p.name}" — apasă GALBEN sus pentru a salva`);
}

function cancelEditProject() {
    editingProjectId = null;
    const banner = document.getElementById('editBanner');
    const saveBtn = document.getElementById('btnSaveProject');
    const topBanner = document.getElementById('editModeTopBanner');
    if (banner) banner.classList.remove('active');
    if (saveBtn) saveBtn.style.display = '';
    if (topBanner) topBanner.style.display = 'none';
}

// ========================
// PERSONALIZAT LOGIC
// ========================
let persSegments = [{ L: 50, angle: 0 }, { L: 30, angle: 90 }];

function renderPersSegments() {
    const list = document.getElementById('segmentList');
    if(!list) return;
    let html = '';
    persSegments.forEach((seg, idx) => {
        html += `
        <div class="segment-row">
            <div class="form-group"><label>Latura ${idx+1} (cm)</label><input type="number" value="${seg.L}" oninput="updatePersSeg(${idx}, 'L', this.value)" min="0.1" step="0.1"></div>
            <div class="form-group"><label>Unghi (&deg;)</label><input type="number" value="${seg.angle}" oninput="updatePersSeg(${idx}, 'angle', this.value)" step="1"></div>
        </div>`;
    });
    list.innerHTML = html;
    calcPersonalizat();
}

function updatePersSeg(idx, field, val) {
    persSegments[idx][field] = parseFloat(val) || 0;
    calcPersonalizat();
}

function addPersSegment() {
    persSegments.push({ L: 20, angle: 90 });
    renderPersSegments();
}

function removePersSegment() {
    if(persSegments.length > 1) {
        persSegments.pop();
        renderPersSegments();
    }
}

function calcPersonalizat() {
    let totalL = persSegments.reduce((s, seg) => s + (seg.L || 0), 0) / 100;
    const diamSelect = document.getElementById('persDiam');
    const bucInput = document.getElementById('persBuc');
    if(!diamSelect || !bucInput) return;
    
    const diam = parseInt(diamSelect.value) || 8;
    const buc = parseInt(bucInput.value) || 1;
    const pretKg = getPretKg();
    const gSp = greutateSpecifica(diam);
    
    document.getElementById('persLungBuc').textContent = totalL.toFixed(2);
    document.getElementById('persLungTot').textContent = (totalL * buc).toFixed(2);
    document.getElementById('persGSp').textContent = gSp.toFixed(3);
    const gTot = totalL * buc * gSp;
    document.getElementById('persGTot').textContent = gTot.toFixed(2);
    document.getElementById('persPret').textContent = (gTot * pretKg).toFixed(2);
    
    drawCustomShape();
}

let sketchPoints = [];
let isDrawing = false;

function drawCustomShape() {
    const canvas = document.getElementById('drawCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (!isDrawing && persSegments.length > 0) {
        let mathPts = [{x: 0, y: 0}];
        let currentGlobalAngle = 0;
        let cX = 0, cY = 0;
        
        let minX = 0, maxX = 0, minY = 0, maxY = 0;
        
        persSegments.forEach(seg => {
            currentGlobalAngle += (seg.angle || 0);
            const rad = currentGlobalAngle * Math.PI / 180;
            cX += (seg.L) * Math.cos(rad);
            cY += (seg.L) * Math.sin(rad);
            mathPts.push({x: cX, y: cY});
            
            if(cX < minX) minX = cX; if(cX > maxX) maxX = cX;
            if(cY < minY) minY = cY; if(cY > maxY) maxY = cY;
        });
        
        const rawW = maxX - minX || 1;
        const rawH = maxY - minY || 1;
        
        // Auto-Zoom: Fit shape into 75% of the canvas
        const targetW = canvas.width * 0.75;
        const targetH = canvas.height * 0.75;
        
        const scaleX = targetW / rawW;
        const scaleY = targetH / rawH;
        let SC = Math.min(scaleX, scaleY);
        if (SC > 10) SC = 10; // prevent extremely huge lines for small segments
        
        const scaledW = rawW * SC;
        const scaledH = rawH * SC;
        
        const offsetX = (canvas.width - scaledW) / 2 - (minX * SC);
        const offsetY = (canvas.height - scaledH) / 2 - (minY * SC);
        
        sketchPoints = mathPts.map(p => ({ x: (p.x * SC) + offsetX, y: (p.y * SC) + offsetY }));
    }
    
    drawSketch(ctx, canvas);
}

function drawSketch(ctx, canvas, currentSnap = null) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (sketchPoints.length === 0) return;

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(sketchPoints[0].x, sketchPoints[0].y);
    for (let i = 1; i < sketchPoints.length; i++) {
        ctx.lineTo(sketchPoints[i].x, sketchPoints[i].y);
    }
    
    if (isDrawing && currentSnap) {
        ctx.lineTo(currentSnap.x, currentSnap.y);
    }
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw node dots
    ctx.fillStyle = '#ffffff';
    sketchPoints.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
    });
    
    if (isDrawing && currentSnap) {
        // Red tip dot
        ctx.fillStyle = '#f87171'; 
        ctx.beginPath();
        ctx.arc(currentSnap.x, currentSnap.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Length and angle info tooltip next to pointer
        const lastP = sketchPoints[sketchPoints.length - 1];
        const dist = Math.sqrt(Math.pow(currentSnap.x - lastP.x, 2) + Math.pow(currentSnap.y - lastP.y, 2));
        const lengthCm = Math.round(dist / 3);
        const angle = currentSnap.angle !== undefined ? Math.round(currentSnap.angle) : 0;

        ctx.font = 'bold 12px "Outfit", sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`${lengthCm} cm | ${angle}°`, currentSnap.x + 15, currentSnap.y - 15);
    }
}

function initSmartSketch() {
    const canvas = document.getElementById('drawCanvas');
    if (!canvas) return;
    
    const resizeCanvas = () => {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        drawCustomShape();
    };
    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 100);
    
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const snapPoint = (lastP, newP) => {
        if (!lastP) return newP;
        const dx = newP.x - lastP.x;
        const dy = newP.y - lastP.y;
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        angle = Math.round(angle / 45) * 45; // snap to 45 deg increments
        const dist = Math.sqrt(dx*dx + dy*dy);
        const rad = angle * Math.PI / 180;
        return { x: lastP.x + dist * Math.cos(rad), y: lastP.y + dist * Math.sin(rad), angle: angle };
    };

    const startDraw = (e) => {
        e.preventDefault();
        isDrawing = true;
        try { canvas.setPointerCapture(e.pointerId); } catch(err) {}
        const pos = getPos(e);
        if (sketchPoints.length === 0) sketchPoints.push(pos);
    };

    const doDraw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        const lastP = sketchPoints[sketchPoints.length - 1];
        const snapped = snapPoint(lastP, pos);
        drawSketch(canvas.getContext('2d'), canvas, snapped);
    };

    const endDraw = (e) => {
        if (!isDrawing) return;
        isDrawing = false;
        e.preventDefault();
        try { canvas.releasePointerCapture(e.pointerId); } catch(err) {}
        
        const pos = getPos(e);
        const lastP = sketchPoints[sketchPoints.length - 1];
        const snapped = snapPoint(lastP, pos);
        const dist = Math.sqrt(Math.pow(snapped.x - lastP.x, 2) + Math.pow(snapped.y - lastP.y, 2));
        
        if (dist > 5) { // minimum length to register
            let lengthCm = Math.round(dist / 3); // 3 pixels per cm
            let relativeAngle = snapped.angle;
            
            if (persSegments.length > 0) {
                 let prevGlobal = 0;
                 persSegments.forEach(s => prevGlobal += s.angle);
                 relativeAngle = snapped.angle - prevGlobal;
                 while(relativeAngle > 180) relativeAngle -= 360;
                 while(relativeAngle <= -180) relativeAngle += 360;
            }
            
            if (persSegments.length === 0) {
                 persSegments = [{ L: lengthCm, angle: snapped.angle }];
            } else {
                 persSegments.push({ L: lengthCm, angle: relativeAngle });
            }
            renderPersSegments(); // This calculates and redraws correctly
        } else {
            if (persSegments.length === 0) {
                sketchPoints = []; // reset if just tapped
            }
            drawCustomShape(); // reset drawing tip
        }
    };

    canvas.addEventListener('pointerdown', startDraw);
    canvas.addEventListener('pointermove', doDraw);
    canvas.addEventListener('pointerup', endDraw);
    canvas.addEventListener('pointercancel', (e) => { if(isDrawing) { isDrawing = false; try { canvas.releasePointerCapture(e.pointerId); } catch(err) {} drawCustomShape(); }});
}

function resetSmartSketch() {
    sketchPoints = [];
    persSegments = [];
    renderPersSegments();
    drawCustomShape();
}

// Call initially once DOM is ready
setTimeout(() => {
    if(document.getElementById('segmentList')) {
        persSegments = []; // Start empty so user can draw
        renderPersSegments();
        initSmartSketch();
    }
}, 500);
