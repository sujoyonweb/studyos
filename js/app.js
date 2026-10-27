// ==========================================
// CORE APPLICATION, SETTINGS & HOME CONTROLLER
// ==========================================

const settingsApp = {
    wakeLock: null,

    defaultProfiles: {
        cgl: { targetScore: 165, totalScore: 200, examDate: '2027-09-15' },
        ntpc: { targetScore: 85, totalScore: 100, examDate: '2027-06-01' },
        upsc: { targetScore: 110, totalScore: 200, examDate: '2027-05-25' }
    },

    defaultSettings: {
        dailyGoal: 8,
        targetScore: 165,
        totalScore: 200,
        examDate: '2027-09-15',
        prepStartDate: null,
        examProfiles: {},
        autoFlow: false,
        breakDuration: 5,
        focusDuration: 25,
        theme: 'night',
        soundEffects: true,
        keepAwake: true
    },

    init: () => {
        const savedSettings = storage.getKey('preferences', settingsApp.defaultSettings);
        settingsApp.current = { ...settingsApp.defaultSettings, ...savedSettings };

        if (!settingsApp.current.examProfiles || typeof settingsApp.current.examProfiles !== 'object') {
            settingsApp.current.examProfiles = {};
        }
        Object.keys(settingsApp.defaultProfiles).forEach(exId => {
            if (!settingsApp.current.examProfiles[exId]) {
                if (exId === 'cgl' && savedSettings) {
                    settingsApp.current.examProfiles.cgl = {
                        targetScore: savedSettings.targetScore || 165,
                        totalScore: savedSettings.totalScore || 200,
                        examDate: savedSettings.examDate || '2027-09-15'
                    };
                } else {
                    settingsApp.current.examProfiles[exId] = { ...settingsApp.defaultProfiles[exId] };
                }
            }
        });

        if (!settingsApp.current.prepStartDate) {
            settingsApp.current.prepStartDate = storage.getLocalDate();
        }
        storage.setKey('preferences', settingsApp.current);

        settingsApp.applyTheme(settingsApp.current.theme);
        settingsApp.applyWakeLock(settingsApp.current.keepAwake);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && settingsApp.current.keepAwake) {
                settingsApp.applyWakeLock(true);
            }
        });
        
        setTimeout(() => {
            const elGoal = document.getElementById('setting-goal');
            const elSound = document.getElementById('setting-sound');
            const elAwake = document.getElementById('setting-awake');
            if (elGoal) elGoal.value = settingsApp.current.dailyGoal;
            if (elSound) elSound.checked = settingsApp.current.soundEffects;
            if (elAwake) elAwake.checked = settingsApp.current.keepAwake;
            settingsApp.setSegmentUI('setting-theme', settingsApp.current.theme);
            if (typeof backupApp !== 'undefined') backupApp.updateUI();
        }, 100); 
    },

    syncExamProfile: (examId) => {
        const id = examId || 'cgl';
        if (!settingsApp.current.examProfiles) settingsApp.current.examProfiles = {};
        if (!settingsApp.current.examProfiles[id]) {
            settingsApp.current.examProfiles[id] = { ...(settingsApp.defaultProfiles[id] || settingsApp.defaultProfiles.cgl) };
        }
        const profile = settingsApp.current.examProfiles[id];
        settingsApp.current.targetScore = profile.targetScore;
        settingsApp.current.totalScore = profile.totalScore;
        settingsApp.current.examDate = profile.examDate;
        storage.setKey('preferences', settingsApp.current);

        const mockTotalInput = document.getElementById('mock-total');
        if (mockTotalInput && (!mockApp || !mockApp.editingId)) {
            mockTotalInput.value = profile.totalScore;
        }
    },

    update: (key, value) => {
        settingsApp.current[key] = value;
        if (['targetScore', 'totalScore', 'examDate'].includes(key)) {
            const activeExam = app.activeExamId || 'cgl';
            if (!settingsApp.current.examProfiles) settingsApp.current.examProfiles = {};
            if (!settingsApp.current.examProfiles[activeExam]) {
                settingsApp.current.examProfiles[activeExam] = { ...(settingsApp.defaultProfiles[activeExam] || settingsApp.defaultProfiles.cgl) };
            }
            settingsApp.current.examProfiles[activeExam][key] = value;
        }
        storage.setKey('preferences', settingsApp.current);
        if (key === 'theme') settingsApp.applyTheme(value);
        if (key === 'keepAwake') settingsApp.applyWakeLock(value);
        if (key === 'dailyGoal' || key === 'examDate') progressTracker.updateHomeUI();
    },

    applyWakeLock: async (enabled) => {
        if (!('wakeLock' in navigator)) return;
        try {
            if (enabled && !settingsApp.wakeLock) {
                settingsApp.wakeLock = await navigator.wakeLock.request('screen');
                settingsApp.wakeLock.addEventListener('release', () => {
                    settingsApp.wakeLock = null;
                });
            } else if (!enabled && settingsApp.wakeLock) {
                await settingsApp.wakeLock.release();
                settingsApp.wakeLock = null;
            }
        } catch (e) {}
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

    // Safe delegates to backupApp
    updateSyncUI: () => backupApp.updateUI(),
    exportData: () => backupApp.exportData(),
    importData: (e) => backupApp.importData(e),
    undoImport: () => backupApp.undoImport(),

    clearAllData: () => {
        const executeClear = () => { localStorage.clear(); window.location.reload(); };
        if (typeof ui !== 'undefined' && ui.confirm) {
            ui.confirm("Are you sure? This deletes ALL local data permanently.", executeClear, true);
        } else if (window.confirm("Are you sure? This deletes ALL local data permanently.")) {
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

    detectIllusions: (examTree, progressData) => {
        const activeExam = app.activeExamId || 'cgl';
        const mocks = storage.getKey('mocks', []).filter(m => (m.exam || 'cgl') === activeExam);
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
                const isStudied = Boolean(
                    progressData[`${node.id}_C`] ||
                    (progressData[`${node.id}_Q`] > 0) ||
                    (progressData[`${node.id}_T`] > 0) ||
                    progressData[`${node.id}_broken`]
                );
                if (!isStudied) return;

                const patterns = getMatchPatterns(node.name);
                if (patterns.length > 0) {
                    const lastRehabTime = progressData[`${node.id}_rehabTime`] || 0;
                    let strikes = 0;

                    mocks.forEach(m => {
                        const mockTime = Math.max(parseInt(m.id) || 0, m.updatedAt || 0);
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

    renderVelocityChart: () => {
        const velocityCard = document.querySelector('.quick-start-card');
        if (!velocityCard) return;

        let totalLeaves = 0; 
        let masteredLeaves = 0;
        const p = app.progressData || {};

        const traverse = node => {
            if (node.type === 'leaf') {
                totalLeaves++;
                const hasC = p[`${node.id}_C`] || (node.legacyId && p[`${node.id}_C`]);
                const qCount = p[`${node.id}_Q`] || (node.legacyId && p[`${node.id}_Q`]) || 0;
                if (hasC) masteredLeaves += 0.5;
                if (qCount > 0) masteredLeaves += 0.5;
            } else if (node.children) {
                node.children.forEach(traverse);
            }
        };
        if (app.examTree) app.examTree.forEach(subj => subj.tree.forEach(traverse));
        masteredLeaves = Math.round(masteredLeaves * 10) / 10;
        if (totalLeaves === 0) totalLeaves = 1;
        
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);

        let earliestDateStr = settingsApp.current.prepStartDate || storage.getLocalDate();
        const logDates = Object.keys(progressTracker.getLogs()).sort();
        if (logDates.length > 0 && logDates[0] < earliestDateStr) earliestDateStr = logDates[0];

        const startMidnight = new Date(earliestDateStr + 'T00:00:00');
        const daysElapsed = Math.max(1, Math.floor((todayMidnight - startMidnight) / 86400000) + 1);

        const daysLeft = settingsApp.current.examDate
            ? Math.max(0, Math.ceil((new Date(settingsApp.current.examDate + 'T00:00:00') - todayMidnight) / 86400000))
            : 180;
        const totalPrepDays = Math.max(1, daysElapsed + daysLeft);
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
        const lastDate = storage.getKey('focusTasksDate', null);
        const today = storage.getLocalDate();
        
        if (lastDate !== today) {
            if (lastDate !== null) {
                tasks.forEach(t => t.done = false);
                storage.setKey('focusTasks', tasks);
            }
            storage.setKey('focusTasksDate', today, true);
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
    activeExamId: 'cgl',
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
        if (typeof backupApp !== 'undefined') backupApp.init();
        if (typeof mockApp !== 'undefined') mockApp.init();

        const examSelector = document.getElementById('exam-selector');
        if (examSelector) {
            examSelector.innerHTML = app.availableExams.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
        }

        const state = storage.getAppState();
        app.progressData = storage.getProgress() || {};

        const urlParams = new URLSearchParams(window.location.search);
        const urlView = urlParams.get('view');
        const validViews = ['home', 'dashboard', 'syllabus', 'timer', 'routine', 'mocks', 'settings'];
        const initialView = (urlView && validViews.includes(urlView))
            ? urlView
            : (validViews.includes(state.view) ? state.view : 'home');

        const examId = (state.exam && state.exam !== 'undefined') ? state.exam : 'cgl';
        app.activeExamId = examId;
        settingsApp.syncExamProfile(examId);

        progressTracker.updateHomeUI();
        app.switchView(initialView, true);

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
        if (viewId === 'syllabus') syllabusApp.refresh();
        if (viewId === 'mocks' && typeof mockApp !== 'undefined') mockApp.renderMocks();
        if (viewId === 'settings' && typeof backupApp !== 'undefined') backupApp.updateUI();
    },

    loadExam: async (examId, targetSubjectId = null) => {
        if (!examId || examId === 'undefined') examId = 'cgl';
        app.activeExamId = examId;
        storage.saveAppState('exam', examId);
        settingsApp.syncExamProfile(examId);

        try {
            let response = await fetch(`data/${examId}.json`);
            if (!response.ok && examId !== 'cgl') {
                examId = 'cgl';
                app.activeExamId = 'cgl';
                storage.saveAppState('exam', 'cgl');
                settingsApp.syncExamProfile('cgl');
                response = await fetch(`data/cgl.json`);
            }
            app.currentExamData = await response.json();
            app.examTree = syllabusEngine.buildTree(app.currentExamData, examId);

            if (app.examTree.length > 0) {
                const subjectExists = targetSubjectId === 'all' || app.examTree.find(s => s.id === targetSubjectId);
                app.activeSubjectId = subjectExists ? targetSubjectId : app.examTree[0].id;
            }
            storage.saveAppState('subject', app.activeSubjectId);

            syllabusApp.refresh();
            progressTracker.updateHomeUI();
            if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
            if (typeof mockApp !== 'undefined') mockApp.renderMocks();
        } catch (error) {
            console.error(`Error loading ${examId}.json:`, error);
        } finally {
            if (typeof backupApp !== 'undefined') backupApp.isBooting = false;
        }
    },

    switchSubject: (subjectId) => {
        app.activeSubjectId = subjectId;
        storage.saveAppState('subject', subjectId);
        syllabusApp.refresh();
    },

    // Safe delegates to syllabusApp
    refreshSyllabusView: () => syllabusApp.refresh(),
    updateTally: (id, type) => syllabusApp.updateTally(id, type),
    decrementTally: (id, type) => syllabusApp.decrementTally(id, type)
};

document.addEventListener('DOMContentLoaded', () => { app.init(); });