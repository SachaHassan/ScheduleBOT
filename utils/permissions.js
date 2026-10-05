const { PermissionsBitField } = require('discord.js');

/**
 * Checks member permissions and roles.
 * Supports case-insensitive matches for:
 * - Admin: role "Moderator" (or Administrator permission)
 * - Manager: role "managers" (or "manager")
 * - Member: role "Member"
 */
function getMemberAccess(interaction) {
    const member = interaction.member;

    if (!member) {
        return { isAdmin: false, isManager: false, isMember: false };
    }

    // Server owner or Administrator permission always gets Admin level
    const hasAdminPerm = member.permissions?.has(PermissionsBitField.Flags.Administrator) ||
                         member.permissions?.has(PermissionsBitField.Flags.ManageGuild);

    const roles = member.roles?.cache;

    const hasModeratorRole = roles ? roles.some(r => r.name.toLowerCase() === 'moderator') : false;
    const hasManagerRole   = roles ? roles.some(r => ['managers', 'manager'].includes(r.name.toLowerCase())) : false;
    const hasMemberRole    = roles ? roles.some(r => r.name.toLowerCase() === 'member') : false;

    const isAdmin   = Boolean(hasAdminPerm || hasModeratorRole);
    const isManager = Boolean(isAdmin || hasManagerRole);
    // Admins and Managers inherently have Member access, otherwise must have "Member" role
    const isMember  = Boolean(isManager || hasMemberRole);

    return { isAdmin, isManager, isMember };
}

module.exports = {
    getMemberAccess,
};
