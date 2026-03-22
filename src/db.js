const DB_PREFIX = 'gvs_cuisine_';

export const db = {
  saveData: (type, data) => {
    try {
      const key = DB_PREFIX + type;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const newItem = {
        id: Date.now(),
        timestamp: new Date().toLocaleString(),
        ...data
      };
      existing.unshift(newItem); // Newest first
      localStorage.setItem(key, JSON.stringify(existing));
      console.log(`Saved ${type}:`, newItem);
      return true;
    } catch (e) {
      console.error('Error saving to DB:', e);
      return false;
    }
  },

  getLogs: (type) => {
    try {
      const key = DB_PREFIX + type;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      console.error('Error reading from DB:', e);
      return [];
    }
  },

  setSingleValue: (type, value) => {
    try {
      localStorage.setItem(DB_PREFIX + type, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Error setting single value:', e);
      return false;
    }
  },

  getSingleValue: (type, defaultValue) => {
    try {
      const val = localStorage.getItem(DB_PREFIX + type);
      return val ? JSON.parse(val) : defaultValue;
    } catch (e) {
      console.error('Error getting single value:', e);
      return defaultValue;
    }
  },

  clearData: (type) => {
    localStorage.removeItem(DB_PREFIX + type);
  }
};
