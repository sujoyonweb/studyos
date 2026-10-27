// ==========================================
// DASHBOARD CONTROLLER (Unified Stats Engine)
// ==========================================
const dashboardApp = {
    escapeHTML: (str = '') => String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m])),

    openGoalsModal: () => {
        const s = settingsApp.current;
        document.getElementById('dg-date').value = s.examDate || '';
        document.getElementById('dg-target').value = s.targetScore || '';
        document.getElementById('dg-total').value = s.totalScore || '';
        document.getElementById('dg-hours').value = s.dailyGoal || '';
        document.getElementById('dash-goals-modal').classList.add('active');
    },

    saveGoals: () => {
        const dDate = document.getElementById('dg-date').value;
        const dTarget = parseFloat(document.getElementById('dg-target').value);
        const dTotal = parseFloat(document.getElementById('dg-total').value);
        const dHours = parseFloat(document.getElementById('dg-hours').value);

        if (dDate) settingsApp.update('examDate', dDate);
        if (!isNaN(dTarget)) settingsApp.update('targetScore', dTarget);
        if (!isNaN(dTotal)) settingsApp.update('totalScore', dTotal);
        if (!isNaN(dHours)) settingsApp.update('dailyGoal', dHours);

        document.getElementById('dash-goals-modal').classList.remove('active');
        dashboardApp.updateDashboard();
    },

    openTimeLogModal: () => {
        document.getElementById('dt-date').value = storage.getLocalDate();
        document.getElementById('dt-hours').value = '';
        document.getElementById('dt-mins').value = '';
        document.getElementById('dash-time-modal').classList.add('active');
    },

    saveTimeLog: () => {
        const dateStr = document.getElementById('dt-date').value;
        const h = parseInt(document.getElementById('dt-hours').value) || 0;
        const m = parseInt(document.getElementById('dt-mins').value) || 0;

        if (!dateStr || (h === 0 && m === 0)) return ui.alert("Please enter a valid time.");

        const totalMins = (h * 60) + m;
        const logs = storage.getKey('timeLogs', {});
        if (!logs[dateStr]) logs[dateStr] = 0;
        logs[dateStr] += totalMins;

        storage.setKey('timeLogs', logs);
        progressTracker.updateHomeUI();
        document.getElementById('dash-time-modal').classList.remove('active');
        dashboardApp.updateDashboard();
    },

    updateDashboard: (examData, progressData) => {
        const currentExam = examData || app.currentExamData;
        const currentProgress = progressData || app.progressData || {};
        const examTree = app.examTree || (currentExam ? syllabusEngine.buildTree(currentExam) : null);
        if (!currentExam || !examTree) return;

        const s = settingsApp.current;
        const TARGET_SCORE = s.targetScore || 140;
        const TOTAL_SCORE = s.totalScore || 200;
        const DAILY_GOAL_MINS = (s.dailyGoal || 8) * 60;

        const setCardVisualProgress = (valElId, pct, rgb, colorVar) => {
            const card = document.getElementById(valElId)?.closest('.card');
            if (card) {
                const clamped = Math.min(100, Math.max(0, Math.round(pct || 0)));
                card.style.setProperty('--stat-pct', `${clamped}%`);
                card.style.setProperty('--stat-rgb', rgb);
                card.style.setProperty('--stat-color', colorVar);
            }
        };

        let daysLeft = null;
        if (s.examDate) {
            const dDay = new Date(s.examDate + 'T00:00:00');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            daysLeft = Math.ceil((dDay.getTime() - today.getTime()) / 86400000);
        }

        document.getElementById('dash-exam-name').innerText = currentExam.examName || "My Exam";

        let badgesHtml = `
            <span class="badge" style="background: var(--bg-body); border: 1px solid var(--border-light); color: var(--text-main);">Target: <span class="text-success">${TARGET_SCORE}/${TOTAL_SCORE}</span></span>
            <span class="badge" style="background: var(--bg-body); border: 1px solid var(--border-light); color: var(--text-main);">Goal: <span class="text-purple">${s.dailyGoal || 8}h/day</span></span>
        `;

        const elCountdown = document.getElementById('dash-countdown');
        if (elCountdown) {
            if (daysLeft === null) elCountdown.innerHTML = "--";
            else if (daysLeft < 0) elCountdown.innerHTML = "Done";
            else if (daysLeft === 0) elCountdown.innerHTML = "Today";
            else elCountdown.innerHTML = daysLeft;
        }

        let globalStats = { maxPts: 0, pts: 0, leaves: 0, mastered: 0 };
        let subjectHTML = '';
        let debtHTML = '';

        examTree.forEach(subj => {
            const subjStats = syllabusEngine.getStats({ type: 'folder', children: subj.tree }, currentProgress);
            globalStats.maxPts += subjStats.maxPts;
            globalStats.pts += subjStats.pts;
            globalStats.leaves += subjStats.leaves;
            globalStats.mastered += subjStats.mastered;

            subjStats.debtNodes.forEach(item => {
                debtHTML += `<div class="debt-item"><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">${dashboardApp.escapeHTML(item.name)}</span><span class="debt-item-subject">${dashboardApp.escapeHTML(subj.name)}</span></div>`;
            });

            subjectHTML += `
                <div class="subj-breakdown-item">
                    <div class="subj-breakdown-header">
                        <span class="subj-breakdown-name" title="${dashboardApp.escapeHTML(subj.name)}">${dashboardApp.escapeHTML(subj.name)}</span>
                        <div class="subj-breakdown-meta">
                            <span class="subj-breakdown-count">${subjStats.mastered}<span>/${subjStats.leaves}</span></span>
                            <span class="subj-breakdown-pct ${subjStats.percent === 100 ? 'is-complete' : ''}">${subjStats.percent}%</span>
                        </div>
                    </div>
                    <div class="dash-mini-progress">
                        <div class="dash-mini-progress-bar ${subjStats.percent === 100 ? 'is-complete' : ''}" style="width: ${subjStats.percent}%;"></div>
                    </div>
                </div>
            `;
        });

        globalStats.mastered = Math.round(globalStats.mastered * 10) / 10;
        const sylPercent = globalStats.maxPts === 0 ? 0 : Math.round((globalStats.pts / globalStats.maxPts) * 100);
        document.getElementById('dash-stat-syllabus').innerText = `${sylPercent}%`;
        setCardVisualProgress('dash-stat-syllabus', sylPercent, '59, 130, 246', 'var(--brand-accent)');
        document.getElementById('dash-subject-breakdown').innerHTML = subjectHTML;

        const elDebt = document.getElementById('dash-revision-debt');
        if (elDebt) elDebt.innerHTML = debtHTML !== '' ? debtHTML : `<div class="text-center text-success" style="font-weight: 600; padding: 2rem 0;">No revision debt! 🎉</div>`;

        const conceptsLeft = Math.max(0, globalStats.leaves - globalStats.mastered);
        if (daysLeft !== null && daysLeft > 0 && conceptsLeft > 0) {
            const reqPace = (conceptsLeft / daysLeft).toFixed(1);
            badgesHtml += `<span class="badge rev">Pace: ${reqPace} topics/day</span>`;
        }

        const badgesContainer = document.getElementById('dash-badges-container');
        if (badgesContainer) badgesContainer.innerHTML = badgesHtml;

        const activeExam = app.activeExamId || 'cgl';
        const allMocks = storage.getKey('mocks', [])
            .filter(m => (m.exam || 'cgl') === activeExam)
            .sort((a, b) => {
                const dateDiff = (b.date || '').localeCompare(a.date || '');
                return dateDiff !== 0 ? dateDiff : (parseInt(b.id) || 0) - (parseInt(a.id) || 0);
            });
        const fullMocks = allMocks.filter(m => m.type === 'full');
        const last5Mocks = fullMocks.slice(0, 5);

        let avgScore = 0; let avgPercentile = 0;
        if (last5Mocks.length > 0) {
            const sumScore = last5Mocks.reduce((sum, mock) => sum + (parseFloat(mock.score) || 0), 0);
            avgScore = (sumScore / last5Mocks.length).toFixed(1);
            let validPercentiles = last5Mocks.filter(m => m.percentile !== null && m.percentile !== undefined && m.percentile !== '');
            if (validPercentiles.length > 0) {
                avgPercentile = (validPercentiles.reduce((sum, mock) => sum + parseFloat(mock.percentile), 0) / validPercentiles.length).toFixed(1);
            }
        }

        document.getElementById('dash-stat-mocks').innerText = avgScore > 0 ? avgScore : '0.0';
        document.getElementById('dash-stat-percentile').innerHTML = `${avgPercentile}<span>%</span>`;
        setCardVisualProgress('dash-stat-mocks', ((parseFloat(avgScore) || 0) / TARGET_SCORE) * 100, '16, 185, 129', 'var(--success)');
        setCardVisualProgress('dash-stat-percentile', parseFloat(avgPercentile) || 0, '245, 158, 11', 'var(--warning)');

        const elGap = document.getElementById('dash-stat-gap');
        if (elGap) {
            if (avgScore > 0) {
                const gap = (avgScore - TARGET_SCORE).toFixed(1);
                if (gap >= 0) elGap.innerHTML = `<span class="text-success">Target hit (+${gap})</span>`;
                else elGap.innerHTML = `<span class="text-danger">${Math.abs(gap)} pts to Target</span>`;
            } else {
                elGap.innerHTML = '';
            }
        }

        const elTakeaways = document.getElementById('dash-takeaways');
        if (elTakeaways) {
            const mocksWithNotes = fullMocks.filter(m => m.notes).slice(0, 4);
            if (mocksWithNotes.length > 0) {
                elTakeaways.innerHTML = mocksWithNotes.map(m => `<div style="padding: 0.75rem; background: var(--bg-hover); border-radius: var(--radius-md);"><div class="dash-stat-label">${dashboardApp.escapeHTML(m.name)}</div><div style="font-size: 0.875rem; color: var(--text-main); line-height: 1.4;">${dashboardApp.escapeHTML(m.notes)}</div></div>`).join('');
            } else {
                elTakeaways.innerHTML = `<div class="text-center text-muted" style="padding: 2rem 0;">No takeaways logged yet.</div>`;
            }
        }

        const logs = storage.getKey('timeLogs', {});
        const daysLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let chartHtml = '';
        let total7DayMins = 0;
        let maxActualMins = 0;

        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const mins = logs[storage.getLocalDate(d)] || 0;
            if (mins > maxActualMins) maxActualMins = mins;
        }

        const chartScaleMax = Math.max(DAILY_GOAL_MINS, maxActualMins) * 1.15;
        const targetLineBottom = (DAILY_GOAL_MINS / chartScaleMax) * 100;
        chartHtml += `<div class="dash-target-line" style="bottom: ${targetLineBottom}%;"><div class="dash-target-label">TARGET</div></div>`;

        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const mins = logs[storage.getLocalDate(d)] || 0;
            const hours = (mins / 60).toFixed(1);
            total7DayMins += mins;
            const heightPercent = Math.max((mins / chartScaleMax) * 100, 2);

            let barColor = 'var(--brand-accent)';
            if (mins >= DAILY_GOAL_MINS) barColor = 'var(--success)';
            else if (i === 0) barColor = 'var(--purple)';

            chartHtml += `
                <div class="dash-bar-wrapper">
                    <div class="dash-bar-value" style="color: ${barColor};">${hours}h</div>
                    <div class="dash-bar" style="height: ${heightPercent}%; background-color: ${barColor}; opacity: ${i === 0 ? '1' : '0.85'}; box-shadow: 0 4px 10px rgba(0,0,0,0.1);"></div>
                    <div class="dash-bar-label" style="color: ${i === 0 ? 'var(--text-main)' : 'var(--text-muted)'};">${daysLabel[d.getDay()][0]}</div>
                </div>
            `;
        }

        const avgDailyHours = (total7DayMins / 60) / 7;
        document.getElementById('dash-activity-chart').innerHTML = chartHtml;
        document.getElementById('dash-stat-hours').innerHTML = `${avgDailyHours.toFixed(1)}<span>h</span>`;
        setCardVisualProgress('dash-stat-hours', (avgDailyHours / (s.dailyGoal || 8)) * 100, '139, 92, 246', 'var(--purple)');

        const streak = progressTracker.calculateStreakCount();
        document.getElementById('dash-stat-streak').innerHTML = streak > 0 ? `<span class="text-success">🔥 ${streak} Day Streak</span>` : `0 Day Streak`;
        const elMobileStreak = document.getElementById('mobile-nav-streak');
        if (elMobileStreak) elMobileStreak.innerHTML = `🔥 ${streak} Day`;

        const savedLimit = Math.max(2, Math.min(500, parseInt(storage.getKey('mockGraphLimit', 10)) || 10));
        const limitInput = document.getElementById('dash-mock-limit');
        if (limitInput && document.activeElement !== limitInput) limitInput.value = savedLimit;

        const elMockChart = document.getElementById('dash-mock-chart');
        if (elMockChart) {
            if (fullMocks.length >= 2) {
                const graphMocks = fullMocks.slice(0, savedLimit).reverse();
                const scores = graphMocks.map(m => Math.max(0, parseFloat(m.score) || 0));
                const scaleMax = Math.max(TARGET_SCORE, ...scores, 1);

                const svgW = 500;
                const topY = 24;
                const svgH = 130;
                const plotH = svgH - topY;
                const padX = 24;

                const targetY = svgH - ((TARGET_SCORE / scaleMax) * plotH);
                const dotRadius = scores.length > 50 ? 2 : (scores.length > 15 ? 3.5 : 5);
                const lineW = scores.length > 50 ? 2 : 3;

                const pointsArr = scores.map((score, index) => {
                    const x = padX + ((index / (scores.length - 1)) * (svgW - padX * 2));
                    const y = svgH - ((score / scaleMax) * plotH);
                    return { x, y, score, name: graphMocks[index].name, date: graphMocks[index].date };
                });

                let svgSegments = ''; let svgCircles = '';
                for (let i = 0; i < pointsArr.length - 1; i++) {
                    let p1 = pointsArr[i]; let p2 = pointsArr[i + 1];
                    svgSegments += `<polygon points="${p1.x},${svgH} ${p1.x},${p1.y} ${p2.x},${p2.y} ${p2.x},${svgH}" fill="url(#mockGradient)" />`;
                    svgSegments += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="var(--success)" stroke-width="${lineW}" stroke-linecap="round"/>`;
                }

                pointsArr.forEach(p => {
                    svgCircles += `
                        <circle cx="${p.x}" cy="${p.y}" r="${dotRadius}" fill="var(--bg-surface)" stroke="var(--success)" stroke-width="2" class="mock-point"><title>${dashboardApp.escapeHTML(p.name)} (${dashboardApp.escapeHTML(p.date)}): ${p.score}</title></circle>
                        <text x="${p.x}" y="${p.y - 10}" text-anchor="middle" fill="var(--text-main)" font-size="12" font-weight="800" class="chart-tooltip">${p.score}</text>
                    `;
                });

                elMockChart.innerHTML = `
                    <svg viewBox="0 0 ${svgW} 150" width="100%" height="160" style="overflow: visible;">
                        <defs><linearGradient id="mockGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--success)" stop-opacity="0.3"/><stop offset="100%" stop-color="var(--success)" stop-opacity="0.0"/></linearGradient></defs>
                        <line x1="${padX}" y1="${targetY}" x2="${svgW - padX}" y2="${targetY}" stroke="var(--text-muted)" stroke-opacity="0.5" stroke-width="1.2" stroke-dasharray="4,4" />
                        <text x="${padX}" y="${targetY - 5}" fill="var(--text-muted)" font-size="9" font-weight="700" letter-spacing="0.05em">TARGET (${TARGET_SCORE})</text>
                        <line x1="${padX}" y1="${svgH}" x2="${svgW - padX}" y2="${svgH}" stroke="var(--border-light)" stroke-width="2" stroke-dasharray="6,6" />
                        ${svgSegments}${svgCircles}
                    </svg>`;
            } else {
                elMockChart.innerHTML = `<div class="text-center text-muted" style="font-size: 0.875rem;">Log at least 2 full mocks to view trend.</div>`;
            }
        }
    }
};