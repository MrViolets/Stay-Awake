'use strict'

/* global chrome, Audio */

chrome.runtime.onMessage.addListener(onMessageReceived)

function onMessageReceived (message, sender, sendResponse) {
  if (message.msg === 'play_sound') {
    playSound(message.sound)
  } else if (message.msg === 'start_battery_listener') {
    navigator.getBattery().then((battery) => {
      battery.addEventListener('chargingchange', onChargingChange)
      battery.addEventListener('levelchange', onLevelChange)

      function onChargingChange () {
        sendMessage({ msg: 'battery_charging_changed', info: battery.charging })
      }

      function onLevelChange () {
        sendMessage({ msg: 'battery_level_changed', info: battery.level * 100 })
      }
    })
  }

  sendResponse()
}

function playSound (sound) {
  const playable = new Audio(chrome.runtime.getURL(`./offscreen/audio/${sound}.mp3`))
  playable.play()
}

const sendMessage = promisifyChromeMethod(chrome.runtime.sendMessage.bind(chrome.runtime))

function promisifyChromeMethod (method) {
  return (...args) =>
    new Promise((resolve, reject) => {
      method(...args, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || JSON.stringify(chrome.runtime.lastError)))
        } else {
          resolve(result)
        }
      })
    })
}
