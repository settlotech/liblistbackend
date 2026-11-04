require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require("morgan");
const pool = require('./config/db');

const app = express();
app.disable('x-powered-by');

// Security headers
app.use(helmet());

// CORS
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json({ limit: '10kb' }));

app.use(express.urlencoded({
    extended: false,
    limit: '10kb'
}));

// Cookie parser
app.use(cookieParser());

app.use(morgan("dev"));
const { notFound, errorHandler } = require('./middleware/error.middleware');
const initDatabase = require('./database/initDatabase');

const authRoutes = require('./routes/auth.routes');
const roleRoutes = require('./routes/role.route');
const userRoutes = require('./routes/user.route');
const settingRoutes = require('./routes/setting.route');
const signupRoutes = require('./routes/userrequest.route');
const notificationRoutes = require('./routes/notification.route');

// Health check
app.get('/api', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running'
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/signup', signupRoutes);
app.use('/api/notifications', notificationRoutes);

// Start server only after database connection
const startServer = async () => {
    try {
        await initDatabase();
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

    } catch (error) {
        console.error('Database Connection Failed:',
            error.message
        );

        process.exit(1);
    }
};

// Not found
app.use(notFound);
// Centralized error handler
app.use(errorHandler);
startServer();
