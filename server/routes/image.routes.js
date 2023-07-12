const express = require("express");
const canvas = require('canvas');
const faceapi = require('face-api.js');
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const fs = require('fs');
const crypto = require("crypto");
const axios = require('axios');
const requestIp = require('request-ip');
const DB_OBEJCT = require("../dbconnect");
const app = express();

const generateAPIKEY = (ipAddress) => {
  const cipher = crypto.createCipher('aes-256-cbc', process.env.SEED);
  let encryptedWord = cipher.update(ipAddress, 'utf8', 'hex');
  encryptedWord += cipher.final('hex');
  console.log(`${ipAddress}:`, encryptedWord);
  return encryptedWord;
};

const decrypt = (apikey) => {
  const decipher = crypto.createDecipher('aes-256-cbc', process.env.SEED);
  let decryptedWord = decipher.update(apikey, 'hex', 'utf8');
  decryptedWord += decipher.final('utf8');
  return decryptedWord;
};

async function compareFaces(imagePath1, imagePath2) {
  const image1 = await canvas.loadImage(imagePath1);
  const image2 = await canvas.loadImage(imagePath2);
  const detection1 = await faceapi.detectSingleFace(image1).withFaceLandmarks().withFaceDescriptor();
  const detection2 = await faceapi.detectSingleFace(image2).withFaceLandmarks().withFaceDescriptor();

  if (!detection1 || !detection2) {
    throw new Error('Could not detect faces in both images.');
  }

  const faceDescriptors = [detection1.descriptor];
  const labeledFaceDescriptors = [
    new faceapi.LabeledFaceDescriptors("Face 1", faceDescriptors)
  ];

  const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);

  const queryFaceDescriptors = [detection2.descriptor];
  const queryLabeledFaceDescriptors = [
    new faceapi.LabeledFaceDescriptors("Query Face", queryFaceDescriptors)
  ];

  const matchResult = faceMatcher.matchDescriptor(queryFaceDescriptors[0]);
  return matchResult;
}

async function loadModels() {
  await faceapi.nets.ssdMobilenetv1.loadFromDisk('./models');
  await faceapi.nets.faceLandmark68Net.loadFromDisk('./models');
  await faceapi.nets.faceRecognitionNet.loadFromDisk('./models');
}

function saveImageFromBase64(base64Data, filePath) {
  // Remove the data prefix from the base64 string
  const dataWithoutPrefix = base64Data.replace(/^data:image\/\w+;base64,/, '');

  // Create a buffer from the base64 data
  const imageBuffer = Buffer.from(dataWithoutPrefix, 'base64');

  // Save the image buffer to a file
  fs.writeFileSync(filePath, imageBuffer);
}


function getLastId(callback) {
  // Execute the query to retrieve the longest name
  DB_OBEJCT.query('SELECT uId FROM user_images ORDER BY iId DESC LIMIT 1', (error, results, fields) => {

    if (error) {
      return callback(error);
    }

    if (results.length === 0) {
      return callback(new Error('No names found in the table'));
    }

    const lastId = results[0].uId;
    callback(null, lastId);
  });
}

function getImages(callback) {
  DB_OBEJCT.query('SELECT uId, iName FROM user_images', (error, results, fields) => {
    if (error) {
      return callback(error);
    }
    callback(null, results);
  });
}

async function getApiKeyList(callback) {
  await DB_OBEJCT.query('SELECT distinct apikey from user_images', (error, result, fields) => {
    if (error) {
      return callback(error);
    }
    callback(null, result);
  })
}

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

app.post('/getImg', async (req, res) => {
  try {
    const imageBase64 = req.body.file;
    const filename = req.body.fileName;
    let compImgResult = false;

    saveImageFromBase64(
      imageBase64,
      './images/tmp/tmp.png'
    );

    getImages(async (err, images) => {
      if (err) {
        console.log('getImages: ', err);
      }
      let flag = 0;
      if (images.length === 0) {
        const filePath = `./images/${1}.png`; // Replace with the desired file path
        saveImageFromBase64(imageBase64, filePath);
        let apikey = generateAPIKEY(requestIp.getClientIp(req));
        DB_OBEJCT.query(`INSERT INTO user_images (iName, base64, uId, apikey) VALUES ("${filename}", "${imageBase64}", ${1}, "${apikey}")`, (err, result) => {
          if (err) {
            throw err
          } else {
            console.log('Successed!');

            return res.send({ ok: true,  result: {
              flag: 1,
              apikey
            } });
          }
        });


      } else {
        for (let img = 0; img < images.length; img++) {
          if (flag == 1) return;
          else  {
            console.log('start...', img);
            await loadModels().then(async () => {
              const imagePath1 = './images/tmp/tmp.png';
              const imagePath2 = `./images/${images[img].uId}.png`;
              await compareFaces(imagePath1, imagePath2).then(async compResult => {
                // If there is same images
                if (compResult._distance <= 0.5) {
                  console.log(`CompResult:`, true);
                  flag = 1;
                  return res.send({
                    ok: true,
                    result: {
                      flag: 0,
                    }
                  });
                }
    
                if (flag == 0 && images.length === Number(img) + 1) {
                  console.log('-----------------------------------');
                  getLastId((err, lastId) => {
                    if (err) {
                      console.error('Error:', err);
                      return;
                    }

                    getApiKeyList(async (err, keys) => {
                      const filePath = `./images/${lastId + 1}.png`; // Replace with the desired file path
                      saveImageFromBase64(imageBase64, filePath);

                      let keyFlag = '';

                      for (let j = 0; j < keys.length; j++) {
                        if (decrypt(keys[j].apikey)  == requestIp.getClientIp(req)) {
                          keyFlag = keys[j].apikey;
                          break;
                        }
                      }

                      if (keyFlag === '') keyFlag = generateAPIKEY(requestIp.getClientIp(req));

 
                      DB_OBEJCT.query(`INSERT INTO user_images (iName, base64, uId, apikey) VALUES ("${filename}", '${imageBase64}', ${lastId + 1}, "${keyFlag}")`, (err, result) => {
                        if (err) {
                          throw err
                        } else {
                          console.log('Successed!');
        
                          return res.send({ ok: true,  result: {
                            flag: 1,
                            apikey: keyFlag
                          } });
                        }
                      });
                    })
                  });
                }
              }).catch(console.error);
            });
          }
        }
      }
    });
  } catch (err) {
    console.log(err)
    res.send({
      ok: false,
      result: err
    });
  }
});

app.get('/imageslist', (req, res) => {
  DB_OBEJCT.query(`SELECT iId, iName FROM user_images`, (err, result) => {
    if (err) {
      res.send({
        ok: false,
        result: err
      })
    }

    res.send({
      ok: true,
      result
    })
  });
})

app.get('/images/:fileId', (req, res) => {
  const uId = req.params.fileId;
  DB_OBEJCT.query(`SELECT * FROM user_images where iId=${uId}`, (err, result) => {
    if (err) {
      res.send({
        ok: false,
        result: err
      })
    }
    console.log(result);
    res.send({
      ok: true,
      result
    })
  })
});

module.exports = app;