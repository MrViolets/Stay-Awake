'use strict'

/* global chrome */

import * as ch from '../chrome/promisify.js'
import * as preferences from '../preferences.js'
import * as navigation from './navigation.js'

document.addEventListener('DOMContentLoaded', init)

async function init () {
  await insertStrings()
  await restorePreferences()
  navigation.init()
  registerListeners()
}

async function insertStrings () {
  const strings = document.querySelectorAll('[data-localize]')

  if (strings) {
    for (const s of strings) {
      s.innerText = chrome.i18n.getMessage(s.dataset.localize)
    }
  }

  const accelerators = document.querySelectorAll('[data-accelerator]')

  const platformInfo = await ch.getPlatformInfo().catch((error) => {
    console.error(error)
  })

  if (accelerators) {
    for (const a of accelerators) {
      if (platformInfo.os === 'mac') {
        a.innerText = chrome.i18n.getMessage(`ACCELERATOR_${a.dataset.accelerator}_MAC`)
      } else {
        a.innerText = chrome.i18n.getMessage(`ACCELERATOR_${a.dataset.accelerator}`)
      }
    }
  }

  const currentActiveStatus = await ch.storageSessionGet({ status: false })

  if (currentActiveStatus.status === true) {
    const activateElement = document.querySelector('div.label[data-localize="ACTIVATE"]')
    activateElement.innerText = chrome.i18n.getMessage('DEACTIVATE')
  }
}

async function restorePreferences () {
  const userPreferences = await preferences.get()

  for (const [preferenceName, preferenceObj] of Object.entries(userPreferences)) {
    const el = document.getElementById(preferenceName)

    if (preferenceObj.type === 'radio') {
      el.value = preferenceObj.value
    } else if (preferenceObj.type === 'checkbox') {
      el.checked = preferenceObj.value
    }
  }
}

function registerListeners () {
  const on = (target, event, handler) => {
    if (typeof target === 'string') {
      document.getElementById(target).addEventListener(event, handler, false)
    } else {
      target.addEventListener(event, handler, false)
    }
  }

  const onAll = (target, event, handler) => {
    const elements = document.querySelectorAll(target)

    for (const el of elements) {
      el.addEventListener(event, handler, false)
    }
  }

  on(document, 'keydown', onDocumentKeydown)
  onAll('input[type="checkbox"]', 'change', onCheckBoxChanged)
  onAll('div.nav-index', 'click', onActionClicked)
}

async function onCheckBoxChanged (e) {
  const userPreferences = await preferences.get()
  const preference = userPreferences[e.target.id]

  if ('permissions' in preference && preference.permissions.includes('downloads')) {
    if (e.target.checked) {
      // Request permission
      const permissionGranted = await requestDownloadPermission()

      if (permissionGranted) {
        preference.value = true

        try {
          await ch.storageLocalSet({ preferences: userPreferences })
        } catch (error) {
          console.error('An error occurred:', error)
        }
      } else {
        e.target.checked = !e.target.checked
      }
    } else {
      // Revoke permission
      const permissionRemoved = removeDownloadpermission()
      if (permissionRemoved) {
        preference.value = false

        try {
          await ch.storageLocalSet({ preferences: userPreferences })
        } catch (error) {
          console.error('An error occurred:', error)
        }
      } else {
        e.target.checked = !e.target.checked
      }
    }
  } else {
    await updateUserPreference(e, 'checked', !e.target.checked)
  }
}

function requestDownloadPermission () {
  return new Promise((resolve, reject) => {
    chrome.permissions.request(
      {
        permissions: ['downloads']
      },
      (granted) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message)
        }

        if (granted) {
          resolve(true)
        } else {
          resolve(false)
        }
      }
    )
  })
}

function removeDownloadpermission () {
  return new Promise((resolve, reject) => {
    chrome.permissions.remove(
      {
        permissions: ['downloads']
      },
      (removed) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message)
        }

        if (removed) {
          resolve(true)
        } else {
          resolve(false)
        }
      }
    )
  })
}

async function updateUserPreference (e, valueKey, backupValue) {
  const userPreferences = await preferences.get()
  const preference = userPreferences[e.target.id]

  if (!preference) return

  preference.value = e.target[valueKey]

  try {
    await ch.storageLocalSet({ preferences: userPreferences })
  } catch (error) {
    console.error(error)
    e.target[valueKey] = backupValue
  }
}

async function onActionClicked (e) {
  const target = e.target
  const targetId = target.id

  if (targetId === 'action_toggle') {
    const currentActiveStatus = await ch.storageSessionGet({ status: false })

    try {
      if (currentActiveStatus.status === false) {
        await ch.sendMessage({ msg: 'activate' })
      } else {
        await ch.sendMessage({ msg: 'deactivate' })
      }

      window.close()
    } catch (error) {
      console.error('An error occurred:', error)
    }
  } else if (e.target.id === 'rate' || e.target.id === 'donate') {
    openExternal(e.target.id)
  } else if (e.target.id === 'tile_now') {
    try {
      await ch.sendMessage({ msg: 'tile_now' })
    } catch (error) {
      console.error(error)
      e.target.checked = !e.target.checked
    }
  }
}

function onDocumentKeydown (e) {
  if (e.key === 'o' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
    // This wont fire unless the user has set a custom shortcut
    const toggleEl = document.getElementById('action_toggle')
    toggleEl.click()
  }
}

async function openExternal (type) {
  let url

  if (type === 'rate') {
    const extensionId = chrome.runtime.id
    url = `https://chrome.google.com/webstore/detail/${extensionId}`
  } else if (type === 'donate') {
    url = 'https://www.buymeacoffee.com/mrviolets'
  }

  try {
    await ch.tabsCreate({ url })
  } catch (error) {
    console.error(error)
  }
}
