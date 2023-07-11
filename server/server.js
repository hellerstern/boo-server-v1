const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const requestIp = require('request-ip');

const app = express();

app.use(bodyParser.json({limit: '50mb', extended: true}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({ origin: '*' }));

async function getLocation(ipAddress) {
    try {
      const response = await axios.get(`http://ip-api.com/json/${ipAddress}`);
      const { status, country, regionName, city, zip, lat, lon } = response.data;
  
      if (status === 'success') {
        return {
          country,
          region: regionName,
          city,
          zip,
          latitude: lat,
          longitude: lon
        };
      } else {
        throw new Error('Failed to get location');
      }
    } catch (error) {
      throw new Error('Failed to get location');
    }
  }

app.get('/api/location',async (req, res) => {
    
    const clientIp = requestIp.getClientIp(req);

    getLocation(clientIp)
        .then(location => {
            res.json({ ip: clientIp, location: location });
        })
        .catch(error => {
            res.json(...error);
        });
  });

// Routes Global Config
app.use(require("./routes/index.routes"));

module.exports = app;