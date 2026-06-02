app.get('/api/debug-env', (req, res) => res.json({ key: process.env.GEMINI_API_KEY ? "EXISTS_" + process.env.GEMINI_API_KEY.length : "MISSING" }))
