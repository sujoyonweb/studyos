const storage = {
    getLocalDate: (d = new Date()) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    },

    getKey: (key, defaultValue = null) => {
        const data = localStorage.getItem(`studyOS_${key}`);
        if (!data) return defaultValue;
        try {
            return JSON.parse(data);
        } catch (e) {
            return data;
        }
    },
    
    setKey: (key, value, skipSync = false) => {
        const val = typeof value === 'object' ? JSON.stringify(value) : value;
        localStorage.setItem(`studyOS_${key}`, val);
        if (
            !skipSync &&
            typeof backupApp !== 'undefined' &&
            !backupApp.isBooting &&
            !backupApp.isApplying &&
            !backupApp.isSyncing &&
            backupApp.notifyDataChanged
        ) {
            const times = storage.getKey('keyTimes', {});
            times[key] = Date.now();
            localStorage.setItem('studyOS_keyTimes', JSON.stringify(times));
            backupApp.notifyDataChanged(key);
        }
    },
    
    getProgress: () => storage.getKey('progress', {}),
    saveProgress: (data) => storage.setKey('progress', data),
    
    getAppState: () => ({
        exam: storage.getKey('exam', 'cgl'),
        subject: storage.getKey('subject', null),
        view: sessionStorage.getItem('studyOS_view') || 'home'
    }),
    
    saveAppState: (key, value) => {
        if (key === 'view') {
            sessionStorage.setItem('studyOS_view', value);
            localStorage.removeItem('studyOS_view');
            return;
        }
        storage.setKey(key, value, true);
    }
};