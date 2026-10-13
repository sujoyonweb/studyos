// ==========================================
// UI & LAYOUT CONTROLLER (Defensive Tree Engine)
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

    toggleDropdown: () => {
        document.getElementById('subject-options')?.classList.toggle('open');
    },

    collapsedTopics: new Set(storage.getKey('collapsedTopics', [])),

    toggleAccordion: (topicId) => {
        const content = document.getElementById(`content-${topicId}`);
        const header = document.getElementById(`header-${topicId}`);
        if (content && header) {
            const isCollapsed = content.classList.toggle('collapsed');
            header.classList.toggle('collapsed', isCollapsed);

            if (isCollapsed) ui.collapsedTopics.add(topicId);
            else ui.collapsedTopics.delete(topicId);
            storage.setKey('collapsedTopics', [...ui.collapsedTopics]);
        }
    },

    renderSubjectDropdown: (data, activeSubjectId) => {
        const container = document.getElementById('subject-dropdown');
        if (!container) return;

        const subjects = Array.isArray(data) ? data : (data?.subjects || app.examTree || []);
        if (!subjects || !subjects.length) return;

        const activeSubj = activeSubjectId === 'all'
            ? { name: 'All Subjects' }
            : (subjects.find(s => s.id === activeSubjectId) || subjects[0] || { name: 'Select Subject' });

        let html = `
            <div class="select-trigger">
                <span>${activeSubj.name}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
            <div class="select-options" id="subject-options">
                <div class="select-option ${activeSubjectId === 'all' ? 'active' : ''}" data-action="select-subject" data-id="all">All Subjects</div>
        `;
        subjects.forEach(subj => {
            html += `<div class="select-option ${subj.id === activeSubjectId ? 'active' : ''}" data-action="select-subject" data-id="${subj.id}">${subj.name}</div>`;
        });
        html += `</div>`;
        container.innerHTML = html;

        document.onclick = (e) => {
            if (!e.target.closest('.custom-select')) document.getElementById('subject-options')?.classList.remove('open');
        };
    },

    renderSyllabus: (data, progressData, activeSubjectId) => {
        const container = document.getElementById('syllabus-injection-point');
        if (!container) return;

        let examTree = Array.isArray(data) ? data : null;
        if (!examTree && data?.subjects && typeof syllabusEngine !== 'undefined') {
            examTree = syllabusEngine.buildTree(data);
        }
        if (!examTree) examTree = app.examTree || [];

        const pData = progressData || app.progressData || {};
        const hideMastered = document.getElementById('toggle-hide-mastered')?.checked;
        const searchQuery = (document.getElementById('syllabus-search')?.value || '').toLowerCase().trim();

        const subjectsToRender = activeSubjectId === 'all'
            ? examTree
            : examTree.filter(s => s.id === activeSubjectId);

        let html = '';
        subjectsToRender.forEach(subj => {
            if (activeSubjectId === 'all') {
                const subjStats = syllabusEngine.getStats({ type: 'folder', children: subj.tree }, pData);
                html += `
                    <div style="padding: 1rem 1.5rem; background-color: var(--bg-surface); border-bottom: 2px solid var(--border-light); position: sticky; top: 0; z-index: 20; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="font-size: 1rem; font-weight: 800; color: var(--text-main); margin: 0;">${subj.name}</h3>
                        <div id="subj-badge-${subj.id}" style="font-size: 0.75rem; font-weight: 700; color: var(--brand-accent);">${subjStats.percent}% Complete</div>
                    </div>
                `;
            }
            html += ui.renderTreeBranch(subj.tree, pData, hideMastered, searchQuery);
        });

        container.innerHTML = html || `<div class="text-center text-muted" style="padding: 3rem 1rem;">No matching topics found.</div>`;
    },

    renderTreeBranch: (nodes, progressData, hideMastered, searchQuery = '') => {
        if (!nodes || !Array.isArray(nodes)) return '';
        let html = '';
        const pData = progressData || {};

        nodes.forEach(node => {
            if (node.type === 'leaf') {
                const hasC = pData[`${node.id}_C`] || (node.legacyId && pData[`${node.legacyId}_C`]);
                const qCount = pData[`${node.id}_Q`] || (node.legacyId && pData[`${node.legacyId}_Q`]) || 0;
                const rLevel = pData[`${node.id}_R`] || (node.legacyId && pData[`${node.legacyId}_R`]) || 0;
                const rDateStr = pData[`${node.id}_R_D`];
                const tCount = pData[`${node.id}_T`] || (node.legacyId && pData[`${node.legacyId}_T`]) || 0;

                const isMastered = hasC && qCount > 0 && tCount > 0;
                if (hideMastered && isMastered) return;

                if (searchQuery && !node.name.toLowerCase().includes(searchQuery)) return;

                // UPGRADE: R DECAY METER VISUALS
                let isDebt = false;
                if (hasC) {
                    if (rLevel === 0) isDebt = true;
                    else if (rDateStr) {
                        const daysSince = Math.floor((new Date() - new Date(rDateStr)) / (1000 * 60 * 60 * 24));
                        if (rLevel === 1 && daysSince >= 7) isDebt = true;
                        if (rLevel === 2 && daysSince >= 21) isDebt = true;
                        if (rLevel >= 3 && daysSince >= 45) isDebt = true;
                    }
                }

                let rText = 'R: 0';
                if (rLevel === 1) rText = 'R1';
                if (rLevel === 2) rText = 'R2';
                if (rLevel === 3) rText = 'R3';
                if (rLevel >= 4) rText = '∞';

                html += `
                    <div class="syllabus-row" id="row-${node.id}">
                        <div class="syllabus-title">${node.name}</div>
                        <div class="checkpoint-group">
                            <button id="btn-C-${node.id}" class="tally-btn ${hasC ? 'active concept' : ''}" data-action="tally" data-id="${node.id}" data-type="C" title="Toggle Concept">C</button>
                            <button id="btn-Q-${node.id}" class="tally-btn ${qCount > 0 ? 'active q' : ''}" data-action="tally" data-id="${node.id}" data-type="Q" title="Tap +1 | Right-click/hold -1">Q: ${qCount}</button>
                            <button id="btn-R-${node.id}" class="tally-btn ${rLevel > 0 ? 'active r' : ''} ${isDebt ? 'debt-pulse' : ''}" data-action="tally" data-id="${node.id}" data-type="R" title="Tap advances level"> ${rText} </button>
                            <button id="btn-T-${node.id}" class="tally-btn ${tCount > 0 ? 'active t' : ''}" data-action="tally" data-id="${node.id}" data-type="T" title="Tap +1 | Right-click/hold -1">T: ${tCount}</button>
                        </div>
                    </div>
                `;
            } else {
                const stats = syllabusEngine.getStats(node, pData);
                if (hideMastered && stats.percent === 100) return;

                const matchesSearch = !searchQuery || node.name.toLowerCase().includes(searchQuery) ||
                    JSON.stringify(node.children || []).toLowerCase().includes(searchQuery);
                if (searchQuery && !matchesSearch) return;

                const isCollapsed = searchQuery ? false : ui.collapsedTopics.has(node.id);

                const fillStyle = stats.percent > 0
                    ? `background: linear-gradient(to right, rgba(59, 130, 246, 0.12) ${stats.percent}%, var(--bg-hover) ${stats.percent}%);`
                    : '';

                html += `
                    <div class="folder-group" id="folder-${node.id}">
                        <div id="header-${node.id}" class="topic-header ${isCollapsed ? 'collapsed' : ''}" style="${fillStyle}" data-action="toggle-accordion" data-id="${node.id}">
                            <div class="folder-title-group">
                                <svg class="topic-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                                <span>${node.name}</span>
                            </div>
                            <span id="badge-${node.id}" class="folder-badge">${stats.mastered} / ${stats.leaves} • ${stats.percent}%</span>
                        </div>
                        <div id="content-${node.id}" class="topic-content tree-branch ${isCollapsed ? 'collapsed' : ''}">
                            ${ui.renderTreeBranch(node.children, pData, hideMastered, searchQuery)}
                        </div>
                    </div>
                `;
            }
        });
        return html;
    },

    updateTallyUI: (id, type, progressData) => {
        const pData = progressData || app.progressData || {};
        const btn = document.getElementById(`btn-${type}-${id}`);
        if (btn) {
            const val = pData[`${id}_${type}`];
            if (type === 'C') {
                if (val) btn.classList.add('active', 'concept');
                else btn.classList.remove('active', 'concept');
            } else if (type === 'R') {
                let rText = 'R: 0';
                if (val === 1) rText = 'R1';
                if (val === 2) rText = 'R2';
                if (val === 3) rText = 'R3';
                if (val >= 4) rText = '∞';
                btn.innerText = rText;
                
                if (val > 0) btn.classList.add('active', 'r');
                else btn.classList.remove('active', 'r');
            } else {
                btn.innerText = `${type}: ${val || 0}`;
                if (val > 0) btn.classList.add('active', type.toLowerCase());
                else btn.classList.remove('active', type.toLowerCase());
            }

            // Sync pulse immediately
            const hasC = pData[`${id}_C`];
            const rLevel = pData[`${id}_R`] || 0;
            const rDateStr = pData[`${id}_R_D`];
            const rBtn = document.getElementById(`btn-R-${id}`);
            
            if (rBtn) {
                let isDebt = false;
                if (hasC) {
                    if (rLevel === 0) isDebt = true;
                    else if (rDateStr) {
                        const daysSince = Math.floor((new Date() - new Date(rDateStr)) / (1000 * 60 * 60 * 24));
                        if (rLevel === 1 && daysSince >= 7) isDebt = true;
                        if (rLevel === 2 && daysSince >= 21) isDebt = true;
                        if (rLevel >= 3 && daysSince >= 45) isDebt = true;
                    }
                }
                if (isDebt) rBtn.classList.add('debt-pulse');
                else rBtn.classList.remove('debt-pulse');
            }
        }

        if (!app.examTree) return;
        const updateParents = (nodes) => {
            nodes.forEach(node => {
                if (node.type === 'folder') {
                    const stats = syllabusEngine.getStats(node, pData);
                    const badge = document.getElementById(`badge-${node.id}`);
                    if (badge) badge.innerText = `${stats.mastered} / ${stats.leaves} • ${stats.percent}%`;

                    const header = document.getElementById(`header-${node.id}`);
                    if (header) {
                        header.style.background = stats.percent > 0
                            ? `linear-gradient(to right, rgba(59, 130, 246, 0.12) ${stats.percent}%, var(--bg-hover) ${stats.percent}%)`
                            : 'var(--bg-hover)';
                    }
                    if (node.children) updateParents(node.children);
                }
            });
        };

        app.examTree.forEach(subj => {
            const subjStats = syllabusEngine.getStats({ type: 'folder', children: subj.tree }, pData);
            const subjBadge = document.getElementById(`subj-badge-${subj.id}`);
            if (subjBadge) subjBadge.innerText = `${subjStats.percent}% Complete`;
            updateParents(subj.tree);
        });
    }
};