import fs from "fs";
import io from "socket.io-client";
import os, { hostname } from "os";
import { spawn, exec } from "child_process";
import { load } from "nodemon/lib/config";
const socket = io.connect("http://boxlapse.ddns.net:4000");

if (os.hostname() != "video") {
  var hostName = os.hostname();
} else hostName = "boxlapseX";

console.log(`Started with ${hostName}`);

var loadConfig = true;

socket.on("connect", () => {
  console.log("On Connect");
  socket.emit("myNameIs", hostName);
  console.log("Sending myNameIs", hostName);
});

socket.on("disconnect", () => {
  console.log("got disconnected");
});

socket.on("takePicture", (url) => {
  console.log("Got Message to take picture");
  takePictureDO((url) => {
    console.log(`URL is: ${url}`);
    socket.emit("PictureOK", url);
  });
});

socket.on("setConfiguration", (boxJSON) => {
  console.log(`Received update from server:setConfiguration: ${boxJSON}`);
  socket.emit("setConfiguration", `setConfiguration Received by ${hostName}`);
  const content = JSON.stringify(boxJSON, null, 2);
  fs.writeFile("/home/pi/Documents/boxlapse_agent/box.json", content, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`JSON was written to file`);
  });
  loadConfig = false;
  const startHour = boxJSON.startHour;
  const startMinute = boxJSON.startMinute;
  const endHour = boxJSON.endHour;
  const endMinute = boxJSON.endMinute;
  const interval = boxJSON.interval;
  const activeDays = boxJSON.activeDays;
  updateConfiguration(startHour, startMinute, endHour, endMinute, interval, activeDays);
});

socket.on("connect_error", (err) => {
  console.log(`Can't connect to Boxlapse Server, retrying`);
  if (loadConfig) {
    console.log(`Using local configuration box.json`);
    fs.readFile("/home/pi/Documents/boxlapse_agent/box.json", "utf8", (err, box) => {
      if (err) {
        console.error(`Can't read box.json file ${err}`);
        return;
      }
      const boxJSON = JSON.parse(box);
      console.log(boxJSON);
      const startHour = boxJSON.startHour;
      const startMinute = boxJSON.startMinute;
      const endHour = boxJSON.endHour;
      const endMinute = boxJSON.endMinute;
      const interval = boxJSON.interval;
      const activeDays = boxJSON.activeDays;
      loadConfig = false;
      updateConfiguration(startHour, startMinute, endHour, endMinute, interval, activeDays);
    });
  }
});

function takePicture() {
  console.log("Taking a picture");
  if (hostName != "boxlapseX") {
    const child = spawn("/home/pi/upload_cron.sh");
  }
}

function takePictureDO(cb) {
  console.log("Taking a picture DO");
  if (hostName != "boxlapseX") {
    var d = new Date();
    var datestring =
      ("0" + d.getDate()).slice(-2) +
      "-" +
      ("0" + (d.getMonth() + 1)).slice(-2) +
      "-" +
      d.getFullYear() +
      "T" +
      ("0" + d.getHours()).slice(-2) +
      ":" +
      ("0" + d.getMinutes()).slice(-2) +
      ":" +
      ("0" + d.getSeconds()).slice(-2);
    //var cmdPre = "/home/pi/takepictureDO.sh ";
    //var cmd = cmdPre.concat(datestring);
    //console.log(`runngin command => ${cmd}`);
    //var urlPre = "https://highlapse.fra1.digitaloceanspaces.com/${hostname}/takePicture/";
    //var url = urlPre.concat(datestring, ".cr2.jpg");
    const child = exec(`/home/pi/takepictureDO.sh ${datestring}`);
    child.on("close", (code, signal) => {
      console.log(`child process terminated due to receipt of signal ${signal}`);
      cb(`https://highlapse.fra1.digitaloceanspaces.com/${hostname}/takePicture/${datestring}.cr2.jpg`);
    });
  }
}

socket.on("error", (err) => {
  console.log(err);
});

const DAYS_STRS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function dayNumToStr(dayNum) {
  return DAYS_STRS[dayNum % 7];
}

function fillActions(startHour, startMinute, endHour, endMinute, interval, activeDays) {
  const startMinuteOfTheDay = startHour * 60 + startMinute;
  const endMinuteOfTheDay = endHour * 60 + endMinute;
  if (startMinuteOfTheDay > endMinuteOfTheDay) {
    throw new Error("Start time is after End time");
  }

  const result = [[], [], [], [], [], [], []];
  if (!activeDays) {
    return result;
  }
  for (let i = 0; i < activeDays.length; i++) {
    if (activeDays[i]) {
      for (let t = startMinuteOfTheDay; t <= endMinuteOfTheDay; t = t + interval) {
        result[i].push(t);
      }
    }
  }
  return result;
}

function validateActionByDay(actionsByDays) {
  return actionsByDays.some((actions) => actions.length > 0);
}

function getMinutesToWait(actionsByDays) {
  if (validateActionByDay(actionsByDays) === false) {
    return null;
  }

  const now = new Date();
  const currentMinuteOfTheDay = now.getHours() * 60 + now.getMinutes();
  const currentDayOfTheWeek = now.getDay();

  console.log(`currentDayOfTheWeek: ${dayNumToStr(currentDayOfTheWeek)}`);
  console.log(`currentMinuteOfTheDay: ${currentMinuteOfTheDay}`);

  let found = false;
  let idx = 0;
  let daysToAdd = 0;
  while (!found) {
    //console.log(found)
    const targetDay = (currentDayOfTheWeek + daysToAdd) % 7;
    const dayActions = actionsByDays[targetDay];
    if (dayActions.length - 1 < idx) {
      daysToAdd++;
      idx = 0;
    } else {
      const targetMinuteOfTheDay = dayActions[idx];
      if (targetMinuteOfTheDay > currentMinuteOfTheDay || daysToAdd > 0) {
        found = true;
        const minutesToWait = targetMinuteOfTheDay - currentMinuteOfTheDay + daysToAdd * 24 * 60;
        console.log(`daysToAdd: ${daysToAdd}`);
        console.log(`targetDay: ${dayNumToStr(targetDay)}`);
        console.log(`targetMinuteOfTheDay: ${targetMinuteOfTheDay}`);
        console.log(`actionsPerDay: ${dayActions.length}`);
        return minutesToWait;
      } else {
        idx++;
      }
    }
  }
}

let actionsByDays;
let setTimeoutId;
function updateConfiguration(startHour, startMinute, endHour, endMinute, interval, activeDays) {
  // load configuration
  actionsByDays = fillActions(startHour, startMinute, endHour, endMinute, interval, activeDays);
  console.log(actionsByDays);
  console.log(`Interval is ===> ${interval}`);
  work();
}

function work() {
  if (setTimeoutId) {
    clearTimeout(setTimeoutId);
  }
  const now = new Date();
  const seconds = now.getSeconds() * 1000;
  const minutesToWait = getMinutesToWait(actionsByDays);
  if (minutesToWait === null) {
    return;
  }
  const msToWait = minutesToWait * 60000 - seconds;
  console.log(`minutesToWait ===> ${minutesToWait}`);
  console.log(`msToWait ===> ${msToWait}`);
  console.log(now);

  function onTimer() {
    takePicture();
    work();
  }
  setTimeoutId = setTimeout(onTimer, msToWait);
}
