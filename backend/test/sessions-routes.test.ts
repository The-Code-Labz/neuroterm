import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, registerUser, type TestAppContext } from './helpers/testApp';
import { MAX_COLS, MAX_ROWS, MIN_COLS, MIN_ROWS } from '../src/utils/terminal-dims';

describe('POST /api/sessions', () => {
  let ctx: TestAppContext;

  beforeEach(() => {
    ctx = buildTestApp();
  });

  it('clamps an oversized cols/rows request instead of persisting it verbatim', async () => {
    const alice = await registerUser(ctx.app, 'alice');

    const res = await request(ctx.app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ name: 'huge', tmux_session: 'huge', mode: 'local', cols: 999_999_999, rows: 999_999_999 });

    expect(res.status).toBe(201);
    expect(res.body.cols).toBe(MAX_COLS);
    expect(res.body.rows).toBe(MAX_ROWS);
  });

  it('clamps an undersized/zero cols/rows request up to the minimum', async () => {
    const alice = await registerUser(ctx.app, 'alice');

    const res = await request(ctx.app)
      .post('/api/sessions')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ name: 'tiny', tmux_session: 'tiny', mode: 'local', cols: 0, rows: 0 });

    expect(res.status).toBe(201);
    expect(res.body.cols).toBe(MIN_COLS);
    expect(res.body.rows).toBe(MIN_ROWS);
  });
});
