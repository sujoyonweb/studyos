// ==========================================
// ROUTINE CONTROLLER (Apple-Style Engine)
// ==========================================
const routineApp = {
    data: [],
    tempTasks: [],
    prefs: { 
        color: '#10b981', 
        focus: 'Standard', 
        timerLink: true, 
        remind: false, 
        lastEndH: '12', 
        lastEndM: '00', 
        lastEndAMPM: 'PM' 
    },

    init: () => {
        routineApp.data = storage.getKey('routine', []);
        const savedPrefs = storage.getKey('routinePrefs', null);
        if (savedPrefs) routineApp.prefs = { ...routineApp.prefs, ...savedPrefs };

        routineApp.renderDatePicker();
        routineApp.renderTimeline();

        // Subtask Enter Key Listener
        const taskInput = document.getElementById('rt-task-input');
        if (taskInput) {
            taskInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    routineApp.addTempTask();
                }
            });
        }
    },

    switchTab: (tabId, btn) => {
        document.querySelectorAll('.rt-top-nav button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('routine-timeline-view').style.display = tabId === 'timeline' ? 'block' : 'none';
        document.getElementById('routine-routines-view').style.display = tabId === 'routines' ? 'block' : 'none';
    },

    // Generates the interactive week date picker
    renderDatePicker: () => {
        const container = document.getElementById('rt-date-picker');
        if (!container) return;
        
        const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        const today = new Date();
        const currentDayIndex = today.getDay();
        let html = '';

        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - currentDayIndex + i);
            const isToday = i === currentDayIndex;
            html += `
                <div class="rt-day ${isToday ? 'active' : ''}">
                    <span>${days[i]}</span>
                    <span>${date.getDate()}</span>
                </div>
            `;
        }
        container.innerHTML = html;
    },

    toggleForm: () => {
        const overlay = document.getElementById('routine-modal-overlay');
        overlay.classList.toggle('active');
        
        if (overlay.classList.contains('active')) {
            document.getElementById('rt-title').value = '';
            document.getElementById('rt-subtitle').value = '';
            document.getElementById('rt-task-input').value = '';
            
            // Load Smart Memory for Start Time
            if (routineApp.prefs.lastEndH) {
                document.getElementById('rt-start-h').value = routineApp.prefs.lastEndH;
                document.getElementById('rt-start-m').value = routineApp.prefs.lastEndM;
                document.getElementById('rt-start-ampm').innerText = routineApp.prefs.lastEndAMPM;
                
                document.getElementById('rt-end-h').value = '';
                document.getElementById('rt-end-m').value = '';
                document.getElementById('rt-end-ampm').innerText = routineApp.prefs.lastEndAMPM;
            }

            document.getElementById('rt-timer-link').checked = routineApp.prefs.timerLink;
            document.getElementById('rt-remind').checked = routineApp.prefs.remind;

            routineApp.tempTasks = [];
            routineApp.renderTempTasks();
            routineApp.calculateDuration();
        }
    },

    // --- TIME PARSING & AUTO-ADVANCE LOGIC ---
    
    autoAdvance: (input, nextId) => {
        if (input.value.length === 2) {
            routineApp.calculateDuration();
            const nextElement = document.getElementById(nextId);
            if (nextElement) {
                nextElement.focus();
                nextElement.select();
            }
        }
    },

    formatTimeInput: (input) => {
        let val = parseInt(input.value);
        if (isNaN(val)) {
            input.value = '';
            routineApp.calculateDuration();
            return;
        }
        if (input.id.includes('-h')) {
            val = Math.max(1, Math.min(12, val));
        } else if (input.id.includes('-m')) {
            val = Math.max(0, Math.min(59, val));
        }
        input.value = val.toString().padStart(2, '0');
        routineApp.calculateDuration();
    },

    toggleAMPM: (btnId) => {
        const btn = document.getElementById(btnId);
        btn.innerText = btn.innerText === 'AM' ? 'PM' : 'AM';
        routineApp.calculateDuration();
    },

    getTimeInMinutes: (prefix) => {
        let h = parseInt(document.getElementById(`${prefix}-h`).value);
        let m = parseInt(document.getElementById(`${prefix}-m`).value);
        const ampm = document.getElementById(`${prefix}-ampm`).innerText;

        if (isNaN(h) || isNaN(m)) return null;

        if (h === 12 && ampm === 'AM') h = 0;
        if (h < 12 && ampm === 'PM') h += 12;

        return (h * 60) + m;
    },

    calculateDuration: () => {
        const startMins = routineApp.getTimeInMinutes('rt-start');
        const endMins = routineApp.getTimeInMinutes('rt-end');
        const display = document.getElementById('rt-duration');
        
        if (!display) return;
        if (startMins === null || endMins === null) {
            display.innerText = '0h';
            return '0h';
        }

        let diff = endMins - startMins;
        if (diff < 0) diff += 24 * 60;

        const h = Math.floor(diff / 60);
        const m = diff % 60;
        
        let durStr = '';
        if (h > 0) durStr += `${h}h `;
        if (m > 0 || h === 0) durStr += `${m}m`;
        
        display.innerText = durStr.trim();
        return durStr.trim();
    },

    // --- SUBTASKS MANAGEMENT ---

    addTempTask: () => {
        const input = document.getElementById('rt-task-input');
        const text = input.value.trim();
        if (text) {
            routineApp.tempTasks.push({ id: 't' + Date.now(), text: text, checked: false });
            input.value = '';
            routineApp.renderTempTasks();
        }
    },

    removeTempTask: (id) => {
        routineApp.tempTasks = routineApp.tempTasks.filter(t => t.id !== id);
        routineApp.renderTempTasks();
    },

    renderTempTasks: () => {
        const container = document.getElementById('rt-temp-tasks');
        if (!container) return;
        container.innerHTML = routineApp.tempTasks.map(t => `
            <div class="subtask-item">
                <span>${t.text}</span>
                <button onclick="routineApp.removeTempTask('${t.id}')">✕</button>
            </div>
        `).join('');
    },

    // --- SAVE & DELETE ---

    saveBlock: () => {
        const title = document.getElementById('rt-title').value.trim();
        const sh = document.getElementById('rt-start-h').value;
        const sm = document.getElementById('rt-start-m').value;
        const eh = document.getElementById('rt-end-h').value;
        const em = document.getElementById('rt-end-m').value;
        const sampm = document.getElementById('rt-start-ampm').innerText;
        const eampm = document.getElementById('rt-end-ampm').innerText;
        
        if (!title || !sh || !sm || !eh || !em) {
            if (window.ui && ui.alert) return ui.alert("Please fill in the Block Title and full Time constraints.");
            return alert("Please fill in all required fields.");
        }

        routineApp.prefs.lastEndH = eh;
        routineApp.prefs.lastEndM = em;
        routineApp.prefs.lastEndAMPM = eampm;
        routineApp.prefs.timerLink = document.getElementById('rt-timer-link').checked;
        routineApp.prefs.remind = document.getElementById('rt-remind').checked;
        storage.setKey('routinePrefs', routineApp.prefs);

        const dur = routineApp.calculateDuration();
        const fullTitle = `${title} (${sh}:${sm}${sampm.toLowerCase()} to ${eh}:${em}${eampm.toLowerCase()}) - ${dur}`;
        const timeHeader = `${sh}:${sm} ${sampm} • Everyday`;

        const newBlock = {
            id: 'b' + Date.now(),
            rawMins: routineApp.getTimeInMinutes('rt-start'),
            timeHeader,
            fullTitle,
            tasks: [...routineApp.tempTasks],
            timerLink: routineApp.prefs.timerLink
        };

        routineApp.data.push(newBlock);
        routineApp.data.sort((a, b) => a.rawMins - b.rawMins);

        storage.setKey('routine', routineApp.data);
        routineApp.toggleForm();
        routineApp.renderTimeline();
    },

    toggleTask: (bId, tId) => {
        const b = routineApp.data.find(x => x.id === bId);
        if (b) {
            const t = b.tasks.find(x => x.id === tId);
            if (t) {
                t.checked = !t.checked;
                storage.setKey('routine', routineApp.data);
                routineApp.renderTimeline();
            }
        }
    },

    deleteBlock: (id) => {
        const executeDelete = () => {
            routineApp.data = routineApp.data.filter(b => b.id !== id);
            storage.setKey('routine', routineApp.data);
            routineApp.renderTimeline();
        };

        if (window.ui && ui.confirm) {
            ui.confirm("Delete this routine block?", executeDelete, true);
        } else {
            if (confirm("Delete this routine block?")) executeDelete();
        }
    },

    // --- RENDER TIMELINE ---

    renderTimeline: () => {
        const container = document.getElementById('rt-timeline-container');
        if (!container) return;

        if (routineApp.data.length === 0) {
            container.innerHTML = `<div class="card" style="text-align: center; color: var(--text-muted); padding: 3rem;">Your timeline is empty. Tap the + button below to add blocks.</div>`;
            return;
        }

        container.innerHTML = routineApp.data.map((block, index) => {
            const isActive = index === 0; // Highlights top block with active green dot
            
            const tasksHtml = block.tasks.length ? `<div class="rt-card-tasks">` + block.tasks.map(t => `
                <label class="rt-card-task ${t.checked ? 'done' : ''}">
                    <input type="checkbox" ${t.checked ? 'checked' : ''} onchange="routineApp.toggleTask('${block.id}', '${t.id}')">
                    <span>${t.text}</span>
                </label>
            `).join('') + `</div>` : '';

            return `
                <div class="rt-card">
                    <div class="rt-node ${isActive ? 'active' : ''}"></div>
                    <div class="rt-card-header">
                        <div>
                            <div class="rt-card-time">${block.timeHeader}</div>
                            <div class="rt-card-title">${block.fullTitle}</div>
                        </div>
                        <button class="rt-card-menu" onclick="routineApp.deleteBlock('${block.id}')" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                        </button>
                    </div>
                    ${tasksHtml}
                </div>
            `;
        }).join('');
    }
};