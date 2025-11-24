const mongoose = require('mongoose');

const adminConfigSchema = new mongoose.Schema({
    holiday: {
        active: { type: Boolean, default: false },
        reason: { type: String, default: "Public Holiday" }
    },
    leaves: [{
        engineer: String,
        substitute: String, // Can be null if no substitute
        isLeave: { type: Boolean, default: true }
    }]
});

module.exports = mongoose.model('AdminConfig', adminConfigSchema);
