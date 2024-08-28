'use strict'

/* global self, chrome */

import * as ch from './chrome/promisify.js'
import * as preferences from './preferences.js'

chrome.idle.setDetectionInterval(60)

chrome.runtime.onInstalled.addListener(onInstalled)
chrome.runtime.onStartup.addListener(onStartup)
chrome.idle.onStateChanged.addListener(onIdleStateChanged)
chrome.storage.onChanged.addListener(onStorageChanged)
chrome.runtime.onMessage.addListener(onMessageReceived)
chrome.commands.onCommand.addListener(onCommandReceived)
chrome.permissions.onAdded.addListener(verifyPermissions)
chrome.permissions.onRemoved.addListener(verifyPermissions)

async function onInstalled (info) {
  if (info && 'reason' in info && info.reason === 'install') {
    await showOnboarding()
  }

  await setupOffscreenDocument()
}

async function onStartup () {
  await setupOffscreenDocument()
}

async function setupOffscreenDocument () {
  const userPreferences = await preferences.get()

  if (userPreferences.batteryCharging.value === true || userPreferences.batteryLevel.value === true || userPreferences.powerConnect.value === true) {
    throttledstartBatteryListeners()
  }
}

async function showOnboarding () {
  try {
    const url = chrome.runtime.getURL('onboarding/onboarding.html')

    if (url) {
      await ch.tabsCreate({ url })
    }
  } catch (error) {
    console.error(error)
  }
}

function verifyPermissions () {
  chrome.permissions.contains(
    {
      permissions: ['downloads']
    },
    (result) => {
      if (result) {
        chrome.downloads.onCreated.addListener(onDownloadCreated)
        chrome.downloads.onChanged.addListener(onDownloadsChanged)
      }
    }
  )
}

verifyPermissions()

const throttledplaySound = throttle(playSound, 100)
const throttledstartBatteryListeners = throttle(startBatteryListeners, 100)

chrome.runtime.onMessage.addListener(onMessageReceived)

async function onMessageReceived (message, sender, sendResponse) {
  try {
    if (message.msg === 'activate') {
      sendResponse()
      await toggleOnOff(true)
    } else if (message.msg === 'deactivate') {
      sendResponse()
      await toggleOnOff(false)
    } else if (message.msg === 'battery_charging_changed') {
      sendResponse()
      await handleBatteryEvents({ charge: message.info })
    } else if (message.msg === 'battery_level_changed') {
      sendResponse()
      await handleBatteryEvents({ level: message.info })
    } else if (message.msg === 'battery_setting_activated') {
      sendResponse()
      throttledstartBatteryListeners()
    } else if (message.msg === 'battery_setting_deactivated') {
      sendResponse()
      await ch.offscreenCloseDocument()
    }
  } catch (error) {
    console.error('An error occurred:', error)
  }
}

async function handleBatteryEvents (info) {
  const userPreferences = await preferences.get()
  const currentActiveStatus = await ch.storageSessionGet({ status: false })

  if (
    (currentActiveStatus.status === true) &&
    (
      ('charge' in info && userPreferences.batteryCharging.value === true && info.charge === false) ||
      ('level' in info && userPreferences.batteryLevel.value === true && info.level <= 10)
    )
  ) {
    await turnOff()
  } else if (
    (currentActiveStatus.status === false) &&
    ('charge' in info && userPreferences.powerConnect.value === true && info.charge === true)
  ) {
    await turnOn()
  }
}

async function onCommandReceived (command) {
  if (command === 'toggleOnOff') {
    const currentActiveStatus = await ch.storageSessionGet({ status: false })

    toggleOnOff(!currentActiveStatus.status)
  }
}

async function toggleOnOff (state) {
  if (state === true) {
    try {
      await turnOn()
    } catch (error) {
      console.error('An error occurred:', error)
    }
  } else if (state === false) {
    try {
      await turnOff()
    } catch (error) {
      console.error('An error occurred:', error)
    }
  }
}

async function turnOn () {
  const userPreferences = await preferences.get()

  if (userPreferences.sounds.value === true) {
    throttledplaySound('on')
  }

  chrome.power.requestKeepAwake(userPreferences.displaySleep.value ? 'system' : 'display')

  try {
    await Promise.all([updateIcon(true), saveState(true)])
  } catch (error) {
    console.error('An error occurred:', error)
  }
}

async function turnOff () {
  const userPreferences = await preferences.get()

  if (userPreferences.sounds.value === true) {
    throttledplaySound('off')
  }

  chrome.power.releaseKeepAwake()

  try {
    await Promise.all([updateIcon(false), saveState(false), saveDownloadInProgressFlag(false)])
  } catch (error) {
    console.error('An error occurred:', error)
  }
}

async function saveState (state) {
  try {
    await ch.storageSessionSet({ status: state })
  } catch (error) {
    console.error(error)
  }
}

async function saveDownloadInProgressFlag (state) {
  try {
    await ch.storageSessionSet({ downloadInProgress: state })
  } catch (error) {
    console.error('An error occurred:', error)
  }
}

async function updateIcon (state) {
  try {
    const path = chrome.runtime.getURL(`images/icon32${state ? '_active' : ''}.png`)
    await ch.setIcon({ path })
  } catch (error) {
    console.error('An error occurred:', error)
  }
}

async function onIdleStateChanged (state) {
  if (state !== 'locked') return

  const currentActiveStatus = await ch.storageSessionGet({ status: false })

  if (currentActiveStatus.status === true) {
    try {
      await turnOn()
    } catch (error) {
      console.error('An error occurred:', error)
    }
  } else {
    await turnOff()
  }
}

async function onDownloadCreated () {
  const allDownloads = await searchDownloads({ state: 'in_progress' })
  const hasInProgressDownloads = allDownloads.length > 0
  if (!hasInProgressDownloads) return

  const currentActiveStatus = await ch.storageSessionGet({ status: false })
  const userPreferences = await preferences.get()

  if (currentActiveStatus.status === false && userPreferences.autoDownloads.value === true) {
    try {
      await Promise.all([turnOn(), saveDownloadInProgressFlag(true)])
    } catch (error) {
      console.error('An error occurred:', error)
    }
  }
}

async function onDownloadsChanged () {
  const allDownloads = await searchDownloads({ state: 'in_progress' })
  const hasInProgressDownloads = allDownloads.length > 0
  if (hasInProgressDownloads) return

  const currentActiveStatus = await ch.storageSessionGet({ status: false })
  const wasActivatedByDownload = await ch.storageSessionGet({ downloadInProgress: false })
  const userPreferences = await preferences.get()

  if (wasActivatedByDownload.downloadInProgress === true && !hasInProgressDownloads && currentActiveStatus.status === true && userPreferences.autoDownloads.value === true) {
    try {
      await turnOff()
    } catch (error) {
      console.error('An error occurred:', error)
    }
  }
}

function searchDownloads (options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.search(options, function (downloads) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message)
      }
      resolve(downloads)
    })
  })
}

async function onStorageChanged (changes) {
  if (!changes.preferences) return

  const { oldValue, newValue } = changes.preferences

  if (!oldValue || !newValue || oldValue.displaySleep.value === newValue.displaySleep.value) {
    return
  }

  const currentActiveStatus = await ch.storageSessionGet({ status: false })
  if (currentActiveStatus.status === true) {
    chrome.power.releaseKeepAwake()
    chrome.power.requestKeepAwake(newValue.displaySleep.value ? 'system' : 'display')
  }
}

async function playSound (sound) {
  const documentPath = chrome.runtime.getURL('offscreen/offscreen.html')
  const hasDocument = await hasOffscreenDocument(documentPath)

  if (!hasDocument) {
    try {
      await ch.offscreenCreateDocument({
        url: documentPath,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'ui sfx playback'
      })
    } catch (error) {
      console.error(error)
    }
  }

  try {
    await ch.sendMessage({ msg: 'play_sound', sound })
  } catch (error) {
    console.error(error)
  }
}

async function startBatteryListeners () {
  const documentPath = chrome.runtime.getURL('offscreen/offscreen.html')
  const hasDocument = await hasOffscreenDocument(documentPath)

  if (hasDocument) {
    await ch.offscreenCloseDocument()
  }

  try {
    // Reason is set to DOM_PARSER for the moment
    // Although Chrome documentatation states that BATTERY_STATUS is a valid reason (https://developer.chrome.com/docs/extensions/reference/offscreen/#type-Reason) it actually throws
    // DOM_PARSER just seems like the closest temporary fallback until Google make BATTERY_STATUS a valid reason
    await ch.offscreenCreateDocument({
      url: documentPath,
      reasons: ['AUDIO_PLAYBACK', 'DOM_PARSER'],
      justification: 'ui sfx playback and listening to battery changes'
    })
  } catch (error) {
    console.error(error)
  }

  try {
    await ch.sendMessage({ msg: 'start_battery_listener' })
  } catch (error) {
    console.error(error)
  }
}

async function hasOffscreenDocument (path) {
  let matchedClients

  try {
    matchedClients = await self.clients.matchAll()
  } catch (error) {
    console.error(error)
    return false
  }

  for (const client of matchedClients) {
    if (client.url === path) {
      return true
    }
  }

  return false
}

function throttle (func, delay) {
  let lastExecTime = 0
  return function () {
    const context = this
    const args = arguments
    const now = Date.now()
    if (now - lastExecTime >= delay) {
      lastExecTime = now
      func.apply(context, args)
    }
  }
}
