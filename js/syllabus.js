// ==========================================
// SYLLABUS ENGINE & CONTROLLER (Single Source of Truth)
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

    buildTree: (examData, examId = null) => {
        if (!examData || !Array.isArray(examData.subjects)) return [];
        const activeExamId = examId || (typeof app !== 'undefined' ? app.activeExamId : 'cgl') || 'cgl';

        // Clone base subjects from JSON
        const mergedSubjects = examData.subjects.map(s => ({
            ...s,
            units: s.units ? [...s.units] : undefined,
            chapters: s.chapters ? [...s.chapters] : undefined,
            topics: s.topics ? [...s.topics] : undefined
        }));

        // Merge any user-created custom subjects/topics from localStorage
        const allCustom = storage.getKey('customSubjects', {});
        const examCustom = allCustom[activeExamId] || [];

        examCustom.forEach(customSubj => {
            const existing = mergedSubjects.find(s => s.name.toLowerCase() === customSubj.name.toLowerCase());
            if (existing) {
                const targetArr = existing.units || existing.chapters || existing.topics || (existing.units = []);
                targetArr.push(...(customSubj.units || []));
            } else {
                mergedSubjects.push(customSubj);
            }
        });

        return mergedSubjects.map(subj => {
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
        const pData = progressData || (typeof app !== 'undefined' ? app.progressData : {}) || {};

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

const syllabusApp = {
    collapsedTopics: new Set(storage.getKey('collapsedTopics', [])),

    escapeHTML: (str = '') => String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m])),

    toggleDropdown: () => {
        document.getElementById('subject-options')?.classList.toggle('open');
    },

    toggleAccordion: (topicId) => {
        const content = document.getElementById(`content-${topicId}`);
        const header = document.getElementById(`header-${topicId}`);
        if (content && header) {
            const isCollapsed = content.classList.toggle('collapsed');
            header.classList.toggle('collapsed', isCollapsed);

            if (isCollapsed) syllabusApp.collapsedTopics.add(topicId);
            else syllabusApp.collapsedTopics.delete(topicId);
            storage.setKey('collapsedTopics', [...syllabusApp.collapsedTopics]);
        }
    },

    refresh: () => {
        syllabusApp.renderSubjectDropdown(app.examTree || app.currentExamData, app.activeSubjectId);
        syllabusApp.renderSyllabus(app.examTree || app.currentExamData, app.progressData, app.activeSubjectId);
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
                <span>${syllabusApp.escapeHTML(activeSubj.name)}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
            </div>
            <div class="select-options" id="subject-options">
                <div class="select-option ${activeSubjectId === 'all' ? 'active' : ''}" data-action="select-subject" data-id="all">All Subjects</div>
        `;
        subjects.forEach(subj => {
            html += `<div class="select-option ${subj.id === activeSubjectId ? 'active' : ''}" data-action="select-subject" data-id="${subj.id}">${syllabusApp.escapeHTML(subj.name)}</div>`;
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
        if (!examTree && data?.subjects) {
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
            const subjMatchesSearch = Boolean(searchQuery && subj.name.toLowerCase().includes(searchQuery));
            const branchHTML = syllabusApp.renderTreeBranch(subj.tree, pData, hideMastered, subjMatchesSearch ? '' : searchQuery);

            if (searchQuery && !branchHTML) return;

            if (activeSubjectId === 'all') {
                const subjStats = syllabusEngine.getStats({ type: 'folder', children: subj.tree }, pData);
                html += `
                    <div style="padding: 1rem 1.5rem; background-color: var(--bg-surface); border-bottom: 2px solid var(--border-light); position: sticky; top: 0; z-index: 20; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="font-size: 1rem; font-weight: 800; color: var(--text-main); margin: 0;">${syllabusApp.escapeHTML(subj.name)}</h3>
                        <div id="subj-badge-${subj.id}" style="font-size: 0.75rem; font-weight: 700; color: var(--brand-accent);">${subjStats.percent}% Complete</div>
                    </div>
                `;
            }
            html += branchHTML;
        });

        container.innerHTML = html || `<div class="text-center text-muted" style="padding: 3rem 1rem;">No matching topics found.</div>`;
    },

    renderTreeBranch: (nodes, progressData, hideMastered, searchQuery = '') => {
        if (!nodes || !Array.isArray(nodes)) return '';
        let html = '';
        const pData = progressData || {};
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);

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

                let isDebt = false;
                if (hasC) {
                    if (rLevel === 0 || pData[`${node.id}_broken`]) isDebt = true;
                    else if (rDateStr) {
                        const daysSince = Math.floor((todayMidnight - new Date(rDateStr + 'T00:00:00')) / 86400000);
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
                        <div class="syllabus-title">${syllabusApp.escapeHTML(node.name)}</div>
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

                const selfMatchesSearch = Boolean(searchQuery && node.name.toLowerCase().includes(searchQuery));
                const childSearchQuery = selfMatchesSearch ? '' : searchQuery;
                const childrenHTML = syllabusApp.renderTreeBranch(node.children, pData, hideMastered, childSearchQuery);

                if (!childrenHTML) return;

                const isCollapsed = searchQuery ? false : syllabusApp.collapsedTopics.has(node.id);

                const fillStyle = stats.percent > 0
                    ? `background: linear-gradient(to right, rgba(59, 130, 246, 0.12) ${stats.percent}%, var(--bg-hover) ${stats.percent}%);`
                    : '';

                html += `
                    <div class="folder-group" id="folder-${node.id}">
                        <div id="header-${node.id}" class="topic-header ${isCollapsed ? 'collapsed' : ''}" style="${fillStyle}" data-action="toggle-accordion" data-id="${node.id}">
                            <div class="folder-title-group">
                                <svg class="topic-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                                <span>${syllabusApp.escapeHTML(node.name)}</span>
                            </div>
                            <span id="badge-${node.id}" class="folder-badge">${stats.mastered} / ${stats.leaves} • ${stats.percent}%</span>
                        </div>
                        <div id="content-${node.id}" class="topic-content tree-branch ${isCollapsed ? 'collapsed' : ''}">
                            ${childrenHTML}
                        </div>
                    </div>
                `;
            }
        });
        return html;
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
        app.progressData[`${id}_u`] = Date.now();
        storage.saveProgress(app.progressData);

        syllabusApp.updateTallyUI(id, type, app.progressData);
        progressTracker.updateHomeUI();
        if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
    },

    decrementTally: (id, type) => {
        if (type === 'C') return;
        const key = `${id}_${type}`;
        if (app.progressData[key] && app.progressData[key] > 0) {
            app.progressData[key]--;
            app.progressData[`${id}_u`] = Date.now();
            storage.setKey('progress', app.progressData);

            syllabusApp.updateTallyUI(id, type, app.progressData);
            progressTracker.updateHomeUI();
            if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
        }
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

            const hasC = pData[`${id}_C`];
            const rLevel = pData[`${id}_R`] || 0;
            const rDateStr = pData[`${id}_R_D`];
            const rBtn = document.getElementById(`btn-R-${id}`);
            
            if (rBtn) {
                let isDebt = false;
                if (hasC) {
                    if (rLevel === 0 || pData[`${id}_broken`]) isDebt = true;
                    else if (rDateStr) {
                        const todayMidnight = new Date();
                        todayMidnight.setHours(0, 0, 0, 0);
                        const daysSince = Math.floor((todayMidnight - new Date(rDateStr + 'T00:00:00')) / 86400000);
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
    },

    // --- IN-APP CUSTOM SUBJECT / TOPIC BUILDER ---
    openAddModal: () => {
        const modal = document.getElementById('syllabus-add-modal');
        if (!modal) return;
        const activeSubj = (app.examTree || []).find(s => s.id === app.activeSubjectId);
        document.getElementById('cs-subject').value = activeSubj ? activeSubj.name : '';
        document.getElementById('cs-unit').value = '';
        document.getElementById('cs-topics').value = '';
        modal.classList.add('active');
    },

    saveCustomTopic: () => {
        const subjName = document.getElementById('cs-subject')?.value.trim();
        const unitName = document.getElementById('cs-unit')?.value.trim() || 'Custom Unit';
        const topicsRaw = document.getElementById('cs-topics')?.value.trim();

        if (!subjName || !topicsRaw) {
            return ui.alert("Please enter both a Subject Name and at least one Topic.");
        }

        const chapters = topicsRaw.split(',').map(s => s.trim()).filter(Boolean);
        if (chapters.length === 0) return;

        const examId = app.activeExamId || 'cgl';
        const allCustom = storage.getKey('customSubjects', {});
        if (!allCustom[examId]) allCustom[examId] = [];

        let subjEntry = allCustom[examId].find(s => s.name.toLowerCase() === subjName.toLowerCase());
        if (!subjEntry) {
            subjEntry = { name: subjName, units: [] };
            allCustom[examId].push(subjEntry);
        }

        let unitEntry = subjEntry.units.find(u => u.name.toLowerCase() === unitName.toLowerCase());
        if (!unitEntry) {
            unitEntry = { name: unitName, chapters: [] };
            subjEntry.units.push(unitEntry);
        }

        chapters.forEach(ch => {
            if (!unitEntry.chapters.includes(ch)) unitEntry.chapters.push(ch);
        });

        storage.setKey('customSubjects', allCustom);
        document.getElementById('syllabus-add-modal')?.classList.remove('active');

        app.examTree = syllabusEngine.buildTree(app.currentExamData, examId);
        const newSubjId = syllabusEngine.slugify(subjName);
        app.switchSubject(newSubjId);
        progressTracker.updateHomeUI();
        if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
    }
};