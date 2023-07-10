const express = require("express");
const canvas = require('canvas');
const faceapi = require('face-api.js');
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const fs = require('fs');
const crypto = require("crypto");
const DB_OBEJCT = require("../dbconnect");
const app = express();

const generateAPIKEY = () => {

  // Generate a secret key for encryption and decryption.
  const secretKey = crypto.randomBytes(32);

  // Generate an initialization vector
  const iv = crypto.randomBytes(16);

  // data to be encrypted
  const plainText = process.env.SEED;

  // create cipher object
  const cipher = crypto.createCipheriv("aes-256-cbc", secretKey, iv);

  // encrypt the data
  let encryptedText = cipher.update(plainText, "utf-8", "hex");

  // finalize the encryption
  encryptedText += cipher.final("hex");

  return encryptedText;

  // const decipher = crypto.createDecipheriv("aes-256-cbc", secretKey, iv);

  // let decryptedText = decipher.update(encryptedText, "hex", "utf-8");

  // decryptedText += decipher.final("utf-8");
}

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
                  const filePath = `./images/${lastId + 1}.png`; // Replace with the desired file path
                  saveImageFromBase64(imageBase64, filePath);
                  DB_OBEJCT.query(`INSERT INTO user_images (iName, base64, uId) VALUES ("${filename}", '${imageBase64}', ${lastId + 1})`, (err, result) => {
                    if (err) {
                      throw err
                    } else {
                      console.log('Successed!');
    
                      return res.send({ ok: true,  result: {
                        flag: 1,
                        apikey: generateAPIKEY()
                      } });
                    }
                  });
                });
              }
            }).catch(console.error);
          });
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