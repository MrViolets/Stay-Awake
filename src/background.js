'use strict'

/* global self, chrome */

import * as ch from './chrome/promisify.js'
import * as preferences from './preferences.js'

chrome.idle.setDetectionInterval(60)

chrome.idle.onStateChanged.addListener(onIdleStateChanged)
chrome.storage.onChanged.addListener(onStorageChanged)
chrome.runtime.onMessage.addListener(onMessageReceived)
chrome.commands.onCommand.addListener(onCommandReceived)
chrome.permissions.onAdded.addListener(verifyPermissions)
chrome.permissions.onRemoved.addListener(verifyPermissions)

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

async function onMessageReceived (message, sender, sendResponse) {
  try {
    if (message.msg === 'activate') {
      sendResponse()
      await toggleOnOff(true)
    } else if (message.msg === 'deactivate') {
      sendResponse()
      await toggleOnOff(false)
    }
  } catch (error) {
    console.error('An error occurred:', error)
  }
}

async function onCommandReceived (command) {
  if (command === 'toggleOnOff') {
    const currentActiveStatus = await ch.storageSessionGet({ status: false })

    toggleOnOff(!currentActiveStatus.status)
  }
}

async function toggleOnOff (state) {
  console.log(state)
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
      await turnOff()
    } catch (error) {
      console.error('An error occurred:', error)
    }
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

  if (wasActivatedByDownload && !hasInProgressDownloads && currentActiveStatus.status === true && userPreferences.autoDownloads.value === true) {
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
  const documentPath = chrome.runtime.getURL('offscreen/audio-player.html')
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
