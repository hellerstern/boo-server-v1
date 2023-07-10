const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

app.use(bodyParser.json({limit: '50mb', extended: true}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({ origin: '*' }));

// Routes Global Config
app.use(require("./routes/index.routes"));

module.exports = app;