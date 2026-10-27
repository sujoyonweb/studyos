// ==========================================
// MOCKS CONTROLLER
// ==========================================
const mockApp = {
    data: [],
    editingId: null,
    visibleCount: 10,
    searchQuery: '',
    filterType: 'all',

    escapeHTML: (str = '') => String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m])),

    sortMocks: () => {
        mockApp.data.sort((a, b) => {
            const dateDiff = (b.date || '').localeCompare(a.date || '');
            return dateDiff !== 0 ? dateDiff : (parseInt(b.id) || 0) - (parseInt(a.id) || 0);
        });
    },

    init: () => {
        mockApp.data = storage.getKey('mocks', []);
        mockApp.sortMocks();

        const today = storage.getLocalDate();
        const dateInput = document.getElementById('mock-date');
        if (dateInput) dateInput.value = today;

        mockApp.renderMocks();

        // Feed Action Delegation (Edit, Delete, Load More, Quick Add)
        document.getElementById('mock-feed-container')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            if (btn.dataset.action === 'edit-mock') mockApp.editMock(btn.dataset.id);
            if (btn.dataset.action === 'delete-mock') mockApp.deleteMock(btn.dataset.id);
            if (btn.dataset.action === 'load-more') {
                mockApp.visibleCount += 10;
                mockApp.renderMocks(); 
            }
        });

        // Search Input Listener
        document.getElementById('mock-search')?.addEventListener('input', (e) => {
            mockApp.searchQuery = e.target.value.toLowerCase();
            mockApp.visibleCount = 10; 
            mockApp.renderMocks();
        });
    },

    toggleForm: () => {
        const overlay = document.getElementById('mock-modal-overlay');
        overlay.classList.toggle('active');
        if (!overlay.classList.contains('active') && mockApp.editingId) {
            mockApp.resetForm(); 
        } else if (overlay.classList.contains('active')) {
            if (!mockApp.editingId) {
                const dateInput = document.getElementById('mock-date');
                if (dateInput && !dateInput.value) dateInput.value = storage.getLocalDate();
                const totalInput = document.getElementById('mock-total');
                if (totalInput) totalInput.value = settingsApp.current?.totalScore || 200;
            }
            document.getElementById('mock-modal-title').innerText = mockApp.editingId ? 'Edit Test' : 'Log New Test';
            document.getElementById('btn-save-mock').innerText = mockApp.editingId ? 'Update Test' : 'Save Test';
        }
    },

    editMock: (id) => {
        const mock = mockApp.data.find(m => m.id === id);
        if (!mock) return;
        mockApp.editingId = id;
        document.getElementById('mock-name').value = mock.name;
        document.getElementById('mock-type').value = mock.type;
        document.getElementById('mock-date').value = mock.date;
        document.getElementById('mock-score').value = mock.score;
        document.getElementById('mock-total').value = mock.total;
        document.getElementById('mock-percentile').value = mock.percentile ?? '';
        document.getElementById('mock-hardQs').value = mock.hardQs || '';
        document.getElementById('mock-notes').value = mock.notes || '';
        mockApp.toggleForm();
    },

    resetForm: () => {
        mockApp.editingId = null;
        document.getElementById('mock-name').value = '';
        document.getElementById('mock-date').value = storage.getLocalDate();
        document.getElementById('mock-score').value = '';
        document.getElementById('mock-total').value = settingsApp.current?.totalScore || 200;
        document.getElementById('mock-percentile').value = '';
        document.getElementById('mock-hardQs').value = '';
        document.getElementById('mock-notes').value = '';
    },

    saveMock: () => {
        const name = document.getElementById('mock-name').value.trim();
        const type = document.getElementById('mock-type').value;
        const date = document.getElementById('mock-date').value || storage.getLocalDate();
        const score = parseFloat(document.getElementById('mock-score').value);
        const total = parseFloat(document.getElementById('mock-total').value);
        const percentileStr = document.getElementById('mock-percentile').value;
        const percentile = percentileStr ? parseFloat(percentileStr) : null;
        
        if (!name || isNaN(score) || isNaN(total)) return ui.alert("Please fill in the Test Name, Score, and Total.");
        if (score > total) return ui.alert(`Score (${score}) cannot be greater than the Total marks (${total}).`);
        if (percentile !== null && (percentile > 100 || percentile < 0)) return ui.alert("Percentile must be between 0 and 100.");
        
        const mockPayload = {
            exam: app.activeExamId || 'cgl',
            name,
            type,
            date,
            score,
            total,
            percentile,
            hardQs: document.getElementById('mock-hardQs').value.trim(),
            notes: document.getElementById('mock-notes').value.trim(),
            updatedAt: Date.now()
        };

        if (mockApp.editingId) {
            const index = mockApp.data.findIndex(m => m.id === mockApp.editingId);
            if (index !== -1) mockApp.data[index] = { ...mockApp.data[index], ...mockPayload };
        } else {
            const newMock = { id: Date.now().toString(), ...mockPayload };
            mockApp.data.unshift(newMock);
        }

        mockApp.sortMocks();
        storage.setKey('mocks', mockApp.data);
        mockApp.resetForm();
        document.getElementById('mock-modal-overlay').classList.remove('active');
        mockApp.renderMocks();

        if (typeof progressTracker !== 'undefined') progressTracker.updateHomeUI();
        if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
    },

    deleteMock: (id) => {
        ui.confirm("Are you sure you want to delete this test?", () => {
            mockApp.data = mockApp.data.filter(mock => mock.id !== id);
            const deleted = storage.getKey('deletedIds', []);
            if (!deleted.includes(id)) {
                deleted.push(id);
                storage.setKey('deletedIds', deleted);
            }
            storage.setKey('mocks', mockApp.data);
            mockApp.renderMocks();

            if (typeof progressTracker !== 'undefined') progressTracker.updateHomeUI();
            if (typeof dashboardApp !== 'undefined') dashboardApp.updateDashboard();
        }, true);
    },

    renderMocks: (forceFilter) => {
        if (forceFilter !== undefined) {
            mockApp.filterType = forceFilter;
            mockApp.visibleCount = 10; 
        }

        const container = document.getElementById('mock-feed-container');
        if (!container) return;
        container.innerHTML = '';

        mockApp.data = storage.getKey('mocks', []);
        mockApp.sortMocks();

        // Filter by Active Exam, Type & Search Query
        const activeExam = (typeof app !== 'undefined' && app.activeExamId) ? app.activeExamId : 'cgl';
        let filteredData = mockApp.data.filter(mock => (mock.exam || 'cgl') === activeExam);
        if (mockApp.filterType !== 'all') filteredData = filteredData.filter(mock => mock.type === mockApp.filterType);
        if (mockApp.searchQuery) filteredData = filteredData.filter(mock => mock.name.toLowerCase().includes(mockApp.searchQuery));

        mockApp.renderTrendGraph(filteredData);

        if (filteredData.length === 0) {
            container.innerHTML = `<div class="empty-state-card">No tests found for this filter.</div>`;
            return;
        }

        // Apply Pagination
        const paginatedData = filteredData.slice(0, mockApp.visibleCount);

        paginatedData.forEach(mock => {
            const typeLabel = mock.type === 'full' ? 'Full Length' : 'Sectional';
            const badgeClass = mock.type === 'full' ? 'pin' : 'rev'; 
            
            let percColor = 'var(--text-muted)';
            if (mock.percentile >= 90) percColor = 'var(--success)';
            else if (mock.percentile >= 75) percColor = 'var(--warning)';
            else if (mock.percentile < 75) percColor = 'var(--danger)';

            const percHTML = mock.percentile !== null && mock.percentile !== undefined && mock.percentile !== ''
                ? `<div class="mock-percentile-pill" style="color: ${percColor}; border-color: ${percColor};">${mock.percentile}%ile</div>`
                : '';

            const hardQsHTML = mock.hardQs ? `<div class="mock-block"><div class="mock-block-label">Hard Questions</div><div class="mock-block-text">${mockApp.escapeHTML(mock.hardQs)}</div></div>` : '';
            const notesHTML = mock.notes ? `<div class="mock-block"><div class="mock-block-label">Takeaways</div><div class="mock-block-text">${mockApp.escapeHTML(mock.notes)}</div></div>` : '';
            
            const contentWrapper = (hardQsHTML || notesHTML) ? `<div class="mock-content-wrapper">${hardQsHTML}${notesHTML}</div>` : '';
            
            const quickAddHTML = (!mock.hardQs && !mock.notes) ? `
                <div class="quick-add-trigger">
                    <button data-action="edit-mock" data-id="${mock.id}" class="quick-add-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Add Notes
                    </button>
                </div>` : '';

            const cardHTML = `
                <div class="mock-card">
                    <div class="mock-card-header">
                        <div class="mock-meta-group">
                            <div class="mock-meta-tags">
                                <span class="badge ${badgeClass}">${typeLabel}</span>
                                <span class="mock-date">${mockApp.escapeHTML(mock.date)}</span>
                            </div>
                            <h3 class="mock-title">${mockApp.escapeHTML(mock.name)}</h3>
                        </div>
                        <div class="mock-score-group">
                            <div class="mock-actions">
                                <button data-action="edit-mock" data-id="${mock.id}" class="icon-btn" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                                <button data-action="delete-mock" data-id="${mock.id}" class="icon-btn" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                            </div>
                            <div class="mock-score-display">
                                ${percHTML}
                                <div class="mock-points">${mock.score}<span>/ ${mock.total}</span></div>
                            </div>
                        </div>
                    </div>
                    ${contentWrapper}
                    ${quickAddHTML}
                </div>`;
            container.innerHTML += cardHTML;
        });

        if (mockApp.visibleCount < filteredData.length) {
            container.innerHTML += `<button data-action="load-more" class="load-more-btn">Load Older Tests</button>`;
        }
    },

    renderTrendGraph: (tests) => {
        const container = document.getElementById('mock-trend-container');
        if (!container) return;

        // Strictly plot Full-Length mocks only; hide graph when filtering by Sectional
        if (mockApp.filterType === 'sectional') {
            container.style.display = 'none';
            return;
        }

        const fullTests = (tests || []).filter(t => t.type === 'full');
        const savedLimit = Math.max(2, Math.min(500, parseInt(storage.getKey('mockGraphLimit', 10)) || 10));
        const graphData = fullTests.slice(0, savedLimit).reverse(); 

        if (graphData.length < 2) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';

        const targetScore = settingsApp.current?.targetScore || 165;
        const scores = graphData.map(t => Math.max(0, parseFloat(t.score) || 0));
        const scaleMax = Math.max(targetScore, ...scores, 1);

        const padding = 22;
        const width = 750; 
        const height = 125; 
        const plotH = height - padding * 2;
        const xStep = (width - padding * 2) / (graphData.length - 1);
        const targetY = (height - padding) - ((targetScore / scaleMax) * plotH);
        const dotRadius = graphData.length > 50 ? 2 : (graphData.length > 15 ? 3 : 4);
        
        let polylinePoints = '';
        let circlesHTML = '';
        
        graphData.forEach((test, index) => {
            const scoreVal = Math.max(0, parseFloat(test.score) || 0);
            const x = padding + (index * xStep);
            const y = (height - padding) - ((scoreVal / scaleMax) * plotH);
            
            polylinePoints += `${x},${y} `;
            circlesHTML += `
                <g class="trend-node">
                    <circle cx="${x}" cy="${y}" r="${dotRadius}" fill="var(--bg-surface)" stroke="#3b82f6" stroke-width="2" />
                    <title>${mockApp.escapeHTML(test.name)}
Score: ${test.score} | Date: ${mockApp.escapeHTML(test.date)}</title>
                </g>
            `;
        });
        
        container.innerHTML = `
            <div class="trend-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span>FULL MOCK TREND (SHOWING ${graphData.length})</span>
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <span style="font-size: 0.65rem; color: var(--text-muted);">LAST</span>
                    <input type="number" id="mock-page-limit" class="small-number-input" value="${savedLimit}" min="2" max="500" style="width: 3.75rem; padding: 0.2rem 0.4rem; font-size: 0.72rem;">
                </div>
            </div>
            <svg viewBox="0 0 ${width} ${height}" class="trend-svg" preserveAspectRatio="none">
                <line x1="${padding}" y1="${targetY}" x2="${width - padding}" y2="${targetY}" stroke="var(--text-muted)" stroke-opacity="0.45" stroke-width="1" stroke-dasharray="4 4" />
                <text x="${padding}" y="${targetY - 5}" fill="var(--text-muted)" font-size="9" font-weight="700">TARGET (${targetScore})</text>
                <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--border-light)" stroke-dasharray="4 4" />
                <polyline points="${polylinePoints}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                ${circlesHTML}
            </svg>
        `;
    }
};