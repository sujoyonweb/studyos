// ==========================================
// MASTER EVENT ROUTER (Zero-Inline-JS Engine)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    document.addEventListener('click', (e) => {
        const target = e.target;

        if (target.id === 'mobile-overlay') { ui.closeMobileMenu(); return; }
        // Prevent system confirmation modal from closing without an explicit choice
        if (target.classList.contains('modal-overlay') && target.id !== 'os-modal-overlay') {
            target.classList.remove('active');
            return;
        }

        const btn = target.closest('button') || target.closest('.select-trigger') || target.closest('.select-option') || target.closest('.topic-header') || target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;

        if (action === 'switch-view') app.switchView(btn.dataset.target);
        if (action === 'toggle-focus-task') progressTracker.toggleFocusTask(parseInt(btn.dataset.index));
        if (action === 'jump-syllabus') { app.switchSubject(btn.dataset.subject); app.switchView('syllabus'); }
        
        if (btn.id === 'btn-mobile-menu') ui.toggleMobileMenu();
        if (btn.id === 'btn-close-mobile-menu') ui.closeMobileMenu();

        if (btn.id === 'btn-edit-goals') dashboardApp.openGoalsModal();
        if (btn.id === 'btn-close-goals-modal') document.getElementById('dash-goals-modal').classList.remove('active');
        if (btn.id === 'btn-save-goals') dashboardApp.saveGoals();

        if (btn.id === 'btn-open-time-modal') dashboardApp.openTimeLogModal();
        if (btn.id === 'btn-close-time-modal') document.getElementById('dash-time-modal').classList.remove('active');
        if (btn.id === 'btn-save-time') dashboardApp.saveTimeLog();

        if (action === 'timer-type' && typeof timerApp !== 'undefined') timerApp.switchType(btn.dataset.type, btn);
        if (action === 'timer-mode' && typeof timerApp !== 'undefined') timerApp.setMode(btn.dataset.name, parseInt(btn.dataset.minutes), btn);
        if (btn.id === 'timer-action-btn' && typeof timerApp !== 'undefined') timerApp.toggle();
        if (btn.id === 'timer-reset-btn' && typeof timerApp !== 'undefined') timerApp.reset();
        if (btn.id === 'btn-quick-start') dashboardApp.openTimeLogModal();

        if (action === 'routine-tab' && typeof routineApp !== 'undefined') routineApp.switchTab(btn.dataset.target, btn);
        if ((btn.id === 'btn-add-routine' || btn.id === 'btn-close-routine-modal') && typeof routineApp !== 'undefined') routineApp.toggleForm();
        if (btn.id === 'btn-save-routine' && typeof routineApp !== 'undefined') routineApp.saveBlock();
        if (action === 'routine-focus' && typeof routineApp !== 'undefined') routineApp.setFocus(btn.dataset.level, btn);
        if (action === 'routine-color' && typeof routineApp !== 'undefined') routineApp.setColor(btn.dataset.color, btn);
        if ((btn.id === 'rt-start-ampm' || btn.id === 'rt-end-ampm') && typeof routineApp !== 'undefined') routineApp.toggleAMPM(btn.id);

        if (btn.id === 'btn-add-mock' || btn.id === 'btn-cancel-mock' || btn.id === 'btn-close-mock-modal') mockApp.toggleForm();
        if (btn.id === 'btn-save-mock') mockApp.saveMock();

        if (action === 'setting-segment') settingsApp.updateSegment(btn.dataset.key, btn.dataset.value, btn);
        if (btn.id === 'btn-export-data') settingsApp.exportData();
        if (btn.id === 'btn-import-trigger') document.getElementById('import-file').click();
        if (btn.id === 'btn-clear-data') settingsApp.clearAllData();

        if (target.closest('.select-trigger')) ui.toggleDropdown();
        if (action === 'select-subject') { app.switchSubject(btn.dataset.id); ui.toggleDropdown(); }
        if (action === 'toggle-accordion') ui.toggleAccordion(btn.dataset.id);

        if (action === 'tally') {
            if (btn.dataset.longPressTriggered === 'true') {
                delete btn.dataset.longPressTriggered;
                return;
            }
            app.updateTally(btn.dataset.id, btn.dataset.type);
        }
    });

    document.addEventListener('contextmenu', (e) => {
        const btn = e.target.closest('button');
        if (btn && btn.dataset.action === 'tally' && btn.dataset.type !== 'C') {
            e.preventDefault();
            app.decrementTally(btn.dataset.id, btn.dataset.type);
        }
    });

    let longPressTimer = null;
    let activeTouchBtn = null;

    document.addEventListener('touchstart', (e) => {
        const btn = e.target.closest('button[data-action="tally"]');
        if (btn && btn.dataset.type !== 'C') {
            activeTouchBtn = btn;
            longPressTimer = setTimeout(() => {
                if (activeTouchBtn) {
                    activeTouchBtn.dataset.longPressTriggered = 'true';
                    if (navigator.vibrate) navigator.vibrate(40);
                    app.decrementTally(activeTouchBtn.dataset.id, activeTouchBtn.dataset.type);
                }
            }, 500);
        }
    }, { passive: true });

    document.addEventListener('touchend', () => { if (longPressTimer) clearTimeout(longPressTimer); activeTouchBtn = null; });
    document.addEventListener('touchmove', () => { if (longPressTimer) clearTimeout(longPressTimer); activeTouchBtn = null; });

    document.addEventListener('change', (e) => {
        const target = e.target;
        if (target.id === 'exam-selector') app.loadExam(target.value, null);
        if (target.id === 'mock-filter') mockApp.renderMocks(target.value);
        if (target.id === 'import-file') settingsApp.importData(e);
        if (target.id === 'toggle-hide-mastered') app.refreshSyllabusView();
        if (target.id === 'setting-goal') settingsApp.update('dailyGoal', Math.max(0.5, parseFloat(target.value) || 8));
        if (target.id === 'setting-sound') settingsApp.update('soundEffects', target.checked);
        if (target.id === 'setting-awake') settingsApp.update('keepAwake', target.checked);
    });

    document.addEventListener('input', (e) => {
        if (e.target.id === 'syllabus-search') app.refreshSyllabusView();
    });

    document.addEventListener('focusout', (e) => {
        if (e.target.classList.contains('focus-task-input')) progressTracker.updateFocusTaskText(parseInt(e.target.dataset.index), e.target.innerText);
        if (e.target.closest('.custom-time-input') && e.target.tagName === 'INPUT' && typeof routineApp !== 'undefined') routineApp.formatTimeInput(e.target);
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('focus-task-input') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });

    // --- DRAG AND DROP SYNC ENGINE ---
    const syncDropzone = document.getElementById('sync-dropzone');
    if (syncDropzone) {
        syncDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            syncDropzone.classList.add('drag-over');
        });
        syncDropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            syncDropzone.classList.remove('drag-over');
        });
        syncDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            syncDropzone.classList.remove('drag-over');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                settingsApp.importData(e.dataTransfer.files[0]);
            }
        });
    }
});