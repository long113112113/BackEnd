
module.exports = {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN,
    },
};
