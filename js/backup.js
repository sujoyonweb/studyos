// ==========================================
// UNIFIED BACKUP & ZERO-DATA-LOSS SYNC ENGINE
// ==========================================

const backupApp = {
    autoSyncTimer: null,
    isSyncing: false,
    isApplying: false,
    isBooting: true,

    // Only real study data modifications trigger cloud sync
    SYNCABLE_KEYS: [
        'progress',
        'timeLogs',
        'mocks',
        'routine',
        'routinePrefs',
        'focusTasks',
        'customSubjects',
        'preferences',
        'deletedIds',
        'keyTimes'
    ],

    // Device-local UI keys that must never be uploaded or overwritten by cloud
    LOCAL_ONLY_KEYS: [
        'gistConfig',
        'syncPending',
        'lastExportTime',
        'view',
        'collapsedTopics',
        'exam',
        'subject'
    ],

    init: () => {
        backupApp.requestPersistentStorage();
        localStorage.removeItem('studyOS_view'); // Clean up legacy stuck view key
        backupApp.updateUI();

        // Populate saved GitHub Token state in UI
        const cfg = backupApp.getCloudConfig();
        const tokenInput = document.getElementById('cloud-gist-token');
        if (tokenInput && cfg.token) tokenInput.value = cfg.token;

        // Auto-sync queued changes as soon as internet reconnects
        window.addEventListener('online', () => {
            backupApp.updateUI();
            if (storage.getKey('syncPending', false)) {
                backupApp.syncWithCloud(true);
            }
        });

        window.addEventListener('offline', () => {
            backupApp.updateUI();
        });

        // Flush pending changes immediately when minimizing app or closing tab
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && storage.getKey('syncPending', false)) {
                if (backupApp.autoSyncTimer) {
                    clearTimeout(backupApp.autoSyncTimer);
                    backupApp.autoSyncTimer = null;
                }
                backupApp.syncWithCloud(true);
            }
        });

        // Silent background pull on app boot if Cloud is configured
        if (cfg.token && navigator.onLine) {
            setTimeout(() => backupApp.syncWithCloud(true), 1200);
        }
    },

    // LAYER 1: BROWSER PERSISTENT STORAGE LOCK
    requestPersistentStorage: async () => {
        if (navigator.storage && navigator.storage.persist) {
            try {
                await navigator.storage.persist();
            } catch (e) {
                // Ignore if blocked by browser policy
            }
        }
    },

    getCloudConfig: () => {
        return storage.getKey('gistConfig', { token: '', gistId: '', lastCloudSync: null });
    },

    saveCloudConfig: (token, gistId = '') => {
        const cleanToken = (token || '').trim();
        const current = backupApp.getCloudConfig();
        const updated = {
            token: cleanToken,
            gistId: gistId || (cleanToken === current.token ? current.gistId : ''),
            lastCloudSync: current.lastCloudSync
        };
        storage.setKey('gistConfig', updated, true);
        backupApp.updateUI();
        return updated;
    },

    toggleCloudSetup: () => {
        const box = document.getElementById('cloud-setup-box');
        if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
    },

    saveCloudSetupFromUI: () => {
        const tokenInput = document.getElementById('cloud-gist-token');
        const token = tokenInput ? tokenInput.value.trim() : '';
        if (!token) {
            storage.setKey('gistConfig', { token: '', gistId: '', lastCloudSync: null }, true);
            backupApp.updateUI();
            document.getElementById('cloud-setup-box').style.display = 'none';
            return ui.alert("Cloud token cleared. Running in Local-Only mode.");
        }
        backupApp.saveCloudConfig(token);
        document.getElementById('cloud-setup-box').style.display = 'none';
        backupApp.syncWithCloud(false);
    },

    // Triggered only when actual user study data changes (30s batch delay)
    notifyDataChanged: (key) => {
        if (backupApp.isSyncing || backupApp.isApplying || backupApp.isBooting) return;
        if (!backupApp.SYNCABLE_KEYS.includes(key)) return;

        storage.setKey('syncPending', true, true);
        backupApp.updateUI();

        const cfg = backupApp.getCloudConfig();
        if (!cfg.token || !navigator.onLine) return;

        if (backupApp.autoSyncTimer) clearTimeout(backupApp.autoSyncTimer);
        backupApp.autoSyncTimer = setTimeout(() => {
            backupApp.autoSyncTimer = null;
            backupApp.syncWithCloud(true);
        }, 30000);
    },

    getBaseTopicId: (pk) => {
        const suffixes = ['_R_D', '_rehabTime', '_broken', '_C', '_Q', '_R', '_T', '_u'];
        for (const s of suffixes) {
            if (pk.endsWith(s)) return pk.slice(0, -s.length);
        }
        return pk;
    },

    // LAYER 2: CORE VAULT PACKER & SMART MERGE ENGINE
    buildVaultPayload: () => {
        const payload = {
            _meta: { timestamp: new Date().toISOString(), version: '2.0.0', device: navigator.platform },
            data: {}
        };

        const excludedRaw = backupApp.LOCAL_ONLY_KEYS.map(k => `studyOS_${k}`);
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('studyOS_') && !excludedRaw.includes(key)) {
                const raw = localStorage.getItem(key);
                try { payload.data[key.replace('studyOS_', '')] = JSON.parse(raw); }
                catch (e) { payload.data[key.replace('studyOS_', '')] = raw; }
            }
        }
        return payload;
    },

    createSafetySnapshot: () => {
        const snapshot = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('studyOS_') && k !== 'studyOS_gistConfig') {
                snapshot[k] = localStorage.getItem(k);
            }
        }
        sessionStorage.setItem('studyOS_snapshot', JSON.stringify(snapshot));
    },

    applyVaultData: (importedObj, modeOverride = null) => {
        const sourceData = importedObj?.data || importedObj;
        if (!sourceData || typeof sourceData !== 'object') {
            throw new Error("Invalid backup data structure.");
        }

        const mode = modeOverride || document.getElementById('sync-mode')?.value || 'merge';
        backupApp.createSafetySnapshot();
        backupApp.isApplying = true;

        try {
            if (mode === 'mirror') {
                Object.keys(localStorage).forEach(k => {
                    if (k.startsWith('studyOS_') && k !== 'studyOS_gistConfig') localStorage.removeItem(k);
                });
                Object.entries(sourceData).forEach(([k, v]) => {
                    if (!backupApp.LOCAL_ONLY_KEYS.includes(k)) storage.setKey(k, v, true);
                });
            } else {
                const localTimes = storage.getKey('keyTimes', {});
                const impTimes = sourceData.keyTimes || {};
                const mergedTimes = { ...localTimes };
                Object.keys(impTimes).forEach(tk => {
                    mergedTimes[tk] = Math.max(localTimes[tk] || 0, impTimes[tk] || 0);
                });
                storage.setKey('keyTimes', mergedTimes, true);

                const localDeleted = storage.getKey('deletedIds', []);
                const impDeleted = Array.isArray(sourceData.deletedIds) ? sourceData.deletedIds : [];
                const deletedSet = new Set([...localDeleted, ...impDeleted]);
                storage.setKey('deletedIds', [...deletedSet], true);

                Object.entries(sourceData).forEach(([k, impVal]) => {
                    if (impVal === null || impVal === undefined || k === 'keyTimes' || k === 'deletedIds' || backupApp.LOCAL_ONLY_KEYS.includes(k)) return;
                    const localVal = storage.getKey(k);

                    if (k === 'progress' && typeof impVal === 'object') {
                        const localProg = localVal || {};
                        const newProg = { ...localProg };

                        Object.keys(impVal).forEach(pk => {
                            const baseId = backupApp.getBaseTopicId(pk);
                            const localUpdated = localProg[`${baseId}_u`] || 0;
                            const impUpdated = impVal[`${baseId}_u`] || 0;

                            // Per-topic timestamp resolution (allows unchecking C and decrementing Q/R/T)
                            if (localUpdated > 0 || impUpdated > 0) {
                                if (impUpdated > localUpdated) {
                                    newProg[pk] = impVal[pk];
                                }
                            } else {
                                // Legacy fallback when neither side has a timestamp yet
                                if (pk.endsWith('_broken')) {
                                    const tVal = Math.max(newProg[`${baseId}_T`] || 0, impVal[`${baseId}_T`] || 0);
                                    newProg[pk] = tVal > 0 ? false : Boolean(newProg[pk] || impVal[pk]);
                                } else if (typeof impVal[pk] === 'number') {
                                    newProg[pk] = Math.max(newProg[pk] || 0, impVal[pk]);
                                } else if (typeof impVal[pk] === 'boolean') {
                                    newProg[pk] = Boolean(newProg[pk] || impVal[pk]);
                                } else if (typeof impVal[pk] === 'string') {
                                    if (!newProg[pk] || new Date(impVal[pk]) > new Date(newProg[pk])) newProg[pk] = impVal[pk];
                                }
                            }
                        });
                        storage.setKey(k, newProg, true);
                    }
                    else if (k === 'timeLogs' && typeof impVal === 'object') {
                        const newLogs = { ...(localVal || {}) };
                        Object.keys(impVal).forEach(date => newLogs[date] = Math.max(newLogs[date] || 0, impVal[date]));
                        storage.setKey(k, newLogs, true);
                    }
                    else if ((k === 'mocks' || k === 'routine') && Array.isArray(impVal)) {
                        const mergedArr = (Array.isArray(localVal) ? [...localVal] : []).filter(item => !deletedSet.has(item.id));
                        impVal.forEach(impItem => {
                            if (!impItem || !impItem.id || deletedSet.has(impItem.id)) return;
                            const idx = mergedArr.findIndex(m => m.id === impItem.id);
                            if (idx === -1) mergedArr.push(impItem);
                            else {
                                const localUpdated = mergedArr[idx].updatedAt || parseInt(mergedArr[idx].id) || 0;
                                const impUpdated = impItem.updatedAt || parseInt(impItem.id) || 0;
                                mergedArr[idx] = impUpdated >= localUpdated
                                    ? { ...mergedArr[idx], ...impItem }
                                    : { ...impItem, ...mergedArr[idx] };
                            }
                        });
                        if (k === 'mocks') {
                            mergedArr.sort((a, b) => {
                                const dateDiff = (b.date || '').localeCompare(a.date || '');
                                return dateDiff !== 0 ? dateDiff : (parseInt(b.id) || 0) - (parseInt(a.id) || 0);
                            });
                        }
                        if (k === 'routine') mergedArr.sort((a, b) => (a.rawMins || 0) - (b.rawMins || 0));
                        storage.setKey(k, mergedArr, true);
                    }
                    else if (k === 'customSubjects' && typeof impVal === 'object') {
                        const mergedCustom = { ...(localVal || {}) };
                        Object.entries(impVal).forEach(([examKey, subjList]) => {
                            if (!Array.isArray(subjList)) return;
                            if (!mergedCustom[examKey]) mergedCustom[examKey] = [...subjList];
                            else {
                                subjList.forEach(s => {
                                    if (!mergedCustom[examKey].some(existing => existing.name === s.name)) {
                                        mergedCustom[examKey].push(s);
                                    }
                                });
                            }
                        });
                        storage.setKey(k, mergedCustom, true);
                    }
                    else {
                        // Only overwrite preferences/focusTasks if remote is newer than local
                        if (localVal === null || (impTimes[k] || 0) > (localTimes[k] || 0)) {
                            storage.setKey(k, impVal, true);
                        }
                    }
                });
            }
        } finally {
            backupApp.isApplying = false;
        }

        // Refresh in-memory settings & app state immediately without changing active tab
        if (typeof settingsApp !== 'undefined') {
            const savedSettings = storage.getKey('preferences', settingsApp.defaultSettings);
            settingsApp.current = { ...settingsApp.defaultSettings, ...savedSettings };
            settingsApp.applyTheme(settingsApp.current.theme);
        }
        app.progressData = storage.getProgress() || {};
        if (app.currentExamData) {
            app.examTree = syllabusEngine.buildTree(app.currentExamData, app.activeExamId);
        }
        syllabusApp.refresh();
        progressTracker.updateHomeUI();
        if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
        if (typeof mockApp !== 'undefined') mockApp.renderMocks();
        backupApp.updateUI();
    },

    // LAYER 3: AUTOMATIC + 1-TAP GITHUB GIST CLOUD SYNC
    syncWithCloud: async (silent = false) => {
        const cfg = backupApp.getCloudConfig();
        if (!cfg.token) {
            if (!silent) {
                backupApp.toggleCloudSetup();
                ui.alert("Paste your GitHub Personal Access Token (with 'gist' permission) once to enable automatic Cloud Sync.");
            }
            return;
        }

        if (!navigator.onLine) {
            if (!silent) ui.alert("You are currently offline. Your changes are safely stored locally and will auto-sync when internet returns.");
            return;
        }

        if (backupApp.isSyncing) return;
        backupApp.isSyncing = true;
        backupApp.updateUI('Syncing...');

        const wasPending = storage.getKey('syncPending', false);

        const headers = {
            'Authorization': `token ${cfg.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };

        try {
            let gistId = cfg.gistId;
            let remoteExists = false;

            // Step 1: Auto-discover existing studyOS_Vault.json Gist if gistId isn't saved yet
            if (!gistId) {
                const listRes = await fetch('https://api.github.com/gists?per_page=100', { headers, cache: 'no-store' });
                if (!listRes.ok) throw new Error("GitHub authentication failed. Check your token.");
                const gists = await listRes.json();
                const found = gists.find(g => g.files && g.files['studyOS_Vault.json']);
                if (found) {
                    gistId = found.id;
                    backupApp.saveCloudConfig(cfg.token, gistId);
                }
            }

            // Step 2: Pull & Smart Merge remote data if Gist exists
            if (gistId) {
                const getRes = await fetch(`https://api.github.com/gists/${gistId}`, { headers, cache: 'no-store' });
                if (getRes.ok) {
                    const gistData = await getRes.json();
                    const fileContent = gistData.files?.['studyOS_Vault.json']?.content;
                    if (fileContent) {
                        remoteExists = true;
                        const remoteVault = JSON.parse(fileContent);
                        backupApp.applyVaultData(remoteVault, 'merge');
                    }
                } else if (getRes.status === 404) {
                    gistId = '';
                }
            }

            // Step 3: Push merged Vault back to Gist ONLY if local changes were pending, manual sync was clicked, or Gist is new
            let finalGistId = gistId;
            if (wasPending || !silent || !remoteExists) {
                const mergedPayload = backupApp.buildVaultPayload();
                const bodyPayload = {
                    description: 'Study OS Cloud Vault (Auto-Synced)',
                    public: false,
                    files: {
                        'studyOS_Vault.json': {
                            content: JSON.stringify(mergedPayload, null, 2)
                        }
                    }
                };

                const pushUrl = gistId ? `https://api.github.com/gists/${gistId}` : 'https://api.github.com/gists';
                const pushMethod = gistId ? 'PATCH' : 'POST';

                const pushRes = await fetch(pushUrl, {
                    method: pushMethod,
                    headers,
                    body: JSON.stringify(bodyPayload)
                });

                if (!pushRes.ok) throw new Error("Failed to write to GitHub Gist.");
                const savedGist = await pushRes.json();
                finalGistId = savedGist.id;
            }

            const nowISO = new Date().toISOString();
            storage.setKey('gistConfig', {
                token: cfg.token,
                gistId: finalGistId,
                lastCloudSync: nowISO
            }, true);
            storage.setKey('lastExportTime', nowISO, true);
            storage.setKey('syncPending', false, true);

            backupApp.isSyncing = false;
            backupApp.updateUI();

            if (!silent) {
                ui.alert("Cloud Sync Complete! Your PC & Phone vault is up to date.");
            }
        } catch (err) {
            backupApp.isSyncing = false;
            backupApp.updateUI();
            if (!silent) ui.alert(`Cloud Sync Error: ${err.message}`);
            console.warn("Cloud Sync warning:", err);
        }
    },

    // LAYER 4: MANUAL FILE EXPORT, NATIVE GOOGLE DRIVE SHARE & SYNC CODES
    exportData: () => {
        const payload = backupApp.buildVaultPayload();
        storage.setKey('lastExportTime', payload._meta.timestamp, true);
        storage.setKey('syncPending', false, true);
        backupApp.updateUI();

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        a.setAttribute("download", `studyOS_Vault_${storage.getLocalDate()}.json`);
        document.body.appendChild(a);
        a.click();
        a.remove();
    },

    shareBackupFile: async () => {
        const payload = backupApp.buildVaultPayload();
        const jsonString = JSON.stringify(payload, null, 2);
        const fileName = `studyOS_Vault_${storage.getLocalDate()}.json`;

        if (navigator.canShare && window.File) {
            try {
                const file = new File([jsonString], fileName, { type: 'application/json' });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: 'Study OS Vault Backup',
                        text: `Study OS Backup (${storage.getLocalDate()})`,
                        files: [file]
                    });
                    storage.setKey('lastExportTime', payload._meta.timestamp, true);
                    storage.setKey('syncPending', false, true);
                    backupApp.updateUI();
                    return;
                }
            } catch (err) {
                if (err.name === 'AbortError') return;
            }
        }
        backupApp.exportData();
    },

    copySyncCode: async () => {
        try {
            const payload = backupApp.buildVaultPayload();
            const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
            const syncCode = `STUDYOS_V1:${encoded}`;
            await navigator.clipboard.writeText(syncCode);
            storage.setKey('lastExportTime', payload._meta.timestamp, true);
            backupApp.updateUI();
            ui.alert("Sync Code copied to clipboard! Paste it into WhatsApp, Telegram, or Keep to import on your other device.");
        } catch (err) {
            ui.alert("Could not access clipboard automatically.");
        }
    },

    pasteSyncCode: async () => {
        let rawText = '';
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                rawText = await navigator.clipboard.readText();
            }
        } catch (e) {}

        if (!rawText || !rawText.trim().startsWith('STUDYOS_V1:')) {
            rawText = window.prompt("Paste your Study OS Sync Code (starts with STUDYOS_V1:):") || '';
        }

        const cleaned = rawText.trim();
        if (!cleaned) return;

        try {
            const base64Part = cleaned.startsWith('STUDYOS_V1:') ? cleaned.slice(11) : cleaned;
            const jsonStr = decodeURIComponent(escape(atob(base64Part)));
            const importedJSON = JSON.parse(jsonStr);

            backupApp.applyVaultData(importedJSON);
            ui.confirm(
                "Sync Code Restored! Keep these changes or undo?",
                () => { window.location.reload(); },
                false,
                "Undo Restore",
                () => { backupApp.undoImport(); }
            );
        } catch (err) {
            ui.alert("Invalid Sync Code. Make sure you copied the full STUDYOS_V1 code.");
        }
    },

    importData: (eventOrFile) => {
        const file = eventOrFile.target ? eventOrFile.target.files[0] : eventOrFile;
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedJSON = JSON.parse(e.target.result);
                backupApp.applyVaultData(importedJSON);

                if (eventOrFile.target) eventOrFile.target.value = '';

                ui.confirm(
                    "Sync Complete! Do you want to apply these changes or undo?",
                    () => { window.location.reload(); },
                    false,
                    "Undo Restore",
                    () => { backupApp.undoImport(); }
                );
            } catch (err) {
                if (eventOrFile.target) eventOrFile.target.value = '';
                ui.alert("Invalid or corrupted backup file.");
                console.error(err);
            }
        };
        reader.readAsText(file);
    },

    undoImport: () => {
        const snapshotRaw = sessionStorage.getItem('studyOS_snapshot');
        if (snapshotRaw) {
            const snapshot = JSON.parse(snapshotRaw);
            Object.keys(localStorage).forEach(k => {
                if (k.startsWith('studyOS_') && k !== 'studyOS_gistConfig') localStorage.removeItem(k);
            });
            Object.entries(snapshot).forEach(([k, v]) => localStorage.setItem(k, v));
            sessionStorage.removeItem('studyOS_snapshot');
            ui.alert("Rollback successful. Your previous data has been restored.");
            setTimeout(() => window.location.reload(), 1200);
        } else {
            ui.alert("No snapshot found to restore.");
        }
    },

    updateUI: (customStatus = null) => {
        const lastSync = storage.getKey('lastExportTime', 'Never');
        const count = Object.keys(localStorage).filter(k => k.startsWith('studyOS_')).length;
        const cfg = backupApp.getCloudConfig();
        const isPending = storage.getKey('syncPending', false);

        const elLastExport = document.getElementById('sync-last-export');
        const elRecordCount = document.getElementById('sync-record-count');
        const elCloudStatus = document.getElementById('sync-cloud-status');

        if (elLastExport) {
            if (lastSync === 'Never') elLastExport.innerText = 'Never';
            else {
                const d = new Date(lastSync);
                elLastExport.innerText = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        }
        if (elRecordCount) elRecordCount.innerText = `${count} Keys`;

        if (elCloudStatus) {
            if (customStatus) {
                elCloudStatus.innerHTML = `<span style="color: var(--brand-accent);">● ${customStatus}</span>`;
            } else if (!cfg.token) {
                elCloudStatus.innerHTML = `<span class="text-muted">○ Local Only (Tap Gear to Link Cloud)</span>`;
            } else if (!navigator.onLine) {
                elCloudStatus.innerHTML = `<span style="color: var(--warning);">● Offline (${isPending ? 'Changes Queued' : 'Protected'})</span>`;
            } else if (isPending) {
                elCloudStatus.innerHTML = `<span style="color: var(--warning);">● Changes Queued (Auto-Sync in 30s)</span>`;
            } else {
                elCloudStatus.innerHTML = `<span style="color: var(--success);">● Cloud Auto-Sync Active</span>`;
            }
        }
    }
};