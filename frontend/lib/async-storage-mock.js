// Mock implementation of @react-native-async-storage/async-storage for web
// This provides the same API but uses localStorage instead

const AsyncStorage = {
    getItem: async (key) => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                return window.localStorage.getItem(key);
            }
            return null;
        } catch (error) {
            console.warn('AsyncStorage.getItem error:', error);
            return null;
        }
    },

    setItem: async (key, value) => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(key, value);
                return true;
            }
            return false;
        } catch (error) {
            console.warn('AsyncStorage.setItem error:', error);
            return false;
        }
    },

    removeItem: async (key) => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(key);
                return true;
            }
            return false;
        } catch (error) {
            console.warn('AsyncStorage.removeItem error:', error);
            return false;
        }
    },

    clear: async () => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.clear();
                return true;
            }
            return false;
        } catch (error) {
            console.warn('AsyncStorage.clear error:', error);
            return false;
        }
    },

    getAllKeys: async () => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                return Object.keys(window.localStorage);
            }
            return [];
        } catch (error) {
            console.warn('AsyncStorage.getAllKeys error:', error);
            return [];
        }
    },

    multiGet: async (keys) => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                return keys.map(key => [key, window.localStorage.getItem(key)]);
            }
            return keys.map(key => [key, null]);
        } catch (error) {
            console.warn('AsyncStorage.multiGet error:', error);
            return keys.map(key => [key, null]);
        }
    },

    multiSet: async (keyValuePairs) => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                keyValuePairs.forEach(([key, value]) => {
                    window.localStorage.setItem(key, value);
                });
                return true;
            }
            return false;
        } catch (error) {
            console.warn('AsyncStorage.multiSet error:', error);
            return false;
        }
    },

    multiRemove: async (keys) => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                keys.forEach(key => {
                    window.localStorage.removeItem(key);
                });
                return true;
            }
            return false;
        } catch (error) {
            console.warn('AsyncStorage.multiRemove error:', error);
            return false;
        }
    }
};

export default AsyncStorage;
