require('dotenv').config();
const PORT = process.env.PORT || 3000;
const VOICEVOX_HOST = process.env.VOICEVOX_HOST;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const OPENAI_API_KEY_DRAW = process.env.OPENAI_API_KEY_DRAW;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const apiKey = GOOGLE_API_KEY;
const cx = GOOGLE_CSE_ID;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VISION_API_KEY = process.env.VISION_API_KEY;
const TRANSLATE_API_KEY = process.env.TRANSLATE_API_KEY;

const express = require('express');
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;
const helmet = require('helmet');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const app = express();

// ファイルパス設定
const DICTIONARY_PATH = path.join(__dirname, 'public', 'siritoriDictionary.txt');

const qs = require('querystring'); // ← 追加！

// CORS対応の強化版（OPTIONSにも対応）
const corsOptions = {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // 全てのOPTIONSリクエストに対応（重要）

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.options('*', (req, res) => {
    res.sendStatus(204);
});

// audio_query にリクエストを中継
app.post('/audio_query', async (req, res) => {
    try {
        const speaker = req.body.speaker || req.query.speaker;
        const text = req.body.text || req.query.text;

        if (!text || !speaker) {
            return res.status(400).json({ error: 'text and speaker are required' });
        }

        const response = await axios.post(
            `${VOICEVOX_HOST}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
            {},
            { headers: { 'Content-Type': 'application/json' } }
        );

        res.set('Access-Control-Allow-Origin', '*'); // ← これ忘れがち！
        res.json(response.data);
    } catch (error) {
        console.error('Error in audio_query:', error);
        res.status(500).json({ error: 'Server error occurred during audio_query' });
    }
});

app.get('/audio_query', async (req, res) => {
    try {
        const speaker = req.query.speaker;
        const text = req.query.text;

        if (!text || !speaker) {
            return res.status(400).json({ error: 'text and speaker are required' });
        }

        const response = await axios.post(
            `https://voicevox-vvoq.onrender.com/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
            {}, // POSTなのにボディなし！VoiceVox仕様
            { headers: { 'Content-Type': 'application/json' } }
        );

        res.set('Access-Control-Allow-Origin', '*'); // 明示的にCORS
        res.json(response.data);
    } catch (error) {
        console.error('Error in GET /audio_query:', error);
        res.status(500).json({ error: 'Server error occurred during GET audio_query' });
    }
});

// synthesis エンドポイントにリクエストを中継
app.post('/synthesis', async (req, res) => {
    try {
        const speaker = req.body.speaker || req.query.speaker;

        if (!speaker || !req.body) {
            return res.status(400).json({ error: 'speaker and audioQuery are required' });
        }

        const synthesisResponse = await axios.post(
            `https://voicevox-vvoq.onrender.com/synthesis?speaker=${speaker}`,
            req.body,
            {
                headers: { 'Content-Type': 'application/json' },
                responseType: 'arraybuffer'
            }
        );

        // ここで明示的に CORS ヘッダーを設定
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', 'audio/wav');
        res.send(synthesisResponse.data);
    } catch (error) {
        console.error('Error in synthesis:', error);
        fs.appendFileSync('server_error.log', error.stack + "\n");
        res.status(500).json({ error: 'Server error occurred during synthesis' });
    }
});
// 公開していい設定
app.get('/config', (req, res) => {
    res.json({
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY
    });
});

// OpenAIリレー
app.post('/api/chat', async (req, res) => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(req.body)
    });
    res.json(await response.json());
});

// Vision APIリレー
app.post('/api/vision', async (req, res) => {
    try {
        const image = req.body.image;
        if (!image) {
            return res.status(400).json({ error: '画像がないよ！' });
        }

        const apiKey = process.env.VISION_API_KEY;

        const visionRes = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [
                    {
                        image: { content: image },
                        features: [{ type: 'LABEL_DETECTION' }]
                    }
                ]
            })
        });

        const data = await visionRes.json();
        const labels = data.responses?.[0]?.labelAnnotations?.map(label => label.description) || [];
        res.json({ labels });
    } catch (err) {
        console.error('Vision APIエラー:', err);
        res.status(500).json({ error: 'Vision APIにアクセスできなかったよ…' });
    }
});

// 翻訳リレー
app.post('/api/translate', async (req, res) => {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${process.env.TRANSLATE_API_KEY}`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
    });
    res.json(await response.json());
});

// ----- ミドルウェア -----
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'", "blob:", "data:", "https:", "http:"],
            mediaSrc: ["'self'", "blob:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        },
    })
);
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self' https://www.gstatic.com; style-src 'self' https://www.gstatic.com;");
    next();
});

// ウェブ検索
app.get("/search", async (req, res) => {
    const query = req.query.q;
    
    try {
        const response = await axios.get("https://www.googleapis.com/customsearch/v1", {
            params: {
                key: apiKey,
                cx: cx,
                q: query,
                num: 3
            }
        });

        const items = response.data.items || [];
        const results = items.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));

        res.json({ results });
    } catch (err) {
        console.error("検索エラー:", err.response?.data || err.message || err);
        res.status(500).json({ error: "検索に失敗しました", detail: err.response?.data || err.message });
    }
});

// ----- Push通知 -----
webpush.setVapidDetails(
    'mailto:example@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// 公開鍵をクライアントに返す
app.get('/vapidPublicKey', (req, res) => {
    res.send(VAPID_PUBLIC_KEY);
});

// ----- リマインダー機能 -----
const remindersFile = 'reminders.json';
let reminders = [];
if (fs.existsSync(remindersFile)) {
    reminders = JSON.parse(fs.readFileSync(remindersFile, 'utf-8'));
}

function saveRemindersToFile() {
    fs.writeFileSync(remindersFile, JSON.stringify(reminders, null, 2));
}

// 新規追加
app.post('/reminders', (req, res) => {
    const { subscription, time, message } = req.body;
    const id = Date.now().toString();
    const reminder = { id, subscription, time, message, notified: false };

    reminders.push(reminder);
    saveRemindersToFile();

    res.status(201).json({ id });
});

// 一覧取得
app.get('/reminders', (req, res) => {
    const simplified = reminders.map(({ id, time, message }) => ({ id, time, message }));
    res.json(simplified);
});

// 削除
app.delete('/reminders/:id', (req, res) => {
    const { id } = req.params;
    console.log(`削除リクエスト: ID = ${id}`);

    reminders = reminders.filter(r => r.id !== id);

    // 削除後の状態をログに出力
    console.log('現在のリマインダーリスト:', reminders);

    saveRemindersToFile();
    res.status(200).send('削除したよ！');
});

// 定期チェック
setInterval(async () => {
    const now = Date.now();
    const remaining = [];

    console.log('定期チェック開始');
    console.log('現在のリマインダー:', reminders); // ← ここをファイルではなく、メモリ上の変数に変更

    for (const r of reminders) {
        const reminderTime = new Date(r.time).getTime();
        const diff = reminderTime - now;

        if (diff <= 0 && !r.notified) {
            console.log(`通知送信: ${r.message} (ID: ${r.id})`);
            try {
                await webpush.sendNotification(r.subscription, JSON.stringify({
                    title: '🔔 リマインダーだよ！',
                    body: r.message
                }));
                r.notified = true;
            } catch (err) {
                console.error(`エラーが発生しました: ${err}`);
                if (err.statusCode === 410) {
                    console.log(`サブスクリプションが無効: ${r.subscription.endpoint}`);
                    continue;
                }
            }
        }

        if (!r.notified && reminderTime > now) {
            remaining.push(r);
        } else {
            console.log(`削除対象: ${r.message} (ID: ${r.id})`);
        }
    }

    reminders = remaining;
    saveRemindersToFile(); // ← メモリ上の reminders を保存
    console.log('残ったリマインダー:', reminders);
}, 10000);

// ----- Googleカレンダー連携 -----
// Google OAuth クライアントを作成する関数
function createOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}

// .env から読み込んだトークンで認証する関数
function authorize() {
    const oAuth2Client = createOAuth2Client();

    oAuth2Client.setCredentials({
        access_token: process.env.ACCESS_TOKEN,
        refresh_token: process.env.REFRESH_TOKEN,
        scope: process.env.SCOPE,
        token_type: process.env.TOKEN_TYPE,
        expiry_date: Number(process.env.EXPIRY_DATE)
    });

    return oAuth2Client;
}

function getFormattedEvents(auth, date, callback) {
    const calendar = google.calendar({ version: 'v3', auth });
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(startOfDay.getDate() + 1);

    calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    }, (err, res) => {
        if (err) {
            callback(`エラーが発生したよ〜: ${err}`);
            return;
        }
        const events = res.data.items;
        if (events.length === 0) {
            callback('予定はないよ〜！ゆっくりしてね🍵');
        } else {
            const formatted = events.map((event) => {
                const start = new Date(event.start.dateTime || event.start.date);
                const end = new Date(event.end.dateTime || event.end.date);
                const startStr = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
                const endStr = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
                return `🕒 ${startStr}〜${endStr} ${event.summary}`;
            }).join('\n');
            callback(formatted);
        }
    });
}

// 今日の予定
app.get('/today-events', (req, res) => {
    try {
        const auth = authorize();
        const today = new Date();
        getFormattedEvents(auth, today, (result) => {
            res.send(result);
        });
    } catch (err) {
        res.send('🔒 Googleカレンダーにまだ認証されてないかも！/auth で認証してみてね！');
    }
});

// 明日の予定
app.get('/tomorrow-events', (req, res) => {
    try {
        const auth = authorize();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        getFormattedEvents(auth, tomorrow, (result) => {
            res.send(result);
        });
    } catch (err) {
        res.send('🔒 Googleカレンダーにまだ認証されてないかも！/auth で認証してみてね！');
    }
});

const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
);

oauth2Client.redirectUri = "https://raichan-chat.jp.ngrok.io/oauth2callback";

app.get('/oauth2callback', async (req, res) => {
    console.log('🌀 /oauth2callback にアクセスが来たよ！');
    const code = req.query.code;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // ここで token.json に保存！
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('✅ トークンを保存しました: token.json');

        res.send('認証が成功しました！このウィンドウは閉じてOKです。');
    } catch (error) {
        console.error('認証エラー:', error);
        res.send('認証に失敗しました');
    }
});

// 認証ルート
app.get('/auth', (req, res) => {
    const client_id = process.env.GOOGLE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_CLIENT_SECRET;
    const redirect_uri = process.env.GOOGLE_REDIRECT_URI;

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar.readonly'],
        redirect_uri: "https://raichan-chat.jp.ngrok.io/oauth2callback" // 必要に応じて明示
    });

    res.redirect(authUrl);
});

// お絵描き機能
app.post('/draw', async (req, res) => {
    const prompt = req.body.prompt;

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/images/generations',
            {
                model: 'dall-e-3',  // ← これ追加して！
                prompt,
                n: 1,
                size: '1024x1024'  // dall-e-3 は 512x512 非対応の場合あり
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY_DRAW}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const imageUrl = response.data.data[0].url;
        res.json({ imageUrl });
    } catch (error) {
        console.error('画像生成エラー:', error.response?.data || error.message);
        res.status(500).json({ error: '画像の生成に失敗したよ…' });
    }
});

// しりとり辞書更新
app.use(express.json());

// 辞書ファイルに単語を追加（重複チェック＆ソート付き）
app.post('/add-word', (req, res) => {
    const { word } = req.body;

    if (!word || typeof word !== 'string') {
        return res.status(400).json({ error: 'Invalid word' });
    }

    fs.readFile(DICTIONARY_PATH, 'utf-8', (err, data) => {
        if (err) {
            console.error('📛 読み込みエラー:', err);
            return res.status(500).json({ error: 'Failed to read dictionary' });
        }

        const words = data.split('\n').map(w => w.trim()).filter(w => w);
        if (words.includes(word)) {
            return res.json({ message: 'Already exists, not added.' });
        }

        words.push(word);

        // 🔽 ソート（アルファベット順 or あいうえお順）※必要なら変更してね
        words.sort((a, b) => a.localeCompare(b, 'ja'));  // 'ja' = 日本語の並び

        fs.writeFile(DICTIONARY_PATH, words.join('\n') + '\n', (err) => {
            if (err) {
                console.error('📛 書き込みエラー:', err);
                return res.status(500).json({ error: 'Failed to save word' });
            }

            console.log(`✅ 「${word}」を辞書に追加（重複チェック＆ソート済）`);
            res.json({ success: true });
        });
    });
});

// 起動
app.listen(PORT, () => {
    console.log(`🚀 サーバー起動中！ http://localhost:${PORT}`);
});
