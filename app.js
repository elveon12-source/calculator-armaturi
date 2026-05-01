/* ============================================
   CALCULATOR ARMATURI PRO - Logic v6.6
   Steel reinforcement & metal materials engine
   With Cache Busing & Emergency Reset
   ============================================ */

const APP_VERSION = "10.2 (Sarma Fix)";

// ========================
// GLOBAL DATA STORES
// ========================
const tableData = {
    etrieri: [], agrafe: [], arcade: [], profileU: [],
    bare: [], sarma: [], tabla: [], cornier: []
};

let rowCounters = {
    etrieri: 0, agrafe: 0, arcade: 0, profileU: 0,
    bare: 0, sarma: 0, tabla: 0, cornier: 0
};

let deferredPrompt;

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

        db.collection("arm_projects").limit(1).get()
          .then(() => {
              clearTimeout(timeout);
              updateCloudUI('connected');
              initCloudSync();
          })
          .catch(err => {
              clearTimeout(timeout);
              if (err.code === 'not-found' || err.message.includes('not exist')) {
                  updateCloudUI('not-created');
              } else {
                  console.warn("Firestore access denied:", err);
                  updateCloudUI('error');
              }
          });
    }
} catch(e) {
    console.error("Firebase init failed:", e);
}

function initCloudSync() {
    if (!db) return;
    console.log("Cloud Sync: Initializing...");
    
    // 1. LISTEN for changes from Cloud
    db.collection("arm_projects").onSnapshot(snapshot => {
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
            localStorage.setItem('arm_projects', JSON.stringify(localProjects));
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
        
        localStorage.setItem('arm_projects', JSON.stringify(finalProjects));
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
                db.collection("arm_projects").doc(proj.id.toString()).set(proj, { merge: true })
                  .catch(e => console.warn("Cloud Sync: Migration skip:", e));
            });
        }
    }, 3000);
}



// ========================
// INITIALIZATION
// ========================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initParticles();
    initPWA();
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
        // Register Service Worker with forced versioning
        navigator.serviceWorker.register(`./sw.js?v=102`).then(reg => {
            console.log('SW Registered [v102]');
            
            // Check if there is already a waiting worker
            if (reg.waiting) {
                showUpdateToast(reg);
            }

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateToast(reg);
                    }
                });
            });
        });

        // Listen for the controlling service worker changing and reload
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

function showUpdateToast(registration) {
    waitingWorker = registration.waiting || registration.installing;
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toastText');
    const updateBadge = document.getElementById('updateBadge');
    
    if (updateBadge) updateBadge.style.display = 'inline-flex';
    if (!toast || !toastText) return;
    
    toastText.innerHTML = 'Versiune noua disponibila! <button onclick="activateUpdate()" class="btn-update-toast" style="margin-left:10px; padding:2px 8px; background:#fff; color:#2563eb; border-radius:4px; font-weight:800; border:none; cursor:pointer">Actualizeaza</button>';
    toast.classList.add('show', 'update-toast');
    
    window.activateUpdate = () => {
        if (registration && registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
            window.location.reload(true);
        }
    };
}

// ========================
// RECALC ALL
// ========================
function recalcAll() {
    calcEtrieri(); calcAgrafe(); calcArcade(); calcProfileU();
    calcBare(); calcSarma(); calcTabla(); calcCornier();
    
    Object.keys(tableData).forEach(type => {
        tableData[type].forEach(row => calcRowValues(type, row));
        updateTableTotals(type);
    });
    
    updateGrandTotal();
    saveToLocalStorage();
}

function getPretKg() {
    return parseFloat(document.getElementById('pretKg').value) || 5.5;
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
    const gt = lt*gs; const p = gt*getPretKg();
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
    const gt = lt*gs; const p = gt*getPretKg();
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
    const gt = lt*gs; const p = gt*getPretKg();
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
    const gt = lt*gs; const p = gt*getPretKg();
    animateValue('profilULungBuc', lb.toFixed(2)); animateValue('profilULungTot', lt.toFixed(2));
    animateValue('profilUGSp', gs.toFixed(3)); animateValue('profilUGTot', gt.toFixed(2)); animateValue('profilUPret', p.toFixed(2));
    updateDimText('dimProfilUA', A); updateDimText('dimProfilUB', B); updateDimText('dimProfilUC', C); updateDimText('dimProfilUDiam', d);
}

function calcBare() {
    const d = parseFloat(document.getElementById('barDiam').value);
    const L = parseFloat(document.getElementById('barL').value) || 0;
    const n = parseInt(document.getElementById('barBuc').value) || 0;
    const lb = L/100; const lt = lb*n; const gs = greutateSpecificaBare(d);
    const gt = lt*gs; const p = gt*getPretKg();
    animateValue('barLungBuc', lb.toFixed(2)); animateValue('barLungTot', lt.toFixed(2));
    animateValue('barGSp', gs.toFixed(3)); animateValue('barGTot', gt.toFixed(2)); animateValue('barPret', p.toFixed(2));
    updateDimText('dimBaraL', L); updateDimText('dimBaraDiam', d);
}

function calcSarma() {
    const dStr = document.getElementById('sarDiam').value;
    const L = parseFloat(document.getElementById('sarL').value) || 0;
    const n = parseInt(document.getElementById('sarBuc').value) || 0;
    const gs = weightsSarma[dStr] || 0; const gt = L * n * gs; const p = gt * getPretKg();
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
    const gt = wMp * mpB * n; const p = gt * getPretKg();
    animateValue('tabGUnit', wMp.toFixed(2)); animateValue('tabMpBuc', mpB.toFixed(2));
    animateValue('tabGTot', gt.toFixed(2)); animateValue('tabPret', p.toFixed(2));
}

function calcCornier() {
    const dim = document.getElementById('corDim').value;
    const L = parseFloat(document.getElementById('corL').value) || 0;
    const n = parseInt(document.getElementById('corBuc').value) || 0;
    const gs = weightsCornier[dim] || 0; const weightBuc = L * gs; const gt = weightBuc * n; const p = gt * getPretKg();
    animateValue('corGSp', gs.toFixed(3)); animateValue('corMassBuc', weightBuc.toFixed(2));
    animateValue('corGTot', gt.toFixed(2)); animateValue('corPret', p.toFixed(2));
}

// ========================
// TABLE ENGINE
// ========================
function calcRowValues(type, row) {
    const pretKg = getPretKg();
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
    }
    if(!['sarma','tabla','cornier'].includes(type)){ row.lungTot = row.lungBuc*row.buc; row.gTot = row.lungTot*row.gSp; }
    row.gTot = Math.round(row.gTot*100)/100; row.pret = Math.round(row.gTot*pretKg*100)/100;
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
    if (['etrieri','agrafe','profileU','bare','arcade'].includes(type)) {
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
        @media print {
            body * { visibility: hidden; }
            #print-area, #print-area * { visibility: visible; }
            #print-area { position: absolute; left: 0; top: 0; width: 100%; color: #1e293b; background: #fff; padding: 12mm; font-family: 'Segoe UI', Arial, sans-serif; }
            
            .print-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1e40af; padding-bottom: 10px; margin-bottom: 20px; }
            .logo-container { width: 60px; height: 60px; background: #f1f5f9; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
            .logo-container img { width: 100%; height: auto; }
            .header-info { text-align: right; }
            .header-info h1 { margin: 0; color: #1e40af; font-size: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
            .header-info p { margin: 2px 0 0 0; color: #64748b; font-size: 11px; }

            .section-title { background: #1e3a8a !important; color: #ffffff !important; padding: 5px 12px; font-weight: bold; font-size: 11px; text-transform: uppercase; margin-top: 15px; margin-bottom: 0; border-radius: 4px 4px 0 0; -webkit-print-color-adjust: exact; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
            th { background: #f8fafc !important; color: #475569 !important; font-weight: bold; text-transform: uppercase; font-size: 10px; padding: 6px 4px; border: 1px solid #e2e8f0; -webkit-print-color-adjust: exact; }
            td { padding: 4px 4px; text-align: center; font-size: 10.5px; border: 1px solid #e2e8f0; color: #1e293b; }
            
            tr:nth-child(even) { background: #fdfdfd !important; -webkit-print-color-adjust: exact; }
            
            .group-total-row { background: #eff6ff !important; font-weight: bold; color: #1e40af !important; -webkit-print-color-adjust: exact; font-size: 10.5px; }
            .group-total-row td { border-top: 1.5px solid #1e40af; padding: 6px 4px; }

            .grand-summary { margin-top: 30px; background: #f8fafc; border: 2px solid #1e40af; border-radius: 6px; padding: 15px; page-break-inside: avoid; }
            .grand-summary h2 { margin: 0 0 10px 0; font-size: 16px; color: #1e40af; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; }
            .summary-item { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #cbd5e1; font-size: 11px; }
            .summary-item:last-child { border-bottom: none; font-size: 15px; font-weight: bold; color: #1e40af; padding-top: 8px; }
            
            .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px; }
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
                        <tr><th>Nr</th><th>Marca</th><th style="width:80px;">Diam</th><th>Dimensiuni Detaliate</th><th style="width:60px;">Buc</th><th>Greutate (kg)</th></tr>
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

                    content += `<tr>
                        <td>${idx + 1}</td>
                        <td style="font-weight:bold;">${r.marca}</td>
                        <td>${diam} mm</td>
                        <td style="text-align:left; padding-left:10px;">${detalii}</td>
                        <td>${r.buc}</td>
                        <td style="font-weight:600;">${r.gTot.toFixed(2)}</td>
                    </tr>`;
                    subtotal += r.gTot;
                });
                
                content += `<tr class="group-total-row">
                    <td colspan="5" style="text-align:right; text-transform:uppercase;">Subtotal Grosime ${diam} mm:</td>
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
    document.body.removeChild(printArea);
    document.head.removeChild(style);
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
        const saved = localStorage.getItem('arm_projects');
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

    const newProj = {
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
        db.collection("arm_projects").doc(newProj.id.toString()).set(newProj)
          .then(() => {
              showToast('Salvat în Cloud!');
          })
          .catch(() => saveLocalOnly(newProj, projects));
    } else {
        saveLocalOnly(newProj, projects);
    }
}

function saveLocalOnly(newProj, projects) {
    projects.push(newProj);
    localStorage.setItem('arm_projects', JSON.stringify(projects));
    showToast('Proiect salvat local!');
    renderHistory();
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
    const proj = projects.find(x => x.id === projId);
    if (!proj || !proj.data || !proj.data[cat] || !proj.data[cat][idx]) return;
    
    proj.data[cat][idx].completed = isCompleted;
    localStorage.setItem('arm_projects', JSON.stringify(projects));
    renderHistory();

    if (isCloudActive && db) {
        db.collection("arm_projects").doc(projId.toString()).update({
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
                <button class="btn-add" style="padding: 4px 8px; opacity: ${p.completed ? '0.5' : '1'};" onclick="loadProjectFromHistory(${p.id})" title="Încarcă">📂</button>
                <button class="btn-share" style="padding: 4px 8px; background:#ef4444;" onclick="deleteProjectFromHistory(${p.id})" title="Șterge">🗑️</button>
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
    const proj = projects.find(x => x.id === id);
    if (proj) {
        proj.completed = isCompleted;
        localStorage.setItem('arm_projects', JSON.stringify(projects));
        renderHistory();
        if (isCloudActive && db) {
            db.collection("arm_projects").doc(id.toString()).update({ 
                completed: isCompleted,
                lastUpdated: Date.now()
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
    if (!confirm('Ștergi proiectul?')) return;
    let projects = getProjectsFromStorage();
    localStorage.setItem('arm_projects', JSON.stringify(projects.filter(x => x.id !== id)));
    renderHistory();
    if (isCloudActive && db) {
        db.collection("arm_projects").doc(id.toString()).delete().catch(() => {});
    }
}


function shareResults(method) {
    const tg = document.getElementById('grandTotalWeight').textContent;
    const tp = document.getElementById('grandTotalPrice').textContent;
    const tr = document.getElementById('grandTotalRows').textContent;
    const url = window.location.href;
    const text = `PROIECT NOU ARMATURI\n\nRezumat:\n📦 Greutate: ${tg}\n💰 Cost estimat: ${tp}\n🔢 Total poziții: ${tr}\n\nAccesează proiectul aici:\n${url}`;

    if (method === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast("Link copiat A?n clipboard!");
        });
    }
}

