const isProduction = process.env.NODE_ENV === 'production';

const setRefreshCookie = (res, token, rememberMe) => {
    const options = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        path: '/api/auth'
    };
 
    if (rememberMe) {
        options.maxAge = (Number(process.env.REFRESH_TOKEN_DAYS) || 7) * 24 * 60 * 60 * 1000;
    }

    res.cookie('refreshToken', token, options);
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
