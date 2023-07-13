const express = require('express');
const app = express();
const db_object = require('../dbconnect');

app.post('/validate', (req, res) => {
  const { apikey, paraphrase } = req.body;

  db_object.query("SELECT * FROM `api-keys` INNER JOIN customer ON `api-keys`.busid=customer.busid where apikey='"+apikey+"' AND paraphrase='"+paraphrase+"'", (error, result) => {
    if (error) {
      console.log(error);
    }
    res.json({
      isValid: result.length !== 0
    })
  })
  
})

module.exports = app;