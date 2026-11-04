const pool = require('../config/db');

const createToken = async (client,{userId,tokenHash,familyId,expiresAt}) => {

    const query = `
        INSERT INTO refresh_tokens (
            user_id,
            token_hash,
            family_id,
            expires_at
        )
        VALUES ($1, $2, $3, $4)
    `;

    await client.query(query, [
        userId,
        tokenHash,
        familyId,
        expiresAt
    ]);
};

const findTokenForUpdate = async (client, tokenHash) => {
    const query = `
        SELECT *
        FROM refresh_tokens
        WHERE token_hash = $1
        FOR UPDATE
    `;

    const result = await client.query(query, [tokenHash]);
    return result.rows[0];
};

const rotateToken = async (client,oldTokenHash,newTokenHash) => {

    const query = `
        UPDATE refresh_tokens
        SET revoked_at = NOW(),
            replaced_by_hash = $2
        WHERE token_hash = $1
          AND revoked_at IS NULL
    `;

    await client.query(query, [oldTokenHash,newTokenHash]);
};

const revokeFamily = async (client, familyId) => {

    await client.query(`
        UPDATE refresh_tokens
        SET revoked_at = NOW()
        WHERE family_id = $1
          AND revoked_at IS NULL
    `, [familyId]);
};

const revokeToken = async (client, tokenHash) => {

    await client.query(`
        UPDATE refresh_tokens
        SET revoked_at = NOW()
        WHERE token_hash = $1
          AND revoked_at IS NULL
    `, [tokenHash]);
};

const revokeAllUserTokens = async (client, userId) => {

    await client.query(`
        UPDATE refresh_tokens
        SET revoked_at = NOW()
        WHERE user_id = $1
          AND revoked_at IS NULL
    `, [userId]);
};

module.exports = {
    createToken,
    findTokenForUpdate,
    rotateToken,
    revokeFamily,
    revokeToken,
    revokeAllUserTokens
};