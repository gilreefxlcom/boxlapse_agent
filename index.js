import io from "socket.io-client";
import os from "os";
import { spawn } from "child_process";
const socket = io.connect("http://boxlapse.ddns.net:4000");

var hostName = os.hostname();
//var hostName = "boxlapse1";
console.log(`Started with ${hostName}`);

socket.on("connect", () => {
  console.log("On Connect");
  socket.emit("myNameIs", hostName);
  console.log("Sending myNameIs", hostName);
});

socket.on("disconnect", () => {
  console.log("got disconnected");
});

socket.on("takePicture", () => {
  console.log("Got Message to take picture");
  //run script to take picture
  const url = "bla";
  takePicture()
  socket.emit("PictureOK", url);
});

socket.on("setConfiguration", (boxJSON) => {
  console.log(`Received update from server:setConfiguration: ${boxJSON}`);
  socket.emit("setConfiguration", `setConfiguration Received by ${hostName}`);
  const startHour = boxJSON.startHour;
  const startMinute = boxJSON.startMinute;
  const endHour = boxJSON.endHour;
  const endMinute = boxJSON.endMinute;
  const interval = boxJSON.interval;
  const activeDays = boxJSON.activeDays;

  updateConfiguration(startHour, startMinute, endHour, endMinute, interval, activeDays);
});

function takePicture() {
  console.log("Taking a picture");
  const child = spawn('/home/pi/upload_cron.sh');
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
  return actionsByDays.some((actions) => actions.length >= 0);
}

function getMinutesToWait(actionsByDays) {
  if (validateActionByDay(actionsByDays) === false) {
    throw new Error("No actions found");
    console.log("No actions found");
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
  const now = new Date();
  const seconds = now.getSeconds() * 1000;
  const minutesToWait = getMinutesToWait(actionsByDays);
  const msToWait = minutesToWait * 60000 - seconds;
  console.log(`minutesToWait ===> ${minutesToWait}`);
  console.log(`msToWait ===> ${msToWait}`);
  console.log(now);

  function onTimer() {
    takePicture();
    work();
  }

  if (setTimeoutId) {
    clearTimeout(setTimeoutId);
  }
  setTimeoutId = setTimeout(onTimer, msToWait);
}
