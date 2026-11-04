const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: Number(process.env.REFRESH_TOKEN_DAYS || 7) * 24 * 60 * 60 * 1000
};

const setRefreshCookie = (res, token) => {
    res.cookie('refreshToken', token, cookieOptions);
};

const clearRefreshCookie = (res) => { 
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        path: '/api/auth'
    });
};

module.exports = {
    setRefreshCookie,
    clearRefreshCookie
};