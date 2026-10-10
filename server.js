const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────
// CORS — allow any website to call this API
// ─────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

// ─────────────────────────────────────────────────────────────
// HOME — simple info page
// ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        service: 'VCN Roblox Avatar Fetcher',
        status: 'online',
        endpoints: {
            lookup: '/lookup?username=Roblox',
            health: '/health',
            user: '/user/:id'
        }
    });
});

// ─────────────────────────────────────────────────────────────
// HEALTH — quick alive check
// ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        time: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ─────────────────────────────────────────────────────────────
// LOOKUP — search a Roblox user by username
// GET /lookup?username=Roblox
// ─────────────────────────────────────────────────────────────
app.get('/lookup', async (req, res) => {
    const username = (req.query.username || '').trim();
    if (!username) {
        return res.status(400).json({ error: 'username query parameter required' });
    }

    try {
        console.log(`[lookup] Searching for: ${username}`);

        // 1. Search Roblox for the user
        const searchRes = await fetch(
            `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`
        );
        if (!searchRes.ok) {
            console.error(`[lookup] Roblox search failed: ${searchRes.status}`);
            return res.status(502).json({ error: `Roblox search failed (${searchRes.status})` });
        }
        const searchData = await searchRes.json();

        if (!searchData.data || searchData.data.length === 0) {
            return res.status(404).json({ error: 'User not found on Roblox' });
        }

        // Prefer exact case-insensitive match
        const exact = searchData.data.find(
            u => u.name.toLowerCase() === username.toLowerCase()
        );
        const user = exact || searchData.data[0];
        console.log(`[lookup] Found: ${user.name} (ID ${user.id})`);

        // 2. Fetch avatar headshot from OFFICIAL Roblox thumbnail API
        const thumbUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`;
        const thumbRes = await fetch(thumbUrl);
        let avatarUrl = '';
        if (thumbRes.ok) {
            const thumbData = await thumbRes.json();
            avatarUrl = thumbData?.data?.[0]?.imageUrl || '';
        } else {
            console.warn(`[lookup] Thumbnail fetch failed: ${thumbRes.status}`);
        }

        // 3. Fetch full profile
        const profileRes = await fetch(`https://users.roblox.com/v1/users/${user.id}`);
        const profileData = profileRes.ok ? await profileRes.json() : null;

        // 4. Return combined data
        const result = {
            username: user.name,
            userId: user.id,
            displayName: (profileData && profileData.displayName) || user.displayName || user.name,
            avatarUrl: avatarUrl,
            description: (profileData && profileData.description) || '',
            created: (profileData && profileData.created) || ''
        };

        console.log(`[lookup] Returning: ${result.username} (avatar: ${avatarUrl ? 'yes' : 'no'})`);
        res.json(result);
    } catch (err) {
        console.error('[lookup] ERROR:', err);
        res.status(500).json({ error: 'Lookup failed', detail: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// USER — get user info by ID
// GET /user/1
// ─────────────────────────────────────────────────────────────
app.get('/user/:id', async (req, res) => {
    const userId = req.params.id;
    if (!userId || isNaN(parseInt(userId))) {
        return res.status(400).json({ error: 'Valid user ID required' });
    }

    try {
        console.log(`[user] Fetching ID: ${userId}`);

        // Fetch avatar + profile in parallel
        const [thumbRes, profileRes] = await Promise.all([
            fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`),
            fetch(`https://users.roblox.com/v1/users/${userId}`)
        ]);

        if (!profileRes.ok) {
            return res.status(404).json({ error: 'User not found' });
        }

        const thumbData = thumbRes.ok ? await thumbRes.json() : null;
        const profileData = await profileRes.json();

        res.json({
            username: profileData.name,
            userId: profileData.id,
            displayName: profileData.displayName || profileData.name,
            avatarUrl: thumbData?.data?.[0]?.imageUrl || '',
            description: profileData.description || '',
            created: profileData.created || ''
        });
    } catch (err) {
        console.error('[user] ERROR:', err);
        res.status(500).json({ error: 'Fetch failed', detail: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('');
    console.log('=================================');
    console.log('  VCN AVATAR FETCHER ONLINE');
    console.log('  http://localhost:' + PORT);
    console.log('  Test: http://localhost:' + PORT + '/lookup?username=Roblox');
    console.log('=================================');
    console.log('');
});
