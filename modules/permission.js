// modules/permission.js
const { ownerWhatsAppJids } = require('../config')

function getUserRole(msg, isGroupAdmin) {
    // Get the exact ID of the person sending the message
    const sender = msg.key.participant || msg.key.remoteJid

    // 1. Check if the sender is an Owner
    // We check the array to see if your number is in it
    if (ownerWhatsAppJids && ownerWhatsAppJids.includes(sender)) {
        return 'owner'
    }

    // 2. Check if the sender is an Admin in a group
    if (isGroupAdmin) {
        return 'admin'
    }

    // 3. Otherwise, they are a normal public user
    return 'public'
}

module.exports = { getUserRole }
