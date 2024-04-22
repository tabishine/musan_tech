//Необходимые библиотеки
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const redis = require('redis');
const redisStore = require('connect-redis').default;
const app = express();
const port = 3000;

//Подключение к MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/test').then(() => console.log('Connected to MongoDB!'));
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

//Подключение к Redis
const redisClient = redis.createClient({
    host: 'localhost',
    port: 6379,
});

redisClient.connect().catch(console.error)

// Схема юзера в БД
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    }
});

const User = mongoose.model('User', userSchema);

// Определение схемы заметок в БД
const noteSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    data: {
        type: String,
        required: true
    }
});
const Note = mongoose.model('Note', noteSchema, 'notes');

app.use(express.json());

app.use(
    session({
        secret: 'secret_key',
        resave: false,
        saveUninitialized: false,
        store: new redisStore({ client: redisClient }), 
        cookie: { secure: false } // Store sessions in Redis
    })
);

const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        next(); 
    } else {
        return res.status(401).json({ error: true, message: 'Unauthorized', statusCode: 401, data: null });
    }
};

// Middleware для обработки ошибок
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: true, message: 'Internal Server Error', statusCode: 500, data: null });
});

// Применяем middleware для аутентификации ко всем маршрутам, кроме GET /auth
app.use((req, res, next) => {
    if (req.path !== '/auth' && req.method !== 'GET') {
        requireAuth(req, res, next); 
    } else {
        next(); 
    }
});

const noteLimitPerMinute = 3;
const noteTracker = {}; 

//Лимит на создание заметок (3 заметки в минуту на пользователя)
const checkNoteLimit = (req, res, next) => {
    const userId = req.session.userId;

    if (!noteTracker[userId]) {
        noteTracker[userId] = { count: 1, timestamp: Date.now() };
    } else {
        const currentTime = Date.now();
        const userNoteInfo = noteTracker[userId];

        if (currentTime - userNoteInfo.timestamp >= 60000) {
            noteTracker[userId] = { count: 1, timestamp: currentTime };
        } else {
            if (userNoteInfo.count >= noteLimitPerMinute) {
                return res.status(429).json({ error: true, message: 'Note creation limit exceeded. Please try again later.' });
            } else {
                userNoteInfo.count++;
            }
        }
    }

    next();
};

// POST /auth - Авторизация пользователя (сессиии)
app.post('/auth', requireAuth,async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (!existingUser) {
            const newUser = new User({ username, password });
            await newUser.save();
            req.session.regenerate(() => {
                req.session.userId = newUser._id;
                return res.status(201).json({error: false, message: 'User registered and authenticated successfully', statusCode: 200, data: newUser });
            });
        } else {
            const isPasswordValid = await bcrypt.compare(password, existingUser.password);
            if (!isPasswordValid) {
                return res.status(401).json({ error: true, message: 'Invalid username or password', statusCode: 401, data: null});
            }
            req.session.regenerate(() => {
                req.session.userId = existingUser._id;
                return res.status(200).json({ error: false, message: 'Authentication successful', statusCode: 200, data: existingUser });
            });
        }
    } catch (error) {
        console.error('Error authenticating/registering user:', error);
        return res.status(500).json({ error: true, message: 'Internal Server Error',  statusCode: 401, data: null});
    }
});

app.get('/auth', async (req, res) => {
    const sessionId = req.sessionID;
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username, password });
        if (existingUser) {
            
            return res.status(200).json({error: false, message: 'This user is exist',statusCode: '200', data: {userId: existingUser._id, sessionId}});
            
        } else {
            return res.status(401).json({ error: true, message: 'Unauthorized', statusCode: 401, data:null});
        }
    } catch (error) {
        console.error('Error finding user:', error);
        return res.status(500).json({ error: true, message: 'Internal Server Error',statusCode: 401, data: null});
    }
}); 

// POST /notes - Создает заметку
app.post('/notes', requireAuth, checkNoteLimit,  async (req, res) => {
    const {  sessionId,userId, data } = req.body; 
        if (req.session.userId === userId && req.sessionID === sessionId) {
            const newNote = new Note({ userId: userId, data });
            await newNote.save(); // Сохраняем заметку в базу данных
            return res.status(201).json({ error: false, message: 'Note created successfully', statusCode: 200, data: newNote });
        } else {
            return res.status(401).json({ error: true, message: 'Unauthorized', statusCode: 401, data: null}); // Не соответствует сессионному идентификатору или userId
        }
   
});

// GET /notes - Возвращает заметки пользователя
app.get('/notes', requireAuth, async (req, res) => {
    const userId = req.session.userId;

    try {
        if (req.sessionID === sessionId && req.session.userId === userId) {
            const userNotes = await Note.find({ userId: userId });
            return res.status(200).json({ error: false, message: 'User notes retrieved successfully', statusCode: 200, data: userNotes });
        } else {
            return res.status(401).json({ error: true, message: 'Unauthorized', statusCode: 401, data: null });
        }
    } catch (error) {
        console.error('Error fetching user notes:', error);
        return res.status(500).json({ error: true, message: 'Internal Server Error', statusCode: 500, data: null });
    }
});



// PUT /notes/id/:id - Изменение заметки
app.put('/notes/id/:id', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const id = req.params._id;
    const { data } = req.body;

    try {
        const note = await Note.findOneAndUpdate({ id: id, userId: userId }, { data: data }, { new: true });
        if (!note) {
            return res.status(404).json({ error: true, message: 'Note not found or does not belong to the user',statusCode: '401', data: 'NULL' });
        }
        return res.status(200).json({ error: false, message: 'Note updated successfully', statusCode: 200, data: note });
    } catch (error) {
        console.error('Error updating note:', error);
        return res.status(500).json({ error: true, message: 'Internal Server Error' });
    }
});

//DELETE /notes/id/:id - Удаление заметки
app.delete('/notes/id/:id', requireAuth, async(req, res) => {
    const userId = req.session.userId;
    const id = req.params._id;
    const { data } = req.body;
    try{
    const note = await Note.findOneAndDelete({ id: id, userId: userId }, { data: data }, { new: false });
    if (!note) {
        return res.status(404).json({ error: true, message: 'Note not found or does not belong to the user',statusCode: '401', data: 'NULL'});
    }
    return res.status(200).json({ error: false, message: 'Note deleted successfully', statusCode: 200, data: note });
}
    catch(error) {
        console.error('Error updating note:', error);
        return res.status(500).json({ error: true, message: 'Internal Server Error', statusCode: 401, data:null});
    }
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
