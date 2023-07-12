/**npm update function. @preserve Copyright(c) 2023 Allory Dante.*/
"use strict";

var fs = require("fs");
var path = require("path");
var { EventEmitter } = require("events");
var confSets = require("config-sets");
var { spawn, spawnSync } = require("child_process");
var options = confSets.init({
  tiny_npm_updater: {
    autoupdate: true,
    logDir: "./log/tiny-npm-updater",
    current_working_directory: confSets.findArg("--cwd") || confSets.findArg("cwd") || path.parse(process.argv[1]).dir,
    updateCheckInterval_seconds: confSets.findArg("--interval") || confSets.findArg("interval") || 86400, //1 day
  },
}).tiny_npm_updater;
options.updateCheckInterval_seconds = confSets.findArg("--interval") || confSets.findArg("interval") || options.updateCheckInterval_seconds;

var isDebug = Boolean(confSets.isDebug);

var cwd = options.current_working_directory || path.parse(process.argv[1]).dir;
if (confSets.isDebug) {
  console.log("[ DEBUG ] 'tiny-npm-updater' current working directory: " + cwd);
}
var name = "";

try {
  name = require(path.resolve(cwd, "./package.json")).name || "nameless";
} catch (err) {
  var errMsg = "Bad current_working_directory, please check config-sets.json file.";
  if (confSets.isDebug) {
    console.error("[ ERROR ] 'tiny-npm-updater' " + errMsg);
  }
  updater.emit("error", new Error(errMsg));
  callback("[ ERROR ] 'tiny-npm-updater' " + errMsg);
}

var logDir = path.resolve(cwd, options.logDir);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
function log(info, timestamp = true) {
  if (!info) {
    return;
  }

  var date = new Date();
  var year = date.getFullYear();
  var month = date.getMonth() + 1 < 10 ? `0${date.getMonth() + 1}` : date.getMonth() + 1;
  var fileName = path.resolve(process.cwd(), options.logDir, year + "-" + month + ".log");
  var msg = "\r\n>> " + (timestamp ? "[" + date.toLocaleString("en-GB") + "] " : "") + info + "\r\n";

  fs.appendFile(fileName, msg, { flag: "a+" }, function (err) {
    if (err && confSets.isDebug) {
      console.error("[ ERROR ] 'tiny-npm-updater' " + err);
    }
  });
  updater.emit("log", msg);
}

var timeout = null;
var updater = new EventEmitter();
updater.options = options;
updater.log = log;

function update(updateLater = false, nextUpdate = "", callback) {
  if (!updateLater) {
    var isUpdated = false;
    var logText = "package '" + name + "' cwd: " + cwd + "\r\n";
    logText += "==== Executing command 'npm update' ====\r\n";
    if (typeof callback === "function") {
      callback(logText);
    }
    updater.emit("update", name);

    var child = spawn("npm", ["update"], { shell: true, cwd });
    child.stdout.on("data", (data) => {
      var info = data.toString("utf-8");
      if (typeof callback === "function") {
        callback(info);
      }
      logText += info;

      var events = ["added", "removed", "changed"];
      if (
        events.some(function (e) {
          return info.trim().toLowerCase().includes(e);
        })
      ) {
        isUpdated = true;
      }
    });
    child.on("error", function (err) {
      if (typeof callback === "function") {
        callback("error => " + err + "\r\n");
      }

      logText += "error => " + err + "\r\n";
      updater.emit("error", err, name);
    });
    child.on("exit", function (code, signal) {
      var msg = "\r\n==== 'npm update' completed ====\r\n";

      if (isUpdated) {
        msg += "==== app reboot is required ====\r\n";
      }
      if (typeof callback === "function") {
        callback(msg);
      }

      logText += msg;
      if (isDebug) {
        logText += nextUpdate;
      }
      log(logText);
      setTimeout(function () {
        updater.emit("updated", name, isUpdated, logText);
      }, 1000);
    });
  } else if (isDebug) {
    log(nextUpdate);
  }

  clearTimeout(timeout);
  console.log("bb");
  timeout = setTimeout(function () {
    console.log("aaa");
    confSets.reload();
    log(outdated());

    var date = new Date();
    date.setSeconds(date.getSeconds() + updater.options.updateCheckInterval_seconds);
    update(!options.autoupdate, "\r\n==== " + name + ": next check => " + date.toLocaleString());
  }, 1000 * updater.options.updateCheckInterval_seconds);
}
function outdated(callback) {
  var strCompleted = "\r\n==== 'npm outdated' completed ====\r\n";
  var info = "package '" + name + "' cwd: " + cwd + "\r\n";
  info += "==== Executing command 'npm outdated' ====\r\n\r\n";

  if (typeof callback === "function") {
    var isUpdated = true;

    callback(info);

    var child = spawn("npm", ["outdated"], { shell: true, cwd });
    child.stdout.on("data", (data) => {
      info = data.toString("utf-8").trim();
      if (info) {
        info += "\r\n";
        isUpdated = false;
      }
      callback(info);
    });
    child.on("error", function (err) {
      msg = "error => " + err + "\r\n";
      callback(msg);
    });
    child.on("exit", function (code, signal) {
      info = isUpdated ? "up-to-date\r\n" : "";
      info += strCompleted;
      callback(info, true);
    });

    return;
  }

  var result = spawnSync("npm outdated", { shell: true, cwd });

  if (result.error) {
    throw result.error;
  }
  if (result.stderr + "") {
    if (confSets.isDebug) {
      console.error("[ ERROR ] 'tiny-npm-updater' " + result.stderr);
    }
  }

  info += result.stdout.toString("utf-8") || "up-to-date\r\n";

  info += strCompleted;

  return info;
}

updater.update = update;
updater.outdated = outdated;
module.exports = updater;

update(true, "\r\n==== 'tiny-npm-updater' startup ====");
