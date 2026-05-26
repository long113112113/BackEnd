const clean = (obj) => {
    const result = {};
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val === '' || val === undefined) continue;
        result[key] = val;
    }
    return result;
};

module.exports = clean;
