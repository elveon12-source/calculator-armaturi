/* ============================================
   CALCULATOR ARMATURI PRO - Logic v6.6
   Steel reinforcement & metal materials engine
   With Cache Busing & Emergency Reset
   ============================================ */

const APP_VERSION = "9.1 (Professional Desktop Dashboard)";

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
// INITIALIZATION
// ========================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initParticles();
    initPWA();
    loadFromLocalStorage();
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
        navigator.serviceWorker.register(`./sw.js?v=26`).then(reg => {
            console.log('SW Registered [v26]');
            
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

async function emergencyReset() {
    if (!confirm("Aceasta actiune va sterge tot cache-ul si va reseta aplicatia. Datele salvate vor ramane intacte. Continuati?")) return;
    
    try {
        // 1. Unregister all service workers
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
            await registration.unregister();
        }
        
        // 2. Delete all caches
        const cacheNames = await caches.keys();
        for (let name of cacheNames) {
            await caches.delete(name);
        }
        
        // 3. Clear session storage (optional)
        sessionStorage.clear();
        
        // 4. Hard reload
        window.location.reload(true);
    } catch (e) {
        console.error("Reset failed", e);
        window.location.reload(true);
    }
}

function shareResults(method) {
    const tg = document.getElementById('grandTotalWeight').textContent;
    const tp = document.getElementById('grandTotalPrice').textContent;
    const tr = document.getElementById('grandTotalRows').textContent;
    const url = window.location.href;
    const text = `PROIECT NOU ARMATURI\n\nRezumat:\n\uD83D\uDCC8 Greutate: ${tg}\n\uD83D\uDCC8 Cost estimat: ${tp}\n\uD83D\uDCC8 Total pozitii: ${tr}\n\nAcceseaza proiectul aici:\n${url}`;

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
    const d = parseFloat(document.getElementById('arcDiam').value);
    const D = parseFloat(document.getElementById('arcD').value) || 0;
    const H = parseFloat(document.getElementById('arcH').value) || 0;
    const n = parseInt(document.getElementById('arcBuc').value) || 0;
    const lb = (Math.PI*(D/2) + 2*H)/100; const lt = lb*n; const gs = greutateSpecifica(d);
    const gt = lt*gs; const p = gt*getPretKg(); const hm = H + (D/2);
    animateValue('arcLungBuc', lb.toFixed(2)); animateValue('arcLungTot', lt.toFixed(2));
    animateValue('arcGSp', gs.toFixed(3)); animateValue('arcGTot', gt.toFixed(2));
    animateValue('arcHMid', hm.toFixed(2)); animateValue('arcPret', p.toFixed(2));
    updateDimText('dimArcadaD', D); updateDimText('dimArcadaH', H); updateDimText('dimArcadaDiam', d);
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
        case 'arcade': row.hMid = (parseFloat(row.H)||0) + ((parseFloat(row.D)||0)/2); row.lungBuc = (Math.PI*(row.D/2) + 2*row.H)/100; row.gSp = greutateSpecifica(row.diam); break;
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
                diam: parseInt(getVal('arcDiam'))||10, 
                clasa: getVal('arcClasa')||'BST500S', 
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
        setEl('gSp', row.gSp.toFixed(3)); if (type==='arcade') setEl('hMid', row.hMid.toFixed(2));
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
            html += `<td><select onchange="updateTableRow('${type}', ${row.id}, 'diam', this.value)">${diameterOptions(row.diam)}</select></td>`;
            html += `<td><select onchange="updateTableRow('${type}', ${row.id}, 'clasa', this.value)">${clasaOptions(row.clasa)}</select></td>`;
            if (type==='etrieri') html += `<td>${inp('A', row.A)}</td><td>${inp('B', row.B)}</td><td>${inp('cioc', row.cioc)}</td>`;
            if (type==='agrafe') html += `<td>${inp('L', row.L)}</td><td>${inp('cioc', row.cioc)}</td>`;
            if (type==='arcade') html += `<td>${inp('D', row.D)}</td><td>${inp('H', row.H)}</td><td>${comp('hMid', row.hMid.toFixed(2))}</td>`;
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
            const gr = {}; data.forEach(r => { const d = r.diam; gr[d] = (gr[d]||0) + r.gTot; });
            const pts = Object.keys(gr).sort((a,b)=>parseFloat(a)-parseFloat(b)).map(d => `<span class="summary-chip"><b>Diam${d}</b>: ${gr[d].toFixed(2)} kg</span>`);
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
                else if (t === 'arcade') headers = ['Nr', 'Marca', 'Diam', 'Clasa', 'D (cm)', 'H (cm)', 'H Mid (cm)', 'Buc', 'Lung/Buc (m)', 'Lung Tot (m)', 'G Spec (kg/m)', 'G Tot (kg)', 'Pret (lei)'];
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
                    else if (t === 'arcade') rowVals = [idx+1, r.marca, r.diam, r.clasa, r.D, r.H, r.hMid, r.buc, r.lungBuc, r.lungTot, r.gSp, r.gTot, r.pret];
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
    // We add a special printable area to the body temporarily
    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            body * { visibility: hidden; }
            .print-container, .print-container * { visibility: visible; }
            .print-container { position: absolute; left: 0; top: 0; width: 100%; color: #000; background: #fff; padding: 20px; }
            .print-header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .print-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 10px; }
            .print-table th, .print-table td { border: 1px solid #000; padding: 4px; text-align: center; }
            .print-table th { background: #f0f0f0; }
            .print-total-section { display: flex; justify-content: flex-end; gap: 20px; margin-top: 20px; font-weight: bold; border-top: 2px solid #000; padding-top: 10px; }
            .no-print { display: none !important; }
        }
    `;
    document.head.appendChild(style);

    const printContainer = document.createElement('div');
    printContainer.className = 'print-container';
    
    let content = `
        <div class="print-header">
            <div>
                <h1 style="margin:0; font-size:24px;">CALCULATOR ARM??TURI PRO</h1>
                <p style="margin:0;">Extras de Materiale - ${new Date().toLocaleDateString('ro-RO')}</p>
            </div>
            <div style="text-align:right;">
                <p style="margin:0;">Pre?? unitar baz??: ${getPretKg()} lei/kg</p>
            </div>
        </div>
    `;

    Object.keys(tableData).forEach(type => {
        if (tableData[type].length > 0) {
            content += `<h3 style="text-transform: uppercase;">Tablou: ${type}</h3>`;
            content += `<table class="print-table">
                <thead>
                    <tr>
                        <th>Nr</th><th>Marca</th><th>Diam</th><th>Detalii</th><th>Buc</th><th>Lung Tot</th><th>Greut Tot</th><th>Pret</th>
                    </tr>
                </thead>
                <tbody>`;
            
            tableData[type].forEach((r, idx) => {
                let detalii = "";
                if (type==='etrieri') detalii = `${r.A}x${r.B} c:${r.cioc}`;
                else if (type==='agrafe') detalii = `L:${r.L} c:${r.cioc}`;
                else if (type==='arcade') detalii = `D:${r.D} H:${r.H}`;
                else if (type==='profileU') detalii = `${r.A}x${r.B}x${r.C}`;
                else if (type==='bare') detalii = `L:${r.L}`;
                else if (type==='sarma') detalii = `${r.tip}`;
                else if (type==='tabla') detalii = `${r.mod}: ${r.mod==='dreapta'?r.gros:r.model}`;
                else if (type==='cornier') detalii = `${r.dim}`;

                content += `<tr>
                    <td>${idx+1}</td><td>${r.marca}</td><td>${r.diam || r.dim || '-'}</td><td>${detalii}</td><td>${r.buc}</td>
                    <td>${r.lungTot ? r.lungTot.toFixed(2)+' m' : (r.mpTot ? r.mpTot.toFixed(2)+' mp' : '-')}</td>
                    <td>${r.gTot.toFixed(2)} kg</td><td>${r.pret.toFixed(2)} lei</td>
                </tr>`;
            });
            content += `</tbody></table>`;
        }
    });

    const tg = document.getElementById('grandTotalWeight').textContent;
    const tp = document.getElementById('grandTotalPrice').textContent;
    const tr = document.getElementById('grandTotalRows').textContent;

    content += `
        <div class="print-total-section">
            <p>Total Pozi??ii: ${tr}</p>
            <p>Greutate Total??: ${tg}</p>
            <p style="font-size:18px;">TOTAL GENERALE: ${tp}</p>
        </div>
        <p style="margin-top:50px; font-size:10px; color:#666; text-align:center;">Generat automat cu Calculator Arm??turi PRO</p>
    `;

    printContainer.innerHTML = content;
    document.body.appendChild(printContainer);
    
    window.print();
    
    // Cleanup
    document.body.removeChild(printContainer);
    document.head.removeChild(style);
}

function shareResults(method) {
    const tg = document.getElementById('grandTotalWeight').textContent;
    const tp = document.getElementById('grandTotalPrice').textContent;
    const tr = document.getElementById('grandTotalRows').textContent;
    const url = window.location.href;
    const text = `PROIECT NOU ARM??TURI\n\nRezumat:\n???? Greutate: ${tg}\n???? Cost estimat: ${tp}\n???? Total pozi??ii: ${tr}\n\nAcceseaz?? proiectul aici:\n${url}`;

    if (method === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast("Link copiat A?n clipboard!");
        });
    }
}

