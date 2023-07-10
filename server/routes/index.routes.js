const express = require("express");
const app = express();

app.use(require("./image.routes"));
app.use(require("./apikey.routes"));

module.exports = app;