// ==========================================
// CORE APPLICATION CONTROLLER & SYLLABUS ENGINE
// ==========================================

const syllabusEngine = {
    slugify: (text) => {
        return (text || '').toString().toLowerCase().trim()
            .replace(/\s+/g, '_')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '_')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    },

    parseNode: (node, parentId = '', legacyIndex = null, legacyParentId = null) => {
        const name = typeof node === 'string' ? node : (node.name || 'Untitled');
        const slug = syllabusEngine.slugify(name);
        let id = parentId ? `${parentId}__${slug}` : slug;
        let legacyId = null;

        if (typeof node === 'object' && node.id) id = node.id;
        if (legacyIndex !== null && legacyParentId) legacyId = `${legacyParentId}_m${legacyIndex}`;

        let children = [];
        if (typeof node === 'object') {
            const rawChildren = node.units || node.topics || node.chapters || node.subtopics || node.items;
            if (Array.isArray(rawChildren) && rawChildren.length > 0) {
                children = rawChildren.map(c => syllabusEngine.parseNode(c, id));
            } else if (Array.isArray(node.microtopics) && node.microtopics.length > 0) {
                children = node.microtopics.map((m, i) => syllabusEngine.parseNode(m, id, i, id));
            }
        }

        if (children.length > 0) return { type: 'folder', id, name, children };
        return { type: 'leaf', id, name, legacyId };
    },

    buildTree: (examData) => {
        if (!examData || !Array.isArray(examData.subjects)) return [];
        return examData.subjects.map(subj => {
            const subjId = subj.id || syllabusEngine.slugify(subj.name);
            const topics = subj.units || subj.topics || subj.chapters || [];
            return {
                id: subjId,
                name: subj.name,
                tree: topics.map(t => syllabusEngine.parseNode(t, subjId))
            };
        });
    },

    getStats: (node, progressData) => {
        let stats = { leaves: 0, c: 0, q: 0, r: 0, t: 0, pts: 0, maxPts: 0, mastered: 0, debtNodes: [] };
        const pData = progressData || app.progressData || {};

        if (node.type === 'leaf') {
            stats.leaves = 1;
            stats.maxPts = 3;

            const hasC = pData[`${node.id}_C`] || (node.legacyId && pData[`${node.legacyId}_C`]);
            const qCount = pData[`${node.id}_Q`] || (node.legacyId && pData[`${node.legacyId}_Q`]) || 0;
            const rLevel = pData[`${node.id}_R`] || (node.legacyId && pData[`${node.legacyId}_R`]) || 0;
            const rDateStr = pData[`${node.id}_R_D`];
            const tCount = pData[`${node.id}_T`] || (node.legacyId && pData[`${node.legacyId}_T`]) || 0;

            if (hasC) { stats.c = 1; stats.pts += 1; }
            if (qCount > 0) { stats.q = 1; stats.pts += 1; }
            if (tCount > 0) { stats.t = 1; stats.pts += 1; }
            if (rLevel > 0) { stats.r = 1; }
            if (hasC && qCount > 0 && tCount > 0) stats.mastered = 1;

            if (hasC) {
                let isDebt = false;
                if (rLevel === 0 || pData[`${node.id}_broken`]) {
                    isDebt = true;
                } else if (rDateStr) {
                    const todayMidnight = new Date();
                    todayMidnight.setHours(0, 0, 0, 0);
                    const daysSince = Math.floor((todayMidnight - new Date(rDateStr + 'T00:00:00')) / 86400000);
                    if ((rLevel === 1 && daysSince >= 7) || (rLevel === 2 && daysSince >= 21) || (rLevel >= 3 && daysSince >= 45)) {
                        isDebt = true;
                    }
                }
                if (isDebt) stats.debtNodes.push({ name: node.name, id: node.id });
            }
        } else if (node.children) {
            node.children.forEach(c => {
                const cStats = syllabusEngine.getStats(c, pData);
                stats.leaves += cStats.leaves;
                stats.maxPts += cStats.maxPts;
                stats.c += cStats.c;
                stats.q += cStats.q;
                stats.r += cStats.r;
                stats.t += cStats.t;
                stats.pts += cStats.pts;
                stats.mastered += cStats.mastered;
                stats.debtNodes = stats.debtNodes.concat(cStats.debtNodes);
            });
        }

        stats.percent = stats.maxPts === 0 ? 0 : Math.round((stats.pts / stats.maxPts) * 100);
        return stats;
    }
};

const settingsApp = {
    defaultSettings: { dailyGoal: 8, targetScore: 140, totalScore: 200, examDate: '2027-04-01', autoFlow: false, breakDuration: 5, focusDuration: 25, theme: 'night', soundEffects: true, keepAwake: true },

    init: () => {
        const savedSettings = storage.getKey('preferences', settingsApp.defaultSettings);
        settingsApp.current = { ...settingsApp.defaultSettings, ...savedSettings };
        settingsApp.applyTheme(settingsApp.current.theme);
        
        setTimeout(() => {
            const elGoal = document.getElementById('setting-goal');
            const elSound = document.getElementById('setting-sound');
            const elAwake = document.getElementById('setting-awake');
            if (elGoal) elGoal.value = settingsApp.current.dailyGoal;
            if (elSound) elSound.checked = settingsApp.current.soundEffects;
            if (elAwake) elAwake.checked = settingsApp.current.keepAwake;
            settingsApp.setSegmentUI('setting-theme', settingsApp.current.theme);
            settingsApp.updateSyncUI();
        }, 100); 
    },

    update: (key, value) => {
        settingsApp.current[key] = value;
        storage.setKey('preferences', settingsApp.current);
        if (key === 'theme') settingsApp.applyTheme(value);
        if (key === 'dailyGoal' || key === 'examDate') progressTracker.updateHomeUI();
    },

    updateSegment: (key, value, buttonElement) => {
        settingsApp.update(key, value);
        buttonElement.parentElement.querySelectorAll('.segment-btn').forEach(btn => btn.classList.remove('active'));
        buttonElement.classList.add('active');
    },

    setSegmentUI: (groupId, matchValue) => {
        const group = document.getElementById(groupId);
        if (!group) return;
        group.querySelectorAll('.segment-btn').forEach(btn => {
            if (btn.innerText.toLowerCase() === matchValue.toString().toLowerCase()) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    },

    applyTheme: (themeStr) => {
        if (themeStr === 'night') document.documentElement.setAttribute('data-theme', 'dark');
        else document.documentElement.removeAttribute('data-theme');
    },

    updateSyncUI: () => {
        const lastSync = storage.getKey('lastExportTime', 'Never');
        const count = Object.keys(localStorage).filter(k => k.startsWith('studyOS_')).length;
        
        const elLastExport = document.getElementById('sync-last-export');
        const elRecordCount = document.getElementById('sync-record-count');
        
        if (elLastExport) {
            if (lastSync === 'Never') elLastExport.innerText = lastSync;
            else {
                const d = new Date(lastSync);
                elLastExport.innerText = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        }
        if (elRecordCount) elRecordCount.innerText = `${count} Keys`;
    },

    exportData: () => {
        const payload = {
            _meta: { timestamp: new Date().toISOString(), version: '1.2.0', device: navigator.platform },
            data: {}
        };

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('studyOS_')) {
                const raw = localStorage.getItem(key);
                try { payload.data[key.replace('studyOS_', '')] = JSON.parse(raw); } 
                catch(e) { payload.data[key.replace('studyOS_', '')] = raw; }
            }
        }

        storage.setKey('lastExportTime', payload._meta.timestamp);
        settingsApp.updateSyncUI();

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        a.setAttribute("download", `studyOS_Vault_${storage.getLocalDate()}.json`);
        document.body.appendChild(a); a.click(); a.remove();
    },

    importData: (eventOrFile) => {
        const file = eventOrFile.target ? eventOrFile.target.files[0] : eventOrFile;
        if (!file) return;
        
        const mode = document.getElementById('sync-mode')?.value || 'merge';
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const importedJSON = JSON.parse(e.target.result);
                const sourceData = importedJSON.data || importedJSON; 
                if (!sourceData || typeof sourceData !== 'object') throw new Error("Invalid format");
                
                // 1. CREATE SAFETY SNAPSHOT
                const snapshot = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k.startsWith('studyOS_')) snapshot[k] = localStorage.getItem(k);
                }
                sessionStorage.setItem('studyOS_snapshot', JSON.stringify(snapshot));

                // 2. APPLY DATA
                if (mode === 'mirror') {
                    Object.keys(localStorage).forEach(k => { if (k.startsWith('studyOS_')) localStorage.removeItem(k); });
                    Object.entries(sourceData).forEach(([k, v]) => storage.setKey(k, v));
                } else {
                    Object.entries(sourceData).forEach(([k, impVal]) => {
                        if (impVal === null || impVal === undefined) return;
                        const localVal = storage.getKey(k);
                        
                        if (k === 'progress' && typeof impVal === 'object') {
                            const newProg = { ...(localVal || {}) };
                            Object.keys(impVal).forEach(pk => {
                                if (pk.endsWith('_broken')) {
                                    const baseId = pk.slice(0, -7);
                                    const tVal = Math.max(newProg[`${baseId}_T`] || 0, impVal[`${baseId}_T`] || 0);
                                    newProg[pk] = tVal > 0 ? false : Boolean(newProg[pk] || impVal[pk]);
                                } else if (typeof impVal[pk] === 'number') {
                                    newProg[pk] = Math.max(newProg[pk] || 0, impVal[pk]);
                                } else if (typeof impVal[pk] === 'boolean') {
                                    newProg[pk] = Boolean(newProg[pk] || impVal[pk]);
                                } else if (typeof impVal[pk] === 'string') {
                                    if (!newProg[pk] || new Date(impVal[pk]) > new Date(newProg[pk])) newProg[pk] = impVal[pk];
                                }
                            });
                            storage.setKey(k, newProg);
                        } 
                        else if (k === 'timeLogs' && typeof impVal === 'object') {
                            const newLogs = { ...(localVal || {}) };
                            Object.keys(impVal).forEach(date => newLogs[date] = Math.max(newLogs[date] || 0, impVal[date]));
                            storage.setKey(k, newLogs);
                        } 
                        else if ((k === 'mocks' || k === 'routine') && Array.isArray(impVal)) {
                            const mergedArr = Array.isArray(localVal) ? [...localVal] : [];
                            impVal.forEach(impItem => {
                                if (!impItem || !impItem.id) return;
                                const idx = mergedArr.findIndex(m => m.id === impItem.id);
                                if (idx === -1) mergedArr.push(impItem);
                                else mergedArr[idx] = { ...mergedArr[idx], ...impItem }; 
                            });
                            if (k === 'mocks') mergedArr.sort((a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0));
                            if (k === 'routine') mergedArr.sort((a, b) => (a.rawMins || 0) - (b.rawMins || 0));
                            storage.setKey(k, mergedArr);
                        } 
                        else {
                            storage.setKey(k, impVal);
                        }
                    });
                }

                // Reset input so re-selecting the same file triggers change event
                if (eventOrFile.target) eventOrFile.target.value = '';

                // Sync in-memory state immediately
                app.progressData = storage.getProgress() || {};
                settingsApp.updateSyncUI();

                // 3. SUCCESS ALERT WITH UNDO BUTTON
                ui.confirm(
                    "Sync Complete! Do you want to apply these changes or undo?", 
                    () => { window.location.reload(); }, 
                    false, 
                    "Undo Restore", 
                    () => { settingsApp.undoImport(); }
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
            Object.keys(localStorage).forEach(k => { if (k.startsWith('studyOS_')) localStorage.removeItem(k); });
            Object.entries(snapshot).forEach(([k, v]) => localStorage.setItem(k, v));
            sessionStorage.removeItem('studyOS_snapshot');
            ui.alert("Rollback successful. Your data has been restored.");
            setTimeout(() => window.location.reload(), 1500);
        } else {
            ui.alert("No snapshot found to restore.");
        }
    },

    clearAllData: () => {
        const executeClear = () => { localStorage.clear(); window.location.reload(); };
        if (typeof ui !== 'undefined' && ui.confirm) {
            ui.confirm("Are you sure? This deletes ALL data permanently.", executeClear, true);
        } else if (window.confirm("Are you sure? This deletes ALL data permanently.")) {
            executeClear();
        }
    }
};

const progressTracker = {
    defaultFocusTasks: [
        { id: 'ft1', text: "Analyze yesterday's mock mistakes", done: false },
        { id: 'ft2', text: "Complete 50 practice questions", done: false },
        { id: 'ft3', text: "Revise weak syllabus formulas", done: false }
    ],

    getLogs: () => storage.getKey('timeLogs', {}),

    addMinutes: (mins) => {
        if (!mins || mins <= 0) return;
        const logs = progressTracker.getLogs();
        const today = storage.getLocalDate();
        logs[today] = (logs[today] || 0) + mins;
        storage.setKey('timeLogs', logs);
        progressTracker.updateHomeUI();
        if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
    },

    // UPGRADE: SMART MOCK ILLUSION DETECTOR (Word-Boundary + Timestamped Rehab)
    detectIllusions: (examTree, progressData) => {
        const mocks = storage.getKey('mocks', []);
        let brokenNodes = [];
        if (!examTree || mocks.length === 0) return brokenNodes;

        const getMatchPatterns = (rawName) => {
            const cleaned = rawName.toLowerCase()
                .replace(/\(.*?\)/g, '')
                .replace(/\bpt\.?\s*\d+/g, '')
                .replace(/\b(all|question|2025|problems on|basics of)\b/g, '')
                .trim();

            const parts = cleaned.split(/[,:&/]+/).map(s => s.trim()).filter(s => s.length >= 4);
            if (parts.length === 0 && cleaned.length >= 3) parts.push(cleaned);

            return parts.map(part => {
                const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
                return new RegExp(`\\b${escaped}\\b`, 'i');
            });
        };

        const traverse = (node, subjName, subjId) => {
            if (node.type === 'leaf') {
                const patterns = getMatchPatterns(node.name);
                if (patterns.length > 0) {
                    const lastRehabTime = progressData[`${node.id}_rehabTime`] || 0;
                    let strikes = 0;

                    mocks.forEach(m => {
                        const mockTime = parseInt(m.id) || 0;
                        if (mockTime > lastRehabTime) {
                            const mText = `${m.hardQs || ''} ${m.notes || ''}`;
                            if (patterns.some(regex => regex.test(mText))) {
                                strikes++;
                            }
                        }
                    });

                    if (strikes >= 2) {
                        progressData[`${node.id}_Q`] = 0;
                        progressData[`${node.id}_T`] = 0;
                        progressData[`${node.id}_broken`] = true;
                        progressData[`${node.id}_rehabTime`] = Date.now();
                        storage.setKey('progress', progressData);
                    }

                    if (progressData[`${node.id}_broken`]) {
                        if (progressData[`${node.id}_T`] > 0) {
                            progressData[`${node.id}_broken`] = false;
                            storage.setKey('progress', progressData);
                        } else {
                            brokenNodes.push({ name: node.name, subj: subjName, id: subjId });
                        }
                    }
                }
            } else if (node.children) {
                node.children.forEach(c => traverse(c, subjName, subjId));
            }
        };

        examTree.forEach(subj => subj.tree.forEach(t => traverse(t, subj.name, subj.id)));
        return brokenNodes;
    },
    
    updateHomeUI: () => {
        const logs = progressTracker.getLogs();
        const today = storage.getLocalDate();
        const todayMinutes = logs[today] || 0;
        const todayHours = (todayMinutes / 60).toFixed(1);
        const goalHours = settingsApp.current.dailyGoal || 8;

        const hour = new Date().getHours();
        let greeting = "Good Evening,";
        if (hour < 12) greeting = "Good Morning,";
        else if (hour < 17) greeting = "Good Afternoon,";
        
        const greetingEl = document.querySelector('.home-banner-text h2');
        if (greetingEl) greetingEl.innerText = greeting;

        const hoursText = document.getElementById('home-hours-text');
        const goalText = document.getElementById('home-goal-text');
        if (hoursText) hoursText.innerHTML = `${todayHours}<span>h</span>`;
        if (goalText) goalText.innerText = `Goal: ${goalHours}h`;

        const progressBar = document.getElementById('home-progress-bar');
        if (progressBar) {
            const percent = Math.min((todayHours / goalHours) * 100, 100);
            progressBar.style.width = `${percent}%`;
            progressBar.style.backgroundColor = percent >= 100 ? 'var(--success)' : 'var(--brand-accent)';
        }

        const homeCountdown = document.getElementById('home-countdown');
        if (homeCountdown && settingsApp.current.examDate) {
            const dDay = new Date(settingsApp.current.examDate + 'T00:00:00');
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);
            const daysLeft = Math.ceil((dDay.getTime() - todayDate.getTime()) / 86400000);
            homeCountdown.innerHTML = daysLeft < 0 ? "0" : daysLeft;
        }

        progressTracker.renderStreak();
        progressTracker.renderFocusTasks();
        progressTracker.renderScheduleQueue(); 
        progressTracker.renderSyllabusActions();
        progressTracker.renderVelocityChart();
    },

    // UPGRADE: VELOCITY BURN-DOWN CHART + QUICK LOG BUTTON
    renderVelocityChart: () => {
        const velocityCard = document.querySelector('.quick-start-card');
        if (!velocityCard) return;

        let totalLeaves = 0; 
        let masteredLeaves = 0;
        const p = app.progressData || {};

        const traverse = node => {
            if (node.type === 'leaf') {
                totalLeaves++;
                if (p[`${node.id}_C`] && (p[`${node.id}_Q`] > 0) && (p[`${node.id}_T`] > 0)) masteredLeaves++;
            } else if (node.children) {
                node.children.forEach(traverse);
            }
        };
        if (app.examTree) app.examTree.forEach(subj => subj.tree.forEach(traverse));
        if (totalLeaves === 0) totalLeaves = 1;
        
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const daysLeft = settingsApp.current.examDate
            ? Math.max(1, Math.ceil((new Date(settingsApp.current.examDate + 'T00:00:00') - todayMidnight) / 86400000))
            : 180;
        const totalPrepDays = 180; 
        const daysElapsed = Math.max(1, totalPrepDays - daysLeft);
        const targetMastered = Math.min(totalLeaves, Math.round((totalLeaves / totalPrepDays) * daysElapsed));
        
        const isBehind = masteredLeaves < targetMastered;
        const chartColor = isBehind ? 'var(--danger)' : 'var(--success)';
        const statusText = isBehind ? 'Falling Behind' : 'Pace: Optimal';
        
        velocityCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <div class="quick-start-label m-0" style="color: var(--text-main); font-weight: 800; font-size: 1rem;">Velocity Tracker</div>
                <div class="badge ${isBehind ? 'rev' : 'pin'}" style="${isBehind ? 'background:rgba(239,68,68,0.15);color:var(--danger);' : 'background:rgba(16,185,129,0.15);color:var(--success);'}">${statusText}</div>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                <span class="text-muted">Target Trajectory</span>
                <span style="color: var(--text-muted);">${targetMastered} topics</span>
            </div>
            <div style="width: 100%; height: 8px; background: var(--bg-hover); border-radius: 4px; margin-bottom: 1.25rem; overflow: hidden;">
                <div style="width: ${Math.min(100, (targetMastered/totalLeaves)*100)}%; height: 100%; background: var(--text-muted); opacity: 0.4;"></div>
            </div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                <span class="text-muted">Actual Progress</span>
                <span style="color: ${chartColor};">${masteredLeaves} topics</span>
            </div>
            <div style="width: 100%; height: 8px; background: var(--bg-hover); border-radius: 4px; overflow: hidden; margin-bottom: 1.5rem;">
                <div style="width: ${Math.min(100, (masteredLeaves/totalLeaves)*100)}%; height: 100%; background: ${chartColor}; box-shadow: 0 0 10px ${chartColor}; transition: width 1s ease;"></div>
            </div>
            <button id="btn-quick-start" class="quick-start-btn">+ Log Study Time</button>
        `;
        velocityCard.style.padding = '1.75rem';
        velocityCard.style.textAlign = 'left';
    },

    renderStreak: () => {
        const streakContainer = document.getElementById('home-streak-container');
        if (!streakContainer) return;
        const logs = progressTracker.getLogs();
        const daysLabel = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        let html = '';
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = storage.getLocalDate(d);
            const hasActivity = (logs[dateStr] || 0) > 0;
            
            let classes = 'streak-circle';
            if (hasActivity) classes += ' hit';
            if (i === 0 && !hasActivity) classes += ' today';
            html += `<div class="${classes}">${daysLabel[d.getDay()]}</div>`;
        }
        streakContainer.innerHTML = html;

        const mobileStreak = document.getElementById('mobile-nav-streak');
        if (mobileStreak) mobileStreak.innerHTML = `🔥 ${progressTracker.calculateStreakCount()} Day`;
    },

    calculateStreakCount: () => {
        const logs = progressTracker.getLogs();
        let streak = 0;
        const todayStr = storage.getLocalDate();
        let d = new Date();
        
        if (!(logs[todayStr] > 0)) d.setDate(d.getDate() - 1);

        while (true) {
            const dateStr = storage.getLocalDate(d);
            if (logs[dateStr] > 0) {
                streak++;
                d.setDate(d.getDate() - 1);
            } else {
                break;
            }
        }
        return streak;
    },

    getFocusTasks: () => {
        let tasks = storage.getKey('focusTasks', progressTracker.defaultFocusTasks);
        const lastDate = storage.getKey('focusTasksDate', storage.getLocalDate());
        const today = storage.getLocalDate();
        
        if (lastDate !== today) {
            tasks.forEach(t => t.done = false); 
            storage.setKey('focusTasks', tasks);
            storage.setKey('focusTasksDate', today);
        }
        return tasks;
    },

    renderFocusTasks: () => {
        const container = document.getElementById('home-focus-tasks');
        if (!container) return;
        const tasks = progressTracker.getFocusTasks();
        container.innerHTML = tasks.map((t, idx) => `
            <div class="task-item">
                <div class="task-checkbox ${t.done ? 'checked' : ''}" data-action="toggle-focus-task" data-index="${idx}" style="cursor: pointer; display: flex; align-items: center; justify-content: center; ${t.done ? 'background-color: var(--success); border-color: var(--success); color: #fff;' : ''}">
                    ${t.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                </div>
                <div class="task-text focus-task-input" contenteditable="true" data-index="${idx}" style="flex: 1; outline: none; ${t.done ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${t.text}</div>
            </div>
        `).join('');
    },

    toggleFocusTask: (index) => {
        const tasks = progressTracker.getFocusTasks();
        if (tasks[index]) {
            tasks[index].done = !tasks[index].done;
            storage.setKey('focusTasks', tasks);
            progressTracker.renderFocusTasks();
        }
    },

    updateFocusTaskText: (index, newText) => {
        const tasks = progressTracker.getFocusTasks();
        if (tasks[index] && newText.trim()) {
            tasks[index].text = newText.trim();
            storage.setKey('focusTasks', tasks);
        }
    },

    renderScheduleQueue: () => {
        const container = document.getElementById('home-schedule-queue');
        if (!container) return;

        let dueQueue = [];
        let maintenanceQueue = [];

        const brokenConcepts = progressTracker.detectIllusions(app.examTree, app.progressData);
        brokenConcepts.forEach(b => {
            dueQueue.push({ badge: 'Concept Broken', label: 'Rehab Required (Failed 2+ Mocks)', subject: b.subj, topic: b.name, subjId: b.id, isBroken: true });
        });

        if (app.examTree) {
            const todayMidnight = new Date();
            todayMidnight.setHours(0, 0, 0, 0);

            const traverse = (node, subjName, subjId) => {
                const p = app.progressData || {};
                if (node.type === 'leaf') {
                    const hasC = p[`${node.id}_C`];
                    const rLevel = p[`${node.id}_R`] || 0;
                    const rDateStr = p[`${node.id}_R_D`];
                    
                    if (hasC && !p[`${node.id}_broken`]) {
                        if (rLevel === 0) {
                            dueQueue.push({ badge: 'Due: R1', label: 'Initial Revision', subject: subjName, topic: node.name, subjId });
                        } else if (rDateStr) {
                            const daysSince = Math.floor((todayMidnight - new Date(rDateStr + 'T00:00:00')) / 86400000);
                            if (rLevel === 1 && daysSince >= 7) dueQueue.push({ badge: 'Due: R2', label: '7-Day Review', subject: subjName, topic: node.name, subjId });
                            else if (rLevel === 2 && daysSince >= 21) dueQueue.push({ badge: 'Due: R3', label: '21-Day Review', subject: subjName, topic: node.name, subjId });
                            else if (rLevel >= 3 && daysSince >= 45) maintenanceQueue.push({ badge: 'Keep Fresh', label: '45-Day Maintenance Loop', subject: subjName, topic: node.name, subjId });
                        }
                    }
                } else if (node.children) {
                    node.children.forEach(c => traverse(c, subjName, subjId));
                }
            };
            app.examTree.forEach(subj => subj.tree.forEach(t => traverse(t, subj.name, subj.id)));
        }

        dueQueue = dueQueue.concat(maintenanceQueue.slice(0, 3));

        if (dueQueue.length > 0) {
            container.innerHTML = dueQueue.slice(0, 4).map((item, i) => `
                <div class="timeline-item" data-action="jump-syllabus" data-subject="${item.subjId}" style="cursor: pointer;">
                    <div class="timeline-time ${item.isBroken ? 'text-danger' : (i === 0 ? 'text-warning' : '')}">${item.badge}</div>
                    <div class="timeline-content">${item.subject}: ${item.topic}<span class="${item.isBroken ? 'text-danger' : 'text-warning'}">${item.label}</span></div>
                </div>
            `).join('');
        } else {
            container.innerHTML = `
                <div class="timeline-item">
                    <div class="timeline-time text-success">All Set</div>
                    <div class="timeline-content">No revision debt!<span>Pick a new chapter below to start today.</span></div>
                </div>
            `;
        }
    },

    renderSyllabusActions: () => {
        const container = document.getElementById('home-syllabus-actions');
        if (!container || !app.examTree) return;

        let actions = [];
        const traverse = (node, subjName, subjId) => {
            if (node.type === 'leaf') {
                const p = app.progressData || {};
                const hasC = p[`${node.id}_C`] || false;
                const qCount = p[`${node.id}_Q`] || 0;

                if (!hasC) {
                    actions.push({ badge: 'Start', cls: 'pin', text: `${subjName}: ${node.name}`, subjId, priority: 2 });
                } else if (hasC && qCount === 0) {
                    actions.push({ badge: 'Practice', cls: 'pin', text: `${subjName}: ${node.name}`, subjId, priority: 1 });
                }
            } else if (node.children) {
                node.children.forEach(c => traverse(c, subjName, subjId));
            }
        };

        app.examTree.forEach(subj => subj.tree.forEach(t => traverse(t, subj.name, subj.id)));
        actions.sort((a, b) => a.priority - b.priority);
        
        container.innerHTML = actions.slice(0, 3).map(a => `
            <div class="task-item" data-action="jump-syllabus" data-subject="${a.subjId}" style="cursor: pointer;">
                <div class="badge ${a.cls}">${a.badge}</div>
                <div class="task-text">${a.text}</div>
            </div>
        `).join('');
    }
};

const app = {
    currentExamData: null,
    examTree: null,
    progressData: {},
    activeSubjectId: null,

    availableExams: [
        { id: 'cgl', name: 'SSC CGL' },
        { id: 'ntpc', name: 'RRB NTPC' },
        { id: 'upsc', name: 'UPSC CSE' }
    ],

    init: () => {
        settingsApp.init();
        if (typeof mockApp !== 'undefined') mockApp.init();

        const examSelector = document.getElementById('exam-selector');
        if (examSelector) {
            examSelector.innerHTML = app.availableExams.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        }

        const state = storage.getAppState();
        app.progressData = storage.getProgress() || {};
        progressTracker.updateHomeUI();
        app.switchView(state.view || 'home', false);

        const examId = (state.exam && state.exam !== 'undefined') ? state.exam : 'cgl';
        if (examSelector) examSelector.value = examId;
        app.loadExam(examId, state.subject);
    },

    switchView: (viewId, save = true) => {
        if (save) storage.saveAppState('view', viewId);
        if (typeof ui !== 'undefined') ui.closeMobileMenu();

        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-target="${viewId}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
        const viewTarget = document.getElementById(`view-${viewId}`);
        if (viewTarget) viewTarget.classList.add('active');

        if (viewId === 'dashboard' && typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
        if (viewId === 'home') progressTracker.updateHomeUI();
        if (viewId === 'syllabus') app.refreshSyllabusView(); 
    },

    loadExam: async (examId, targetSubjectId = null) => {
        if (!examId || examId === 'undefined') examId = 'cgl';
        storage.saveAppState('exam', examId);
        try {
            let response = await fetch(`data/${examId}.json`);
            if (!response.ok && examId !== 'cgl') {
                examId = 'cgl';
                storage.saveAppState('exam', 'cgl');
                response = await fetch(`data/cgl.json`);
            }
            app.currentExamData = await response.json();
            app.examTree = syllabusEngine.buildTree(app.currentExamData);

            if (app.examTree.length > 0) {
                const subjectExists = targetSubjectId === 'all' || app.examTree.find(s => s.id === targetSubjectId);
                app.activeSubjectId = subjectExists ? targetSubjectId : app.examTree[0].id;
            }
            storage.saveAppState('subject', app.activeSubjectId);

            app.refreshSyllabusView();
            progressTracker.updateHomeUI();
            if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();

        } catch (error) {
            console.error(`Error loading ${examId}.json:`, error);
        }
    },

    switchSubject: (subjectId) => {
        app.activeSubjectId = subjectId;
        storage.saveAppState('subject', subjectId);
        app.refreshSyllabusView();
    },

    refreshSyllabusView: () => {
        if (typeof ui === 'undefined') return;
        ui.renderSubjectDropdown(app.examTree || app.currentExamData, app.activeSubjectId);
        ui.renderSyllabus(app.examTree || app.currentExamData, app.progressData, app.activeSubjectId);
    },

    updateTally: (id, type) => {
        const key = `${id}_${type}`;
        if (type === 'C') {
            app.progressData[key] = !app.progressData[key];
        } else if (type === 'R') {
            let rLevel = app.progressData[key] || 0;
            if (rLevel < 4) rLevel++;
            app.progressData[key] = rLevel;
            app.progressData[`${id}_R_D`] = storage.getLocalDate();
        } else {
            if (!app.progressData[key]) app.progressData[key] = 0;
            app.progressData[key]++;
            if (type === 'T' && app.progressData[`${id}_broken`]) {
                app.progressData[`${id}_broken`] = false;
            }
        }
        storage.saveProgress(app.progressData);

        if (typeof ui !== 'undefined') ui.updateTallyUI(id, type, app.progressData);
        progressTracker.updateHomeUI();
        if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
    },

    decrementTally: (id, type) => {
        if (type === 'C') return;
        const key = `${id}_${type}`;
        if (app.progressData[key] && app.progressData[key] > 0) {
            app.progressData[key]--;
            storage.setKey('progress', app.progressData);

            if (typeof ui !== 'undefined') ui.updateTallyUI(id, type, app.progressData);
            progressTracker.updateHomeUI();
            if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => { app.init(); });