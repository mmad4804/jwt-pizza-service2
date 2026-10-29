const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database.js');
const { setAuth } = require('./authRouter.js');

const unique = (prefix) => `${prefix}-${Math.random().toString(36).substring(2, 10)}`;

let testUser;
let testUserAuthToken;
let otherUser;
let adminUser;
let adminAuthToken;

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

  adminUser = await DB.addUser({
    name: unique('pizza admin'),
    email: `${unique('admin')}@test.com`,
    password: 'password',
    roles: [{ role: Role.Admin }],
  });
  adminAuthToken = await setAuth(adminUser);
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

test('requires authentication to list users', async () => {
  const res = await request(app).get('/api/user');
  expect(res.status).toBe(401);
});

test('only admins can list users', async () => {
  const res = await request(app)
    .get('/api/user')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(res.status).toBe(403);
});

test('lists users with roles and supports name filtering and pagination', async () => {
  const res = await request(app)
    .get(`/api/user?page=1&limit=1&name=${encodeURIComponent(otherUser.name)}`)
    .set('Authorization', `Bearer ${adminAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body.users).toHaveLength(1);
  expect(res.body.users[0]).toMatchObject({ id: otherUser.id, name: otherUser.name, email: otherUser.email, roles: [{ role: 'diner' }] });
  expect(res.body.more).toBe(false);
});

test('reports another page when more matching users exist', async () => {
  const res = await request(app)
    .get('/api/user?page=1&limit=1&name=*')
    .set('Authorization', `Bearer ${adminAuthToken}`);

  expect(res.status).toBe(200);
  expect(res.body.users).toHaveLength(1);
  expect(res.body.more).toBe(true);
});

test('rejects non-admin user deletion and deletes a user as an admin', async () => {
  const denied = await request(app)
    .delete(`/api/user/${otherUser.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(denied.status).toBe(403);

  const deleted = await request(app)
    .delete(`/api/user/${otherUser.id}`)
    .set('Authorization', `Bearer ${adminAuthToken}`);
  expect(deleted.status).toBe(204);

  const listed = await request(app)
    .get(`/api/user?page=1&limit=10&name=${encodeURIComponent(otherUser.name)}`)
    .set('Authorization', `Bearer ${adminAuthToken}`);
  expect(listed.body.users).toEqual([]);
});

test('updates a name without requiring email or password', async () => {
  const updatedName = unique('name only');
  const res = await request(app)
    .put(`/api/user/${testUser.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: updatedName });

  expect(res.status).toBe(200);
  expect(res.body.user).toMatchObject({ id: testUser.id, name: updatedName, email: testUser.email });
  testUserAuthToken = res.body.token;
});

test('persists email and password changes so the updated credentials can log in', async () => {
  const updatedEmail = `${unique('updated')}@test.com`;
  const updatedPassword = 'new-password';
  const updateRes = await request(app)
    .put(`/api/user/${testUser.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ email: updatedEmail, password: updatedPassword });

  expect(updateRes.status).toBe(200);
  expect(updateRes.body.user).toMatchObject({ id: testUser.id, email: updatedEmail });

  const oldCredentials = await request(app).put('/api/auth').send({ email: testUser.email, password: 'password' });
  expect(oldCredentials.status).toBe(404);
  const newCredentials = await request(app).put('/api/auth').send({ email: updatedEmail, password: updatedPassword });
  expect(newCredentials.status).toBe(200);
  expect(newCredentials.body.user).toMatchObject({ id: testUser.id, email: updatedEmail });
});


