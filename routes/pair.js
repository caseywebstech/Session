const { 
    giftedId,
    removeFile,
    generateRandomCode
} = require('../gift');
const zlib = require('zlib');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const {
    default: giftedConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const { sendInteractiveMessage } = require('gifted-btns');

const getSessionDir = () => {
    const dir = path.join(os.tmpdir(), 'BLOODRAVEN-XMD-sessions', 'pair');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
};

router.get('/', async (req, res) => {
    const id = giftedId();
    const sessionDir = getSessionDir();
    const sessionPath = path.join(sessionDir, id);
    let num = req.query.number;
    let responseSent = false;
    let sessionCleanedUp = false;
    let sessionAlreadySent = false;
    let connectionInstance = null;

    if (!num) {
        return res.status(400).json({ code: 'Missing number parameter.' });
    }

    const timeout = setTimeout(async () => {
        if (!responseSent) {
            res.status(503).json({ code: 'Session timed out. Please try again.' });
            responseSent = true;
        }
        try { if (connectionInstance?.ws) await connectionInstance.ws.close(); } catch (_) {}
        await cleanUp();
    }, 120000);

    async function cleanUp() {
        clearTimeout(timeout);
        if (!sessionCleanedUp) {
            sessionCleanedUp = true;
            try { await removeFile(sessionPath); } catch (_) {}
        }
    }

    async function start() {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        try {
            const sock = giftedConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
                },
                printQRInTerminal: false,
                logger: pino({ level: 'fatal' }),
                browser: Browsers.macOS('Safari'),
                syncFullHistory: false,
                generateHighQualityLinkPreview: false,
                getMessage: async () => undefined,
                markOnlineOnConnect: false,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                retryRequestDelayMs: 2000
            });
            connectionInstance = sock;

            if (!sock.authState.creds.registered) {
                await delay(1500);
                const cleanNum = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(cleanNum, generateRandomCode());
                if (!responseSent && !res.headersSent) {
                    res.json({ code });
                    responseSent = true;
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    if (sessionAlreadySent) return;
                    sessionAlreadySent = true;

                    try { await sock.groupAcceptInvite('KPZqnYAODRdJUtME3fEqsS'); } catch (_) {}
                    await delay(3000);
                    try { await saveCreds(); } catch (_) {}

                    const credsJson = JSON.stringify(state.creds);
                    if (!credsJson || credsJson.length < 50) {
                        await cleanUp();
                        return;
                    }

                    try {
                        const compressed = zlib.gzipSync(Buffer.from(credsJson)).toString('base64');
                        const uid = sock.user?.id;
                        if (uid) {
                            // Send ONE interactive message with buttons
                            await sendInteractiveMessage(sock, uid, {
                                title: '✅ PAIRING SUCCESSFUL',
                                text: `🩸 *BLOODRAVEN-XMD CONNECTED* 🩸\n\n` +
                                      `✅ *Connected successfully!*\n` +
                                      `🤖 Bot is now online and ready.\n\n` +
                                      `👤 *Account:* ${sock.user?.id || 'WhatsApp account'}\n` +
                                      `🔧 *Prefix:* .\n` +
                                      `📅 *Time:* ${new Date().toLocaleString()}\n\n` +
                                      `⚠️ *SECURITY WARNING* ⚠️\n` +
                                      `🔒 *DO NOT SHARE THIS SESSION ID WITH ANYONE!*\n\n` +
                                      `Only share it with your trusted bot deployer.\n\n` +
                                      `📋 *Your Session ID:* \`${compressed}\``,
                                footer: '🩸 BLOODRAVEN-XMD ⚔️',
                                interactiveButtons: [
                                    {
                                        name: 'cta_copy',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: '📋 Copy Session ID',
                                            copy_code: compressed
                                        })
                                    },
                                    {
                                        name: 'cta_url',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: '📢 Join Channel',
                                            url: 'https://whatsapp.com/channel/0029VaAkETLLY6d8qhLmZt2v'
                                        })
                                    }
                                ]
                            });

                            await delay(1500);
                        }
                    } catch (e) {
                        console.error('[PAIR] Send error:', e.message);
                    } finally {
                        await delay(2000);
                        try { await sock.ws.close(); } catch (_) {}
                        await cleanUp();
                    }

                } else if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    if (code !== DisconnectReason.loggedOut && code !== 401 && !sessionAlreadySent) {
                        await delay(3000);
                        start();
                    } else {
                        await cleanUp();
                    }
                }
            });

        } catch (err) {
            console.error('[PAIR] Fatal:', err.message);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: 'Service Unavailable. Please try again.' });
                responseSent = true;
            }
            await cleanUp();
        }
    }

    try { await start(); } catch (e) {
        console.error('[PAIR] Top-level error:', e.message);
        await cleanUp();
        if (!responseSent && !res.headersSent) res.status(500).json({ code: 'Service Error' });
    }
});

module.exports = router;
