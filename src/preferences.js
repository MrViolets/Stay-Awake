'use strict'

/* global chrome */

import * as ch from './chrome/promisify.js'

export const defaults = {
  sounds: {
    title: chrome.i18n.getMessage('OPTIONS_SOUNDS'),
    value: true,
    type: 'checkbox'
  },
  displaySleep: {
    title: chrome.i18n.getMessage('OPTIONS_DISPLAY_SLEEP'),
    value: false,
    type: 'checkbox'
  },
  autoDownloads: {
    title: chrome.i18n.getMessage('OPTIONS_AUTO_DOWNLOAD'),
    value: false,
    type: 'checkbox',
    permissions: ['downloads']
  },
  powerConnect: {
    title: chrome.i18n.getMessage('OPTIONS_POWER_CONNECT'),
    value: false,
    type: 'checkbox'
  },
  batteryCharging: {
    title: chrome.i18n.getMessage('OPTIONS_BATTERY_CHARGING'),
    value: false,
    type: 'checkbox'
  },
  batteryLevel: {
    title: chrome.i18n.getMessage('OPTIONS_BATTERY_LEVEL'),
    value: false,
    type: 'checkbox'
  }
}

export async function get () {
  try {
    const result = await ch.storageLocalGet({ preferences: defaults })
    const userPreferences = result.preferences

    for (const key in userPreferences) {
      if (!(key in defaults)) {
        delete userPreferences[key]
      }
    }

    for (const defaultKey in defaults) {
      if (!(defaultKey in userPreferences)) {
        userPreferences[defaultKey] = defaults[defaultKey]
      }
    }

    return userPreferences
  } catch (error) {
    console.error(error)
    return defaults
  }
}
