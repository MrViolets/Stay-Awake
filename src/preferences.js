'use strict'

/* global chrome */

import * as ch from './chrome/promisify.js'

export const preferenceDefaults = {
  sounds: { status: true, permissions: null },
  displaySleep: { status: false, permissions: null },
  autoDownloads: { status: false, permissions: ['downloads'] }
}

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
