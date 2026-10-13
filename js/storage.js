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
            return data; // Return as plain string if not JSON
        }
    },
    
    // Core helper to save data
    setKey: (key, value) => {
        const val = typeof value === 'object' ? JSON.stringify(value) : value;
        localStorage.setItem(`studyOS_${key}`, val);
    },
    
    // --- Progress Tracking ---
    getProgress: () => storage.getKey('progress', {}),
    saveProgress: (data) => storage.setKey('progress', data),
    
    // --- UI State Tracking (The "Memory") ---
    getAppState: () => ({
        exam: storage.getKey('exam', 'cgl'), // Defaults to CGL
        subject: storage.getKey('subject', null),
        view: storage.getKey('view', 'home') // Defaults to Home screen
    }),
    
    saveAppState: (key, value) => {
        storage.setKey(key, value);
    }
};