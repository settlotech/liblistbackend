const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security Headers
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS: explicitly allow configured frontend origins.
const allowedOrigins = (process.env.CORS_ORIGINS || [
    process.env.CLIENT_URL,
    process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : null,
    process.env.NODE_ENV !== 'production' ? 'http://127.0.0.1:5173' : null,
].filter(Boolean).join(','))
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (
            allowedOrigins.includes(origin) ||
            origin.endsWith('.vercel.app') ||
            origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:')
        ) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

// Body Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({
    extended: true,
    limit: '50mb'
}));

// Compression
app.use(compression());

// Cookie Parser
app.use(cookieParser());

const pool = require('./config/db');
const initializeDatabase = require('./database/initDatabase');

// Route Modules
const authRoutes = require('./routes/authRoutes');
const roleRoutes = require('./routes/role.route');
const userRoutes = require('./routes/user.route');
const settingRoutes = require('./routes/setting.route');
const signupRoutes = require('./routes/userrequest.route');
const notificationRoutes = require('./routes/notification.route');
const dashboardRoutes = require('./routes/dashboard.route');
const libraryRoutes = require('./routes/library.routes');
const documentRoutes = require('./routes/document.routes');
const templateRoutes = require('./routes/template.routes');
const taskRoutes = require('./routes/task.routes');
const policyChatRoutes = require('./routes/policyChat.routes');
const privateChatRoutes = require('./routes/privateChat.routes');

const API = process.env.API_VERSION || 'v1';

app.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Welcome to LibList Banking API Server',
        environment: process.env.NODE_ENV, 
    });
});

let dbInitPromise = null;
const ensureDatabaseReady = () => {
    if (!dbInitPromise) {
        dbInitPromise = initializeDatabase().catch((err) => {
            console.error('Lazy DB initialization warning:', err.message);
            dbInitPromise = null;
        });
    }
    return dbInitPromise;
};

// Ensure DB schema exists on first API call in serverless cold starts without blocking root healthcheck
app.use(`/api`, async (req, res, next) => {
    if (process.env.VERCEL) {
        await ensureDatabaseReady();
    }
    next();
});

// Mount Routes with /api/v1 and /api for full compatibility
const mountRoute = (path, router) => {
    app.use(`/api/${API}${path}`, router);
    app.use(`/api${path}`, router);
};

mountRoute('/auth', authRoutes);
mountRoute('/roles', roleRoutes);
mountRoute('/users', userRoutes);
mountRoute('/settings', settingRoutes);
mountRoute('/signup', signupRoutes);
mountRoute('/notifications', notificationRoutes);
mountRoute('/dashboard', dashboardRoutes);
mountRoute('/tasks', taskRoutes);
mountRoute('/policies', policyChatRoutes);
mountRoute('/chats', privateChatRoutes);
// Document Management — single canonical prefix under /document-management/*
mountRoute('/document-management/libraries', libraryRoutes);
mountRoute('/document-management/documents', documentRoutes);
mountRoute('/document-management/templates', templateRoutes);

// Error Handling
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

app.use(notFound);
app.use(errorHandler);

const startServer = async () => {
    try {
        const client = await pool.connect();
        console.log('PostgreSQL connected successfully!');
        client.release();

        await initializeDatabase();

        app.listen(PORT, () => {
            console.log(`API running on http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('Application startup failed:', error.message);
        process.exit(1);
    }
};

// Export Express app for Vercel Serverless Function deployment
module.exports = app;

if (!process.env.VERCEL && require.main === module) {
    startServer();
}
