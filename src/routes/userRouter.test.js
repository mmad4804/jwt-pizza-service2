const request = require('supertest');
const app = require('../service');

const unique = (prefix) => `${prefix}-${Math.random().toString(36).substring(2, 10)}`;

let testUser;
let testUserAuthToken;
let otherUser;

beforeAll(async () => {
  const registerRes = await request(app).post('/api/auth').send({
    name: unique('pizza user'),
    email: `${unique('user')}@test.com`,
    password: 'password',
  });
  expect(registerRes.status).toBe(200);
  testUser = registerRes.body.user;
  testUserAuthToken = registerRes.body.token;

  const otherUserRes = await request(app).post('/api/auth').send({
    name: unique('other user'),
    email: `${unique('other')}@test.com`,
    password: 'password',
  });
  expect(otherUserRes.status).toBe(200);
  otherUser = otherUserRes.body.user;
});

test('rejects unauthenticated user requests', async () => {
  const res = await request(app).get('/api/user/me');
  expect(res.status).toBe(401);
  expect(res.body.message).toBe('unauthorized');
});

test('gets the authenticated user', async () => {
  const res = await request(app)
    .get('/api/user/me')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id: testUser.id, name: testUser.name, email: testUser.email });
  expect(res.body.roles).toEqual([{ role: 'diner' }]);
});

test('prevents a diner from updating another user', async () => {
  const res = await request(app)
    .put(`/api/user/${otherUser.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: 'should not update' });

  expect(res.status).toBe(403);
  expect(res.body.message).toBe('unauthorized');
});

test('updates the authenticated user and returns a new token', async () => {
  const updatedName = unique('updated user');
  const res = await request(app)
    .put(`/api/user/${testUser.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: updatedName, email: testUser.email, password: 'password' });

  expect(res.status).toBe(200);
  expect(res.body.user).toMatchObject({ id: testUser.id, name: updatedName, email: testUser.email });
  expect(res.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
  testUserAuthToken = res.body.token;
});

test('lists users with the current placeholder response', async () => {
  const res = await request(app)
    .get('/api/user')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'not implemented', users: [], more: false });
});

test('deletes users with the current placeholder response', async () => {
  const res = await request(app)
    .delete(`/api/user/${testUser.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'not implemented' });
});

