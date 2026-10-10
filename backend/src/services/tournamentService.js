import { withTransaction } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';

export async function joinTournament({ tournamentId, userId }) {
  return withTransaction(async (client) => {
    const t = await client.query(
      'SELECT * FROM tournaments WHERE id = $1 FOR UPDATE',
      [tournamentId]
    );
    const tour = t.rows[0];
    if (!tour) throw new AppError('Turnir tapilmadi', 404, 'NO_TOUR');
    if (tour.status !== 'open') throw new AppError('Turnir baglidir', 400, 'CLOSED');

    const existing = await client.query(
      'SELECT id FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2',
      [tournamentId, userId]
    );
    if (existing.rows[0]) {
      throw new AppError('Artiq qatilmisiniz', 400, 'ALREADY_JOINED');
    }

    const u = await client.query(
      'SELECT tickets FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (!u.rows[0]) throw new AppError('Istifadeci tapilmadi', 404, 'NO_USER');
    if (u.rows[0].tickets < tour.ticket_price) {
      throw new AppError('Kifayet qeder bilet yoxdur', 400, 'NO_TICKETS');
    }

    const cnt = await client.query(
      'SELECT COUNT(*)::int AS c FROM tournament_participants WHERE tournament_id = $1',
      [tournamentId]
    );
    if (cnt.rows[0].c >= tour.max_players) {
      throw new AppError('Turnir doludur', 400, 'FULL');
    }

    await client.query(
      'UPDATE users SET tickets = tickets - $1 WHERE id = $2',
      [tour.ticket_price, userId]
    );
    await client.query(
      'INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1, $2)',
      [tournamentId, userId]
    );

    return { success: true };
  });
}
