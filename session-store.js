'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_DIR = path.join(process.cwd(), 'data', 'sessions');

function ensureStore() {
    fs.mkdirSync(STORE_DIR, { recursive: true });
}

function generateSessionId(length = 10) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let id = '';
    while (id.length < length) {
        const bytes = crypto.randomBytes(length);
        for (const b of bytes) {
            id += alphabet[b % alphabet.length];
            if (id.length === length) break;
        }
    }
    return id;
}

function sessionDir(id) {
    if (!/^[A-Za-z0-9]{6,32}$/.test(id)) {
        throw new Error('Invalid session ID');
    }
    return path.join(STORE_DIR, id);
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(from, to);
        else if (entry.isFile()) fs.copyFileSync(from, to);
    }
}

function saveAuthState(sourceDir) {
    ensureStore();

    let id;
    do {
        id = generateSessionId(10);
    } while (fs.existsSync(sessionDir(id)));

    const dest = sessionDir(id);
    copyDir(sourceDir, dest);

    // Make stored auth files private where the platform supports it.
    try { fs.chmodSync(dest, 0o700); } catch (_) {}
    return id;
}

function readAuthState(id) {
    const dir = sessionDir(id);
    if (!fs.existsSync(dir)) return null;

    const files = {};

    function walk(current, relative = '') {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            const rel = path.join(relative, entry.name).replace(/\\/g, '/');
            if (entry.isDirectory()) walk(full, rel);
            else if (entry.isFile()) {
                files[rel] = fs.readFileSync(full, 'utf8');
            }
        }
    }

    walk(dir);
    return { id, files };
}

function deleteSession(id) {
    const dir = sessionDir(id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = {
    STORE_DIR,
    ensureStore,
    generateSessionId,
    saveAuthState,
    readAuthState,
    deleteSession
};
