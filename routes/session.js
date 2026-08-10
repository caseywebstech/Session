'use strict';

const express = require('express');
const router = express.Router();
const { readAuthState, deleteSession } = require('../session-store');

// GET /session/:id
// Returns the complete multi-file Baileys auth state for a short session ID.
router.get('/:id', (req, res) => {
    try {
        const result = readAuthState(req.params.id);
        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Session not found or expired.'
            });
        }

        res.json({
            success: true,
            sessionId: result.id,
            files: result.files
        });
    } catch (err) {
        console.error('[SESSION] Read error:', err.message);
        res.status(400).json({
            success: false,
            error: 'Invalid session ID.'
        });
    }
});

// DELETE /session/:id
router.delete('/:id', (req, res) => {
    try {
        deleteSession(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({
            success: false,
            error: 'Invalid session ID.'
        });
    }
});

module.exports = router;
