// ==========================================
// TIMER CONTROLLER
// ==========================================
const timerApp = {
    interval: null,
    type: 'timer', 
    seconds: 25 * 60,
    baseSeconds: 25 * 60,
    isRunning: false,
    sessionElapsed: 0, 

    init: () => {
        timerApp.reset();
        timerApp.updateTodayStats();
    },

    toggle: () => {
        if (timerApp.isRunning) timerApp.pause();
        else timerApp.start();
    },

    start: () => {
        if (!timerApp.isRunning) {
            timerApp.isRunning = true;
            document.getElementById('timer-icon-play').style.display = 'none';
            document.getElementById('timer-icon-pause').style.display = 'block';
            document.getElementById('timer-action-btn')?.style.setProperty('border-color', 'var(--success)');
            timerApp.interval = setInterval(timerApp.tick, 1000);
        }
    },

    pause: () => {
        timerApp.isRunning = false;
        document.getElementById('timer-icon-pause').style.display = 'none';
        document.getElementById('timer-icon-play').style.display = 'block';
        document.getElementById('timer-action-btn')?.style.setProperty('border-color', 'var(--border-light)');
        clearInterval(timerApp.interval);
        
        timerApp.syncProgress();
    },

    reset: () => {
        timerApp.pause();
        timerApp.seconds = timerApp.type === 'timer' ? timerApp.baseSeconds : 0;
        timerApp.updateDisplay();
    },

    tick: () => {
        timerApp.sessionElapsed++;
        
        if (timerApp.type === 'timer') {
            if (timerApp.seconds > 0) {
                timerApp.seconds--;
                timerApp.updateDisplay();
            } else {
                timerApp.completeSession();
            }
        } else {
            timerApp.seconds++;
            timerApp.updateDisplay();
        }

        if (timerApp.sessionElapsed >= 300) {
            timerApp.syncProgress();
        }
    },

    syncProgress: () => {
        if (timerApp.sessionElapsed >= 60) {
            const mins = Math.floor(timerApp.sessionElapsed / 60);
            if (typeof progressTracker !== 'undefined') progressTracker.addMinutes(mins);
            timerApp.sessionElapsed %= 60; 
            timerApp.updateTodayStats();
        }
    },

    completeSession: () => {
        timerApp.pause();
        timerApp.syncProgress();
        if (settingsApp.current.soundEffects) timerApp.playChime();
        timerApp.reset();
    },

    switchType: (newType, btnElement) => {
        timerApp.pause();
        timerApp.type = newType;
        
        document.querySelectorAll('#timer-type-controls .type-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
        
        const modesContainer = document.getElementById('timer-modes');
        if (newType === 'stopwatch') {
            modesContainer.style.display = 'none';
            document.getElementById('timer-label').innerText = 'Free Flow Tracking';
        } else {
            modesContainer.style.display = 'flex';
            document.getElementById('timer-label').innerText = 'What are you working on?';
        }
        
        timerApp.reset();
    },

    setMode: (name, minutes, btnElement) => {
        timerApp.pause();
        timerApp.baseSeconds = minutes * 60;
        
        document.querySelectorAll('#timer-modes .mode-btn').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
        
        document.getElementById('timer-label').innerText = `Current Mode: ${name}`;
        timerApp.reset();
    },

    updateDisplay: () => {
        let m = Math.floor(timerApp.seconds / 60);
        let s = timerApp.seconds % 60;
        
        let h = 0;
        if (m >= 60) {
            h = Math.floor(m / 60);
            m = m % 60;
        }

        const mStr = m.toString().padStart(2, '0');
        const sStr = s.toString().padStart(2, '0');
        
        const timeStr = h > 0 ? `${h}:${mStr}:${sStr}` : `${mStr}:${sStr}`;
        document.getElementById('timer-display').innerText = timeStr;
        
        const homeTimer = document.getElementById('home-quick-timer');
        if (homeTimer) homeTimer.innerText = timeStr;
    },

    updateTodayStats: () => {
        if (typeof progressTracker === 'undefined') return;
        const logs = progressTracker.getLogs();
        const today = new Date().toISOString().split('T')[0];
        const totalMinutes = logs[today] || 0;
        
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        document.getElementById('timer-today-stats').innerText = `Today: ${h}h ${m}m`;
    },

    playChime: () => {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
        oscillator.frequency.exponentialRampToValueAtTime(261.63, audioCtx.currentTime + 2); 
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 2);
    },
    
    quickStart: () => {
        app.switchView('timer');
        if (!timerApp.isRunning) timerApp.start();
    }
};