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
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
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
const authRoutes = require('./routes/auth.routes');
const { notFound, errorHandler } = require('./middleware/error.middleware');
const initDatabase = require('./database/initDatabase');

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running'
    });
});



// Authentication routes
app.use('/api/auth', authRoutes);


// Start server only after database connection
const startServer = async () => {

    try {
        // await pool.query('SELECT 1');
        // console.log('PostgreSQL Connected Successfully');
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