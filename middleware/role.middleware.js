const AppError = require('../utils/appError');

const authorize = (...roles) => { 

    return (req, res, next) => {

        console.log("req.user.role ==> ", req.user.role);
        if (!req.user || !roles.includes(req.user.role)) {
            return next(
                new AppError('You do not have permission', 403)
            );
        }

        next();
    };
};

module.exports = authorize;