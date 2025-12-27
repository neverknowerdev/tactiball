'use client';

type Value = string | null;

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

async function getItem(key: string): Promise<Value> {
    if (!isBrowser) return null;
    return localStorage.getItem(key);
}

async function setItem(key: string, value: string): Promise<void> {
    if (!isBrowser) return;
    localStorage.setItem(key, value);
}

async function removeItem(key: string): Promise<void> {
    if (!isBrowser) return;
    localStorage.removeItem(key);
}

async function clear(): Promise<void> {
    if (!isBrowser) return;
    localStorage.clear();
}

export default {
    getItem,
    setItem,
    removeItem,
    clear
};

