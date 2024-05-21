const path = require('path');

module.exports = ({ env }) => ({
  connection: {
    client: 'sqlite',
    connection: {
      filename: path.join(__dirname, '..', 'data/data.sqlite'),
    },
    useNullAsDefault: true,
    debug: false,
  },
});
