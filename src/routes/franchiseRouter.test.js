const request = require('supertest');
const app = require('../service');
const { DB, Role } = require('../database/database.js');

const unique = (prefix) => `${prefix}-${Math.random().toString(36).substring(2, 10)}`;

let adminToken;
let franchiseAdmin;
let franchiseAdminToken;
let strangerToken;
let franchise;
let adminEmail;

beforeAll(async () => {
  adminEmail = `${unique('franchise-admin')}@test.com`;
  await DB.addUser({ name: unique('franchise admin'), email: adminEmail, password: 'admin', roles: [{ role: Role.Admin }] });

  const adminLoginRes = await request(app).put('/api/auth').send({ email: adminEmail, password: 'admin' });
  expect(adminLoginRes.status).toBe(200);
  adminToken = adminLoginRes.body.token;

  const franchiseAdminRes = await request(app).post('/api/auth').send({
    name: unique('franchise admin'),
    email: `${unique('franchise-admin')}@test.com`,
    password: 'password',
  });
  expect(franchiseAdminRes.status).toBe(200);
  franchiseAdmin = franchiseAdminRes.body.user;

  const strangerRes = await request(app).post('/api/auth').send({
    name: unique('stranger'),
    email: `${unique('stranger')}@test.com`,
    password: 'password',
  });
  expect(strangerRes.status).toBe(200);
  strangerToken = strangerRes.body.token;

  const createRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: unique('Test franchise'), admins: [{ email: franchiseAdmin.email }] });
  expect(createRes.status).toBe(200);
  franchise = createRes.body;

  const loginRes = await request(app).put('/api/auth').send({ email: franchiseAdmin.email, password: 'password' });
  expect(loginRes.status).toBe(200);
  franchiseAdminToken = loginRes.body.token;
});

test('lists franchises for an unauthenticated user', async () => {
  const res = await request(app).get(`/api/franchise?page=0&limit=10&name=${encodeURIComponent(franchise.name)}`);

  expect(res.status).toBe(200);
  expect(res.body.more).toBe(false);
  expect(res.body.franchises).toEqual(expect.arrayContaining([expect.objectContaining({ id: franchise.id, name: franchise.name })]));
});

test('lists franchise details for an authenticated admin', async () => {
  const res = await request(app)
    .get(`/api/franchise?page=0&limit=10&name=${encodeURIComponent(franchise.name)}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(res.status).toBe(200);
  expect(res.body.franchises[0]).toMatchObject({ id: franchise.id, name: franchise.name, admins: expect.any(Array), stores: expect.any(Array) });
});

test('requires authentication for a user franchise lookup', async () => {
  const res = await request(app).get(`/api/franchise/${franchiseAdmin.id}`);
  expect(res.status).toBe(401);
});

test('returns franchises owned by the requested user', async () => {
  const res = await request(app)
    .get(`/api/franchise/${franchiseAdmin.id}`)
    .set('Authorization', `Bearer ${franchiseAdminToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: franchise.id, name: franchise.name })]));
});

test('does not expose another user’s franchises to a diner', async () => {
  const res = await request(app)
    .get(`/api/franchise/${franchiseAdmin.id}`)
    .set('Authorization', `Bearer ${strangerToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('requires an admin to create a franchise', async () => {
  const res = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${franchiseAdminToken}`)
    .send({ name: unique('forbidden franchise'), admins: [] });

  expect(res.status).toBe(403);
  expect(res.body.message).toBe('unable to create a franchise');
});

test('creates stores for an admin and a franchise admin', async () => {
  const adminStoreRes = await request(app)
    .post(`/api/franchise/${franchise.id}/store`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: unique('admin store') });
  expect(adminStoreRes.status).toBe(200);
  expect(adminStoreRes.body).toMatchObject({ franchiseId: franchise.id, name: expect.any(String) });

  const ownerStoreRes = await request(app)
    .post(`/api/franchise/${franchise.id}/store`)
    .set('Authorization', `Bearer ${franchiseAdminToken}`)
    .send({ name: unique('owner store') });
  expect(ownerStoreRes.status).toBe(200);
  expect(ownerStoreRes.body).toMatchObject({ franchiseId: franchise.id, name: expect.any(String) });
});

test('rejects store creation for an unrelated user or franchise', async () => {
  const unrelatedRes = await request(app)
    .post(`/api/franchise/${franchise.id}/store`)
    .set('Authorization', `Bearer ${strangerToken}`)
    .send({ name: unique('forbidden store') });
  expect(unrelatedRes.status).toBe(403);
});

test('deletes a store for a franchise admin', async () => {
  const storeRes = await request(app)
    .post(`/api/franchise/${franchise.id}/store`)
    .set('Authorization', `Bearer ${franchiseAdminToken}`)
    .send({ name: unique('deletable store') });
  expect(storeRes.status).toBe(200);

  const res = await request(app)
    .delete(`/api/franchise/${franchise.id}/store/${storeRes.body.id}`)
    .set('Authorization', `Bearer ${franchiseAdminToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'store deleted' });
});

test('rejects deleting a store from an unrelated user', async () => {
  const res = await request(app)
    .delete(`/api/franchise/${franchise.id}/store/999999999`)
    .set('Authorization', `Bearer ${strangerToken}`);

  expect(res.status).toBe(403);
});

test('deletes a franchise', async () => {
  const res = await request(app).delete(`/api/franchise/${franchise.id}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'franchise deleted' });
});
