require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');
const pool = require('./config/db');

const app = express();
app.disable('x-powered-by');

// Security headers (allow inline styles & 3d viewer scripts)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS configuration supporting credentials and multiple local/deployed origins
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cookie parser
app.use(cookieParser());
app.use(morgan('dev'));

const { notFound, errorHandler } = require('./middleware/error.middleware');
const initDatabase = require('./database/initDatabase');

// 1. Auth, Roles, RBAC & Settings Routes (Tamilmani's modules)
const authRoutes = require('./routes/auth.routes');
const roleRoutes = require('./routes/role.route');
const userRoutes = require('./routes/user.route');
const settingRoutes = require('./routes/setting.route');

// 2. Australian Banking Governance Routes (LibTrak OmniSpec modules)
const departmentsRouter = require('./routes/departments');
const policiesRouter = require('./routes/policies');
const makerCheckerRouter = require('./routes/makerChecker');
const changeLogsRouter = require('./routes/changeLogs');
const metricsRouter = require('./routes/metrics');
const templatesRouter = require('./routes/templates');
const tasksRouter = require('./routes/tasks');
const aiRouter = require('./routes/ai');
const vectorsRouter = require('./routes/vectors');
const notificationRoutes = require('./routes/notification.route');
const signupRoutes = require('./routes/userrequest.route');
const dashboardRoutes = require('./routes/dashboard.route');


// Standalone 3D Vector DB Viewer & TensorFlow Projector
const { get3dViewerHtml } = require('./views/viewerHtml');
app.get('/3dviewer', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(get3dViewerHtml());
});

// API Root Status & Documentation
app.get('/', (req, res) => {
    res.json({
        message: 'LibTrak OmniSpec Hub API',
        version: '2.2.0',
        documentation: '/api',
        endpoints: {
            auth: '/api/auth',
            roles: '/api/roles',
            users: '/api/users',
            settings: '/api/settings',
            hierarchy: '/api/hierarchy',
            policies: '/api/policies',
            maker_checker: '/api/maker-checker',
            tasks: '/api/tasks',
            change_logs: '/api/change-logs',
            metrics: '/api/dashboard-metrics',
            dashboard: '/api/dashboard',
            templates: '/api/templates',
            ingest: '/api/ai/ingest-documents',
            rag: '/api/ai/rag-query',
            vectors: '/api/vectors',
            viewer_3d: '/3dviewer'
        }
    });
});

app.get('/api', (req, res) => {
    res.status(200).json({
        success: true,
        system: 'LibTrak OmniSpec Hub — Australian Banking Multi-Tenant API',
        version: '2.2.0',
        status: 'online'
    });
});

// Mount RBAC & Auth routes
app.use('/api/auth', authRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/signup', signupRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Mount Banking Governance routes
app.use('/api', departmentsRouter);
app.use('/api', policiesRouter);
app.use('/api', makerCheckerRouter);
app.use('/api', changeLogsRouter);
app.use('/api', metricsRouter);
app.use('/api', templatesRouter);
app.use('/api', tasksRouter);
app.use('/api', aiRouter);
app.use('/api', vectorsRouter); 

// Centralized error handling
app.use(notFound);
app.use(errorHandler);

// Start server
const startServer = async () => {
    try {
        await initDatabase();
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Database Connection Failed:', error.message);
        process.exit(1);
    }
};

startServer();
