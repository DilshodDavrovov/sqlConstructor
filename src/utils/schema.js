export const demoSchema = {
  tables: [
    { name: 'users', fields: [
      { name: 'id' }, { name: 'name' }, { name: 'email' }, { name: 'age' }, { name: 'country' }, { name: 'created_at' }
    ]},
    { name: 'orders', fields: [
      { name: 'id' }, { name: 'user_id' }, { name: 'total' }, { name: 'status' }, { name: 'created_at' }
    ]},
    { name: 'products', fields: [
      { name: 'id' }, { name: 'name' }, { name: 'price' }, { name: 'category' }
    ]},
    { name: 'order_items', fields: [
      { name: 'id' }, { name: 'order_id' }, { name: 'product_id' }, { name: 'qty' }, { name: 'price' }
    ]}
  ]
};


