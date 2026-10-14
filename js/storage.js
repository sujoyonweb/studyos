const storage = {
    // Returns YYYY-MM-DD in the user's local timezone
    getLocalDate: (d = new Date()) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    },

    // Core helper to parse objects or strings safely
    getKey: (key, defaultValue = null) => {
        const data = localStorage.getItem(`studyOS_${key}`);
        if (!data) return defaultValue;
        try {
            return JSON.parse(data);
        } catch (e) {
            return data;
        }
    },
    
    // Core helper to save data + trigger non-blocking background auto-sync
    setKey: (key, value) => {
        const val = typeof value === 'object' ? JSON.stringify(value) : value;
        localStorage.setItem(`studyOS_${key}`, val);
        if (typeof backupApp !== 'undefined' && backupApp.notifyDataChanged) {
            backupApp.notifyDataChanged(key);
        }
    },
    
    // --- Progress Tracking ---
    getProgress: () => storage.getKey('progress', {}),
    saveProgress: (data) => storage.setKey('progress', data),
    
    // --- UI State Tracking (The "Memory") ---
    getAppState: () => ({
        exam: storage.getKey('exam', 'cgl'),
        subject: storage.getKey('subject', null),
        view: storage.getKey('view', 'home')
    }),
    
    saveAppState: (key, value) => {
        storage.setKey(key, value);
    }
};