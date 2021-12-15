const Sequelize = require('sequelize');
const User = require('./user');
const Good = require('./good');
const Auction = require('./auction');
const Domain = require('./domain');

const env = process.env.NODE_ENV || 'development';
const config = require('../config/config')[env];
const db = {};

const sequelize = new Sequelize(
  config.database, config.username, config.password, config,
);

db.sequelize = sequelize;
db.User = User;
db.Good = Good;
db.Auction = Auction;
db.Domain = Domain

User.init(sequelize);
Good.init(sequelize);
Auction.init(sequelize);
Domain.init(sequelize);

User.associate(db);
Good.associate(db);
Auction.associate(db);
Domain.associate(db);

module.exports = db;
