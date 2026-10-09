const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const PROFILES_FILE = path.join(__dirname, 'profiles.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- JSON STORAGE ----------
function loadProfiles() {
    try {
        if (!fs.existsSync(PROFILES_FILE)) {
            fs.writeFileSync(PROFILES_FILE, JSON.stringify({ profiles: {} }, null, 2));
        }
        const raw = fs.readFileSync(PROFILES_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (!data.profiles) data.profiles = {};
        return data;
    } catch (err) {
        console.error('[JSON] Load failed:', err.message);
        return { profiles: {} };
    }
}

function saveProfiles(data) {
    try {
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[JSON] Save failed:', err.message);
    }
}

// ---------- ROBLOX API ----------
async function fetchRobloxUser(username) {
    const url = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Roblox user search failed (${res.status})`);
    const data = await res.json();
    if (!data.data || data.data.length === 0) throw new Error('User not found');
    const exact = data.data.find(u => u.name.toLowerCase() === username.toLowerCase());
    return exact || data.data[0];
}

async function fetchRobloxAvatar(userId) {
    const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Avatar fetch failed (${res.status})`);
    const data = await res.json();
    return data.data?.[0]?.imageUrl || '';
}

async function fetchRobloxProfile(userId) {
    const url = `https://users.roblox.com/v1/users/${userId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Profile fetch failed (${res.status})`);
    return res.json();
}

// ---------- ROUTES ----------
app.get('/api/profiles', (req, res) => {
    const data = loadProfiles();
    res.json(data.profiles);
});

app.get('/api/profiles/:username', (req, res) => {
    const { username } = req.params;
    const data = loadProfiles();
    const profile = data.profiles[username.toLowerCase()];
    if (!profile) return res.status(404).json({ error: 'Profile not cached' });
    res.json(profile);
});

app.post('/api/lookup', async (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || !username.trim()) {
        return res.status(400).json({ error: 'Username required' });
    }
    const key = username.trim().toLowerCase();
    const data = loadProfiles();

    try {
        const user = await fetchRobloxUser(username.trim());
        const [avatarUrl, profile] = await Promise.all([
            fetchRobloxAvatar(user.id),
            fetchRobloxProfile(user.id)
        ]);

        const existing = data.profiles[key] || {};
        const cached = {
            username: profile.name,
            userId: profile.id,
            displayName: profile.displayName || profile.name,
            avatarUrl,
            description: profile.description || '',
            created: profile.created || '',
            fetchedAt: new Date().toISOString(),
            ransomDebt: existing.ransomDebt ?? 1000,
            weeksOverdue: existing.weeksOverdue ?? 0,
            kills: existing.kills ?? Math.floor(Math.random() * 200),
            status: existing.status ?? 'Newly Flagged'
        };

        data.profiles[key] = cached;
        saveProfiles(data);

        console.log(`[LOOKUP] ${cached.username} (${cached.userId}) saved`);
        res.json(cached);
    } catch (err) {
        console.error('[LOOKUP] Error:', err.message);
        if (data.profiles[key]) {
            return res.json({ ...data.profiles[key], _fromCache: true });
        }
        res.status(404).json({ error: err.message });
    }
});

app.patch('/api/profiles/:username', (req, res) => {
    const { username } = req.params;
    const key = username.toLowerCase();
    const data = loadProfiles();
    if (!data.profiles[key]) return res.status(404).json({ error: 'Profile not found' });
    const allowed = ['ransomDebt', 'weeksOverdue', 'kills', 'status'];
    allowed.forEach(field => {
        if (req.body[field] !== undefined) data.profiles[key][field] = req.body[field];
    });
    saveProfiles(data);
    res.json(data.profiles[key]);
});

app.delete('/api/profiles/:username', (req, res) => {
    const { username } = req.params;
    const key = username.toLowerCase();
    const data = loadProfiles();
    if (!data.profiles[key]) return res.status(404).json({ error: 'Profile not found' });
    delete data.profiles[key];
    saveProfiles(data);
    res.json({ success: true });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n  ╔═══════════════════════════════════════╗`);
    console.log(`  ║  VCN COMMAND SERVER ONLINE            ║`);
    console.log(`  ║  http://localhost:${PORT}                ║`);
    console.log(`  ╚═══════════════════════════════════════╝\n`);
    loadProfiles();
});
