const request = require('supertest');
const app = require('../service');

const unique = (prefix) => `${prefix}-${Math.random().toString(36).substring(2, 10)}`;

let dinerToken;
let adminToken;
let menuItem;
let franchise;
let store;

beforeAll(async () => {
  const dinerRes = await request(app).post('/api/auth').send({
    name: unique('order diner'),
    email: `${unique('order-diner')}@test.com`,
    password: 'password',
  });
  expect(dinerRes.status).toBe(200);
  dinerToken = dinerRes.body.token;

  const adminLoginRes = await request(app).put('/api/auth').send({ email: 'a@jwt.com', password: 'admin' });
  expect(adminLoginRes.status).toBe(200);
  adminToken = adminLoginRes.body.token;

  const menuRes = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: unique('Test pizza'), description: 'Coverage pizza', image: 'pizza-test.png', price: 9.99 });
  expect(menuRes.status).toBe(200);
  menuItem = menuRes.body.find((item) => item.title.startsWith('Test pizza'));

  const franchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: unique('Order franchise'), admins: [{ email: 'a@jwt.com' }] });
  expect(franchiseRes.status).toBe(200);
  franchise = franchiseRes.body;

  const storeRes = await request(app)
    .post(`/api/franchise/${franchise.id}/store`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: unique('Order store') });
  expect(storeRes.status).toBe(200);
  store = storeRes.body;
});

test('gets the pizza menu', async () => {
  const res = await request(app).get('/api/order/menu');

  expect(res.status).toBe(200);
  expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: menuItem.id, title: menuItem.title })]));
});

test('requires authentication to add a menu item', async () => {
  const res = await request(app).put('/api/order/menu').send({ title: 'No access' });
  expect(res.status).toBe(401);
});

test('only admins can add menu items', async () => {
  const res = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send({ title: 'No access' });

  expect(res.status).toBe(403);
  expect(res.body.message).toBe('unable to add menu item');
});

test('gets orders for the authenticated diner', async () => {
  const res = await request(app)
    .get('/api/order?page=2')
    .set('Authorization', `Bearer ${dinerToken}`);

  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ orders: [], page: '2' });
});

test('requires authentication to get orders', async () => {
  const res = await request(app).get('/api/order');
  expect(res.status).toBe(401);
});

test('creates an order when the factory accepts it', async () => {
  const orderRequest = {
    franchiseId: franchise.id,
    storeId: store.id,
    items: [{ menuId: menuItem.id, description: menuItem.title, price: menuItem.price }],
  };
  const res = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${dinerToken}`)
    .send(orderRequest);

  expect(res.status).toBe(200);
  expect(res.body.order).toMatchObject(orderRequest);
  expect(res.body).toHaveProperty('order');
});
