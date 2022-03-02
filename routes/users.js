import express from "express";
const router = express.Router();
//import fs from 'fs';
import aws from "aws-sdk";

var accessKeyId = "YZHADFLBWJFT2NIZEQOY";
var secretAccessKey = "c9jXEXHPYXWTm4JSrwOWqUL9OVCXNCRJSlxrPxBYDrA"

aws.config.update({
  accessKeyId: accessKeyId,
  secretAccessKey: secretAccessKey
});


// Set S3 endpoint to DigitalOcean Spaces
const spacesEndpoint = new aws.Endpoint('fra1.digitaloceanspaces.com');
const s3 = new aws.S3({
  endpoint: spacesEndpoint
});

function loadBoxes() {
  return new Promise((resolve) => {
    var params = {
      Bucket: 'highlapse/boxapp',
      Key: 'users.json'
    };
    
    s3.getObject(params, function(err, data) {
      if (err) {
        console.log("Error getting data: ", err);
      } else {
        console.log("Successfully got data from DO space", data);
        var boxes = data.Body.toString('utf-8');
        console.log('here', boxes);
        resolve(boxes);
      }
    });
  })
}

router.get('/', async (req, res) => {
  const boxes = await loadBoxes();
  res.send(boxes);
});

router.post('/', async (req, res) => {
  const data = req.body;
  if (data.password !== '123') {
    res.send('go away');
    return;
  }

  const boxes = await loadBoxes();
  const boxesJSON = JSON.parse(boxes);
  const box = boxesJSON.find((item) => item.userId === data.userId);
  if (box) {
    console.log('user found, changing', data)
    box.interval = data.interval;
    box.click = data.click;
  } else {
    //console.log('user not found', data)
  }

  var params = {
    Bucket: 'highlapse/boxapp',
    Key: 'users.json',
    ACL: 'public-read',
    Body: JSON.stringify(boxesJSON, null, 2)
  };
  console.log(params)
  s3.putObject(params, function (perr, pres) {
    if (perr) {
      console.log("Error uploading data: ", perr);
      //res.send('[]');
      res.sendStatus(500);
    } else {
      console.log("Successfully uploaded data to myBucket/myKey");
      res.send(boxesJSON);
    }
  });


  // fs.writeFileSync('public/users.json', JSON.stringify(boxesJSON, null, 2));
  //res.send(boxesJSON);
})

export default router;