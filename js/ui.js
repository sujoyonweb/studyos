// ==========================================
// GLOBAL UI & MODAL CONTROLLER
// ==========================================
const ui = {
    toggleMobileMenu: () => {
        document.querySelector('.sidebar')?.classList.toggle('open');
        document.getElementById('mobile-overlay')?.classList.toggle('active');
    },

    closeMobileMenu: () => {
        document.querySelector('.sidebar')?.classList.remove('open');
        document.getElementById('mobile-overlay')?.classList.remove('active');
    },

    alert: (message) => {
        const overlay = document.getElementById('os-modal-overlay');
        const msgBox = document.getElementById('os-modal-msg');
        const actionsBox = document.getElementById('os-modal-actions');
        if (!overlay) return window.alert(message);
        msgBox.innerHTML = message;
        actionsBox.innerHTML = '<button class="modal-btn" onclick="ui.closeModal()">OK</button>';
        overlay.classList.add('active');
    },

    confirm: (message, onConfirm, isDanger = false, cancelText = "Cancel", onCancel = null) => {
        const overlay = document.getElementById('os-modal-overlay');
        const msgBox = document.getElementById('os-modal-msg');
        const actionsBox = document.getElementById('os-modal-actions');
        
        if (!overlay) { 
            if (window.confirm(message)) onConfirm(); 
            else if (onCancel) onCancel();
            return; 
        }
        
        msgBox.innerHTML = message;
        actionsBox.innerHTML = `
            <button class="modal-btn" id="modal-cancel-btn">${cancelText}</button>
            <button class="modal-btn ${isDanger ? 'danger' : ''}" id="modal-confirm-btn">Confirm</button>
        `;
        
        document.getElementById('modal-cancel-btn').onclick = () => { 
            ui.closeModal(); 
            if (onCancel) onCancel(); 
        };
        document.getElementById('modal-confirm-btn').onclick = () => { 
            ui.closeModal(); 
            onConfirm(); 
        };
        overlay.classList.add('active');
    },

    closeModal: () => {
        document.getElementById('os-modal-overlay')?.classList.remove('active');
    },

    // Safe backwards-compatible delegates to syllabusApp
    toggleDropdown: () => syllabusApp.toggleDropdown(),
    toggleAccordion: (id) => syllabusApp.toggleAccordion(id),
    renderSubjectDropdown: (d, id) => syllabusApp.renderSubjectDropdown(d, id),
    renderSyllabus: (d, p, id) => syllabusApp.renderSyllabus(d, p, id),
    updateTallyUI: (id, t, p) => syllabusApp.updateTallyUI(id, t, p)
};